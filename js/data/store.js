// Estado global + ações. A UI lê daqui; toda gravação passa pelo backend (servidor valida autoria e regras).
import { useEffect, useState } from 'preact/hooks';
import { indexar, recorrenciasPendentes, dividirParcelas, faturaDaCompra, ocorrencias } from '../lib/calc.js';
import { hoje, addMesYM, ultimoDia, mesAtual, uuid, primeiroDia, addMesYM as addYM, ymDe, dataHoraBR } from '../lib/fmt.js';
import { ErroConflito, erroAmigavel } from './backend-supabase.js';

const CHAVE = { projeto_tarefas: 'tarefas' };
const chaveD = (t) => CHAVE[t] || t;

const vazio = () => indexar({ lancamentos: [], contas: [], cartoes: [], categorias: [], pessoas: [], projetos: [], tarefas: [],
  metas: [], aportes: [], orcamentos: [], recorrencias: [], perfis: [], config: {} });

export const store = {
  s: {
    fase: 'iniciando', // iniciando | login | redefinir | carregando | pronto | negado | erro | config
    backend: null, sessao: null, perfil: null, D: vazio(), versaoD: 0,
    mes: mesAtual(), toasts: [], form: null, dialogo: null, online: true, sinc: 'conectando', erro: null,
  },
  ouvintes: new Set(),
  set(p) { this.s = { ...this.s, ...(typeof p === 'function' ? p(this.s) : p) }; this.ouvintes.forEach((f) => f(this.s)); },
};
export function useStore() {
  const [, setV] = useState(0);
  useEffect(() => { const f = () => setV((v) => v + 1); store.ouvintes.add(f); f(); return () => store.ouvintes.delete(f); }, []);
  return store.s;
}
const B = () => store.s.backend;
const uid = () => store.s.sessao?.user?.id;

// ------------------------------------------------------------------ avisos
let tid = 0;
export function toast(msg, tipo = 'ok', ms = 4200) {
  const id = ++tid;
  store.set((s) => ({ toasts: [...s.toasts, { id, msg, tipo }] }));
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
export function confirmar(titulo, texto, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((res) => store.set({ dialogo: { tipo: 'confirmar', titulo, texto, ok, perigo, res } }));
}
export function escolher(titulo, texto, opcoes) {
  return new Promise((res) => store.set({ dialogo: { tipo: 'escolher', titulo, texto, opcoes, res } }));
}
export const fecharDialogo = (v) => { const d = store.s.dialogo; store.set({ dialogo: null }); d?.res?.(v); };

// ------------------------------------------------------------------ dados locais
function publicar(D) { indexar(D); store.set((s) => ({ D, versaoD: s.versaoD + 1 })); }
function aplicar(tabela, linhas) {
  const D = { ...store.s.D };
  if (tabela === 'configuracoes') { if (linhas[0]) D.config = linhas[0]; publicar(D); return; }
  const k = chaveD(tabela);
  const arr = [...D[k]];
  for (const l of linhas) { const i = arr.findIndex((x) => x.id === l.id); if (i >= 0) arr[i] = l; else arr.push(l); }
  D[k] = arr; publicar(D);
}
function tirar(tabela, ids) {
  const D = { ...store.s.D }; const k = chaveD(tabela);
  D[k] = D[k].filter((x) => !ids.includes(x.id)); publicar(D);
}
function montarD(raw) {
  const D = { ...raw, tarefas: raw.projeto_tarefas || [], config: (raw.configuracoes || [])[0] || {} };
  delete D.projeto_tarefas; delete D.configuracoes;
  for (const k of ['pessoas', 'categorias', 'contas', 'cartoes', 'projetos', 'tarefas']) D[k].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome || a.titulo).localeCompare(String(b.nome || b.titulo), 'pt-BR'));
  return indexar(D);
}

// ------------------------------------------------------------------ ciclo de vida
let desassinar = null;
export async function iniciar(backend) {
  store.set({ backend });
  backend.aoMudarAuth(async (evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { store.set({ sessao, fase: 'redefinir' }); return; }
    if (evento === 'SIGNED_OUT') { desassinar?.(); store.set({ sessao: null, perfil: null, fase: 'login', D: vazio() }); return; }
    if (evento === 'SIGNED_IN' && store.s.fase !== 'redefinir' && (!store.s.sessao || store.s.sessao.user.id !== sessao?.user?.id)) {
      store.set({ sessao }); await carregar();
    }
    if (evento === 'TOKEN_REFRESHED') store.set({ sessao });
  });
  const sessao = await backend.sessao();
  if (/type=(recovery|invite)/.test(location.hash)) { store.set({ sessao, fase: 'redefinir' }); return; }
  if (!sessao) { store.set({ fase: 'login' }); return; }
  store.set({ sessao }); await carregar();
}

