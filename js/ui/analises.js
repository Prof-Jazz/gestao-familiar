import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Base, Vazio, Sel, Campo, Grafico, Modal, opcoesContas, opcoesPessoas, opcoesCategorias } from './comp.js';
import { useStore, toast } from '../data/store.js';
import { RelatorioAnalise } from './relatorio-analise.js';
import { corTema } from '../lib/tema.js';
import { saudeFinanceira } from '../lib/saude.js';
import { KpiDash, Var, BarrasMeta, RoscaDestaque, Empilhadas, TabelaComparativa, Alertas, montarAlertas, FaixaResumo, ArvoreCategorias } from './analises-dash.js';
import { exportarCSV, exportarXLSX } from '../lib/exportar.js';
import { ItemLanc } from './item.js';
import * as C from '../lib/calc.js';
import { brl, pct, primeiroDia, ultimoDia, addMesYM, mesCurto, dataBR, difDias, addDias, variacao, hoje, nomeMesCap } from '../lib/fmt.js';

const fmtEixo = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const tip = (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${brl(Math.round(c.raw * 100))}`;
const optsEixo = (extra = {}) => ({ interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: tip } } },
  scales: { y: { ticks: { callback: fmtEixo }, grid: { color: corTema('--grade', '#EEF0F6') } }, x: { grid: { display: false } } }, ...extra });

export function periodoDe(preset, mes, livre) {
  const H = hoje();
  switch (preset) {
    case 'atual': { const ym = H.slice(0, 7); return { ini: primeiroDia(ym), fim: ultimoDia(ym), rot: 'Mês atual — ' + nomeMesCap(ym) }; }
    case 'anterior': { const ym = addMesYM(H.slice(0, 7), -1); return { ini: primeiroDia(ym), fim: ultimoDia(ym), rot: 'Mês anterior — ' + nomeMesCap(ym) }; }
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
  const { D, perfil } = useStore();
  const mes = hoje().slice(0, 7); // Análises sempre partem do mês atual
  const [imprimindo, setImprimindo] = useState(false);
  const base = 'consumo'; // gastos no mês em que aconteceram (cartão conta na data da compra)
  const [preset, setPreset] = useState('atual');
  const [livre, setLivre] = useState({ ini: primeiroDia(mes), fim: ultimoDia(mes) });
  const [f, setF] = useState({});
  const [gran, setGran] = useState('dia');
  const [tipoEv, setTipoEv] = useState('gastos');
  const [cats, setCats] = useState([]);
  const [dimRank, setDimRank] = useState('categoria');
  const [fatia, setFatia] = useState(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const set = (p) => setF((x) => { const n = { ...x, ...p }; for (const k in n) if (!n[k]) delete n[k]; return n; });
  const P = periodoDe(preset, mes, livre);
  const mudarPreset = (v) => { setPreset(v); setGran(['mes', 'atual', 'anterior', 'livre'].includes(v) ? 'dia' : 'mes'); };
  const PA = periodoAnterior(P);
  const H = hoje();

  const r = useMemo(() => {
    const itens = C.itensBase(D, base, P.ini, P.fim, f, { soPagas: true });
    const itensA = C.itensBase(D, base, PA.ini, PA.fim, f, { soPagas: true });
    const tot = C.totais(itens), totA = C.totais(itensA);
    const porCat = C.agrupar(D, itens, 'categoria');
    const porCatRec = C.agrupar(D, itens, 'categoria', C.valorReceita);
    const rank = C.agrupar(D, itens, dimRank);
    // evolução
    const serie = C.serieTemporal(itens, P.ini, P.fim, gran);
    const serieRec = C.serieTemporal(itens.filter((it) => C.valorReceita(it) > 0), P.ini, P.fim, gran, C.valorReceita);
    const serieA = null;
    const tres = [-2, -1, 0].map((k) => { const ym = addMesYM(mes, k); return { ym, ...C.totais(C.itensBase(D, base, primeiroDia(ym), ultimoDia(ym), f, { soPagas: true })) }; });
    const porCatSerie = cats.map((id) => ({ id, s: C.serieTemporal(itens.filter((it) => it.l.categoria_id === id), P.ini, P.fim, gran) }));
    // receitas x despesas por mês (sempre mensal)
    const meses = []; for (let ym = P.ini.slice(0, 7); ym <= P.fim.slice(0, 7); ym = addMesYM(ym, 1)) meses.push(ym);
    const rxd = meses.map((ym) => C.totais(itens.filter((it) => it.data.slice(0, 7) === ym)));
    // orçamento x realizado (consumo, mês selecionado)
    const orc = C.statusOrcamento(D, mes);
    // saldo
    const ymIni = P.ini.slice(0, 7); const ymFim = addMesYM(H.slice(0, 7), 6) > P.fim.slice(0, 7) ? addMesYM(H.slice(0, 7), 6) : P.fim.slice(0, 7);
    const saldo = C.serieSaldo(D, ymIni, ymFim, H);
    const saude = saudeFinanceira(D, P.ini, P.fim, H, f);
    const orcPorCat = Object.fromEntries(orc.linhas.filter((l) => l.orcado != null).map((l) => [l.categoria.id, l.orcado]));
    const porCatA = C.agrupar(D, itensA, 'categoria');
    const contasAtrasadas = C.vivos(D).filter((l) => l.status === 'previsto' && l.tipo === 'despesa' && C.dataPrevista(l) < H);
    const alertas = montarAlertas({ D, H, g: porCat, gA: porCatA, orcPorCat, saude, contasAtrasadas });
    const maior = itens.filter((it) => C.valorDespesa(it) > 0).sort((a, b) => b.valor - a.valor)[0];
    const mapaA = Object.fromEntries(porCatA.grupos.map((x) => [x.chave, x.valor]));
    const cresceu = porCat.grupos.map((x) => ({ x, d: x.valor - (mapaA[x.chave] || 0) })).sort((a, b) => b.d - a.d)[0];
    const proj = C.projecaoFimMes(D, H.slice(0, 7), H);
    return { saude, orcPorCat, porCatA, alertas, maior, cresceu, proj, tres, serieRec, itens, itensA, porCatRec, tot, totA, porCat, rank, serie, serieA, porCatSerie, meses, rxd, orc, saldo };
  }, [D, base, P.ini, P.fim, f, gran, cats.join(), dimRank, mes]);

  const rotSerie = (k) => (gran === 'mes' ? mesCurto(k) : dataBR(k).slice(0, 5));
  const chave = [base, P.ini, P.fim, JSON.stringify(f), gran, cats.join(), mes, D.lancamentos.length, r.tot.despesas, r.tot.receitas].join('|');
  const vDesp = variacao(r.tot.despesas, r.totA.despesas);
  const vRec = variacao(r.tot.receitas, r.totA.receitas);
  const subs = f.categoria_id ? D.categorias.filter((c) => c.parent_id === f.categoria_id).map((c) => ({ v: c.id, r: c.nome })) : [];
  const catsDesp = D.categorias.filter((c) => c.tipo === 'despesa' && !c.parent_id);

  useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener('afterprint', fim, { once: true });
    const t = setTimeout(() => window.print(), 300);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fim); };
  }, [imprimindo]);
  const lancsPeriodo = () => [...new Map(r.itens.map((it) => [it.l.id, it.l])).values()].sort((a, b) => a.data_ocorrencia.localeCompare(b.data_ocorrencia));
  const nomeArq = `analise-${P.ini}-a-${P.fim}`;
  const filtrosTxt = Object.entries(f).map(([k, v]) => (k.endsWith('categoria_id') ? D.mapa.categorias[v]?.nome : k === 'conta_id' ? D.mapa.contas[v]?.nome : k === 'cartao_id' ? D.mapa.cartoes[v]?.nome : k === 'projeto_id' ? D.projetos.find((p) => p.id === v)?.nome : D.mapa.pessoas[v]?.nome || D.mapa.perfis[v]?.nome)).filter(Boolean).join(', ');
  function excelAnalise() {
    const ok = exportarXLSX(D, lancsPeriodo(), nomeArq + '.xlsx', [
      { nome: 'Resumo', linhas: [{ Indicador: 'Receitas', Valor: r.tot.receitas / 100 }, { Indicador: 'Gastos', Valor: r.tot.despesas / 100 }, { Indicador: 'Sobrou', Valor: r.tot.resultado / 100 }] },
      { nome: 'Mês a mês', linhas: r.meses.map((ym, i) => ({ Mês: mesCurto(ym), Receitas: r.rxd[i].receitas / 100, Gastos: r.rxd[i].despesas / 100, Sobrou: r.rxd[i].resultado / 100 })) },
      { nome: 'Gastos por categoria', linhas: C.rankingValor(r.porCat.grupos).map((g, i) => ({ Posição: i + 1, Categoria: g.rotulo, Valor: g.valor / 100, Vezes: g.qtd, 'Participação %': +g.pct.toFixed(2) })) },
      { nome: 'Receitas por categoria', linhas: C.rankingValor(r.porCatRec.grupos).map((g, i) => ({ Posição: i + 1, Categoria: g.rotulo, Valor: g.valor / 100, Vezes: g.qtd, 'Participação %': +g.pct.toFixed(2) })) },
    ]);
    if (!ok) toast('Não há lançamentos no período para exportar.', 'erro');
  }

  return html`<div class="nao-imprimir">
  <div class="topo"><div><h2>Análises</h2><div class="sub">${P.rot}</div></div><span class="esp"></span>
    <div class="export-grupo">
      <button class="btn" onClick=${() => setImprimindo(true)} title="Relatório completo com avaliação da saúde financeira"><${Icone} n="printer" /> Relatório PDF</button>
      <button class="btn sec" onClick=${() => exportarCSV(D, lancsPeriodo(), nomeArq + '.csv') || toast('Nada para exportar.', 'erro')}><${Icone} n="download" /> CSV</button>
      <button class="btn sec" onClick=${excelAnalise}><${Icone} n="file-spreadsheet" /> Excel</button></div></div>

  <div class="dash-barra">
      <${Campo} rot="Período"><${Sel} valor=${preset} onChange=${mudarPreset} opcoes=${[{ v: 'atual', r: 'Mês atual' }, { v: 'anterior', r: 'Mês anterior' }, { v: '3m', r: 'Últimos 3 meses' }, { v: '6m', r: 'Últimos 6 meses' }, { v: '12m', r: 'Últimos 12 meses' }, { v: 'ano', r: 'Ano inteiro' }, { v: 'livre', r: 'Personalizado' }]} /></${Campo}>
      ${preset === 'livre' && html`<${Campo} rot="De"><input class="inp" type="date" value=${livre.ini} onInput=${(e) => setLivre({ ...livre, ini: e.target.value })} /></${Campo}>
        <${Campo} rot="Até"><input class="inp" type="date" value=${livre.fim} onInput=${(e) => setLivre({ ...livre, fim: e.target.value })} /></${Campo}>`}
      <button class="btn sec" style="align-self:flex-end" onClick=${() => setVerFiltros(!verFiltros)}><${Icone} n="filter" /> Filtros${Object.keys(f).length ? ` (${Object.keys(f).length})` : ''}</button>
      <span class="dash-nota">Só entra o que já foi pago. Compras no cartão entram depois que a fatura é paga; transferências não entram.</span>
  </div>
    ${verFiltros && html`<div class="card filtros" style="margin-bottom:16px">
      <${Campo} rot="Categoria"><${Sel} valor=${f.categoria_id} onChange=${(v) => set({ categoria_id: v, subcategoria_id: null })} vazio="Todas" opcoes=${[...opcoesCategorias(D, 'despesa', { arquivadas: true }), ...opcoesCategorias(D, 'receita', { arquivadas: true })]} /></${Campo}>
      ${subs.length > 0 && html`<${Campo} rot="Subcategoria"><${Sel} valor=${f.subcategoria_id} onChange=${(v) => set({ subcategoria_id: v })} vazio="Todas" opcoes=${subs} /></${Campo}>`}
      <${Campo} rot="Conta"><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Todas" opcoes=${opcoesContas(D, { incluirArquivadas: true })} /></${Campo}>
      <${Campo} rot="Cartão"><${Sel} valor=${f.cartao_id} onChange=${(v) => set({ cartao_id: v })} vazio="Todos" opcoes=${D.cartoes.map((c) => ({ v: c.id, r: c.nome }))} /></${Campo}>
      <${Campo} rot="Lançado por"><${Sel} valor=${f.criado_por} onChange=${(v) => set({ criado_por: v })} vazio="Qualquer pessoa" opcoes=${D.perfis.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <${Campo} rot="Quem pagou/recebeu"><${Sel} valor=${f.pagador_id} onChange=${(v) => set({ pagador_id: v })} vazio="Qualquer pessoa" opcoes=${opcoesPessoas(D)} /></${Campo}>
      <${Campo} rot="Projeto"><${Sel} valor=${f.projeto_id} onChange=${(v) => set({ projeto_id: v })} vazio="Todos" opcoes=${D.projetos.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <button class="btn fantasma" onClick=${() => setF({})}><${Icone} n="x" /> Limpar</button>
    </div>`}

  <div class="kpis-dash" style="margin-bottom:16px">
    <${KpiDash} rot="Receitas" icone="arrow-down-left" cor="#22C55E" destaqueCor="var(--pos)" valor=${brl(r.tot.receitas)} rodape=${html`<${Var} v=${vRec} />`} />
    <${KpiDash} rot="Gastos" icone="arrow-up-right" cor="#F43F5E" destaqueCor="var(--neg)" valor=${brl(r.tot.despesas)} rodape=${html`<${Var} v=${vDesp} inverso />`} />
    <${KpiDash} rot=${r.tot.resultado >= 0 ? 'Sobrou' : 'Faltou'} anel=${r.tot.receitas ? Math.max(0, (r.tot.resultado / r.tot.receitas) * 100) : 0} cor=${r.tot.resultado >= 0 ? '#22C55E' : '#F43F5E'}
      destaqueCor=${r.tot.resultado >= 0 ? 'var(--pos)' : 'var(--neg)'} valor=${brl(Math.abs(r.tot.resultado))} rodape="da renda ficou guardada" />
    <${KpiDash} rot="Renda já gasta" anel=${r.tot.receitas ? (r.tot.despesas / r.tot.receitas) * 100 : 0} cor=${r.tot.despesas > r.tot.receitas ? '#F43F5E' : '#3B82F6'}
      valor=${r.tot.receitas ? (Math.round((r.tot.despesas / r.tot.receitas) * 100) + '%') : '—'} rodape="dos gastos sobre as receitas" />
    <${KpiDash} rot="Limite dos cartões" anel=${r.saude.limTot ? (r.saude.usado / r.saude.limTot) * 100 : 0} cor=${r.saude.usado > r.saude.limTot ? '#F43F5E' : r.saude.usado > r.saude.limTot * 0.6 ? '#F59E0B' : '#06B6D4'}
      valor=${brl(r.saude.usado)} rodape=${'usado de ' + brl(r.saude.limTot)} />
    <${KpiDash} rot="Saúde financeira" anel=${r.saude.nota ?? 0} anelTexto=${r.saude.nota ?? '—'} cor=${r.saude.nota >= 80 ? '#22C55E' : r.saude.nota >= 60 ? '#3B82F6' : r.saude.nota >= 40 ? '#F59E0B' : '#F43F5E'}
      valor=${r.saude.notaRot} rodape="nota de 0 a 100 · detalhes no PDF" />
  </div>

  ${r.itens.length === 0 ? html`<div class="card"><${Vazio} icone="chart-line" titulo="Sem dados para estes filtros" texto="Não há lançamentos pagos no período escolhido. Ajuste o período ou os filtros." /></div>` : html`
  <div class="dash-corpo">
    <${ArvoreCategorias} D=${D} g=${r.porCat} gA=${r.porCatA} itens=${r.itens} valor=${cats[0] || null} onChange=${(id) => { setTipoEv('gastos'); setCats(id ? [id] : []); }} />
    <div class="dash-main">
      <div class="grade g-3" style="margin-bottom:16px">
        <${BarrasMeta} grupos=${C.rankingValor(r.porCat.grupos)} orcPorCat=${r.orcPorCat} abrir=${setFatia} />
        <${RoscaDestaque} titulo="Distribuição dos gastos" icone="chart-pie" ag=${r.porCat} chave=${'pz' + chave} abrir=${setFatia} />
        <${Empilhadas} D=${D} f=${f} mesFim=${P.fim.slice(0, 7)} chave=${chave} />
      </div>

      <div class="grade g-21" style="margin-bottom:16px">
  <div class="card"><h3><${Icone} n="chart-column" /> Evolução ${tipoEv === 'gastos' ? 'dos gastos' : 'das receitas'}</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <div class="btn-grupo ev-tipo">
        <button class=${tipoEv === 'gastos' ? 'on gastos' : ''} onClick=${() => setTipoEv('gastos')}><${Icone} n="arrow-down" /> Gastos</button>
        <button class=${tipoEv === 'receitas' ? 'on receitas' : ''} onClick=${() => { setTipoEv('receitas'); setCats([]); }}><${Icone} n="arrow-up" /> Receitas</button></div>
      <div class="btn-grupo">${[['dia', 'Por dia'], ['semana', 'Por semana'], ['mes', 'Por mês']].map(([v, t]) => html`<button class=${gran === v ? 'on' : ''} onClick=${() => setGran(v)}>${t}</button>`)}</div>
    </div>
    <${Grafico} chave=${'ev' + tipoEv + chave} altura=${300} rotulo=${tipoEv === 'gastos' ? 'Evolução dos gastos' : 'Evolução das receitas'} cfg=${{ type: 'bar',
      data: { labels: r.serie.chaves.map(rotSerie), datasets:
        (tipoEv === 'receitas' ? [{ label: 'Receitas', data: r.serieRec.vals.map((v) => v / 100), backgroundColor: '#16A34A', borderRadius: 6, maxBarThickness: 46 }]
        : cats.length ? r.porCatSerie.map(({ id, s }) => ({ label: D.mapa.categorias[id]?.nome, data: s.vals.map((v) => v / 100), backgroundColor: D.mapa.categorias[id]?.cor, borderRadius: 6, maxBarThickness: 46 }))
        : [{ label: 'Gastos', data: r.serie.vals.map((v) => v / 100), backgroundColor: '#E11D48', borderRadius: 6, maxBarThickness: 46 }]).concat(cats.length ? [] : [(() => {
          const vals = (tipoEv === 'receitas' ? r.serieRec.vals : r.serie.vals); const nz = vals.filter((v) => v > 0); const m = nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length / 100 : 0;
          return { type: 'line', label: 'Média', data: vals.map(() => m), borderColor: '#F97316', borderDash: [6, 5], borderWidth: 2, pointRadius: 0 }; })()]) },
      options: optsEixo({ plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: tip } } } }) }} />
    <div class="ev-total">Total ${tipoEv === 'gastos' ? 'gasto' : 'recebido'} no período: <b class="num">${brl(tipoEv === 'gastos' ? r.tot.despesas : r.tot.receitas)}</b></div>
        </div>
        <${Alertas} itens=${r.alertas} />
      </div>

      <div class="grade g-21" style="margin-bottom:16px">
        <${TabelaComparativa} D=${D} itens=${r.itens} itensA=${r.itensA} abrir=${setFatia} rotA="Período anterior" rotB=${P.rot.replace(/^Mês atual — /, '')} />
        <${Comparacao3} tres=${r.tres} />
      </div>

      <${FaixaResumo} itens=${[
        { rot: 'Projeção do fim do mês', valor: brl(r.proj.valor), det: 'saldo das contas com o que ainda vence', icone: 'trending-up', cor: r.proj.valor < 0 ? '#F43F5E' : '#3B82F6' },
        { rot: 'Maior gasto do período', valor: r.maior ? brl(r.maior.valor) : '—', det: r.maior ? r.maior.l.descricao : '', icone: 'receipt', cor: '#F97316' },
        { rot: 'Categoria que mais cresceu', valor: r.cresceu && r.cresceu.d > 0 ? r.cresceu.x.rotulo : '—', det: r.cresceu && r.cresceu.d > 0 ? '+' + brl(r.cresceu.d) + ' vs. período anterior' : 'nenhuma subiu', icone: 'trending-up', cor: '#F43F5E' },
        { rot: 'Parcelamentos restantes', valor: brl(r.saude.restanteParc), det: r.saude.compras.length + ' em andamento', icone: 'credit-card', cor: '#8B5CF6' },
        { rot: 'Juros e encargos', valor: brl(r.saude.juros), det: 'pagos no período', icone: 'badge-percent', cor: r.saude.juros ? '#F59E0B' : '#22C55E' },
      ]} />

      <div class="card" style="margin:16px 0">
        <div class="det-topo"><h3 style="margin:0"><${Icone} n="search" /> Detalhe do período</h3>
          <div class="btn-grupo ev-tipo">
            <button class=${tipoEv === 'gastos' ? 'on gastos' : ''} onClick=${() => setTipoEv('gastos')}><${Icone} n="arrow-down" /> Gastos</button>
            <button class=${tipoEv === 'receitas' ? 'on receitas' : ''} onClick=${() => { setTipoEv('receitas'); setCats([]); }}><${Icone} n="arrow-up" /> Receitas</button></div></div>
        ${tipoEv === 'gastos' && html`<div class="so-estreito" style="margin:12px 0 0"><${MenuCategoria} lista=${catsDesp} valor=${cats[0] || null} onChange=${(id) => setCats(id ? [id] : [])} /></div>`}
        ${tipoEv === 'gastos' && (cats.length ? cats : [null]).map((id) => html`<${DetalheGastos} key=${id || 'todos'} D=${D} catId=${id} itens=${r.itens} itensA=${r.itensA} totalPeriodo=${r.tot.despesas} base=${base} abrir=${setFatia} />`)}
        ${tipoEv === 'receitas' && html`<${DetalheReceitas} D=${D} itens=${r.itens} abrir=${setFatia} />`}
      </div>

      <div class="grade g-2" style="margin-bottom:16px">
        <${RoscaDestaque} titulo="Distribuição das receitas" icone="hand-coins" ag=${r.porCatRec} chave=${'pr' + chave} abrir=${setFatia} receita />
        <${Ranking} titulo="Ranking por valor gasto" grupos=${C.rankingValor(r.rank.grupos)} base=${base} dim=${dimRank} setDim=${setDimRank} abrir=${setFatia} principal="valor" />
      </div>

      <div class="grade" style="margin-bottom:16px">
    <div class="card"><h3><${Icone} n="trending-up" /> Evolução do saldo </h3>
      <${Grafico} chave=${'sd' + D.lancamentos.length + r.saldo.length + P.ini} altura=${300} rotulo="Evolução do saldo realizado e projetado" cfg=${{ type: 'line',
        data: { labels: r.saldo.map((s) => mesCurto(s.ym)), datasets: [
          { label: 'Realizado', data: r.saldo.map((s) => (s.realizado == null ? null : s.realizado / 100)), borderColor: '#5B4FE9', backgroundColor: '#5B4FE922', fill: true, tension: .25, pointRadius: 3 },
          { label: 'Projetado', data: r.saldo.map((s) => (s.projetado == null ? null : s.projetado / 100)), borderColor: '#F59E0B', borderDash: [7, 6], pointStyle: 'triangle', pointRadius: 4, tension: .25 },
        ] }, options: optsEixo() }} />
      <div style="font-size:12px;color:var(--txt3)">Linha contínua: saldo realizado no fim de cada mês. Tracejada (▲): projeção com previstos, recorrências e faturas.</div>
    </div>
      </div>
    </div>
  </div>`}


  ${fatia && html`<${Modal} titulo=${fatia.rotulo} onClose=${() => setFatia(null)} larg="larga">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px"><span class="pilula pri">${brl(fatia.valor)}</span><span class="pilula zero">${fatia.qtd} lançamento(s)</span><span class="pilula zero">${pct(fatia.pct)} do total</span></div>
    <div class="lista">${fatia.itens.slice().sort((a, b) => b.data.localeCompare(a.data)).map((it) => html`<${ItemLanc} l=${it.l} D=${D} />`)}</div>
  </${Modal}>`}</div>
  ${imprimindo && html`<${RelatorioAnalise} D=${D} P=${P} f=${f} mes=${mes} hoje=${H} perfil=${perfil} filtrosTxt=${filtrosTxt} />`}`;
}

function Distribuicao({ titulo, icone, ag, chave, base, abrir, vazio, receita }) {
  const gs = C.rankingValor(ag.grupos);
  return html`<div class="card"><h3><${Icone} n=${icone} /> ${titulo}</h3>
    ${gs.length ? html`
      <div style="position:relative">
        <${Grafico} chave=${chave} altura=${240} rotulo=${titulo} onClique=${(i) => abrir(gs[i])} cfg=${{ type: 'doughnut',
          data: { labels: gs.map((g) => g.rotulo), datasets: [{ data: gs.map((g) => g.valor / 100), backgroundColor: gs.map((g) => g.cor), borderColor: '#fff', borderWidth: 2 }] },
          options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(Math.round(c.raw * 100))} (${pct(ag.total ? (c.raw * 10000) / ag.total : 0)})` } } } } }} />
        <div class="rosca-centro"><small>${receita ? 'Total recebido' : 'Total gasto'}</small><b class="num" style=${receita ? 'color:var(--pos)' : ''}>${brl(ag.total)}</b></div>
      </div>
      <div class="legenda" style="margin-top:12px">${gs.map((g) => html`<div class="lg" role="button" tabIndex="0" onClick=${() => abrir(g)} onKeyDown=${(e) => e.key === 'Enter' && abrir(g)}>
        <${CatIcone} p cor=${g.cor} icone=${g.icone} /><span class="nm">${g.rotulo}</span><b class="num">${brl(g.valor)}</b><span class="pc">${pct(g.pct)}</span></div>`)}</div>
      <div style="font-size:12px;color:var(--txt3);margin-top:6px">Toque numa fatia ou categoria para ver os lançamentos.</div>`
    : html`<${Vazio} icone=${icone} titulo=${vazio} />`}
  </div>`;
}

