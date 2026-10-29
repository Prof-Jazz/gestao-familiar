import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import htm from 'htm';
import { ICONES } from '../lib/icons.js';
import { brl, nomeMesCap, addMesYM, mesAtual, dataHoraBR, parseValor, numBR } from '../lib/fmt.js';
import { store, useStore, setMes, fecharDialogo, nomeUsuario } from '../data/store.js';
import { BASES, tomSaldo } from '../lib/calc.js';

export const html = htm.bind(h);

/** Logos de bancos e instituições de pagamento (ícone = "banco:<id>"). */
export const LOGOS = [
  { id: 'nubank', nome: 'Nubank', cor: '#820AD1', chaves: ['nubank', 'nu pagamentos', 'roxinho'] },
  { id: 'inter', nome: 'Inter', cor: '#EA7100', chaves: ['inter'] },
  { id: 'itau', nome: 'Itaú', cor: '#2E3192', chaves: ['itau', 'itaú', 'iti'] },
  { id: 'banco-do-brasil', nome: 'Banco do Brasil', cor: '#34348A', chaves: ['banco do brasil', 'bb'] },
  { id: 'caixa', nome: 'Caixa', cor: '#005CA9', chaves: ['caixa', 'cef'] },
  { id: 'santander', nome: 'Santander', cor: '#EC0000', chaves: ['santander'] },
  { id: 'picpay', nome: 'PicPay', cor: '#21C25E', chaves: ['picpay', 'pic pay'] },
  { id: 'mercado-pago', nome: 'Mercado Pago', cor: '#009EE3', chaves: ['mercado pago', 'mercadopago', 'mercado livre'] },
  { id: 'hotmart', nome: 'Hotmart', cor: '#F04E23', chaves: ['hotmart'] },
];
export const ehLogo = (n) => typeof n === 'string' && n.startsWith('banco:');
export const logoDe = (n) => LOGOS.find((l) => 'banco:' + l.id === n);
const urlLogo = (n) => `img/bancos/${n.slice(6)}.png`;
/** Sugere o logo pelo nome/instituição digitados (ex.: "Conta Nubank" → Nubank). */
export function sugerirLogo(...textos) {
  const t = ' ' + textos.filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() + ' ';
  return LOGOS.find((l) => l.chaves.some((c) => new RegExp('(^|[^a-z])' + c.normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '([^a-z]|$)').test(t))) || null;
}

export function Icone({ n, cls = '', titulo }) {
  if (ehLogo(n)) return html`<img class=${'ic logo ' + cls} src=${urlLogo(n)} alt=${titulo || logoDe(n)?.nome || ''} loading="lazy" />`;
  return html`<svg class=${'ic ' + cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden=${titulo ? undefined : 'true'} role=${titulo ? 'img' : undefined} dangerouslySetInnerHTML=${{ __html: (titulo ? `<title>${titulo}</title>` : '') + (ICONES[n] || ICONES['ellipsis']) }} />`;
}
export const LISTA_ICONES = Object.keys(ICONES);

/** Ícone de categoria em quadrado colorido (cor da categoria). */
export function CatIcone({ cat, p, cor, icone }) {
  const c = cor || cat?.cor || '#9CA3AF';
  const ic = icone || cat?.icone;
  if (ehLogo(ic)) return html`<span class=${'cb logo' + (p ? ' p' : '')}><${Icone} n=${ic} /></span>`;
  return html`<span class=${'cb' + (p ? ' p' : '')} style=${`background:${c}1F;color:${c}`}><${Icone} n=${icone || cat?.icone || 'ellipsis'} /></span>`;
}