export async function carregar({ silencioso = false } = {}) {
  if (!silencioso) store.set({ fase: 'carregando' });
  try {
    const raw = await B().carregarTudo();
    const D = montarD(raw);
    const perfil = D.perfis.find((p) => p.id === uid());
    if (!perfil) { store.set({ fase: 'negado' }); return; }
    store.set({ perfil, fase: 'pronto' });
    publicar(D);
    await gerarRecorrencias();
    if (!desassinar) desassinar = B().assinar(aoMudarRemoto);
  } catch (e) {
    console.error(e);
    store.set({ fase: silencioso ? store.s.fase : 'erro', erro: erroAmigavel(e) });
    if (silencioso) toast('Não foi possível atualizar: ' + erroAmigavel(e), 'erro');
  }
}

const pendentesRecarga = new Set(); let timerRecarga = null;
function aoMudarRemoto(tabela, payload) {
  if (tabela === '__status') { store.set({ sinc: payload.status === 'SUBSCRIBED' ? 'ok' : payload.status === 'CLOSED' ? 'off' : 'conectando' }); return; }
  pendentesRecarga.add(tabela);
  clearTimeout(timerRecarga);
  timerRecarga = setTimeout(recarregarPendentes, 350);
}
async function recarregarPendentes() {
  const ts = [...pendentesRecarga]; pendentesRecarga.clear();
  try {
    const res = await Promise.all(ts.map((t) => B().listar(t)));
    const D = { ...store.s.D };
    ts.forEach((t, i) => { if (t === 'configuracoes') D.config = res[i][0] || {}; else D[chaveD(t)] = res[i]; });
    publicar(montarD({ ...D, projeto_tarefas: D.tarefas, configuracoes: [D.config] }));
  } catch (e) { console.warn('recarga', e); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { if (store.s.fase === 'pronto') carregar({ silencioso: true }); });
  window.addEventListener('online', () => { store.set({ online: true }); if (store.s.fase === 'pronto') carregar({ silencioso: true }); });
  window.addEventListener('offline', () => store.set({ online: false }));
}

export async function gerarRecorrencias() {
  const D = store.s.D;
  const ate = ultimoDia(addMesYM(mesAtual(), (D.config?.horizonte_recorrencia_meses ?? 12)));
  const novas = recorrenciasPendentes(D, ate).map((l) => ({ id: uuid(), ...l }));
  if (!novas.length) return;
  try {
    const ins = await B().inserirIgnorandoDuplicados('lancamentos', novas, 'recorrencia_id,recorrencia_seq');
    aplicar('lancamentos', ins);
    // se outro dispositivo gerou ao mesmo tempo, busca o que ficou
    if (ins.length < novas.length) aplicar('lancamentos', await B().listar('lancamentos'));
  } catch (e) { console.warn('recorrências', e); }
}

// ------------------------------------------------------------------ autenticação
export const entrar = (email, senha) => B().entrar(email, senha);
export const sair = () => B().sair();
export const recuperarSenha = (email) => B().recuperarSenha(email);
export async function definirSenha(senha) {
  await B().definirSenha(senha);
  history.replaceState(null, '', location.pathname + location.search);
  toast('Senha atualizada com sucesso.');
  await carregar();
}

