// Formatação e datas — pt-BR, fuso America/Sao_Paulo. Valores sempre em centavos (inteiros).
export const TZ = 'America/Sao_Paulo';

const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const nfNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 125090 -> "R$ 1.250,90"; negativos com sinal de menos. */
export function brl(cent, { sinal = false } = {}) {
  const c = Math.round(Number(cent) || 0);
  const s = nfBRL.format(Math.abs(c) / 100).replace(/ /g, ' ');
  if (c < 0) return '−' + s;
  if (sinal && c > 0) return '+' + s;
  return s;
}
export const numBR = (cent) => nfNum.format((Number(cent) || 0) / 100);
export const pct = (v) => nfPct.format(v) + '%';

/** Converte texto digitado em centavos. Aceita "1.250,90", "1250,9", "1250.90", "1250", "R$ 12". Retorna null se inválido. */
export function parseValor(txt) {
  if (typeof txt === 'number') return Number.isFinite(txt) ? Math.round(txt * 100) : null;
  let s = String(txt ?? '').trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (!s) return null;
  let neg = false;
  if (/^[-−]/.test(s)) { neg = true; s = s.slice(1); }
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(s)) s = s.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ''] = s.split('.');
  const cent = parseInt(int, 10) * 100 + parseInt((dec + '00').slice(0, 2), 10);
  return neg ? -cent : cent;
}

const pad = (n) => String(n).padStart(2, '0');

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export const mesAtual = () => hoje().slice(0, 7);

/** "2026-10-28" -> "28/10/2026" */
export function dataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
/** "28/10/2026" -> "2026-10-28" (ou aceita ISO). null se inválida. */
export function parseData(txt) {
  const s = String(txt ?? '').trim();
  let y, m, d;
  let r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (r) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
  else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > diasNoMes(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/** Timestamp -> "15/11/2026 às 14h30" no fuso de São Paulo */
export function dataHoraBR(ts) {
  if (!ts) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}h${p.minute}`;
}

export const diasNoMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const ymDe = (iso) => String(iso).slice(0, 7);
export const primeiroDia = (ym) => `${ym}-01`;
export function ultimoDia(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(diasNoMes(y, m))}`;
}
/** Soma meses a um "YYYY-MM". */
export function addMesYM(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
/** Soma meses a uma data, limitando o dia ao fim do mês (31/01 + 1 mês = 28/02). `diaBase` preserva o dia original. */
export function addMeses(iso, n, diaBase) {
  const ym = addMesYM(iso.slice(0, 7), n);
  const [y, m] = ym.split('-').map(Number);
  const d = Math.min(diaBase ?? Number(iso.slice(8, 10)), diasNoMes(y, m));
  return `${ym}-${pad(d)}`;
}
export function addDias(iso, n) {
  const dt = new Date(iso + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function difDias(a, b) { // b - a, em dias
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
export const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
export function difMeses(ymA, ymB) {
  const [ya, ma] = ymA.split('-').map(Number), [yb, mb] = ymB.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_AB = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = (ym) => `${MESES[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
export const nomeMesCap = (ym) => { const s = nomeMes(ym); return s[0].toUpperCase() + s.slice(1); };
export const mesCurto = (ym) => `${MESES_AB[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}`;
export const MESES_NOMES = MESES;

/** UUID v4 gerado no navegador (identificador do registro = chave de idempotência). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Variação percentual segura: null quando a base é zero (evita "infinito"). */
export function variacao(atual, anterior) {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