/** Detalhamento de uma categoria (ou de todos os gastos): quanto, quanto do total, onde e em quê. */
function DetalheGastos({ D, catId, itens, itensA, totalPeriodo, base, abrir }) {
  const cat = catId ? D.mapa.categorias[catId] : null;
  const filtrar = (arr) => (catId ? arr.filter((it) => it.l.categoria_id === catId) : arr);
  const its = filtrar(itens).filter((it) => C.valorDespesa(it));
  const tot = C.totais(its).despesas, totA = C.totais(filtrar(itensA)).despesas;
  const qtd = its.filter((it) => it.natureza === 'despesa' || it.natureza === 'fatura').length;
  const maior = its.filter((it) => it.natureza !== 'reembolso').sort((a, b) => b.valor - a.valor)[0];
  const lugares = C.rankingValor(C.agrupar(D, its, 'favorecido').grupos);
  const subs = C.rankingValor(C.agrupar(D, its, catId ? 'subcategoria' : 'categoria').grupos).map((g) => ({ ...g, rotulo: catId && g.categoria_id !== catId ? g.rotulo.split(' › ').pop() : catId ? 'Sem subcategoria' : g.rotulo }));
  const cor = cat?.cor || '#5B4FE9';
  const titulo = cat ? cat.nome : 'Todos os gastos do período';
  if (!its.length) return html`<div class="detalhe-gasto" style=${`--c:${cor}`}><div class="det-cab"><${CatIcone} cor=${cor} icone=${cat?.icone || 'coins'} /><b>${titulo}</b></div>
    <${Vazio} icone="search" titulo="Nenhum gasto nesta categoria no período" texto="Escolha outro período ou outra categoria." /></div>`;
  const Lista = ({ titulo: t, grupos, icone }) => {
    const topo = grupos[0]?.valor || 1;
    return html`<div class="det-lista"><h4><${Icone} n=${icone} /> ${t}</h4>
      ${grupos.slice(0, 10).map((g, i) => html`<button type="button" class="det-linha" onClick=${() => abrir(g)} title="Ver os lançamentos">
        <span class=${'rank-pos p' + (i + 1)}>${i + 1}</span><${CatIcone} p cor=${g.cor} icone=${g.icone} />
        <span class="det-meio"><span class="det-nome">${g.rotulo}</span><span class="det-barra"><i style=${`width:${Math.max(2, (g.valor / topo) * 100)}%;background:${cor}`}></i></span>
          <small>${g.qtd} lançamento(s) · ${pct(tot ? (g.valor / tot) * 100 : 0)} ${cat ? 'da categoria' : 'do total'}</small></span>
        <b class="num">${brl(g.valor)}</b></button>`)}
      ${grupos.length > 10 && html`<small style="color:var(--txt3)">+ ${grupos.length - 10} outros</small>`}</div>`;
  };
  return html`<div class="detalhe-gasto" style=${`--c:${cor}`}>
    <div class="det-cab"><${CatIcone} cor=${cor} icone=${cat?.icone || 'coins'} /><b>${titulo}</b></div>
    <div class="det-kpis">
      <div class="det-kpi destaque"><small>Total gasto</small><b class="num">${brl(tot)}</b><span>no período</span></div>
      ${cat && html`<div class="det-kpi"><small>Do total de despesas</small><b class="num">${pct(totalPeriodo ? (tot / totalPeriodo) * 100 : 0)}</b><span class="det-barra"><i style=${`width:${totalPeriodo ? Math.min(100, (tot / totalPeriodo) * 100) : 0}%;background:${cor}`}></i></span></div>`}
      <div class="det-kpi"><small>Lançamentos</small><b class="num">${qtd}</b><span>Média ${qtd ? brl(Math.round(tot / qtd)) : '—'} cada</span></div>
      <div class="det-kpi"><small>Lugar onde mais gastou</small><b>${lugares[0]?.rotulo || '—'}</b><span>${lugares[0] ? `${brl(lugares[0].valor)} · ${pct(tot ? (lugares[0].valor / tot) * 100 : 0)}` : ''}</span></div>
      ${maior && html`<div class="det-kpi"><small>Maior gasto único</small><b class="num">${brl(maior.valor)}</b><span>${maior.l.descricao} · ${dataBR(maior.data)}</span></div>`}
    </div>
    <div class="grade g-2">
      <${Lista} titulo="Onde você mais gastou" grupos=${lugares} icone="store" />
      <${Lista} titulo=${cat ? 'Por subcategoria' : 'Por categoria'} grupos=${subs} icone="tag" />
    </div>
    <small style="color:var(--txt3)">“Lugar” é o estabelecimento informado no lançamento; quando ele está vazio, usamos a descrição. Toque numa linha para ver os lançamentos.</small>
  </div>`;
}