// ------------------------------------------------------------------ gravação genérica
let gravando = new Set();
/** Garante que um mesmo botão não dispare duas gravações simultâneas. */
async function umaVez(chave, fn) {
  if (gravando.has(chave)) return null;
  gravando.add(chave);
  try { return await fn(); } finally { gravando.delete(chave); }
}
export async function inserir(tabela, linhas, chave) {
  linhas = linhas.map((l) => ({ id: l.id || uuid(), ...l }));
  return umaVez(chave || tabela + linhas[0].id, async () => {
    const r = await B().inserir(tabela, linhas);
    aplicar(tabela, r); return r;
  });
}
export async function atualizar(tabela, id, patch, versao) {
  return umaVez('u' + tabela + id, async () => {
    try {
      const r = await B().atualizar(tabela, id, limparMeta(patch), versao);
      aplicar(tabela, [r]); return r;
    } catch (e) {
      if (e instanceof ErroConflito || e?.conflito) {
        if (e.atual) aplicar(tabela, [e.atual]);
        const quem = nomeUsuario(e.atual?.alterado_por);
        throw new Error(`${quem ? quem + ' alterou' : 'Este registro foi alterado'} este item${e.atual?.alterado_em ? ' em ' + dataHoraBR(e.atual.alterado_em) : ''} enquanto você editava. Carregamos a versão mais recente — revise e salve de novo.`);
      }
      throw e;
    }
  });
}
export async function apagar(tabela, id) { await B().apagar(tabela, id); tirar(tabela, [id]); }
function limparMeta(p) {
  const x = { ...p };
  for (const k of ['id', 'criado_por', 'criado_em', 'alterado_por', 'alterado_em', 'versao', 'excluido_por']) delete x[k];
  return x;
}
export function nomeUsuario(id) { return id ? store.s.D.mapa.perfis[id]?.nome || 'Usuário' : ''; }
export async function salvar(tabela, dados) {
  if (dados.id && (tabela === 'configuracoes' ? true : store.s.D.mapa?.[chaveD(tabela)]?.[dados.id] || findIn(tabela, dados.id))) {
    return atualizar(tabela, dados.id, dados, dados.versao);
  }
  return (await inserir(tabela, [dados]))?.[0];
}
const findIn = (t, id) => (store.s.D[chaveD(t)] || []).find?.((x) => x.id === id);

// ------------------------------------------------------------------ lançamentos
/** Cria um lançamento simples, uma compra parcelada (n linhas) ou uma recorrência (+ previsões). */
export async function criarLancamento(base, { parcelas = 1, recorrencia = null } = {}) {
  const D = store.s.D;
  if (recorrencia) {
    const rec = { id: uuid(), tipo: base.tipo, descricao: base.descricao, valor_centavos: base.valor_centavos, categoria_id: base.categoria_id,
      subcategoria_id: base.subcategoria_id, conta_id: base.cartao_id ? null : base.conta_id, cartao_id: base.cartao_id || null,
      forma_pagamento: base.forma_pagamento, pagador_id: base.pagador_id, beneficiario_id: base.beneficiario_id, favorecido: base.favorecido,
      projeto_id: base.projeto_id, observacoes: base.observacoes, etiquetas: base.etiquetas || [], frequencia: recorrencia.frequencia,
      inicio: base.vencimento || base.data_ocorrencia, fim: recorrencia.fim || null, ativa: true };
    const r = await inserir('recorrencias', [rec]);
    if (!r) return null;
    // a 1ª ocorrência recebe o status escolhido no formulário (ex.: já paga)
    const primeira = { id: base.id || uuid(), ...base, recorrencia_id: rec.id, recorrencia_seq: 1 };
    const ok = await inserir('lancamentos', [primeira]);
    await gerarRecorrencias();
    return ok;
  }
  if (parcelas > 1) {
    const compraId = uuid();
    const valores = dividirParcelas(base.valor_centavos, parcelas);
    const cartao = base.cartao_id ? D.mapa.cartoes[base.cartao_id] : null;
    const fat1 = cartao ? faturaDaCompra(cartao, base.data_ocorrencia) : null;
    const comp1 = ymDe(base.competencia || base.data_ocorrencia);
    const venc1 = base.vencimento || base.data_ocorrencia;
    const linhas = valores.map((v, i) => ({
      ...base, id: i === 0 && base.id ? base.id : uuid(), valor_centavos: v, compra_id: compraId, parcela_num: i + 1, parcelas_total: parcelas,
      competencia: primeiroDia(addYM(comp1, i)),
      fatura: cartao ? primeiroDia(addYM(fat1.slice(0, 7), i)) : null,
      vencimento: cartao ? null : (i === 0 ? venc1 : addMesesData(venc1, i)),
      status: cartao ? base.status : (i === 0 ? base.status : 'previsto'),
      data_efetiva: cartao ? base.data_ocorrencia : (i === 0 ? base.data_efetiva : null),
    }));
    return inserir('lancamentos', linhas, 'compra' + linhas[0].id);
  }
  return inserir('lancamentos', [{ id: base.id || uuid(), ...base }]);
}
import { addMeses } from '../lib/fmt.js';
const addMesesData = (iso, n) => addMeses(iso, n, Number(iso.slice(8, 10)));

