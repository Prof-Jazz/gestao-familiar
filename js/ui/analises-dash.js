// Peças do dashboard de Análises (anéis, barras com meta, empilhadas, tabela comparativa, alertas, resumo, árvore de categorias).
import { useState } from 'preact/hooks';
import { html, Icone, CatIcone, Grafico } from './comp.js';
import * as C from '../lib/calc.js';
import { brl, pct, mesCurto, nomeMesCap, dataBR, variacao, addMesYM, primeiroDia, ultimoDia } from '../lib/fmt.js';
import { corTema } from '../lib/tema.js';

const fmtEixo = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const pctTxt = (v, casas = 0) => (v == null || !isFinite(v) ? '—' : v.toFixed(casas).replace('.', ',') + '%');

/** Anel de progresso em SVG. */
export function Anel({ v, cor, tam = 62, esp = 7, texto }) {
  const r = (tam - esp) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, v ?? 0));
  return html`<svg class="anel" width=${tam} height=${tam} viewBox=${`0 0 ${tam} ${tam}`} aria-hidden="true">
    <circle cx=${tam / 2} cy=${tam / 2} r=${r} fill="none" stroke="var(--grade)" stroke-width=${esp} />
    <circle cx=${tam / 2} cy=${tam / 2} r=${r} fill="none" stroke=${cor} stroke-width=${esp} stroke-linecap="round"
      stroke-dasharray=${`${(p / 100) * c} ${c}`} transform=${`rotate(-90 ${tam / 2} ${tam / 2})`} />
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="anel-txt">${texto ?? pctTxt(v)}</text></svg>`;
}

/** Variação colorida: ▲/▼ com %; inverso = subir é ruim (gastos). */
export function Var({ v, inverso, sufixo = 'vs. período anterior' }) {
  if (v == null || !isFinite(v)) return html`<span class="var-txt zero">sem comparação ainda</span>`;
  if (Math.abs(v) < 0.05) return html`<span class="var-txt zero">● estável ${sufixo}</span>`;
  const subiu = v > 0, ruim = inverso ? subiu : !subiu;
  return html`<span class=${'var-txt ' + (ruim ? 'neg' : 'pos')}>${subiu ? '▲' : '▼'} ${pctTxt(Math.abs(v), 1)} <small>${sufixo}</small></span>`;
}

/** Cartão de indicador com anel (ou só valor). */
export function KpiDash({ rot, valor, cor = 'var(--pri)', anel, anelTexto, rodape, icone, destaqueCor }) {
  return html`<div class="card kpi-dash">
    ${anel !== undefined ? html`<${Anel} v=${anel} cor=${cor} texto=${anelTexto} />` : html`<span class="kpi-dash-ic" style=${`background:color-mix(in srgb, ${cor} 16%, transparent);color:${cor}`}><${Icone} n=${icone || 'coins'} /></span>`}
    <div class="kpi-dash-meio"><div class="kpi-dash-rot">${rot}</div><div class="kpi-dash-val num" style=${destaqueCor ? `color:${destaqueCor}` : ''}>${valor}</div><div class="kpi-dash-rod">${rodape}</div></div>
  </div>`;
}

/** Gastos por categoria com a meta (orçamento) marcada. */
export function BarrasMeta({ grupos, orcPorCat, abrir }) {
  const lista = grupos.slice(0, 8);
  const max = Math.max(1, ...lista.map((g) => Math.max(g.valor, orcPorCat[g.chave] || 0)));
  return html`<div class="card"><h3><${Icone} n="target" /> Gastos por categoria × orçamento</h3>
    ${lista.length ? html`<div class="bm-lista">${lista.map((g) => {
      const meta = orcPorCat[g.chave]; const passou = meta && g.valor > meta; const perto = meta && !passou && g.valor >= meta * 0.8;
      const cor = passou ? 'var(--neg)' : perto ? 'var(--atn)' : g.cor;
      return html`<button type="button" class="bm-linha" onClick=${() => abrir(g)} title="Ver os lançamentos">
        <span class="bm-nome"><${CatIcone} p cor=${g.cor} icone=${g.icone} />${g.rotulo}</span>
        <span class="bm-trilho"><i style=${`width:${(g.valor / max) * 100}%;background:${cor}`}></i>
          ${meta ? html`<em style=${`left:${(meta / max) * 100}%`} title=${'Orçamento ' + brl(meta)}></em>` : ''}</span>
        <span class="bm-val num">${brl(g.valor)}${meta ? html`<small class=${passou ? 'neg' : perto ? 'atn' : ''}>${pctTxt((g.valor / meta) * 100)} de ${brl(meta)}</small>` : html`<small>sem orçamento</small>`}</span></button>`;
    })}</div>
    <div class="bm-leg"><span><i class="tr"></i> limite do orçamento</span><span><i style="background:var(--atn)"></i> acima de 80%</span><span><i style="background:var(--neg)"></i> estourou</span></div>`
    : html`<div class="vazio-p">Sem gastos no período.</div>`}
  </div>`;
}

