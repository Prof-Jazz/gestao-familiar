import { useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Base, Vazio, Sel, Campo, Grafico, Modal, opcoesContas, opcoesPessoas, opcoesCategorias } from './comp.js';
import { useStore } from '../data/store.js';
import { ItemLanc } from './item.js';
import * as C from '../lib/calc.js';
import { brl, pct, primeiroDia, ultimoDia, addMesYM, mesCurto, dataBR, difDias, addDias, variacao, hoje, nomeMesCap } from '../lib/fmt.js';

const fmtEixo = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const tip = (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${brl(Math.round(c.raw * 100))}`;
const optsEixo = (extra = {}) => ({ interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: tip } } },
  scales: { y: { ticks: { callback: fmtEixo }, grid: { color: '#EEF0F6' } }, x: { grid: { display: false } } }, ...extra });

export function periodoDe(preset, mes, livre) {
  const H = hoje();
  switch (preset) {
    case 'mes': return { ini: primeiroDia(mes), fim: ultimoDia(mes), rot: nomeMesCap(mes) };
    case '3m': return { ini: primeiroDia(addMesYM(mes, -2)), fim: ultimoDia(mes), rot: 'Últimos 3 meses' };
    case '6m': return { ini: primeiroDia(addMesYM(mes, -5)), fim: ultimoDia(mes), rot: 'Últimos 6 meses' };
    case '12m': return { ini: primeiroDia(addMesYM(mes, -11)), fim: ultimoDia(mes), rot: 'Últimos 12 meses' };
    case 'ano': return { ini: mes.slice(0, 4) + '-01-01', fim: mes.slice(0, 4) + '-12-31', rot: 'Ano de ' + mes.slice(0, 4) };
    default: return { ini: livre.ini || H, fim: livre.fim || H, rot: `${dataBR(livre.ini)} a ${dataBR(livre.fim)}` };
  }
}
/** Período imediatamente anterior, com o mesmo tamanho. */
export function periodoAnterior({ ini, fim }) {
  if (ini.slice(8) === '01' && fim === ultimoDia(fim.slice(0, 7))) {
    const n = (+fim.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+fim.slice(5, 7) - +ini.slice(5, 7)) + 1;
    return { ini: primeiroDia(addMesYM(ini.slice(0, 7), -n)), fim: ultimoDia(addMesYM(ini.slice(0, 7), -1)) };
  }
  const n = difDias(ini, fim) + 1;
  return { ini: addDias(ini, -n), fim: addDias(ini, -1) };
}

export function Analises() {
  const { D, mes } = useStore();
  const [base, setBase] = useState('consumo');
  const [preset, setPreset] = useState('6m');
  const [livre, setLivre] = useState({ ini: primeiroDia(mes), fim: ultimoDia(mes) });
  const [f, setF] = useState({});
  const [gran, setGran] = useState('mes');
  const [cats, setCats] = useState([]);
  const [comparar, setComparar] = useState(true);
  const [dimRank, setDimRank] = useState('categoria');
  const [fatia, setFatia] = useState(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const set = (p) => setF((x) => { const n = { ...x, ...p }; for (const k in n) if (!n[k]) delete n[k]; return n; });
  const P = periodoDe(preset, mes, livre);
  const PA = periodoAnterior(P);
  const H = hoje();

  const r = useMemo(() => {
    const itens = C.itensBase(D, base, P.ini, P.fim, f);
    const itensA = C.itensBase(D, base, PA.ini, PA.fim, f);
    const tot = C.totais(itens), totA = C.totais(itensA);
    const porCat = C.agrupar(D, itens, 'categoria');
    const rank = C.agrupar(D, itens, dimRank);
    // evolução
    const serie = C.serieTemporal(itens, P.ini, P.fim, gran);
    const serieA = C.serieTemporal(itensA, PA.ini, PA.fim, gran);
    const porCatSerie = cats.map((id) => ({ id, s: C.serieTemporal(itens.filter((it) => it.l.categoria_id === id), P.ini, P.fim, gran) }));
    // receitas x despesas por mês (sempre mensal)
    const meses = []; for (let ym = P.ini.slice(0, 7); ym <= P.fim.slice(0, 7); ym = addMesYM(ym, 1)) meses.push(ym);
    const rxd = meses.map((ym) => C.totais(itens.filter((it) => it.data.slice(0, 7) === ym)));
    // orçamento x realizado (consumo, mês selecionado)
    const orc = C.statusOrcamento(D, mes);
    // saldo
    const ymIni = P.ini.slice(0, 7); const ymFim = addMesYM(H.slice(0, 7), 6) > P.fim.slice(0, 7) ? addMesYM(H.slice(0, 7), 6) : P.fim.slice(0, 7);
    const saldo = C.serieSaldo(D, ymIni, ymFim, H);
    return { itens, tot, totA, porCat, rank, serie, serieA, porCatSerie, meses, rxd, orc, saldo };
  }, [D, base, P.ini, P.fim, f, gran, cats.join(), dimRank, mes]);

  const rotSerie = (k) => (gran === 'mes' ? mesCurto(k) : dataBR(k).slice(0, 5));
  const chave = [base, P.ini, P.fim, JSON.stringify(f), gran, cats.join(), comparar, D.lancamentos.length, r.tot.despesas, r.tot.receitas].join('|');
  const vDesp = variacao(r.tot.despesas, r.totA.despesas);
  const vRec = variacao(r.tot.receitas, r.totA.receitas);
  const subs = f.categoria_id ? D.categorias.filter((c) => c.parent_id === f.categoria_id).map((c) => ({ v: c.id, r: c.nome })) : [];
  const catsDesp = D.categorias.filter((c) => c.tipo === 'despesa' && !c.parent_id);

  return html`
  <div class="topo"><div><h2>Análises</h2><div class="sub">${P.rot} · comparado com ${dataBR(PA.ini)} a ${dataBR(PA.fim)}</div></div><span class="esp"></span></div>

  <div class="card" style="margin-bottom:16px">
    <div class="filtros">
      <div class="campo" style="flex:0 1 auto"><span>Base dos indicadores</span><div class="btn-grupo">
        <button class=${base === 'consumo' ? 'on' : ''} onClick=${() => setBase('consumo')}>Consumo (competência)</button>
        <button class=${base === 'caixa' ? 'on' : ''} onClick=${() => setBase('caixa')}>Fluxo de caixa</button></div></div>
      <${Campo} rot="Período"><${Sel} valor=${preset} onChange=${setPreset} opcoes=${[{ v: 'mes', r: 'Mês selecionado' }, { v: '3m', r: 'Últimos 3 meses' }, { v: '6m', r: 'Últimos 6 meses' }, { v: '12m', r: 'Últimos 12 meses' }, { v: 'ano', r: 'Ano inteiro' }, { v: 'livre', r: 'Personalizado' }]} /></${Campo}>
      ${preset === 'livre' && html`<${Campo} rot="De"><input class="inp" type="date" value=${livre.ini} onInput=${(e) => setLivre({ ...livre, ini: e.target.value })} /></${Campo}>
        <${Campo} rot="Até"><input class="inp" type="date" value=${livre.fim} onInput=${(e) => setLivre({ ...livre, fim: e.target.value })} /></${Campo}>`}
      <button class="btn sec" onClick=${() => setVerFiltros(!verFiltros)}><${Icone} n="filter" /> Filtros${Object.keys(f).length ? ` (${Object.keys(f).length})` : ''}</button>
    </div>
    ${verFiltros && html`<div class="filtros" style="margin-top:12px">
      <${Campo} rot="Categoria"><${Sel} valor=${f.categoria_id} onChange=${(v) => set({ categoria_id: v, subcategoria_id: null })} vazio="Todas" opcoes=${[...opcoesCategorias(D, 'despesa', { arquivadas: true }), ...opcoesCategorias(D, 'receita', { arquivadas: true })]} /></${Campo}>
      ${subs.length > 0 && html`<${Campo} rot="Subcategoria"><${Sel} valor=${f.subcategoria_id} onChange=${(v) => set({ subcategoria_id: v })} vazio="Todas" opcoes=${subs} /></${Campo}>`}
      <${Campo} rot="Conta"><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Todas" opcoes=${opcoesContas(D, { incluirArquivadas: true })} /></${Campo}>
      <${Campo} rot="Cartão"><${Sel} valor=${f.cartao_id} onChange=${(v) => set({ cartao_id: v })} vazio="Todos" opcoes=${D.cartoes.map((c) => ({ v: c.id, r: c.nome }))} /></${Campo}>
      <${Campo} rot="Lançado por"><${Sel} valor=${f.criado_por} onChange=${(v) => set({ criado_por: v })} vazio="Qualquer pessoa" opcoes=${D.perfis.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <${Campo} rot="Quem pagou/recebeu"><${Sel} valor=${f.pagador_id} onChange=${(v) => set({ pagador_id: v })} vazio="Qualquer pessoa" opcoes=${opcoesPessoas(D)} /></${Campo}>
      <${Campo} rot="Beneficiário"><${Sel} valor=${f.beneficiario_id} onChange=${(v) => set({ beneficiario_id: v })} vazio="Todos" opcoes=${opcoesPessoas(D)} /></${Campo}>
      <${Campo} rot="Projeto"><${Sel} valor=${f.projeto_id} onChange=${(v) => set({ projeto_id: v })} vazio="Todos" opcoes=${D.projetos.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <button class="btn fantasma" onClick=${() => setF({})}><${Icone} n="x" /> Limpar</button>
    </div>`}
    <div style="margin-top:10px;font-size:12.5px;color:var(--txt3)"><${Base} base=${base} /> ${C.BASES[base].desc} Somente lançamentos realizados.</div>
  </div>

  <div class="grade g-kpi" style="margin-bottom:16px">
    <div class="card kpi"><div class="rot">Despesas no período</div><div class="val num">${brl(r.tot.despesas)}</div><div class="det"><${Variacao} v=${vDesp} inverso /> vs. período anterior (${brl(r.totA.despesas)})</div></div>
    <div class="card kpi"><div class="rot">Receitas no período</div><div class="val num">${brl(r.tot.receitas)}</div><div class="det"><${Variacao} v=${vRec} /> vs. período anterior (${brl(r.totA.receitas)})</div></div>
    <div class="card kpi"><div class="rot">Resultado</div><div class="val"><${Tom} v=${r.tot.resultado} /></div><div class="det"><${Base} base=${base} /></div></div>
    <div class="card kpi"><div class="rot">Lançamentos de despesa</div><div class="val num">${r.tot.qtdDespesas}</div><div class="det">Média ${r.tot.qtdDespesas ? brl(Math.round(r.tot.despesas / r.tot.qtdDespesas)) : '—'} por lançamento</div></div>
  </div>

  ${r.itens.length === 0 ? html`<div class="card"><${Vazio} icone="chart-line" titulo="Sem dados para estes filtros" texto="Não há lançamentos realizados no período e base escolhidos. Ajuste o período, a base ou os filtros." /></div>` : html`
  <div class="card" style="margin-bottom:16px"><h3><${Icone} n="chart-line" /> Evolução dos gastos <span class="acao"><${Base} base=${base} /></span></h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <div class="btn-grupo">${[['dia', 'Diária'], ['semana', 'Semanal'], ['mes', 'Mensal']].map(([v, t]) => html`<button class=${gran === v ? 'on' : ''} onClick=${() => setGran(v)}>${t}</button>`)}</div>
      <label class="chk" style="font-size:13px"><input type="checkbox" checked=${comparar} onChange=${(e) => setComparar(e.target.checked)} /> Comparar com período anterior</label>
    </div>
    <div class="chips" style="margin-bottom:10px">${catsDesp.map((c) => html`<button class=${'chip' + (cats.includes(c.id) ? ' on' : '')} style=${cats.includes(c.id) ? `background:${c.cor};border-color:${c.cor}` : ''}
      onClick=${() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}><${Icone} n=${c.icone} />${c.nome}</button>`)}</div>
    <${Grafico} chave=${'ev' + chave} altura=${300} rotulo="Evolução dos gastos" cfg=${{ type: 'line',
      data: { labels: r.serie.chaves.map(rotSerie), datasets: [
        ...(cats.length ? r.porCatSerie.map(({ id, s }) => ({ label: D.mapa.categorias[id]?.nome, data: s.vals.map((v) => v / 100), borderColor: D.mapa.categorias[id]?.cor, backgroundColor: D.mapa.categorias[id]?.cor + '22', tension: .3, pointRadius: 2 }))
          : [{ label: 'Gastos', data: r.serie.vals.map((v) => v / 100), borderColor: '#5B4FE9', backgroundColor: '#5B4FE922', fill: true, tension: .3, pointRadius: 2 }]),
        ...(comparar && !cats.length ? [{ label: 'Período anterior', data: r.serieA.vals.slice(0, r.serie.vals.length).map((v) => v / 100), borderColor: '#94A3B8', borderDash: [6, 5], tension: .3, pointRadius: 0 }] : []),
      ] }, options: optsEixo() }} />
  </div>

  <div class="grade g-2" style="margin-bottom:16px">
    <div class="card"><h3><${Icone} n="chart-pie" /> Distribuição por categoria <span class="acao"><${Base} base=${base} /></span></h3>
      ${r.porCat.grupos.length ? html`
        <${Grafico} chave=${'pz' + chave} altura=${240} rotulo="Distribuição por categoria" onClique=${(i) => setFatia(C.rankingValor(r.porCat.grupos)[i])} cfg=${{ type: 'doughnut',
          data: { labels: C.rankingValor(r.porCat.grupos).map((g) => g.rotulo), datasets: [{ data: C.rankingValor(r.porCat.grupos).map((g) => g.valor / 100), backgroundColor: C.rankingValor(r.porCat.grupos).map((g) => g.cor), borderColor: '#fff', borderWidth: 2 }] },
          options: { cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(Math.round(c.raw * 100))} (${pct(r.porCat.total ? c.raw * 100 / r.porCat.total * 100 : 0)})` } } } } }} />
        <div class="legenda" style="margin-top:12px">${C.rankingValor(r.porCat.grupos).map((g) => html`<div class="lg" role="button" tabIndex="0" onClick=${() => setFatia(g)} onKeyDown=${(e) => e.key === 'Enter' && setFatia(g)}>
          <${CatIcone} p cor=${g.cor} icone=${g.icone} /><span class="nm">${g.rotulo}</span><b class="num">${brl(g.valor)}</b><span class="pc">${pct(g.pct)}</span></div>`)}</div>
        <div style="font-size:12px;color:var(--txt3);margin-top:6px">Toque numa fatia ou categoria para ver os lançamentos.</div>`
      : html`<${Vazio} icone="chart-pie" titulo="Sem despesas no período" />`}
    </div>
    <div class="card"><h3><${Icone} n="chart-column" /> Receitas × despesas <span class="acao"><${Base} base=${base} /></span></h3>
      <${Grafico} chave=${'rx' + chave} altura=${300} rotulo="Receitas versus despesas por mês" cfg=${{ type: 'bar',
        data: { labels: r.meses.map(mesCurto), datasets: [
          { type: 'line', label: 'Resultado', data: r.rxd.map((t) => t.resultado / 100), borderColor: '#1B1F3B', backgroundColor: '#1B1F3B', pointRadius: 4, pointStyle: 'rectRot', tension: .2,
            segment: { borderColor: (ctx) => (ctx.p1.parsed.y < 0 ? '#D1343E' : '#12855A') }, pointBackgroundColor: r.rxd.map((t) => (t.resultado < 0 ? '#D1343E' : t.resultado > 0 ? '#12855A' : '#6B7280')) },
          { label: 'Receitas', data: r.rxd.map((t) => t.receitas / 100), backgroundColor: '#22C55E', borderRadius: 6 },
          { label: 'Despesas', data: r.rxd.map((t) => t.despesas / 100), backgroundColor: '#F43F5E', borderRadius: 6 },
        ] }, options: optsEixo() }} />
      <div class="tabela-wrap" style="margin-top:8px"><table class="tab"><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Despesas</th><th class="r">Resultado</th></tr></thead>
        <tbody>${r.meses.map((ym, i) => html`<tr><td>${mesCurto(ym)}</td><td class="r num">${brl(r.rxd[i].receitas)}</td><td class="r num">${brl(r.rxd[i].despesas)}</td><td class="r"><${Tom} v=${r.rxd[i].resultado} /></td></tr>`)}</tbody></table></div>
    </div>
  </div>

  <div class="grade g-2" style="margin-bottom:16px">
    <${Ranking} titulo="Ranking por valor gasto" grupos=${C.rankingValor(r.rank.grupos)} base=${base} dim=${dimRank} setDim=${setDimRank} abrir=${setFatia} principal="valor" />
    <${Ranking} titulo="Ranking por frequência" grupos=${C.rankingFrequencia(r.rank.grupos)} base=${base} dim=${dimRank} setDim=${setDimRank} abrir=${setFatia} principal="qtd" />
  </div>`}

  <div class="grade g-2">
    <div class="card"><h3><${Icone} n="target" /> Planejado × realizado — ${nomeMesCap(mes)} <span class="acao"><${Base} base="consumo" /></span></h3>
      ${r.orc.linhas.filter((l) => l.orcado != null).length ? html`<${Grafico} chave=${'orc' + mes + D.lancamentos.length + D.orcamentos.length} altura=${Math.max(220, r.orc.linhas.filter((l) => l.orcado != null).length * 46)} rotulo="Orçamento versus realizado por categoria" cfg=${{ type: 'bar',
          data: { labels: r.orc.linhas.filter((l) => l.orcado != null).map((l) => l.categoria.nome), datasets: [
            { label: 'Planejado', data: r.orc.linhas.filter((l) => l.orcado != null).map((l) => l.orcado / 100), backgroundColor: '#CBD5E1', borderRadius: 6 },
            { label: 'Realizado', data: r.orc.linhas.filter((l) => l.orcado != null).map((l) => l.gasto / 100), backgroundColor: r.orc.linhas.filter((l) => l.orcado != null).map((l) => (l.nivel === 'estourado' ? '#D1343E' : l.nivel === 'atencao' ? '#F59E0B' : l.categoria.cor)), borderRadius: 6 }] },
          options: { ...optsEixo(), indexAxis: 'y', scales: { x: { ticks: { callback: fmtEixo } }, y: { grid: { display: false } } } } }} />`
        : html`<${Vazio} icone="target" titulo="Nenhum limite por categoria definido"><a class="btn sec peq" href="#/orcamento">Definir orçamento</a></${Vazio}>`}
      <div style="font-size:12px;color:var(--txt3)">Usa o mês selecionado no topo (${nomeMesCap(mes)}) e não depende do período acima.</div>
    </div>
    <div class="card"><h3><${Icone} n="trending-up" /> Evolução do saldo <span class="acao"><span class="base-tag">Saldo das contas</span></span></h3>
      <${Grafico} chave=${'sd' + D.lancamentos.length + r.saldo.length + P.ini} altura=${300} rotulo="Evolução do saldo realizado e projetado" cfg=${{ type: 'line',
        data: { labels: r.saldo.map((s) => mesCurto(s.ym)), datasets: [
          { label: 'Realizado', data: r.saldo.map((s) => (s.realizado == null ? null : s.realizado / 100)), borderColor: '#5B4FE9', backgroundColor: '#5B4FE922', fill: true, tension: .25, pointRadius: 3 },
          { label: 'Projetado', data: r.saldo.map((s) => (s.projetado == null ? null : s.projetado / 100)), borderColor: '#F59E0B', borderDash: [7, 6], pointStyle: 'triangle', pointRadius: 4, tension: .25 },
        ] }, options: optsEixo() }} />
      <div style="font-size:12px;color:var(--txt3)">Linha contínua: saldo realizado no fim de cada mês. Tracejada (▲): projeção com previstos, recorrências e faturas.</div>
    </div>
  </div>

  ${fatia && html`<${Modal} titulo=${fatia.rotulo} onClose=${() => setFatia(null)} larg="larga">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px"><span class="pilula pri">${brl(fatia.valor)}</span><span class="pilula zero">${fatia.qtd} lançamento(s)</span><span class="pilula zero">${pct(fatia.pct)} do total</span><${Base} base=${base} /></div>
    <div class="lista">${fatia.itens.slice().sort((a, b) => b.data.localeCompare(a.data)).map((it) => html`<${ItemLanc} l=${it.l} D=${D} />`)}</div>
  </${Modal}>`}`;
}

export function Variacao({ v, inverso }) {
  if (v == null) return html`<span class="pilula zero" title="Sem base de comparação">— sem comparação</span>`;
  const subiu = v > 0; const ruim = inverso ? subiu : !subiu;
  if (Math.abs(v) < 0.05) return html`<span class="pilula zero">● 0%</span>`;
  return html`<span class=${'pilula ' + (ruim ? 'neg' : 'pos')}>${subiu ? '▲' : '▼'} ${pct(Math.abs(v))}</span>`;
}

function Ranking({ titulo, grupos, base, dim, setDim, abrir, principal }) {
  const top = grupos.slice(0, 10);
  return html`<div class="card"><h3><${Icone} n=${principal === 'valor' ? 'coins' : 'repeat'} /> ${titulo} <span class="acao"><${Base} base=${base} /></span></h3>
    <div class="btn-grupo" style="margin-bottom:10px">${[['categoria', 'Categorias'], ['subcategoria', 'Subcategorias'], ['favorecido', 'Estabelecimentos']].map(([v, t]) => html`<button class=${dim === v ? 'on' : ''} onClick=${() => setDim(v)}>${t}</button>`)}</div>
    ${top.length ? html`<div class="tabela-wrap"><table class="tab"><thead><tr><th>#</th><th>${dim === 'favorecido' ? 'Estabelecimento' : 'Categoria'}</th><th class="r">Valor</th><th class="r">Vezes</th><th class="r">Part.</th></tr></thead>
      <tbody>${top.map((g, i) => html`<tr style="cursor:pointer" onClick=${() => abrir(g)}><td><span class=${'rank-pos p' + (i + 1)}>${i + 1}</span></td>
        <td><span style="display:flex;gap:8px;align-items:center"><${CatIcone} p cor=${g.cor} icone=${g.icone} /><span style="min-width:0">${g.rotulo}</span></span></td>
        <td class="r num" style=${principal === 'valor' ? 'font-weight:800' : ''}>${brl(g.valor)}</td><td class="r num" style=${principal === 'qtd' ? 'font-weight:800' : ''}>${g.qtd}</td><td class="r num">${pct(g.pct)}</td></tr>`)}</tbody></table></div>`
      : html`<${Vazio} icone="list" titulo="Sem dados" />`}</div>`;
}