export function Variacao({ v, inverso }) {
  if (v == null) return html`<span class="pilula zero" title="Sem base de comparação">— sem comparação</span>`;
  const subiu = v > 0; const ruim = inverso ? subiu : !subiu;
  if (Math.abs(v) < 0.05) return html`<span class="pilula zero">● 0%</span>`;
  return html`<span class=${'pilula ' + (ruim ? 'neg' : 'pos')}>${subiu ? '▲' : '▼'} ${pct(Math.abs(v))}</span>`;
}

function Ranking({ titulo, grupos, base, dim, setDim, abrir, principal }) {
  const top = grupos.slice(0, 10);
  return html`<div class="card"><h3><${Icone} n=${principal === 'valor' ? 'coins' : 'repeat'} /> ${titulo}</h3>
    <div class="btn-grupo" style="margin-bottom:10px">${[['categoria', 'Categorias'], ['subcategoria', 'Subcategorias'], ['favorecido', 'Estabelecimentos']].map(([v, t]) => html`<button class=${dim === v ? 'on' : ''} onClick=${() => setDim(v)}>${t}</button>`)}</div>
    ${top.length ? html`<div class="tabela-wrap"><table class="tab"><thead><tr><th>#</th><th>${dim === 'favorecido' ? 'Estabelecimento' : 'Categoria'}</th><th class="r">Valor</th><th class="r">Vezes</th><th class="r">Part.</th></tr></thead>
      <tbody>${top.map((g, i) => html`<tr style="cursor:pointer" onClick=${() => abrir(g)}><td><span class=${'rank-pos p' + (i + 1)}>${i + 1}</span></td>
        <td><span style="display:flex;gap:8px;align-items:center"><${CatIcone} p cor=${g.cor} icone=${g.icone} /><span style="min-width:0">${g.rotulo}</span></span></td>
        <td class="r num" style=${principal === 'valor' ? 'font-weight:800' : ''}>${brl(g.valor)}</td><td class="r num" style=${principal === 'qtd' ? 'font-weight:800' : ''}>${g.qtd}</td><td class="r num">${pct(g.pct)}</td></tr>`)}</tbody></table></div>`
      : html`<${Vazio} icone="list" titulo="Sem dados" />`}</div>`;
}