/** Rosca com a maior categoria em destaque no centro. */
export function RoscaDestaque({ titulo, icone, ag, chave, abrir, receita }) {
  const gs = C.rankingValor(ag.grupos);
  const top = gs[0];
  return html`<div class="card"><h3><${Icone} n=${icone} /> ${titulo}</h3>
    ${gs.length ? html`<div class="rd">
      <div class="rd-graf"><${Grafico} chave=${chave} altura=${200} rotulo=${titulo} onClique=${(i) => abrir(gs[i])} cfg=${{ type: 'doughnut',
        data: { labels: gs.map((g) => g.rotulo), datasets: [{ data: gs.map((g) => g.valor / 100), backgroundColor: gs.map((g) => g.cor), borderColor: corTema('--card', '#fff'), borderWidth: 3, hoverOffset: 6 }] },
        options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(Math.round(c.raw * 100))} (${pct(ag.total ? (c.raw * 10000) / ag.total : 0)})` } } } } }} />
        <div class="rd-centro"><b class="num">${pctTxt(top.pct, 1)}</b><span>${top.rotulo}</span><small>${receita ? 'maior fonte' : 'maior gasto'}</small></div></div>
      <div class="rd-leg">${gs.slice(0, 6).map((g) => html`<button type="button" onClick=${() => abrir(g)}><i style=${`background:${g.cor}`}></i><span>${g.rotulo}</span><b class="num">${pctTxt(g.pct, 1)}</b></button>`)}
        ${gs.length > 6 && html`<small>+ ${gs.length - 6} outras</small>`}
        <div class="rd-total">Total ${receita ? 'recebido' : 'gasto'}: <b class="num">${brl(ag.total)}</b></div></div>
    </div>` : html`<div class="vazio-p">${receita ? 'Sem receitas no período.' : 'Sem gastos no período.'}</div>`}
  </div>`;
}

/** Barras empilhadas: peso de cada categoria em cada mês. */
export function Empilhadas({ D, f, mesFim, chave }) {
  const meses = [-5, -4, -3, -2, -1, 0].map((k) => addMesYM(mesFim, k));
  const porMes = meses.map((ym) => C.agrupar(D, C.itensBase(D, 'consumo', primeiroDia(ym), ultimoDia(ym), f, { soPagas: true }), 'categoria'));
  const tot = new Map();
  for (const m of porMes) for (const g of m.grupos) tot.set(g.chave, (tot.get(g.chave) || 0) + g.valor);
  const top = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  const nome = (k) => D.mapa.categorias[k]?.nome || 'Sem categoria';
  const cor = (k) => D.mapa.categorias[k]?.cor || '#94A3B8';
  const ds = top.map((k) => ({ label: nome(k), data: porMes.map((m) => (m.grupos.find((g) => g.chave === k)?.valor || 0) / 100), backgroundColor: cor(k), borderRadius: 4, maxBarThickness: 38, stack: 's' }));
  ds.push({ label: 'Outras', data: porMes.map((m) => m.grupos.filter((g) => !top.includes(g.chave)).reduce((s, g) => s + g.valor, 0) / 100), backgroundColor: '#94A3B8', borderRadius: 4, maxBarThickness: 38, stack: 's' });
  const vazio = porMes.every((m) => !m.total);
  return html`<div class="card"><h3><${Icone} n="chart-column" /> Peso das categorias por mês</h3>
    ${vazio ? html`<div class="vazio-p">Sem gastos nos últimos meses.</div>` : html`<${Grafico} chave=${'emp' + chave} altura=${250} rotulo="Gastos empilhados por categoria e mês" cfg=${{ type: 'bar',
      data: { labels: meses.map(mesCurto), datasets: ds },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(Math.round(c.raw * 100))}`, footer: (its) => 'Total: ' + brl(Math.round(its.reduce((s, i) => s + i.raw, 0) * 100)) } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: fmtEixo }, grid: { color: corTema('--grade') } } } } }} />`}
    <div class="card-rod">Últimos 6 meses até ${nomeMesCap(mesFim)} · 5 maiores categorias + outras</div>
  </div>`;
}

