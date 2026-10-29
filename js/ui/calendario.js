import { useMemo, useState } from 'preact/hooks';
import { html, Icone, SeletorMes, Vazio } from './comp.js';
import { useStore } from '../data/store.js';
import { ItemLanc } from './item.js';
import * as C from '../lib/calc.js';
import { brl, hoje, primeiroDia, ultimoDia, addDias, dataBR, diaSemana } from '../lib/fmt.js';

export function Calendario() {
  const { D, mes } = useStore();
  const H = hoje();
  const [sel, setSel] = useState(null);
  const aviso = D.config?.dias_aviso_vencimento ?? 5;
  const ini = primeiroDia(mes), fim = ultimoDia(mes);
  const gIni = addDias(ini, -diaSemana(ini)); const gFim = addDias(fim, 6 - diaSemana(fim));

  const eventos = useMemo(() => {
    const ev = {};
    const add = (d, e) => { (ev[d] ||= []).push(e); };
    for (const l of C.vivos(D)) {
      if (l.status === 'cancelado' || l.tipo === 'transferencia' && l.status !== 'previsto') continue;
      if (l.cartao_id && l.tipo !== 'pagamento_fatura') continue; // compras no cartão aparecem via fatura
      const d = l.status === 'previsto' ? C.dataPrevista(l) : (l.vencimento || null);
      if (!d || d < gIni || d > gFim) continue;
      const tipo = l.status === 'efetivado' ? 'pago' : d < H ? 'atrasado' : l.tipo === 'receita' ? 'receber' : 'pagar';
      add(d, { tipo, l, rot: l.descricao, valor: l.valor_centavos, proximo: l.status === 'previsto' && d >= H && d <= addDias(H, aviso) });
    }
    for (const c of D.cartoes) for (const f of C.faturasDoCartao(D, c, H)) {
      if (f.vencimento < gIni || f.vencimento > gFim || (f.total <= 0 && f.previstas <= 0)) continue;
      const devido = f.aberto + f.previstas;
      add(f.vencimento, { tipo: devido <= 0 ? 'pago' : f.vencimento < H ? 'atrasado' : 'fatura', fatura: f, rot: 'Fatura ' + c.nome, valor: devido > 0 ? devido : f.total, proximo: devido > 0 && f.vencimento >= H && f.vencimento <= addDias(H, aviso) });
    }
    return ev;
  }, [D, mes]);

  const dias = []; for (let d = gIni; d <= gFim; d = addDias(d, 1)) dias.push(d);
  const doMes = Object.entries(eventos).filter(([d]) => d >= ini && d <= fim);
  const soma = (t) => doMes.flatMap(([, e]) => e).filter((e) => t.includes(e.tipo)).reduce((s, e) => s + e.valor, 0);
  const lista = sel ? (eventos[sel] || []) : doMes.sort(([a], [b]) => a.localeCompare(b)).flatMap(([, e]) => e).filter((e) => e.tipo !== 'pago');

  return html`
  <div class="topo"><div><h2>Calendário financeiro</h2><div class="sub">Contas a pagar, receitas a receber e faturas</div></div><span class="esp"></span><${SeletorMes} /></div>
  <div class="chips" style="margin-bottom:12px">
    <span class="pilula neg">▼ A pagar ${brl(soma(['pagar']))}</span><span class="pilula pos">▲ A receber ${brl(soma(['receber']))}</span>
    <span class="pilula pri"><${Icone} n="credit-card" /> Faturas ${brl(soma(['fatura']))}</span><span class="pilula neg" style="background:var(--neg);color:#fff">⚠ Atrasado ${brl(soma(['atrasado']))}</span>
    <span class="pilula zero">✓ Pago</span><span class="pilula atn" style="outline:2px solid #F59E0B">Vence em até ${aviso} dias</span>
  </div>
  <div class="grade g-21">
    <div class="card" style="padding:12px">
      <div class="cal" role="grid" aria-label="Calendário do mês">
        ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => html`<div class="cab">${d}</div>`)}
        ${dias.map((d) => html`<div role="gridcell" tabIndex="0" class=${'dia' + (d < ini || d > fim ? ' fora' : '') + (d === H ? ' hoje' : '') + (d === sel ? ' sel' : '')}
          onClick=${() => setSel(sel === d ? null : d)} onKeyDown=${(e) => e.key === 'Enter' && setSel(d)} aria-label=${dataBR(d) + ((eventos[d] || []).length ? `, ${eventos[d].length} compromisso(s)` : '')}>
          <span class="n">${+d.slice(8, 10)}</span>
          ${(eventos[d] || []).slice(0, 3).map((e) => html`<span class=${'ev ' + e.tipo + (e.proximo ? ' proximo' : '')} title=${`${e.rot} — ${brl(e.valor)}`}>${e.rot}</span>`)}
          ${(eventos[d] || []).length > 3 && html`<span class="ev" style="background:var(--bg2)">+${eventos[d].length - 3}</span>`}
        </div>`)}
      </div>
    </div>
    <div class="card"><h3><${Icone} n="calendar-days" /> ${sel ? dataBR(sel) : 'Pendências do mês'}${sel && html`<button class="acao btn fantasma peq" onClick=${() => setSel(null)}>Ver mês</button>`}</h3>
      ${lista.length === 0 ? html`<${Vazio} icone="circle-check" titulo=${sel ? 'Nada neste dia' : 'Nenhuma pendência no mês'} />`
        : html`<div class="lista">${lista.map((e) => e.l ? html`<${ItemLanc} l=${e.l} D=${D} compacto />` : html`<a class="item click" href="#/contas" style="text-decoration:none;color:inherit">
          <span class="cb" style="background:#EDE9FE;color:#5B21B6"><${Icone} n="credit-card" /></span><div class="meio"><div class="t1">${e.rot}</div><div class="t2">Vence ${dataBR(e.fatura.vencimento)} · fecha ${dataBR(e.fatura.fechamento)}</div></div>
          <div class="dir"><b class="num">${brl(e.valor)}</b><br /><span class=${'pilula ' + (e.tipo === 'atrasado' ? 'neg' : e.tipo === 'pago' ? 'zero' : 'pri')}>${e.tipo === 'atrasado' ? '⚠ Vencida' : e.tipo === 'pago' ? '✓ Paga' : 'Pagar na tela de cartões'}</span></div></a>`)}</div>`}
    </div>
  </div>`;
}
