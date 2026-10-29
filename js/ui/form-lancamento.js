import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Modal, CampoValor, Autoria, Sel, Campo, opcoesContas, opcoesPessoas, opcoesProjetos } from './comp.js';
import { store, useStore, fecharForm, criarLancamento, editarLancamento, atualizar, paraLixeira, toast, escolher, confirmar,
  enviarAnexos, urlAnexo, removerAnexoArquivo, historicoDe, nomeUsuario, abrirForm, encerrarRecorrencia } from '../data/store.js';
import { hoje, dataBR, dataHoraBR, brl, primeiroDia, ymDe, uuid, nomeMesCap, addMesYM } from '../lib/fmt.js';
import { faturaDaCompra, dividirParcelas, datasFatura } from '../lib/calc.js';

const FORMAS = [['pix', 'Pix'], ['debito', 'Débito'], ['credito', 'Crédito'], ['dinheiro', 'Dinheiro'], ['boleto', 'Boleto'], ['transferencia', 'Transferência'], ['debito_automatico', 'Débito automático'], ['outro', 'Outro']];
export const NOME_FORMA = Object.fromEntries(FORMAS);
export const NOME_TIPO = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência', pagamento_fatura: 'Pagamento de fatura', reembolso: 'Reembolso / estorno' };
const LS = 'gf.ultimaOrigem';