/** Mês selecionado comparado com os 2 meses anteriores. */
function Comparacao3({ tres }) {
  const linhas = [['Receitas', 'receitas', false], ['Gastos', 'despesas', true], ['Sobrou', 'resultado', false]];
  return html`<div class="card"><h3><${Icone} n="calendar-days" /> Comparação com os 2 meses anteriores</h3>
    <div class="tabela-wrap"><table class="tab comp3"><thead><tr><th></th>${tres.map((t, i) => html`<th class="r">${nomeMesCap(t.ym)}${i === 2 ? ' (atual)' : ''}</th>`)}</tr></thead>
      <tbody>${linhas.map(([rot, k, inv]) => html`<tr><td><b>${rot}</b></td>${tres.map((t, i) => html`<td class="r">
        <div class="num" style=${`font-weight:${i === 2 ? 800 : 600};color:${k === 'receitas' ? 'var(--pos)' : k === 'despesas' ? 'var(--neg)' : t[k] < 0 ? 'var(--neg)' : 'var(--txt)'}`}>${brl(t[k])}</div>
        ${i > 0 && html`<div style="margin-top:2px"><${Variacao} v=${variacao(t[k], tres[i - 1][k])} inverso=${inv} /></div>`}</td>`)}</tr>`)}</tbody></table></div>
    <div style="font-size:12px;color:var(--txt3);margin-top:6px">As setas comparam cada mês com o mês anterior a ele.</div>
  </div>`;
}

