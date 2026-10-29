// AMBIENTE DE DEMONSTRAÇÃO — dados fictícios, somente na memória deste navegador.
// Totalmente separado do ambiente real: não conversa com o Supabase.
import { CATEGORIAS_INICIAIS } from './seed.js';
import { uuid, hoje, addMesYM, primeiroDia, addDias, diasNoMes } from '../lib/fmt.js';
import { dividirParcelas, faturaDaCompra } from '../lib/calc.js';
import { ErroConflito } from './backend-supabase.js';

const USUARIOS = {
  jes: { id: 'demo-u-jesrrael', email: 'jesrrael@demo.local', nome: 'Jesrrael' },
  lau: { id: 'demo-u-laucielly', email: 'laucielly@demo.local', nome: 'Laucielly' },
};

function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

export function criarBackendDemo() {
  const T = { pessoas: [], categorias: [], contas: [], cartoes: [], projetos: [], projeto_tarefas: [], metas: [], aportes: [],
    orcamentos: [], recorrencias: [], lancamentos: [], configuracoes: [], perfis: [], historico: [] };
  let atual = null; // usuário da sessão demo
  const ouvintesAuth = new Set();
  const ouvintesDados = new Set();
  const blobs = new Map();
  let hid = 1;

  const agora = () => new Date().toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const hist = (tabela, id, acao, antes, depois, usuario) => T.historico.push({ id: hid++, tabela, registro_id: id, acao, antes, depois, usuario, em: agora() });

  function carimbarInsert(row, usuario, quando = agora()) {
    return { ...row, id: row.id || uuid(), criado_por: usuario, criado_em: quando, alterado_por: null, alterado_em: null, versao: 1,
      ...(('excluido_em' in row || T.lancamentos === undefined) ? {} : {}) };
  }
  function validarLanc(l) {
    if (!(l.valor_centavos > 0)) throw new Error('Dados inválidos: valor deve ser maior que zero.');
    if (l.tipo === 'transferencia' && (!l.conta_id || !l.conta_destino_id || l.conta_id === l.conta_destino_id)) throw new Error('Dados inválidos: escolha contas de origem e destino diferentes.');
    if (l.tipo === 'despesa' && !l.conta_id === !l.cartao_id) throw new Error('Dados inválidos: informe a conta OU o cartão.');
    if (l.status === 'efetivado' && !l.cartao_id && !l.data_efetiva) throw new Error('Dados inválidos: informe a data de pagamento.');
  }
  const emitir = (t) => ouvintesDados.forEach((cb) => setTimeout(() => cb(t, {}), 0));

  // ------------------------------------------------------------------ dados fictícios
  function semear() {
    const H = hoje();
    const ym0 = H.slice(0, 7);
    const r = rng(42);
    const U1 = USUARIOS.jes.id, U2 = USUARIOS.lau.id;
    const ins = (t, row, u = U1, q) => { const x = carimbarInsert(row, u, q); if (t === 'lancamentos') { x.excluido_em = null; x.excluido_por = null; x.etiquetas ||= []; x.anexos ||= []; } T[t].push(x); return x; };
    T.perfis.push({ id: U1, email: USUARIOS.jes.email, nome: 'Jesrrael' }, { id: U2, email: USUARIOS.lau.email, nome: 'Laucielly' });
    const pFam = ins('pessoas', { nome: 'Família', tipo: 'familia', cor: '#0F766E', ordem: 0, ativo: true });
    const pJ = ins('pessoas', { nome: 'Jesrrael', tipo: 'membro', perfil_id: U1, cor: '#2563EB', ordem: 1, ativo: true });
    const pL = ins('pessoas', { nome: 'Laucielly', tipo: 'membro', perfil_id: U2, cor: '#DB2777', ordem: 2, ativo: true });
    const pF = ins('pessoas', { nome: 'Filhos', tipo: 'filho', cor: '#F59E0B', ordem: 3, ativo: true });
    T.configuracoes.push(carimbarInsert({ id: 1, alerta_atencao_pct: 80, alerta_limite_pct: 100, horizonte_recorrencia_meses: 12, dias_aviso_vencimento: 5 }, U1));
    const cat = {}; let ordem = 0;
    for (const [tipo, nome, icone, cor, subs] of CATEGORIAS_INICIAIS) {
      const c = ins('categorias', { tipo, nome, icone, cor, ordem: ++ordem, arquivada: false, parent_id: null });
      cat[nome] = { id: c.id, subs: {} };
      subs.split('|').filter(Boolean).forEach((s, j) => { const sc = ins('categorias', { tipo, nome: s, icone, cor, ordem: j + 1, arquivada: false, parent_id: c.id }); cat[nome].subs[s] = sc.id; });
    }
    const ini = primeiroDia(addMesYM(ym0, -5));
    const cc = ins('contas', { nome: 'Conta corrente', tipo: 'corrente', instituicao: 'Nubank', saldo_inicial_centavos: 450000, data_referencia: ini, cor: '#820AD1', icone: 'banco:nubank', ordem: 1, arquivada: false });
    const cd = ins('contas', { nome: 'Carteira', tipo: 'dinheiro', saldo_inicial_centavos: 30000, data_referencia: ini, cor: '#16A34A', icone: 'wallet', ordem: 2, arquivada: false });
    const cr = ins('contas', { nome: 'Reserva de emergência', tipo: 'reserva', saldo_inicial_centavos: 800000, data_referencia: ini, cor: '#EA7100', icone: 'banco:inter', ordem: 3, arquivada: false });
    const k = ins('cartoes', { nome: 'Cartão Família', titular_id: pL.id, limite_centavos: 800000, dia_fechamento: 25, dia_vencimento: 5, conta_pagamento_id: cc.id, cor: '#EC0000', icone: 'banco:santander', ordem: 1, arquivado: false });
    const C = (n, s) => ({ categoria_id: cat[n].id, subcategoria_id: s ? cat[n].subs[s] : null });
    const L = (o, u) => ins('lancamentos', { status: 'efetivado', forma_pagamento: 'pix', beneficiario_id: pFam.id, ...o, competencia: o.competencia || primeiroDia(o.data_ocorrencia.slice(0, 7)) }, u ?? (r() < 0.5 ? U1 : U2));

    // compra parcelada
    const dtP = primeiroDia(addMesYM(ym0, -2)).slice(0, 8) + '14';
    const compraId = uuid();
    dividirParcelas(239990, 10).forEach((v, j) => L({ tipo: 'despesa', descricao: 'Geladeira', valor_centavos: v, ...C('Moradia', 'Móveis'), data_ocorrencia: dtP, data_efetiva: dtP,
      competencia: primeiroDia(addMesYM(dtP.slice(0, 7), j)), cartao_id: k.id, fatura: primeiroDia(addMesYM(faturaDaCompra(k, dtP).slice(0, 7), j)), forma_pagamento: 'credito',
      compra_id: compraId, parcela_num: j + 1, parcelas_total: 10, pagador_id: pJ.id, favorecido: 'Magazine' }, U1));
    for (let i = -5; i <= 0; i++) {
      const ym = addMesYM(ym0, i);
      const d = (dia) => `${ym}-${String(Math.min(dia, diasNoMes(+ym.slice(0, 4), +ym.slice(5, 7)))).padStart(2, '0')}`;
      const passou = (x) => x <= H;
      const ef = (dt, extra = {}) => (passou(dt) ? { status: 'efetivado', data_efetiva: dt } : { status: 'previsto', data_efetiva: null, vencimento: dt });
      L({ tipo: 'receita', descricao: 'Salário — Colégio', valor_centavos: 680000, ...C('Salários'), data_ocorrencia: d(5), conta_id: cc.id, pagador_id: pJ.id, favorecido: 'Colégio Nacional', ...ef(d(5)), vencimento: d(5) }, U1);
      L({ tipo: 'receita', descricao: 'Salário', valor_centavos: 520000, ...C('Salários'), data_ocorrencia: d(6), conta_id: cc.id, pagador_id: pL.id, ...ef(d(6)), vencimento: d(6) }, U2);
      L({ tipo: 'receita', descricao: 'Mentorias ENEM', valor_centavos: 90000 + Math.round(r() * 80000), ...C('Cursos e mentorias'), data_ocorrencia: d(15), conta_id: cc.id, pagador_id: pJ.id, ...ef(d(15)), vencimento: d(15) }, U1);
      L({ tipo: 'despesa', descricao: 'Aluguel', valor_centavos: 220000, ...C('Moradia', 'Aluguel'), data_ocorrencia: d(10), conta_id: cc.id, pagador_id: pJ.id, favorecido: 'Imobiliária', forma_pagamento: 'boleto', ...ef(d(10)), vencimento: d(10) });
      L({ tipo: 'despesa', descricao: 'Energia', valor_centavos: 21000 + Math.round(r() * 8000), ...C('Moradia', 'Energia'), data_ocorrencia: d(12), conta_id: cc.id, pagador_id: pL.id, favorecido: 'Cemig', ...ef(d(12)), vencimento: d(12) });
      L({ tipo: 'despesa', descricao: 'Colégio', valor_centavos: 125000, ...C('Educação', 'Colégio'), data_ocorrencia: d(8), conta_id: cc.id, pagador_id: pJ.id, beneficiario_id: pF.id, forma_pagamento: 'boleto', ...ef(d(8)), vencimento: d(8) });
      L({ tipo: 'despesa', descricao: 'Dízimo', valor_centavos: 120000, ...C('Contribuições e doações', 'Dízimos'), data_ocorrencia: d(6), conta_id: cc.id, pagador_id: pJ.id, favorecido: 'Igreja', ...ef(d(6)), vencimento: d(6) });
      L({ tipo: 'despesa', descricao: 'Diarista', valor_centavos: 60000, ...C('Serviços domésticos', 'Diarista'), data_ocorrencia: d(20), conta_id: cd.id, pagador_id: pL.id, forma_pagamento: 'dinheiro', ...ef(d(20)), vencimento: d(20) });
      // cartão
      const compras = [['Supermercado', 'Compras do mês', 'Supermercado BH', 3, 52000, 25000], ['Alimentação fora e delivery', 'iFood', 'iFood', 6, 4500, 6000],
        ['Veículos e transporte', 'Combustível', 'Posto Ipiranga', 3, 18000, 9000], ['Assinaturas e tecnologia', 'Streaming', 'Netflix', 1, 5590, 0],
        ['Lazer e passeios', 'Passeios', 'Parque', 1, 9000, 8000], ['Saúde', 'Medicamentos', 'Drogaria', 2, 6000, 5000], ['Supermercado', 'Feira', 'Feira livre', 3, 7000, 3000]];
      for (const [cn, sn, fav, qtd, vb, va] of compras) {
        for (let q = 0; q < qtd; q++) {
          const dt = d(2 + Math.floor(r() * 26));
          if (!passou(dt)) continue;
          L({ tipo: 'despesa', descricao: sn === 'Compras do mês' ? 'Compras do mês' : sn, valor_centavos: vb + Math.round(r() * va), ...C(cn, sn), data_ocorrencia: dt, data_efetiva: dt, cartao_id: k.id, fatura: faturaDaCompra(k, dt), forma_pagamento: 'credito', pagador_id: r() < 0.5 ? pJ.id : pL.id, favorecido: fav });
        }
      }
      // pagamento da fatura que vence neste mês
      if (i < 0 || passou(d(5))) {
        const fat = primeiroDia(ym);
        const total = T.lancamentos.filter((l) => l.cartao_id === k.id && l.fatura === fat && l.tipo === 'despesa' && l.status === 'efetivado').reduce((s, l) => s + l.valor_centavos, 0);
        if (total > 0) L({ tipo: 'pagamento_fatura', descricao: 'Pagamento fatura Cartão Família', valor_centavos: total, conta_id: cc.id, cartao_id: k.id, fatura: fat, data_ocorrencia: d(5), data_efetiva: d(5), vencimento: d(5), pagador_id: pL.id, forma_pagamento: 'debito_automatico', categoria_id: null });
      }
    }
    // transferência para reserva
    L({ tipo: 'transferencia', descricao: 'Guardar na reserva', valor_centavos: 50000, conta_id: cc.id, conta_destino_id: cr.id, data_ocorrencia: addDias(H, -3), data_efetiva: addDias(H, -3), forma_pagamento: 'transferencia', categoria_id: null }, U2);
    // recorrências (geram previstos)
    ins('recorrencias', { tipo: 'despesa', descricao: 'Curso de inglês', valor_centavos: 38000, ...C('Educação', 'Curso de inglês'), conta_id: cc.id, pagador_id: pL.id, beneficiario_id: pF.id, forma_pagamento: 'boleto', frequencia: 'mensal', inicio: addDias(H, 4), fim: null, ativa: true, etiquetas: [] }, U2);
    ins('recorrencias', { tipo: 'despesa', descricao: 'Academia', valor_centavos: 11990, ...C('Esportes e atividade física', 'Academia'), conta_id: cc.id, pagador_id: pJ.id, beneficiario_id: pJ.id, forma_pagamento: 'pix', frequencia: 'mensal', inicio: addDias(H, 9), fim: null, ativa: true, etiquetas: [] }, U1);
    // projeto
    const pr = ins('projetos', { nome: 'Viagem de férias em família', descricao: 'Praia em julho', icone: 'plane', cor: '#0EA5E9', valor_estimado_centavos: 1200000, data_alvo: `${+ym0.slice(0, 4) + 1}-07-10`, status: 'andamento', responsaveis: [pJ.id, pL.id], observacoes: '', anexos: [], ordem: 1 }, U2);
    ['Pesquisar destinos', 'Comprar passagens', 'Reservar hospedagem', 'Montar roteiro'].forEach((t, j) => ins('projeto_tarefas', { projeto_id: pr.id, titulo: t, concluida: j < 2, ordem: j, responsavel_id: j % 2 ? pL.id : pJ.id }));
    ins('aportes', { projeto_id: pr.id, tipo: 'aporte', valor_centavos: 300000, data: addDias(H, -40), descricao: 'Primeira reserva', conta_id: cr.id });
    ins('aportes', { projeto_id: pr.id, tipo: 'aporte', valor_centavos: 150000, data: addDias(H, -10), descricao: 'Reserva do mês', conta_id: cr.id });
    L({ tipo: 'despesa', descricao: 'Passagens aéreas', valor_centavos: 280000, ...C('Viagens', 'Passagens'), data_ocorrencia: addDias(H, -8), data_efetiva: addDias(H, -8), conta_id: cc.id, projeto_id: pr.id, pagador_id: pL.id, favorecido: 'Companhia aérea' }, U2);
    ins('projetos', { nome: 'Reforma da cozinha', descricao: '', icone: 'hammer', cor: '#F97316', valor_estimado_centavos: 1500000, data_alvo: null, status: 'planejado', responsaveis: [pJ.id], observacoes: '', anexos: [], ordem: 2 }, U1);
    // metas e orçamento
    const me = ins('metas', { nome: 'Reserva de emergência (6 meses)', tipo: 'emergencia', valor_alvo_centavos: 3600000, data_alvo: `${+ym0.slice(0, 4) + 1}-12-31`, conta_id: cr.id, icone: 'piggy-bank', cor: '#0891B2', arquivada: false });
    ins('aportes', { meta_id: me.id, tipo: 'aporte', valor_centavos: 800000, data: ini, descricao: 'Saldo inicial' });
    ins('metas', { nome: 'IPVA do próximo ano', tipo: 'provisao', valor_alvo_centavos: 240000, data_alvo: `${+ym0.slice(0, 4) + 1}-01-20`, icone: 'car', cor: '#0F766E', arquivada: false });
    ins('orcamentos', { categoria_id: null, mes: null, valor_centavos: 1000000 });
    [['Supermercado', 180000], ['Alimentação fora e delivery', 40000], ['Veículos e transporte', 70000], ['Lazer e passeios', 30000]].forEach(([n, v]) => ins('orcamentos', { categoria_id: cat[n].id, mes: null, valor_centavos: v }));
    for (const l of T.lancamentos) hist('lancamentos', l.id, 'criado', null, clone(l), l.criado_por);
  }
  semear();

  const tab = (t) => { if (!T[t]) throw new Error('tabela desconhecida ' + t); return T[t]; };

  return {
    modo: 'demo',
    usuariosDemo: USUARIOS,
    async sessao() { return atual ? { user: { id: atual.id, email: atual.email } } : null; },
    async entrar(email) {
      const u = Object.values(USUARIOS).find((x) => x.email === email) || USUARIOS.jes;
      atual = u; ouvintesAuth.forEach((cb) => cb('SIGNED_IN', { user: { id: u.id, email: u.email } }));
    },
    async sair() { atual = null; ouvintesAuth.forEach((cb) => cb('SIGNED_OUT', null)); },
    async recuperarSenha() { throw new Error('No ambiente de demonstração não há envio de e-mail.'); },
    async definirSenha() { throw new Error('No ambiente de demonstração não há senha.'); },
    aoMudarAuth(cb) { ouvintesAuth.add(cb); return { data: { subscription: { unsubscribe: () => ouvintesAuth.delete(cb) } } }; },
    async carregarTudo() { return Object.fromEntries(Object.keys(T).filter((t) => t !== 'historico').map((t) => [t, clone(T[t])])); },
    async listar(t) { return clone(tab(t)); },
    async inserir(t, linhas) {
      const out = [];
      for (const l of linhas) {
        if (l.id && tab(t).some((x) => x.id === l.id)) { out.push(clone(tab(t).find((x) => x.id === l.id))); continue; }
        if (t === 'lancamentos') validarLanc(l);
        const row = carimbarInsert(l, atual?.id);
        if (t === 'lancamentos') { row.excluido_em = null; row.excluido_por = null; row.etiquetas ||= []; row.anexos ||= []; }
        tab(t).push(row); hist(t, row.id, 'criado', null, clone(row), atual?.id); out.push(clone(row));
      }
      emitir(t); return out;
    },
    async inserirIgnorandoDuplicados(t, linhas) {
      const novas = linhas.filter((l) => !tab(t).some((x) => x.recorrencia_id && x.recorrencia_id === l.recorrencia_id && x.recorrencia_seq === l.recorrencia_seq));
      return this.inserir(t, novas);
    },
    async atualizar(t, id, patch, versao) {
      const i = tab(t).findIndex((x) => x.id === id);
      const old = tab(t)[i];
      if (!old || (versao != null && old.versao !== versao)) throw new ErroConflito(old && clone(old));
      const novo = { ...old, ...patch, criado_por: old.criado_por, criado_em: old.criado_em, versao: old.versao + 1 };
      const soLixeira = Object.keys(patch).every((k) => k === 'excluido_em');
      let acao = 'alterado';
      if ('excluido_em' in patch) {
        if (patch.excluido_em && !old.excluido_em) { novo.excluido_em = agora(); novo.excluido_por = atual?.id; acao = 'enviado_lixeira'; }
        else if (!patch.excluido_em && old.excluido_em) { novo.excluido_por = null; acao = 'restaurado'; }
      }
      if (!soLixeira) { novo.alterado_por = atual?.id; novo.alterado_em = agora(); }
      if (t === 'lancamentos') validarLanc(novo);
      tab(t)[i] = novo; hist(t, id, acao, clone(old), clone(novo), atual?.id); emitir(t);
      return clone(novo);
    },
    async atualizarVarios(t, ids, patch) { const out = []; for (const id of ids) out.push(await this.atualizar(t, id, patch, null)); return out; },
    async apagar(t, id) {
      const i = tab(t).findIndex((x) => x.id === id);
      if (i >= 0) { hist(t, id, 'apagado_definitivamente', clone(tab(t)[i]), null, atual?.id); tab(t).splice(i, 1); }
      emitir(t);
    },
    async apagarVarios(t, ids) { for (const id of ids) await this.apagar(t, id); },
    async historico(id) { return clone(T.historico.filter((h) => h.registro_id === id).reverse()); },
    async historicoRecente(n = 100) { return clone(T.historico.slice(-n).reverse()); },
    async restaurarBackup(dados) {
      const res = {};
      for (const [t, linhas] of Object.entries(dados)) {
        if (!T[t] || t === 'historico' || t === 'perfis' || t === 'configuracoes') continue;
        let n = 0; for (const l of linhas) if (!T[t].some((x) => x.id === l.id)) { T[t].push(clone(l)); n++; }
        res[t] = n;
      }
      emitir('lancamentos'); return res;
    },
    async enviarAnexo(caminho, arquivo) { blobs.set(caminho, URL.createObjectURL(arquivo)); return caminho; },
    async urlAnexo(caminho) { return blobs.get(caminho) || ''; },
    async removerAnexo(caminho) { blobs.delete(caminho); },
    assinar(cb) { ouvintesDados.add(cb); setTimeout(() => cb('__status', { status: 'SUBSCRIBED' }), 0); return () => ouvintesDados.delete(cb); },
  };
}