function padrao(D, perfil, tipo, extra = {}) {
  const pessoaEu = D.pessoas.find((p) => p.perfil_id === perfil?.id);
  const familia = D.pessoas.find((p) => p.tipo === 'familia');
  let origem = null;
  try { origem = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
  const contaValida = (id) => D.contas.some((c) => c.id === id && !c.arquivada);
  const cartaoValido = (id) => D.cartoes.some((c) => c.id === id && !c.arquivado);
  let conta_id = null, cartao_id = null;
  if (tipo === 'despesa' && origem?.cartao_id && cartaoValido(origem.cartao_id)) cartao_id = origem.cartao_id;
  else if (origem?.conta_id && contaValida(origem.conta_id)) conta_id = origem.conta_id;
  else conta_id = D.contas.find((c) => !c.arquivada)?.id || null;
  const h = hoje();
  return {
    tipo, descricao: '', valor_centavos: null, categoria_id: null, subcategoria_id: null,
    data_ocorrencia: h, competencia: primeiroDia(h.slice(0, 7)), vencimento: null, data_efetiva: h,
    conta_id, conta_destino_id: null, cartao_id, fatura: null, forma_pagamento: null,
    status: 'efetivado', pagador_id: pessoaEu?.id || null, beneficiario_id: tipo === 'despesa' ? familia?.id || null : null,
    favorecido: '', projeto_id: null, observacoes: '', etiquetas: [], anexos: [], ...extra,
  };
}

export function FormLancamento() {
  const { form, D, perfil } = useStore();
  if (!form) return null;
  return html`<${Formulario} key=${form.chave || form.lancamento?.id || form.tipo} cfg=${form} D=${D} perfil=${perfil} />`;
}

function Formulario({ cfg, D, perfil }) {
  const orig = cfg.lancamento && !cfg.duplicar ? D.mapa.lancamentos[cfg.lancamento.id] || cfg.lancamento : null;
  const editando = !!orig;
  const [f, setF] = useState(() => {
    if (cfg.lancamento) {
      const b = { ...cfg.lancamento };
      if (cfg.duplicar) {
        delete b.id; delete b.versao; delete b.criado_por; delete b.criado_em; delete b.alterado_por; delete b.alterado_em; delete b.excluido_em;
        Object.assign(b, { recorrencia_id: null, recorrencia_seq: null, compra_id: null, parcela_num: null, parcelas_total: null, anexos: [], data_ocorrencia: hoje(), data_efetiva: b.status === 'efetivado' ? hoje() : null, competencia: primeiroDia(hoje().slice(0, 7)) });
        if (b.cartao_id) b.fatura = faturaDaCompra(D.mapa.cartoes[b.cartao_id], b.data_ocorrencia);
      }
      return b;
    }
    return padrao(D, perfil, cfg.tipo || 'despesa', cfg.extra);
  });
  const [parcelas, setParcelas] = useState(1);
  const [rec, setRec] = useState({ ativa: false, frequencia: 'mensal', fim: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [arquivos, setArquivos] = useState([]);
  const [verHist, setVerHist] = useState(false);
  const [compManual, setCompManual] = useState(editando);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const tipo = f.tipo;
  const ehCartao = !!f.cartao_id && tipo !== 'pagamento_fatura';
  const tipoCat = tipo === 'receita' ? 'receita' : 'despesa';
  const catsMae = D.categorias.filter((c) => c.tipo === tipoCat && !c.parent_id && (!c.arquivada || c.id === f.categoria_id));
  const subs = D.categorias.filter((c) => c.parent_id === f.categoria_id && (!c.arquivada || c.id === f.subcategoria_id));
  const cartao = ehCartao ? D.mapa.cartoes[f.cartao_id] : null;

  // fatura e competência acompanham a data da compra
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    if (!montado) { setMontado(true); if (editando) return; }
    if (cartao && !(editando && orig?.parcelas_total > 1)) set({ fatura: faturaDaCompra(cartao, f.data_ocorrencia) });
    if (!compManual && f.data_ocorrencia) set({ competencia: primeiroDia(f.data_ocorrencia.slice(0, 7)) });
  }, [f.data_ocorrencia, f.cartao_id]);

  const origens = [
    ...D.contas.filter((c) => !c.arquivada || c.id === f.conta_id).map((c) => ({ k: 'c:' + c.id, nome: c.nome, icone: c.icone || 'landmark', cor: c.cor, conta_id: c.id, cartao_id: null })),
    ...(tipo === 'despesa' || (tipo === 'reembolso') ? D.cartoes.filter((c) => !c.arquivado || c.id === f.cartao_id).map((c) => ({ k: 'k:' + c.id, nome: c.nome, icone: 'credit-card', cor: c.cor, conta_id: null, cartao_id: c.id })) : []),
  ];
  const origemAtual = f.cartao_id ? 'k:' + f.cartao_id : f.conta_id ? 'c:' + f.conta_id : '';
  const escolherOrigem = (o) => set({ conta_id: o.conta_id, cartao_id: o.cartao_id, forma_pagamento: o.cartao_id ? 'credito' : (f.forma_pagamento === 'credito' ? null : f.forma_pagamento), fatura: o.cartao_id ? faturaDaCompra(D.mapa.cartoes[o.cartao_id], f.data_ocorrencia) : null });

  const trocarTipo = (t) => {
    if (editando) return;
    setF(padrao(D, perfil, t, { valor_centavos: f.valor_centavos, descricao: f.descricao, data_ocorrencia: f.data_ocorrencia, data_efetiva: f.data_efetiva }));
    setParcelas(1);
  };

  function montar() {
    const x = { ...f };
    if (!x.valor_centavos || x.valor_centavos <= 0) throw new Error('Informe um valor maior que zero.');
    if (x.valor_centavos >= 1e13) throw new Error('Valor alto demais.');
    if (!x.data_ocorrencia) throw new Error('Informe a data.');
    if (!x.descricao?.trim()) {
      const nm = D.mapa.categorias[x.subcategoria_id]?.nome || D.mapa.categorias[x.categoria_id]?.nome;
      x.descricao = tipo === 'transferencia' ? `Transferência para ${D.mapa.contas[x.conta_destino_id]?.nome || 'conta'}` : nm || '';
      if (!x.descricao) throw new Error('Escolha uma categoria ou escreva uma descrição.');
    }
    x.descricao = x.descricao.trim().slice(0, 200);
    if (tipo === 'transferencia') {
      if (!x.conta_id || !x.conta_destino_id) throw new Error('Escolha a conta de origem e a de destino.');
      if (x.conta_id === x.conta_destino_id) throw new Error('A conta de destino deve ser diferente da origem.');
      Object.assign(x, { cartao_id: null, fatura: null, categoria_id: null, subcategoria_id: null, forma_pagamento: x.forma_pagamento || 'transferencia' });
    } else if (tipo === 'receita') {
      if (!x.conta_id) throw new Error('Escolha a conta que recebeu.');
      Object.assign(x, { cartao_id: null, fatura: null, conta_destino_id: null });
    } else if (tipo === 'pagamento_fatura') {
      if (!x.conta_id || !x.cartao_id || !x.fatura) throw new Error('Escolha a conta usada no pagamento.');
      Object.assign(x, { conta_destino_id: null, categoria_id: null, subcategoria_id: null });
    } else {
      if (!x.conta_id && !x.cartao_id) throw new Error('Escolha a conta ou o cartão.');
      x.conta_destino_id = null;
    }
    if (x.cartao_id && tipo !== 'pagamento_fatura') {
      if (!x.fatura) x.fatura = faturaDaCompra(D.mapa.cartoes[x.cartao_id], x.data_ocorrencia);
      x.data_efetiva = x.data_ocorrencia; x.conta_id = null;
      if (x.status === 'previsto') x.data_efetiva = null;
    } else if (x.status === 'efetivado') {
      x.data_efetiva = x.data_efetiva || x.data_ocorrencia;
    } else {
      x.data_efetiva = null;
      if (!x.vencimento) x.vencimento = x.data_ocorrencia;
    }
    if (!x.competencia) x.competencia = primeiroDia(x.data_ocorrencia.slice(0, 7));
    x.etiquetas = (x.etiquetas || []).map((t) => t.trim()).filter(Boolean);
    for (const k of ['favorecido', 'observacoes']) x[k] = x[k]?.trim() || null;
    return x;
  }

  async function salvar(e) {
    e?.preventDefault();
    if (salvando) return;
    setErro('');
    let x;
    try { x = montar(); } catch (er) { setErro(er.message); return; }
    setSalvando(true);
    try {
      if (!x.id) x.id = uuid();
      if (arquivos.length) x.anexos = [...(x.anexos || []), ...(await enviarAnexos(x.id, arquivos))];
      if (editando) {
        let escopo = 'esta';
        if (orig.recorrencia_id && orig.status === 'previsto' || orig.recorrencia_id && cfg.perguntarSerie) {
          escopo = await escolher('Editar lançamento recorrente', 'Esta alteração vale para:', [
            { rotulo: 'Somente esta ocorrência', valor: 'esta' }, { rotulo: 'Esta e as próximas previstas', valor: 'futuras', sec: true }]);
          if (!escopo) { setSalvando(false); return; }
        }
        if (orig.compra_id && orig.parcelas_total > 1) {
          const tudo = await escolher('Compra parcelada', 'Aplicar descrição, categoria, pessoas, projeto e observações a:', [
            { rotulo: `Somente a parcela ${orig.parcela_num}/${orig.parcelas_total}`, valor: 'esta' }, { rotulo: 'Todas as parcelas da compra', valor: 'todas', sec: true }]);
          if (!tudo) { setSalvando(false); return; }
          await editarLancamento(orig, x, 'esta');
          if (tudo === 'todas') {
            const campos = ['descricao', 'categoria_id', 'subcategoria_id', 'pagador_id', 'beneficiario_id', 'favorecido', 'projeto_id', 'observacoes', 'etiquetas'];
            for (const p of store.s.D.lancamentos.filter((l) => l.compra_id === orig.compra_id && l.id !== orig.id && !l.excluido_em)) {
              await atualizar('lancamentos', p.id, Object.fromEntries(campos.map((c) => [c, x[c] ?? null])), p.versao);
            }
          }
        } else await editarLancamento(orig, x, escopo);
        toast('Alterações salvas.');
      } else {
        const r = await criarLancamento(x, { parcelas: ehCartao || tipo === 'despesa' ? parcelas : 1, recorrencia: rec.ativa ? { frequencia: rec.frequencia, fim: rec.fim || null } : null });
        if (!r) { setSalvando(false); return; }
        try { localStorage.setItem(LS, JSON.stringify({ conta_id: x.conta_id, cartao_id: x.cartao_id })); } catch {}
        toast(parcelas > 1 ? `Compra registrada em ${parcelas} parcelas.` : rec.ativa ? 'Recorrência criada com as próximas previsões.' : `${NOME_TIPO[tipo]} registrada.`);
      }
      fecharForm();
    } catch (er) {
      setErro(er.message || String(er));
    } finally { setSalvando(false); }
  }

  async function excluir() {
    if (!(await confirmar('Mover para a lixeira?', `“${orig.descricao}” (${brl(orig.valor_centavos)}) sairá dos totais. Você pode recuperar pela Lixeira.`, { ok: 'Mover para a lixeira', perigo: true }))) return;
    try {
      if (orig.recorrencia_id) {
        const esc = await escolher('Lançamento recorrente', 'O que deseja excluir?', [{ rotulo: 'Somente esta ocorrência', valor: 'esta' }, { rotulo: 'Esta e encerrar a recorrência', valor: 'serie', sec: true }]);
        if (!esc) return;
        await paraLixeira(orig);
        if (esc === 'serie') await encerrarRecorrencia(orig.recorrencia_id, orig.data_ocorrencia);
      } else if (orig.compra_id && orig.parcelas_total > 1) {
        const esc = await escolher('Compra parcelada', 'O que deseja excluir?', [{ rotulo: 'Somente esta parcela', valor: 'esta' }, { rotulo: 'Todas as parcelas', valor: 'todas', sec: true }]);
        if (!esc) return;
        const alvo = esc === 'todas' ? store.s.D.lancamentos.filter((l) => l.compra_id === orig.compra_id && !l.excluido_em) : [orig];
        for (const l of alvo) await paraLixeira(l);
      } else await paraLixeira(orig);
      toast('Movido para a lixeira.'); fecharForm();
    } catch (er) { setErro(er.message); }
  }

  const corTipo = { despesa: 'var(--neg)', receita: 'var(--pos)', transferencia: '#0369A1', pagamento_fatura: '#5B21B6', reembolso: '#0E7490' }[tipo];
  const titulo = editando ? `Editar ${NOME_TIPO[tipo].toLowerCase()}` : cfg.duplicar ? 'Duplicar lançamento' : tipo === 'reembolso' ? 'Registrar reembolso / estorno' : 'Novo lançamento';
  const pagoRot = tipo === 'receita' ? ['Já recebida', 'A receber'] : tipo === 'transferencia' ? ['Realizada', 'Agendada'] : ['Já paga', 'A pagar'];
  const valorParcelas = parcelas > 1 && f.valor_centavos ? dividirParcelas(f.valor_centavos, parcelas) : null;

  return html`<${Modal} titulo=${titulo} onClose=${fecharForm} larg=${verHist ? 'larga' : ''}
    icone=${html`<span class="cb p" style=${`background:${corTipo};color:#fff`}><${Icone} n=${tipo === 'receita' ? 'arrow-down-left' : tipo === 'transferencia' ? 'arrow-left-right' : tipo === 'reembolso' ? 'undo-2' : 'arrow-up-right'} /></span>`}
    rodape=${html`
      ${editando && html`<button class="btn fantasma" style="margin-right:auto;color:var(--neg)" onClick=${excluir} type="button"><${Icone} n="trash-2" /> Excluir</button>`}
      <button class="btn sec" type="button" onClick=${fecharForm}>Cancelar</button>
      <button class="btn" type="submit" form="form-lanc" disabled=${salvando}>${salvando ? 'Salvando…' : html`<${Icone} n="check" /> Salvar`}</button>`}>
    <form id="form-lanc" class="pilha" onSubmit=${salvar} noValidate>
      ${editando && html`<div class="info-msg" style="display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center">
        <${Autoria} l=${orig} />
        ${orig.parcelas_total > 1 && html`<span class="pilula pri">Parcela ${orig.parcela_num}/${orig.parcelas_total}</span>`}
        ${orig.recorrencia_id && html`<span class="pilula pri"><${Icone} n="repeat" /> Recorrente</span>`}
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="btn sec peq" onClick=${() => setVerHist(!verHist)}><${Icone} n="history" /> Histórico</button>
          <button type="button" class="btn sec peq" onClick=${() => abrirForm({ lancamento: orig, duplicar: true, chave: 'dup' + orig.id })}><${Icone} n="copy" /> Duplicar</button>
          ${orig.tipo === 'despesa' && html`<button type="button" class="btn sec peq" onClick=${() => abrirForm({ tipo: 'reembolso', chave: 'reemb' + orig.id, extra: reembolsoDe(D, orig) })}><${Icone} n="undo-2" /> Reembolso</button>`}
        </span></div>`}
      ${verHist && html`<${Historico} id=${orig.id} D=${D} />`}

      ${!editando && tipo !== 'reembolso' && html`<div class="tipo-abas" role="tablist">
        ${['despesa', 'receita', 'transferencia'].map((t) => html`<button type="button" role="tab" aria-selected=${tipo === t} class=${(tipo === t ? 'on ' : '') + t} onClick=${() => trocarTipo(t)}>
          <${Icone} n=${t === 'despesa' ? 'arrow-up-right' : t === 'receita' ? 'arrow-down-left' : 'arrow-left-right'} />${NOME_TIPO[t]}</button>`)}
      </div>`}
      ${tipo === 'reembolso' && f.origem_id && html`<div class="info-msg">Vinculado a “${D.mapa.lancamentos[f.origem_id]?.descricao}” (${brl(D.mapa.lancamentos[f.origem_id]?.valor_centavos)}). O reembolso reduz a despesa da categoria — não conta como receita.</div>`}
      ${tipo === 'pagamento_fatura' && html`<div class="info-msg">Pagamento da fatura de ${nomeMesCap(f.fatura?.slice(0, 7) || '2000-01')} do cartão ${D.mapa.cartoes[f.cartao_id]?.nome}. Reduz o saldo da conta e quita a fatura — não é uma nova despesa.</div>`}

      <div>
        <label class="sr" for="valor">Valor</label>
        <${CampoValor} id="valor" grande autoFocus=${!editando} valor=${f.valor_centavos} onChange=${(v) => set({ valor_centavos: v })} />
        ${valorParcelas && html`<div style="text-align:center;font-size:13px;color:var(--txt2);margin-top:4px">${parcelas}× de ${brl(valorParcelas[parcelas - 1])}${valorParcelas[0] !== valorParcelas[parcelas - 1] ? ` (1ª: ${brl(valorParcelas[0])})` : ''} — total exato ${brl(f.valor_centavos)}</div>`}
      </div>

      ${(tipo === 'despesa' || tipo === 'receita' || tipo === 'reembolso') && html`
        <div class="campo"><span>Categoria</span>
          <div class="cat-grade">${catsMae.map((c) => html`<button type="button" class=${'cat-op' + (f.categoria_id === c.id ? ' on' : '')} style=${f.categoria_id === c.id ? `color:${c.cor}` : ''}
            aria-pressed=${f.categoria_id === c.id} onClick=${() => set({ categoria_id: c.id, subcategoria_id: null })}><${CatIcone} cat=${c} />${c.nome}</button>`)}</div>
        </div>
        ${subs.length > 0 && html`<div class="campo"><span>Subcategoria</span><div class="chips">${subs.map((s) => html`<button type="button" class=${'chip' + (f.subcategoria_id === s.id ? ' on' : '')}
          onClick=${() => set({ subcategoria_id: f.subcategoria_id === s.id ? null : s.id })}>${s.nome}</button>`)}</div></div>`}`}

      ${tipo !== 'transferencia' && tipo !== 'pagamento_fatura' && html`<div class="campo"><span>${tipo === 'receita' ? 'Recebido em' : tipo === 'reembolso' ? 'Creditado em' : 'Pago com'}</span>
        ${origens.length ? html`<div class="chips">${origens.map((o) => html`<button type="button" class=${'chip' + (origemAtual === o.k ? ' on' : '')} onClick=${() => escolherOrigem(o)}
          style=${origemAtual === o.k ? `background:${o.cor};border-color:${o.cor}` : ''}><${Icone} n=${o.icone} />${o.nome}</button>`)}</div>`
          : html`<div class="aviso-msg">Cadastre uma conta em <a href="#/contas" onClick=${fecharForm}>Contas e cartões</a> antes de lançar.</div>`}
        ${cartao && html`<small>Entra na fatura de <b>${nomeMesCap(f.fatura?.slice(0, 7) || faturaDaCompra(cartao, f.data_ocorrencia).slice(0, 7))}</b> (vence ${dataBR(datasFatura(cartao, f.fatura || faturaDaCompra(cartao, f.data_ocorrencia)).vencimento)}).</small>`}
      </div>`}

      ${tipo === 'pagamento_fatura' && html`<${Campo} rot="Pago com a conta" obrig><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Escolha…" opcoes=${opcoesContas(D)} /></${Campo}>`}
      ${tipo === 'transferencia' && html`<div class="linha">
        <${Campo} rot="De (origem)" obrig><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Escolha…" opcoes=${opcoesContas(D)} /></${Campo}>
        <${Campo} rot="Para (destino)" obrig><${Sel} valor=${f.conta_destino_id} onChange=${(v) => set({ conta_destino_id: v })} vazio="Escolha…" opcoes=${opcoesContas(D).filter((o) => o.v !== f.conta_id)} /></${Campo}>
      </div><small style="color:var(--txt3);margin-top:-6px">Transferências movem dinheiro entre contas da família: não contam como receita nem despesa.</small>`}

      <div class="linha">
        <${Campo} rot="Descrição"><input class="inp" maxLength="200" value=${f.descricao} onInput=${(e) => set({ descricao: e.target.value })}
          placeholder=${tipo === 'transferencia' ? 'Ex.: Guardar na reserva' : D.mapa.categorias[f.subcategoria_id || f.categoria_id]?.nome || 'Ex.: Mercado do mês'} list="sugestoes-desc" /></${Campo}>
        <${Campo} rot=${ehCartao ? 'Data da compra' : 'Data'} obrig><input class="inp" type="date" required value=${f.data_ocorrencia}
          onInput=${(e) => set({ data_ocorrencia: e.target.value, ...(f.status === 'efetivado' && !ehCartao ? { data_efetiva: e.target.value } : {}) })} /></${Campo}>
      </div>
      <datalist id="sugestoes-desc">${useMemo(() => [...new Set(D.lancamentos.slice(-300).map((l) => l.descricao))].slice(0, 80), [D.lancamentos.length]).map((d) => html`<option value=${d} />`)}</datalist>

      ${!(ehCartao && tipo === 'despesa' && (f.status !== 'previsto' || !editando)) && html`<div class="btn-grupo" role="radiogroup" aria-label="Situação">
        ${[['efetivado', pagoRot[0]], ['previsto', pagoRot[1]]].map(([v, r]) => html`<button type="button" role="radio" aria-checked=${f.status === v} class=${f.status === v ? 'on' : ''}
          onClick=${() => set({ status: v, data_efetiva: v === 'efetivado' ? (f.data_efetiva || f.data_ocorrencia) : null, vencimento: v === 'previsto' ? (f.vencimento || f.data_ocorrencia) : f.vencimento })}>
          <${Icone} n=${v === 'efetivado' ? 'circle-check' : 'clock'} /> ${r}</button>`)}
        ${editando && html`<button type="button" class=${f.status === 'cancelado' ? 'on' : ''} onClick=${() => set({ status: 'cancelado', data_efetiva: null })}><${Icone} n="x" /> Cancelado</button>`}
      </div>`}
      ${f.status === 'previsto' && !ehCartao && html`<${Campo} rot="Vencimento" obrig><input class="inp" type="date" value=${f.vencimento || ''} onInput=${(e) => set({ vencimento: e.target.value })} /></${Campo}>`}

      <details class="mais-detalhes" open=${editando && (f.observacoes || f.projeto_id || (f.etiquetas || []).length > 0)}>
        <summary><${Icone} n="chevron-down" /> Mais detalhes (pessoas, competência, parcelas, recorrência, anexos…)</summary>
        <div class="pilha" style="margin-top:14px">
          ${tipo !== 'transferencia' && html`<div class="linha">
            <${Campo} rot=${tipo === 'receita' ? 'Quem recebeu' : 'Quem pagou'}><${Sel} valor=${f.pagador_id} onChange=${(v) => set({ pagador_id: v })} vazio="—" opcoes=${opcoesPessoas(D)} /></${Campo}>
            ${tipo !== 'receita' && html`<${Campo} rot="A quem se refere (beneficiário)"><${Sel} valor=${f.beneficiario_id} onChange=${(v) => set({ beneficiario_id: v })} vazio="—" opcoes=${opcoesPessoas(D)} /></${Campo}>`}
          </div>`}
          <div class="linha">
            ${tipo !== 'transferencia' && html`<${Campo} rot=${tipo === 'receita' ? 'Fonte pagadora' : 'Estabelecimento / favorecido'}><input class="inp" value=${f.favorecido || ''} onInput=${(e) => set({ favorecido: e.target.value })} /></${Campo}>`}
            <${Campo} rot="Forma de pagamento"><${Sel} valor=${f.forma_pagamento} onChange=${(v) => set({ forma_pagamento: v })} vazio="—" opcoes=${FORMAS.map(([v, r]) => ({ v, r }))} /></${Campo}>
          </div>
          <div class="linha">
            ${tipo !== 'transferencia' && html`<${Campo} rot="Competência" dica="Mês ao qual o gasto pertence."><input class="inp" type="month" value=${(f.competencia || '').slice(0, 7)} onInput=${(e) => { setCompManual(true); set({ competencia: e.target.value ? e.target.value + '-01' : null }); }} /></${Campo}>`}
            ${f.status === 'efetivado' && !ehCartao && html`<${Campo} rot=${tipo === 'receita' ? 'Data do recebimento' : 'Data do pagamento'}><input class="inp" type="date" value=${f.data_efetiva || ''} onInput=${(e) => set({ data_efetiva: e.target.value })} /></${Campo}>`}
            ${f.status === 'efetivado' && !ehCartao && html`<${Campo} rot="Vencimento"><input class="inp" type="date" value=${f.vencimento || ''} onInput=${(e) => set({ vencimento: e.target.value || null })} /></${Campo}>`}
            ${ehCartao && html`<${Campo} rot="Fatura" dica="Calculada pelo fechamento do cartão; ajuste se necessário."><input class="inp" type="month" value=${(f.fatura || '').slice(0, 7)} onInput=${(e) => e.target.value && set({ fatura: e.target.value + '-01' })} /></${Campo}>`}
          </div>
          <div class="linha">
            <${Campo} rot="Projeto relacionado"><${Sel} valor=${f.projeto_id} onChange=${(v) => set({ projeto_id: v })} vazio="Nenhum" opcoes=${opcoesProjetos(D).concat(f.projeto_id && !opcoesProjetos(D).some((o) => o.v === f.projeto_id) ? [{ v: f.projeto_id, r: D.mapa.projetos[f.projeto_id]?.nome }] : [])} /></${Campo}>
            <${Campo} rot="Etiquetas" dica="Separe por vírgula."><input class="inp" value=${(f.etiquetas || []).join(', ')} onInput=${(e) => set({ etiquetas: e.target.value.split(',') })} /></${Campo}>
          </div>
          <${Campo} rot="Observações"><textarea class="inp" value=${f.observacoes || ''} onInput=${(e) => set({ observacoes: e.target.value })}></textarea></${Campo}>

          ${!editando && tipo === 'despesa' && html`<div class="linha">
            <${Campo} rot="Parcelamento" dica=${ehCartao ? 'As parcelas entram nas faturas seguintes.' : 'Da 2ª em diante ficam previstas, mês a mês.'}>
              <${Sel} valor=${String(parcelas)} onChange=${(v) => { setParcelas(Number(v) || 1); if (Number(v) > 1) setRec({ ...rec, ativa: false }); }}
                opcoes=${Array.from({ length: 24 }, (_, i) => ({ v: String(i + 1), r: i === 0 ? 'À vista' : `${i + 1} parcelas` }))} /></${Campo}>
          </div>`}
          ${!editando && (tipo === 'despesa' || tipo === 'receita') && parcelas === 1 && html`<div class="pilha" style="gap:10px">
            <label class="chk"><input type="checkbox" checked=${rec.ativa} onChange=${(e) => setRec({ ...rec, ativa: e.target.checked })} /> Repetir (recorrência)</label>
            ${rec.ativa && html`<div class="linha">
              <${Campo} rot="Frequência"><${Sel} valor=${rec.frequencia} onChange=${(v) => setRec({ ...rec, frequencia: v })} opcoes=${[{ v: 'semanal', r: 'Semanal' }, { v: 'quinzenal', r: 'Quinzenal' }, { v: 'mensal', r: 'Mensal' }, { v: 'anual', r: 'Anual' }]} /></${Campo}>
              <${Campo} rot="Termina em (opcional)"><input class="inp" type="date" value=${rec.fim} onInput=${(e) => setRec({ ...rec, fim: e.target.value })} /></${Campo}>
            </div><small style="color:var(--txt3)">As próximas ocorrências são criadas como <b>previstas</b> — você confirma o pagamento de cada uma.</small>`}
          </div>`}
          <${Anexos} f=${f} set=${set} arquivos=${arquivos} setArquivos=${setArquivos} />
        </div>
      </details>
      ${erro && html`<div class="erro-msg" role="alert">${erro}</div>`}
      <button type="submit" class="sr">Salvar</button>
    </form>
  </${Modal}>`;
}

export function reembolsoDe(D, l) {
  return { origem_id: l.id, descricao: 'Reembolso: ' + l.descricao, valor_centavos: l.valor_centavos, categoria_id: l.categoria_id, subcategoria_id: l.subcategoria_id,
    conta_id: l.conta_id, cartao_id: l.cartao_id, fatura: l.cartao_id ? faturaDaCompra(D.mapa.cartoes[l.cartao_id], hoje()) : null,
    beneficiario_id: l.beneficiario_id, projeto_id: l.projeto_id, favorecido: l.favorecido };
}

function Anexos({ f, set, arquivos, setArquivos }) {
  const abrir = async (a) => { try { const u = await urlAnexo(a.caminho); if (u) window.open(u, '_blank', 'noopener'); } catch (e) { toast(e.message, 'erro'); } };
  const remover = async (a) => {
    if (!(await confirmar('Remover anexo?', a.nome, { ok: 'Remover', perigo: true }))) return;
    try { await removerAnexoArquivo(a.caminho); } catch {}
    set({ anexos: (f.anexos || []).filter((x) => x.caminho !== a.caminho) });
  };
  return html`<div class="campo"><span>Comprovantes e anexos</span>
    <div class="chips">
      ${(f.anexos || []).map((a) => html`<span class="chip"><${Icone} n="paperclip" /><a href="#" onClick=${(e) => { e.preventDefault(); abrir(a); }}>${a.nome}</a>
        <button type="button" class="btn fantasma ico peq" style="min-height:0;padding:2px" aria-label="Remover anexo" onClick=${() => remover(a)}><${Icone} n="x" /></button></span>`)}
      ${arquivos.map((a, i) => html`<span class="chip">${a.name} <button type="button" class="btn fantasma ico peq" style="min-height:0;padding:2px" onClick=${() => setArquivos(arquivos.filter((_, j) => j !== i))} aria-label="Retirar"><${Icone} n="x" /></button></span>`)}
      <label class="btn sec peq"><${Icone} n="upload" /> Adicionar<input type="file" multiple accept="image/*,application/pdf" class="sr" onChange=${(e) => setArquivos([...arquivos, ...e.target.files])} /></label>
    </div><small>Imagens ou PDF, até 10 MB cada. Ficam em armazenamento privado da família.</small></div>`;
}

const ROTULOS = { descricao: 'Descrição', valor_centavos: 'Valor', categoria_id: 'Categoria', subcategoria_id: 'Subcategoria', data_ocorrencia: 'Data', competencia: 'Competência',
  vencimento: 'Vencimento', data_efetiva: 'Data efetiva', conta_id: 'Conta', conta_destino_id: 'Conta destino', cartao_id: 'Cartão', fatura: 'Fatura', forma_pagamento: 'Forma de pagamento',
  status: 'Situação', pagador_id: 'Quem pagou/recebeu', beneficiario_id: 'Beneficiário', favorecido: 'Favorecido', projeto_id: 'Projeto', observacoes: 'Observações', etiquetas: 'Etiquetas', anexos: 'Anexos' };
const NOME_ACAO = { criado: 'Lançado', alterado: 'Alterado', enviado_lixeira: 'Enviado para a lixeira', restaurado: 'Restaurado da lixeira', apagado_definitivamente: 'Apagado definitivamente', restaurado_backup: 'Restaurado de backup' };
const STATUS = { previsto: 'Previsto', efetivado: 'Pago/recebido', cancelado: 'Cancelado' };

export function formatarCampo(D, k, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
  if (k === 'valor_centavos') return brl(v);
  if (k === 'categoria_id' || k === 'subcategoria_id') return D.mapa.categorias[v]?.nome || '?';
  if (k === 'conta_id' || k === 'conta_destino_id') return D.mapa.contas[v]?.nome || '?';
  if (k === 'cartao_id') return D.mapa.cartoes[v]?.nome || '?';
  if (k === 'pagador_id' || k === 'beneficiario_id') return D.mapa.pessoas[v]?.nome || '?';
  if (k === 'projeto_id') return D.mapa.projetos[v]?.nome || '?';
  if (k === 'status') return STATUS[v] || v;
  if (k === 'forma_pagamento') return NOME_FORMA[v] || v;
  if (k === 'competencia' || k === 'fatura') return nomeMesCap(String(v).slice(0, 7));
  if (/data|vencimento/.test(k)) return dataBR(v);
  if (k === 'anexos') return v.map((a) => a.nome).join(', ');
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export function Historico({ id, D }) {
  const [itens, setItens] = useState(null);
  useEffect(() => { historicoDe(id).then(setItens).catch((e) => setItens({ erro: e.message })); }, [id, D.lancamentos]);
  if (!itens) return html`<div class="card" style="padding:12px">Carregando histórico…</div>`;
  if (itens.erro) return html`<div class="erro-msg">${itens.erro}</div>`;
  return html`<div class="card" style="padding:14px"><h3><${Icone} n="history" /> Histórico de alterações</h3>
    ${itens.map((h) => {
      const difs = h.antes && h.depois ? Object.keys(ROTULOS).filter((k) => JSON.stringify(h.antes[k] ?? null) !== JSON.stringify(h.depois[k] ?? null)) : [];
      return html`<div class="hist-item"><b>${NOME_ACAO[h.acao] || h.acao}</b> por ${nomeUsuario(h.usuario) || 'sistema'} em ${dataHoraBR(h.em)}
        ${difs.length > 0 && html`<div class="dif">${difs.map((k) => html`<div>${ROTULOS[k]}: <s>${formatarCampo(D, k, h.antes[k])}</s> → <ins>${formatarCampo(D, k, h.depois[k])}</ins></div>`)}</div>`}</div>`;
    })}</div>`;
}