/** Valor com cor + símbolo + sinal: a informação nunca depende só da cor. */
export function Tom({ v, sinal = true, cls = '' }) {
  const t = tomSaldo(v);
  const sim = t === 'pos' ? '▲' : t === 'neg' ? '▼' : '●';
  const rot = t === 'pos' ? 'positivo' : t === 'neg' ? 'negativo' : 'zerado';
  return html`<span class=${`tom ${t} num ${cls}`} title=${'Saldo ' + rot}><span class="sim" aria-hidden="true">${sim}</span>${brl(v, { sinal: sinal && t === 'pos' })}<span class="sr"> (${rot})</span></span>`;
}
export const Base = ({ base }) => html`<span class=${'base-tag ' + base} title=${BASES[base].desc}><${Icone} n=${base === 'caixa' ? 'banknote' : 'receipt'} />${BASES[base].nome}</span>`;

export function Modal({ titulo, onClose, children, rodape, larg = '', icone }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="fundo" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose?.(); }} role="dialog" aria-modal="true" aria-label=${titulo}>
    <div class=${'modal ' + larg}>
      <div class="modal-cab">${icone}<h3>${titulo}</h3><button class="btn fantasma ico" onClick=${onClose} aria-label="Fechar"><${Icone} n="x" /></button></div>
      <div class="modal-corpo">${children}</div>
      ${rodape && html`<div class="modal-rod">${rodape}</div>`}
    </div></div>`;
}

export function Vazio({ icone = 'sparkles', titulo, texto, children }) {
  return html`<div class="vazio"><div class="ic-g"><${Icone} n=${icone} /></div><b>${titulo}</b>${texto && html`<p>${texto}</p>`}${children}</div>`;
}

export function SeletorMes({ compacto }) {
  const { mes } = useStore();
  const atual = mesAtual();
  const inp = useRef();
  return html`<div class="mes-sel" role="group" aria-label="Seleção de mês">
    <button class="btn fantasma ico peq" onClick=${() => setMes(addMesYM(mes, -1))} aria-label="Mês anterior"><${Icone} n="chevron-left" /></button>
    <button class="rot" onClick=${() => inp.current?.showPicker?.() ?? inp.current?.focus()} title="Escolher mês e ano">${nomeMesCap(mes)}</button>
    <input ref=${inp} type="month" value=${mes} onInput=${(e) => e.target.value && setMes(e.target.value)} class="sr" aria-label="Mês e ano" />
    <button class="btn fantasma ico peq" onClick=${() => setMes(addMesYM(mes, 1))} aria-label="Próximo mês"><${Icone} n="chevron-right" /></button>
    ${!compacto && html`
      <button class=${'atalho-mes esconde-movel' + (mes === addMesYM(atual, -1) ? ' on' : '')} onClick=${() => setMes(addMesYM(atual, -1))}>Anterior</button>
      <button class=${'atalho-mes' + (mes === atual ? ' on' : '')} onClick=${() => setMes(atual)}>Atual</button>
      <button class=${'atalho-mes esconde-movel' + (mes === addMesYM(atual, 1) ? ' on' : '')} onClick=${() => setMes(addMesYM(atual, 1))}>Seguinte</button>`}
  </div>`;
}

/** Campo monetário: digita "1.250,90" e devolve centavos. */
export function CampoValor({ valor, onChange, grande, id, autoFocus, placeholder = '0,00', obrigatorio }) {
  const [txt, setTxt] = useState(valor != null && valor !== '' ? numBR(valor) : '');
  const ref = useRef();
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, []);
  useEffect(() => { const atual = parseValor(txt); if (valor !== atual && valor != null) setTxt(numBR(valor)); }, [valor]);
  return html`<input ref=${ref} id=${id} class=${grande ? 'valor-grande num' : 'inp num'} inputmode="decimal" autocomplete="off" placeholder=${'R$ ' + placeholder}
    value=${txt} required=${obrigatorio}
    onInput=${(e) => { setTxt(e.target.value); onChange(parseValor(e.target.value)); }}
    onBlur=${() => { const v = parseValor(txt); if (v != null) setTxt(numBR(v)); }} />`;
}

export function Autoria({ l, curto }) {
  if (!l?.criado_por) return null;
  const quem = nomeUsuario(l.criado_por);
  return html`<span class="autoria">Lançado por ${quem}${!curto && l.criado_em ? ' em ' + dataHoraBR(l.criado_em) : ''}${l.alterado_por ? html` · Alterado por ${nomeUsuario(l.alterado_por)} em ${dataHoraBR(l.alterado_em)}` : ''}</span>`;
}

export function Avatar({ nome, cor = '#5B4FE9' }) {
  return html`<span class="avatar" style=${`background:${cor}`} aria-hidden="true">${(nome || '?').slice(0, 1).toUpperCase()}</span>`;
}

export function Barra({ pct, nivel = '', marco }) {
  const w = Math.max(0, Math.min(100, pct ?? 0));
  return html`<div class=${'barra ' + nivel} role="progressbar" aria-valuenow=${Math.round(pct ?? 0)} aria-valuemin="0" aria-valuemax="100">
    <i style=${`width:${w}%`}></i>${marco != null && html`<span class="marco" style=${`left:${Math.min(100, marco)}%`}></span>`}</div>`;
}

/** Wrapper do Chart.js. `cfg` é recriado quando `chave` muda. */
export function Grafico({ cfg, chave, altura = 280, onClique, rotulo }) {
  const ref = useRef(); const ch = useRef();
  useEffect(() => {
    const Chart = window.Chart;
    if (!Chart || !ref.current) return;
    ch.current?.destroy();
    const c = { ...cfg, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, ...cfg.options } };
    if (onClique) c.options.onClick = (evt, els) => { if (els.length) onClique(els[0].index, els[0].datasetIndex); };
    ch.current = new Chart(ref.current, c);
    return () => ch.current?.destroy();
  }, [chave]);
  return html`<div class="grafico" style=${`height:${altura}px`}><canvas ref=${ref} role="img" aria-label=${rotulo || 'Gráfico'}></canvas></div>`;
}

export function Dialogos() {
  const { dialogo } = useStore();
  if (!dialogo) return null;
  if (dialogo.tipo === 'confirmar') {
    return html`<${Modal} titulo=${dialogo.titulo} larg="estreita" onClose=${() => fecharDialogo(false)}
      rodape=${html`<button class="btn sec" onClick=${() => fecharDialogo(false)}>Cancelar</button>
        <button class=${'btn ' + (dialogo.perigo ? 'perigo' : '')} onClick=${() => fecharDialogo(true)} autofocus>${dialogo.ok}</button>`}>
      <p style="margin:0;color:var(--txt2)">${dialogo.texto}</p></${Modal}>`;
  }
  if (dialogo.tipo === 'escolher') {
    return html`<${Modal} titulo=${dialogo.titulo} larg="estreita" onClose=${() => fecharDialogo(null)}>
      ${dialogo.texto && html`<p style="margin:0 0 12px;color:var(--txt2)">${dialogo.texto}</p>`}
      <div class="pilha">${dialogo.opcoes.map((o) => html`<button class=${'btn ' + (o.sec ? 'sec' : '')} onClick=${() => fecharDialogo(o.valor)}>${o.rotulo}</button>`)}</div>
    </${Modal}>`;
  }
  return null;
}

export function Toasts() {
  const { toasts } = useStore();
  return html`<div class="toasts" role="status" aria-live="polite">${toasts.map((t) => html`<div class=${'toast ' + t.tipo} key=${t.id}><${Icone} n=${t.tipo === 'erro' ? 'triangle-alert' : 'circle-check'} />${t.msg}</div>`)}</div>`;
}

export function Sel({ valor, onChange, opcoes, vazio, id, required }) {
  return html`<select class="inp" id=${id} value=${valor ?? ''} required=${required} onChange=${(e) => onChange(e.target.value || null)}>
    ${vazio !== undefined && html`<option value="">${vazio}</option>`}
    ${opcoes.map((o) => (o.grupo ? html`<optgroup label=${o.grupo}>${o.itens.map((i) => html`<option value=${i.v}>${i.r}</option>`)}</optgroup>` : html`<option value=${o.v} disabled=${o.dis}>${o.r}</option>`))}
  </select>`;
}
export const Campo = ({ rot, obrig, children, dica }) => html`<label class="campo"><span>${rot}${obrig && html` <em>*</em>`}</span>${children}${dica && html`<small>${dica}</small>`}</label>`;

/** Paleta para seletor de cores. */
export const CORES = ['#2563EB', '#16A34A', '#F97316', '#0F766E', '#7C3AED', '#EC4899', '#65A30D', '#C026D3', '#EAB308', '#14B8A6', '#A78BFA', '#4F46E5',
  '#0EA5E9', '#FB7185', '#CA8A04', '#92400E', '#64748B', '#9CA3AF', '#DC2626', '#059669', '#0891B2', '#6366F1', '#D97706', '#DB2777'];
export function SeletorCor({ valor, onChange }) {
  return html`<div class="chips">${CORES.map((c) => html`<button type="button" class="chip" aria-label=${'Cor ' + c} aria-pressed=${valor === c}
    style=${`width:32px;height:32px;padding:0;background:${c};border-color:${valor === c ? 'var(--txt)' : c};box-shadow:${valor === c ? '0 0 0 3px #fff inset' : 'none'}`}
    onClick=${() => onChange(c)}></button>`)}
    <input type="color" value=${valor} onInput=${(e) => onChange(e.target.value.toUpperCase())} aria-label="Outra cor" style="width:40px;height:32px;border:0;background:none" /></div>`;
}
export function SeletorIcone({ valor, onChange, cor = '#5B4FE9', logos, onLogo }) {
  const [busca, setBusca] = useState('');
  const lista = LISTA_ICONES.filter((n) => !busca || n.includes(busca.toLowerCase()));
  return html`<div class="pilha" style="gap:8px">
    ${logos && html`<div><div style="font-size:12.5px;font-weight:700;color:var(--txt3);margin-bottom:6px">Bancos e instituições de pagamento</div>
      <div class="logos-grade">${LOGOS.map((l) => html`<button type="button" class=${'logo-op' + (valor === 'banco:' + l.id ? ' on' : '')} aria-pressed=${valor === 'banco:' + l.id}
        title=${l.nome} onClick=${() => { onChange('banco:' + l.id); onLogo?.(l); }}><img src=${urlLogo('banco:' + l.id)} alt="" /><span>${l.nome}</span></button>`)}</div>
      <div style="font-size:12.5px;font-weight:700;color:var(--txt3);margin:10px 0 0">Ou um ícone genérico</div></div>`}
    <input class="inp" placeholder="Filtrar ícones (em inglês: car, home…)" value=${busca} onInput=${(e) => setBusca(e.target.value)} />
    <div class="chips" style="max-height:150px;overflow:auto">${lista.map((n) => html`<button type="button" class="chip" title=${n} aria-pressed=${valor === n}
      style=${`padding:7px;${valor === n ? `background:${cor};border-color:${cor};color:#fff` : ''}`} onClick=${() => onChange(n)}><${Icone} n=${n} /></button>`)}</div></div>`;
}
export const opcoesContas = (D, { incluirArquivadas } = {}) => D.contas.filter((c) => incluirArquivadas || !c.arquivada).map((c) => ({ v: c.id, r: c.nome }));
export const opcoesCartoes = (D) => D.cartoes.filter((c) => !c.arquivado).map((c) => ({ v: c.id, r: c.nome }));
export const opcoesPessoas = (D) => D.pessoas.filter((p) => p.ativo !== false).map((p) => ({ v: p.id, r: p.nome }));
export const opcoesProjetos = (D) => D.projetos.filter((p) => p.status !== 'concluido').map((p) => ({ v: p.id, r: p.nome }));
export function opcoesCategorias(D, tipo = 'despesa', { arquivadas } = {}) {
  return D.categorias.filter((c) => c.tipo === tipo && !c.parent_id && (arquivadas || !c.arquivada)).map((c) => ({ v: c.id, r: c.nome }));
}
export const corPessoa = (D, perfilId) => D.pessoas.find((p) => p.perfil_id === perfilId)?.cor || '#5B4FE9';