/** Todas as receitas do período: de onde veio e em que categoria. */
function DetalheReceitas({ D, itens, abrir }) {
  const its = itens.filter((it) => C.valorReceita(it) > 0);
  const tot = its.reduce((s, it) => s + C.valorReceita(it), 0);
  const cor = '#16A34A';
  if (!its.length) return html`<div class="detalhe-gasto" style=${`--c:${cor};margin-top:14px`}><div class="det-cab"><${CatIcone} cor=${cor} icone="hand-coins" /><b>Todas as receitas do período</b></div>
    <${Vazio} icone="hand-coins" titulo="Nenhuma receita no período" /></div>`;
  const origens = C.rankingValor(C.agrupar(D, its, 'favorecido', C.valorReceita).grupos);
  const porCat = C.rankingValor(C.agrupar(D, its, 'categoria', C.valorReceita).grupos);
  const maior = its.slice().sort((a, b) => b.valor - a.valor)[0];
  const Lista = ({ titulo: t, grupos, icone }) => {
    const topo = grupos[0]?.valor || 1;
    return html`<div class="det-lista"><h4><${Icone} n=${icone} /> ${t}</h4>
      ${grupos.slice(0, 10).map((g, i) => html`<button type="button" class="det-linha" onClick=${() => abrir(g)} title="Ver os lançamentos">
        <span class=${'rank-pos p' + (i + 1)}>${i + 1}</span><${CatIcone} p cor=${g.cor} icone=${g.icone} />
        <span class="det-meio"><span class="det-nome">${g.rotulo}</span><span class="det-barra"><i style=${`width:${Math.max(2, (g.valor / topo) * 100)}%;background:${cor}`}></i></span>
          <small>${g.qtd} lançamento(s) · ${pct(tot ? (g.valor / tot) * 100 : 0)} do total</small></span>
        <b class="num">${brl(g.valor)}</b></button>`)}</div>`;
  };
  return html`<div class="detalhe-gasto" style=${`--c:${cor};margin-top:14px`}>
    <div class="det-cab"><${CatIcone} cor=${cor} icone="hand-coins" /><b>Todas as receitas do período</b></div>
    <div class="det-kpis">
      <div class="det-kpi destaque"><small>Total recebido</small><b class="num">${brl(tot)}</b><span>no período</span></div>
      <div class="det-kpi"><small>Lançamentos</small><b class="num">${its.length}</b><span>Média ${brl(Math.round(tot / its.length))} cada</span></div>
      <div class="det-kpi"><small>Maior fonte</small><b>${origens[0]?.rotulo || '—'}</b><span>${origens[0] ? `${brl(origens[0].valor)} · ${pct(tot ? (origens[0].valor / tot) * 100 : 0)}` : ''}</span></div>
      <div class="det-kpi"><small>Maior receita única</small><b class="num">${brl(maior.valor)}</b><span>${maior.l.descricao} · ${dataBR(maior.data)}</span></div>
    </div>
    <div class="grade g-2">
      <${Lista} titulo="De onde veio" grupos=${origens} icone="building-2" />
      <${Lista} titulo="Por categoria" grupos=${porCat} icone="tag" />
    </div>
  </div>`;
}