/** Tabela: categoria × período anterior × atual × variação × participação. */
export function TabelaComparativa({ D, itens, itensA, abrir, rotA, rotB }) {
  const g = C.agrupar(D, itens, 'categoria'), gA = C.agrupar(D, itensA, 'categoria');
  const mapaA = Object.fromEntries(gA.grupos.map((x) => [x.chave, x]));
  const chaves = [...new Set([...g.grupos.map((x) => x.chave), ...gA.grupos.map((x) => x.chave)])];
  const linhas = chaves.map((k) => {
    const a = g.grupos.find((x) => x.chave === k); const b = mapaA[k];
    const ref = a || b;
    return { k, g: a, rot: ref.rotulo, cor: ref.cor, icone: ref.icone, atual: a?.valor || 0, ant: b?.valor || 0 };
  }).sort((x, y) => y.atual - x.atual || y.ant - x.ant);
  return html`<div class="card"><h3><${Icone} n="table" /> Comparação por categoria</h3>
    <div class="tabela-wrap"><table class="tab tab-comp"><thead><tr><th>Categoria</th><th class="r">${rotA}</th><th class="r">${rotB}</th><th class="r">Variação</th><th class="r">Part.</th></tr></thead>
      <tbody>${linhas.map((l) => { const v = variacao(l.atual, l.ant); return html`<tr class=${l.g ? 'clic' : ''} onClick=${() => l.g && abrir(l.g)}>
        <td><span class="tc-cat"><i style=${`background:${l.cor}`}></i>${l.rot}</span></td>
        <td class="r num">${brl(l.ant)}</td><td class="r num"><b>${brl(l.atual)}</b></td>
        <td class="r">${v == null ? html`<span class="var-txt zero">novo</span>` : html`<span class=${'var-txt ' + (Math.abs(v) < 0.05 ? 'zero' : v > 0 ? 'neg' : 'pos')}>${v > 0 ? '▲' : v < 0 ? '▼' : '●'} ${pctTxt(Math.abs(v), 1)}</span>`}</td>
        <td class="r num">${pctTxt(g.total ? (l.atual / g.total) * 100 : 0, 1)}</td></tr>`; })}</tbody>
      <tfoot><tr><td>Total</td><td class="r num">${brl(gA.total)}</td><td class="r num"><b>${brl(g.total)}</b></td>
        <td class="r"><${Var} v=${variacao(g.total, gA.total)} inverso sufixo="" /></td><td class="r num">100%</td></tr></tfoot></table></div>
  </div>`;
}

/** Avisos automáticos. */
export function Alertas({ itens }) {
  const cor = { neg: 'var(--neg)', atn: 'var(--atn)', pos: 'var(--pos)', pri: 'var(--pri)' };
  return html`<div class="card"><h3><${Icone} n="bell" /> Alertas</h3>
    ${itens.length ? html`<div class="alertas">${itens.slice(0, 7).map((a) => html`<div class="alerta" style=${`--a:${cor[a.tipo]}`}>
      <span class="alerta-ic"><${Icone} n=${a.icone} /></span><div><b>${a.titulo}</b>${a.texto && html`<small>${a.texto}</small>`}</div></div>`)}</div>`
      : html`<div class="alerta" style="--a:var(--pos)"><span class="alerta-ic"><${Icone} n="check" /></span><div><b>Tudo em ordem</b><small>Nenhum ponto de atenção no período.</small></div></div>`}
  </div>`;
}