/** Edita um lançamento; para séries recorrentes, `escopo` = 'esta' | 'futuras'. */
export async function editarLancamento(orig, novo, escopo = 'esta') {
  const r = await atualizar('lancamentos', orig.id, novo, orig.versao);
  if (escopo === 'futuras' && orig.recorrencia_id) {
    const D = store.s.D;
    const rec = D.mapa.recorrencias[orig.recorrencia_id];
    const campos = ['descricao', 'valor_centavos', 'categoria_id', 'subcategoria_id', 'conta_id', 'cartao_id', 'forma_pagamento', 'pagador_id',
      'beneficiario_id', 'favorecido', 'projeto_id', 'observacoes', 'etiquetas'];
    const patch = Object.fromEntries(campos.map((c) => [c, novo[c] ?? null]));
    patch.etiquetas = novo.etiquetas || [];
    if (rec) await atualizar('recorrencias', rec.id, patch, rec.versao);
    const futuras = D.lancamentos.filter((l) => l.recorrencia_id === orig.recorrencia_id && l.recorrencia_seq > orig.recorrencia_seq && l.status === 'previsto' && !l.excluido_em);
    if (futuras.length) {
      const cartao = patch.cartao_id ? D.mapa.cartoes[patch.cartao_id] : null;
      for (const f of futuras) {
        const p2 = { ...patch, fatura: cartao ? faturaDaCompra(cartao, f.data_ocorrencia) : null };
        try { await atualizar('lancamentos', f.id, p2, f.versao); } catch (e) { toast(e.message, 'erro'); }
      }
    }
  }
  return r;
}
export async function encerrarRecorrencia(recId, aPartirDe) {
  const D = store.s.D; const rec = D.mapa.recorrencias[recId];
  if (!rec) return;
  const fim = aPartirDe; // última data incluída = véspera
  await atualizar('recorrencias', rec.id, { fim: fim < rec.inicio ? rec.inicio : fim, ativa: false }, rec.versao);
  const futuras = D.lancamentos.filter((l) => l.recorrencia_id === recId && l.status === 'previsto' && l.data_ocorrencia > fim && !l.excluido_em);
  if (futuras.length) { const r = await B().atualizarVarios('lancamentos', futuras.map((f) => f.id), { excluido_em: new Date().toISOString() }); aplicar('lancamentos', r); }
}
export async function paraLixeira(l) { return atualizar('lancamentos', l.id, { excluido_em: new Date().toISOString() }, l.versao); }
export async function restaurarDaLixeira(l) { return atualizar('lancamentos', l.id, { excluido_em: null }, l.versao); }
export async function apagarDefinitivo(l) {
  for (const a of l.anexos || []) { try { await B().removerAnexo(a.caminho); } catch {} }
  await apagar('lancamentos', l.id);
}
export async function marcarPago(l, data = hoje(), contaId) {
  return atualizar('lancamentos', l.id, { status: 'efetivado', data_efetiva: data, conta_id: contaId || l.conta_id }, l.versao);
}

// ------------------------------------------------------------------ anexos
export async function enviarAnexos(lancId, arquivos) {
  const out = [];
  for (const f of arquivos) {
    if (f.size > 10 * 1024 * 1024) { toast(`${f.name}: limite de 10 MB por arquivo.`, 'erro'); continue; }
    const nomeSeguro = f.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const caminho = `${lancId}/${uuid().slice(0, 8)}-${nomeSeguro}`;
    await B().enviarAnexo(caminho, f);
    out.push({ caminho, nome: f.name, tipo: f.type, tamanho: f.size });
  }
  return out;
}
export const urlAnexo = (c) => B().urlAnexo(c);
export const removerAnexoArquivo = (c) => B().removerAnexo(c);
export const historicoDe = (id) => B().historico(id);
export const historicoRecente = (n) => B().historicoRecente(n);
export const restaurarBackup = (d) => B().restaurarBackup(d);
export const abrirForm = (cfg) => store.set({ form: cfg });
export const fecharForm = () => store.set({ form: null });
export const setMes = (mes) => store.set({ mes });
export { ocorrencias };