/** Menu suspenso de categorias: clique na seta, a lista desce, escolha uma. */
function MenuCategoria({ lista, valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const sel = lista.find((c) => c.id === valor);
  const escolher = (id) => { onChange(id); setAberto(false); };
  return html`<div class="menu-cat" ref=${ref}>
    <button type="button" class=${'menu-cat-btn' + (aberto ? ' aberto' : '')} aria-haspopup="listbox" aria-expanded=${aberto} onClick=${() => setAberto(!aberto)}>
      ${sel ? html`<${CatIcone} p cor=${sel.cor} icone=${sel.icone} /><span>${sel.nome}</span>` : html`<${Icone} n="tag" /><span>Selecione a categoria</span>`}
      <span class="menu-cat-seta"><${Icone} n="chevron-down" /></span></button>
    ${aberto && html`<div class="menu-cat-lista" role="listbox">
      <button type="button" role="option" aria-selected=${!valor} class=${'menu-cat-op' + (!valor ? ' on' : '')} onClick=${() => escolher(null)}>
        <${Icone} n="list" /><span>Todas as categorias</span>${!valor && html`<${Icone} n="check" />`}</button>
      ${lista.map((c) => html`<button type="button" role="option" aria-selected=${valor === c.id} class=${'menu-cat-op' + (valor === c.id ? ' on' : '')} onClick=${() => escolher(c.id)}>
        <${CatIcone} p cor=${c.cor} icone=${c.icone} /><span>${c.nome}</span>${valor === c.id && html`<${Icone} n="check" />`}</button>`)}
    </div>`}
  </div>`;
}