export function montarAlertas({ D, H, g, gA, orcPorCat, saude, contasAtrasadas, anteriorCompleto = true }) {
  const out = [];
  for (const f of saude.faturas) {
    const dias = Math.round((new Date(f.vencimento) - new Date(H)) / 864e5);
    if (dias < 0) out.push({ tipo: 'neg', icone: 'triangle-alert', titulo: `Fatura ${f.cartao.nome} atrasada`, texto: `${brl(f.devido)} · venceu em ${dataBR(f.vencimento)}` });
    else if (dias <= 5) out.push({ tipo: 'atn', icone: 'credit-card', titulo: `Fatura ${f.cartao.nome} vence ${dias === 0 ? 'hoje' : `em ${dias} dia(s)`}`, texto: `${brl(f.devido)} · ${dataBR(f.vencimento)}` });
  }
  if (contasAtrasadas.length) out.push({ tipo: 'neg', icone: 'triangle-alert', titulo: `${contasAtrasadas.length} conta(s) atrasada(s)`, texto: brl(contasAtrasadas.reduce((s, l) => s + l.valor_centavos, 0)) + ' ainda não pagos' });
  for (const x of saude.cartoes) if (x.disponivel < 0) out.push({ tipo: 'neg', icone: 'credit-card', titulo: `Limite do ${x.c.nome} estourado`, texto: `${brl(-x.disponivel)} acima do limite` });
  for (const gr of g.grupos) {
    const meta = orcPorCat[gr.chave];
    if (meta && gr.valor > meta) out.push({ tipo: 'neg', icone: 'target', titulo: `${gr.rotulo} passou do orçamento`, texto: `${brl(gr.valor)} de ${brl(meta)}` });
    else if (meta && gr.valor >= meta * 0.8) out.push({ tipo: 'atn', icone: 'target', titulo: `${gr.rotulo} perto do limite`, texto: `${pctTxt((gr.valor / meta) * 100)} do orçamento` });
  }
  const mapaA = Object.fromEntries(gA.grupos.map((x) => [x.chave, x.valor]));
  const subiu = !anteriorCompleto ? [] : g.grupos.map((x) => ({ x, v: variacao(x.valor, mapaA[x.chave] || 0) })).filter((o) => o.v != null && o.v >= 20 && o.x.valor - (mapaA[o.x.chave] || 0) >= 5000)
    .sort((a, b) => b.x.valor - (mapaA[b.x.chave] || 0) - (a.x.valor - (mapaA[a.x.chave] || 0))).slice(0, 2);
  for (const o of subiu) out.push({ tipo: 'atn', icone: 'trending-up', titulo: `${o.x.rotulo} subiu ${pctTxt(o.v)}`, texto: `+${brl(o.x.valor - (mapaA[o.x.chave] || 0))} vs. período anterior` });
  if (saude.juros > 0) out.push({ tipo: 'atn', icone: 'badge-percent', titulo: `${brl(saude.juros)} em juros e encargos`, texto: 'Dinheiro que dá para economizar quitando parcelamentos' });
  if (saude.tot.resultado > 0 && saude.tot.receitas > 0 && saude.tot.resultado / saude.tot.receitas >= 0.1) out.push({ tipo: 'pos', icone: 'sparkles', titulo: `Sobrou ${pctTxt((saude.tot.resultado / saude.tot.receitas) * 100)} da renda`, texto: 'Ótimo ritmo de economia' });
  return out;
}

/** Faixa de resumo no rodapé. */
export function FaixaResumo({ itens }) {
  return html`<div class="faixa-resumo">${itens.map((i) => html`<div class="fr-item"><span class="fr-ic" style=${`color:${i.cor};background:color-mix(in srgb, ${i.cor} 15%, transparent)`}><${Icone} n=${i.icone} /></span>
    <div><small>${i.rot}</small><b class="num">${i.valor}</b>${i.det && html`<span>${i.det}</span>`}</div></div>`)}</div>`;
}

/** Árvore lateral de categorias (telas largas). */
export function ArvoreCategorias({ D, g, gA, itens, valor, onChange }) {
  const [aberta, setAberta] = useState(null);
  const mapaA = Object.fromEntries(gA.grupos.map((x) => [x.chave, x.valor]));
  const gs = C.rankingValor(g.grupos);
  const subsDe = (catId) => C.rankingValor(C.agrupar(D, itens.filter((it) => it.l.categoria_id === catId), 'subcategoria').grupos);
  return html`<aside class="arvore card" aria-label="Categorias">
    <div class="arv-cab"><span>Categorias</span><span>gasto</span></div>
    <button type="button" class=${'arv-item' + (!valor ? ' on' : '')} onClick=${() => { onChange(null); setAberta(null); }}>
      <${Icone} n="list" /><span class="arv-nome">Todas</span><b class="num">${brl(g.total)}</b></button>
    ${gs.map((x) => { const v = variacao(x.valor, mapaA[x.chave] || 0); const on = valor === x.chave; const ab = aberta === x.chave;
      return html`<div class=${'arv-grupo' + (on ? ' on' : '')}>
        <button type="button" class=${'arv-item' + (on ? ' on' : '')} onClick=${() => { onChange(on ? null : x.chave); setAberta(on ? null : x.chave); }}>
          <${CatIcone} p cor=${x.cor} icone=${x.icone} /><span class="arv-nome">${x.rotulo}</span><b class="num">${brl(x.valor)}</b>
          <span class=${'arv-tend ' + (v == null ? 'zero' : v > 0.05 ? 'neg' : v < -0.05 ? 'pos' : 'zero')} title=${v == null ? 'novo' : pctTxt(v, 1)}>${v == null ? '•' : v > 0.05 ? '▲' : v < -0.05 ? '▼' : '●'}</span></button>
        ${ab && html`<div class="arv-subs">${subsDe(x.chave).map((s) => html`<div class="arv-sub"><span>${s.rotulo.split(' › ').pop()}</span><b class="num">${brl(s.valor)}</b></div>`)}</div>`}
      </div>`; })}
    <div class="arv-rod">▲ subiu · ▼ caiu em relação ao período anterior</div>
  </aside>`;
}
