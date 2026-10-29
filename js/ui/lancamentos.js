import { useMemo, useState, useEffect } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, SeletorMes, Vazio, Sel, Campo, opcoesContas, opcoesCartoes, opcoesPessoas, opcoesCategorias, Autoria } from './comp.js';
import { useStore, abrirForm, restaurarDaLixeira, apagarDefinitivo, confirmar, toast, nomeUsuario } from '../data/store.js';
import { ItemLanc } from './item.js';
import * as C from '../lib/calc.js';
import { brl, dataBR, primeiroDia, ultimoDia, dataHoraBR, MESES_NOMES } from '../lib/fmt.js';
import { exportarCSV, exportarXLSX } from '../lib/exportar.js';

export const dataLista = (l) => (l.status === 'previsto' ? C.dataPrevista(l) : C.dataConsumo(l));
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const rotDia = (iso) => `${DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()]}, ${+iso.slice(8, 10)} de ${MESES_NOMES[+iso.slice(5, 7) - 1]}`;

/** Filtros iniciais podem vir pela rota: #/lancamentos/categoria_id=xxx&base=consumo */
function filtrosDaRota(arg) {
  const p = new URLSearchParams(arg || '');
  return Object.fromEntries([...p.entries()].filter(([k]) => k !== 'ini' && k !== 'fim'));
}

export function Lancamentos({ arg }) {
  const { D, mes } = useStore();
  const [aba, setAba] = useState('lista');
  const [f, setF] = useState(() => filtrosDaRota(arg));
  const [periodo, setPeriodo] = useState(() => { const p = new URLSearchParams(arg || ''); return p.get('ini') ? { ini: p.get('ini'), fim: p.get('fim') } : null; });
  const [ordem, setOrdem] = useState('data_desc');
  const [mostrarFiltros, setMostrarFiltros] = useState(Object.keys(filtrosDaRota(arg)).length > 0);
  useEffect(() => { setF(filtrosDaRota(arg)); }, [arg]);
  const set = (p) => setF((x) => { const n = { ...x, ...p }; for (const k in n) if (!n[k]) delete n[k]; return n; });
  const ini = periodo?.ini || primeiroDia(mes), fim = periodo?.fim || ultimoDia(mes);

  const lista = useMemo(() => {
    const filtrosCalc = { ...f }; delete filtrosCalc.base;
    let arr = C.vivos(D).filter((l) => { const d = dataLista(l); return d >= ini && d <= fim && C.passaFiltro(l, filtrosCalc, D); });
    const [campo, dir] = ordem.split('_'); const s = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => campo === 'valor' ? s * (a.valor_centavos - b.valor_centavos) : campo === 'desc' ? a.descricao.localeCompare(b.descricao, 'pt-BR')
      : s * (dataLista(a).localeCompare(dataLista(b)) || String(a.criado_em).localeCompare(String(b.criado_em))));
    return arr;
  }, [D, f, ini, fim, ordem]);
  const tot = useMemo(() => {
    let rec = 0, desp = 0;
    for (const l of lista) {
      if (l.status === 'cancelado') continue;
      if (l.tipo === 'receita') rec += l.valor_centavos;
      else if (l.tipo === 'despesa') desp += l.valor_centavos;
      else if (l.tipo === 'reembolso') desp -= l.valor_centavos;
    }
    return { rec, desp };
  }, [lista]);
  const lixeira = useMemo(() => D.lancamentos.filter((l) => l.excluido_em).sort((a, b) => b.excluido_em.localeCompare(a.excluido_em)), [D]);
  const subs = f.categoria_id ? D.categorias.filter((c) => c.parent_id === f.categoria_id).map((c) => ({ v: c.id, r: c.nome })) : [];
  const nFiltros = Object.keys(f).length;

  const grupos = [];
  if (ordem.startsWith('data')) for (const l of lista) { const d = dataLista(l); const g = grupos.at(-1); if (g?.d === d) g.ls.push(l); else grupos.push({ d, ls: [l] }); }

  return html`
  <div class="topo"><div><h2>Lançamentos</h2><div class="sub">Receitas, despesas e transferências da família</div></div><span class="esp"></span>
    ${!periodo && html`<${SeletorMes} />`}
    <button class="btn" onClick=${() => abrirForm({ tipo: 'despesa' })}><${Icone} n="plus" /> Novo</button></div>

  <div class="btn-grupo" style="margin-bottom:14px"><button class=${aba === 'lista' ? 'on' : ''} onClick=${() => setAba('lista')}>Lista</button>
    <button class=${aba === 'lixeira' ? 'on' : ''} onClick=${() => setAba('lixeira')}><${Icone} n="trash-2" /> Lixeira (${lixeira.length})</button></div>

  ${aba === 'lista' ? html`
  <div class="card" style="margin-bottom:14px">
    <div class="filtros">
      <div class="busca"><${Icone} n="search" /><input class="inp" type="search" placeholder="Pesquisar descrição, estabelecimento, etiqueta…" value=${f.busca || ''} onInput=${(e) => set({ busca: e.target.value })} aria-label="Pesquisar" /></div>
      <${Campo} rot="Ordenar"><${Sel} valor=${ordem} onChange=${setOrdem} opcoes=${[{ v: 'data_desc', r: 'Mais recentes' }, { v: 'data_asc', r: 'Mais antigos' }, { v: 'valor_desc', r: 'Maior valor' }, { v: 'valor_asc', r: 'Menor valor' }, { v: 'desc_asc', r: 'Descrição (A–Z)' }]} /></${Campo}>
      <button class="btn sec" onClick=${() => setMostrarFiltros(!mostrarFiltros)}><${Icone} n="filter" /> Filtros${nFiltros - (f.busca ? 1 : 0) > 0 ? ` (${nFiltros - (f.busca ? 1 : 0)})` : ''}</button>
    </div>
    ${mostrarFiltros && html`<div class="filtros" style="margin-top:12px">
      <${Campo} rot="Período"><${Sel} valor=${periodo ? 'livre' : 'mes'} onChange=${(v) => setPeriodo(v === 'livre' ? { ini, fim } : null)} opcoes=${[{ v: 'mes', r: 'Mês selecionado' }, { v: 'livre', r: 'Intervalo de datas' }]} /></${Campo}>
      ${periodo && html`<${Campo} rot="De"><input class="inp" type="date" value=${periodo.ini} onInput=${(e) => setPeriodo({ ...periodo, ini: e.target.value })} /></${Campo}>
        <${Campo} rot="Até"><input class="inp" type="date" value=${periodo.fim} onInput=${(e) => setPeriodo({ ...periodo, fim: e.target.value })} /></${Campo}>`}
      <${Campo} rot="Tipo"><${Sel} valor=${f.tipo} onChange=${(v) => set({ tipo: v })} vazio="Todos" opcoes=${[{ v: 'despesa', r: 'Despesas' }, { v: 'receita', r: 'Receitas' }, { v: 'transferencia', r: 'Transferências' }, { v: 'pagamento_fatura', r: 'Pagamentos de fatura' }, { v: 'reembolso', r: 'Reembolsos/estornos' }]} /></${Campo}>
      <${Campo} rot="Categoria"><${Sel} valor=${f.categoria_id} onChange=${(v) => set({ categoria_id: v, subcategoria_id: null })} vazio="Todas" opcoes=${[{ grupo: 'Despesas', itens: opcoesCategorias(D, 'despesa', { arquivadas: true }).map((o) => ({ v: o.v, r: o.r })) }, { grupo: 'Receitas', itens: opcoesCategorias(D, 'receita', { arquivadas: true }).map((o) => ({ v: o.v, r: o.r })) }]} /></${Campo}>
      ${subs.length > 0 && html`<${Campo} rot="Subcategoria"><${Sel} valor=${f.subcategoria_id} onChange=${(v) => set({ subcategoria_id: v })} vazio="Todas" opcoes=${subs} /></${Campo}>`}
      <${Campo} rot="Conta"><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Todas" opcoes=${opcoesContas(D, { incluirArquivadas: true })} /></${Campo}>
      <${Campo} rot="Cartão"><${Sel} valor=${f.cartao_id} onChange=${(v) => set({ cartao_id: v })} vazio="Todos" opcoes=${D.cartoes.map((c) => ({ v: c.id, r: c.nome }))} /></${Campo}>
      <${Campo} rot="Situação"><${Sel} valor=${f.status} onChange=${(v) => set({ status: v })} vazio="Todas" opcoes=${[{ v: 'efetivado', r: 'Pago/recebido' }, { v: 'previsto', r: 'Previsto' }, { v: 'cancelado', r: 'Cancelado' }]} /></${Campo}>
      <${Campo} rot="Lançado por"><${Sel} valor=${f.criado_por} onChange=${(v) => set({ criado_por: v })} vazio="Qualquer pessoa" opcoes=${D.perfis.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <${Campo} rot="Quem pagou/recebeu"><${Sel} valor=${f.pagador_id} onChange=${(v) => set({ pagador_id: v })} vazio="Qualquer pessoa" opcoes=${opcoesPessoas(D)} /></${Campo}>
      <${Campo} rot="Beneficiário"><${Sel} valor=${f.beneficiario_id} onChange=${(v) => set({ beneficiario_id: v })} vazio="Todos" opcoes=${opcoesPessoas(D)} /></${Campo}>
      <${Campo} rot="Projeto"><${Sel} valor=${f.projeto_id} onChange=${(v) => set({ projeto_id: v })} vazio="Todos" opcoes=${D.projetos.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <button class="btn fantasma" onClick=${() => { setF({}); setPeriodo(null); }}><${Icone} n="x" /> Limpar</button>
    </div>`}
  </div>

  <div class="card">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <span class="pilula zero">${lista.length} lançamento(s)</span>
      <span class="pilula pos">Receitas ${brl(tot.rec)}</span><span class="pilula neg">Despesas ${brl(tot.desp)}</span>
      <span style="font-size:13px">Saldo do filtro: <${Tom} v=${tot.rec - tot.desp} /></span>
      <span style="flex:1"></span>
      <button class="btn sec peq" onClick=${() => exportarCSV(D, lista) || toast('Nada para exportar.', 'erro')}><${Icone} n="download" /> CSV</button>
      <button class="btn sec peq" onClick=${() => exportarXLSX(D, lista) || toast('Nada para exportar.', 'erro')}><${Icone} n="file-spreadsheet" /> Excel</button>
    </div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:6px">Totais da lista incluem previstos (exceto cancelados); transferências e pagamentos de fatura não entram em receitas/despesas. Compras parceladas aparecem no mês de cada parcela.</div>
    ${lista.length === 0 ? html`<${Vazio} icone="search" titulo="Nenhum lançamento encontrado" texto=${nFiltros ? 'Ajuste ou limpe os filtros para ver mais resultados.' : 'Não há lançamentos neste período.'} />`
      : grupos.length ? grupos.map((g) => html`<div class="dia-grupo"><span>${rotDia(g.d)}</span></div><div class="lista">${g.ls.map((l) => html`<${ItemLanc} key=${l.id} l=${l} D=${D} semData />`)}</div>`)
      : html`<div class="lista">${lista.map((l) => html`<${ItemLanc} key=${l.id} l=${l} D=${D} />`)}</div>`}
  </div>` : html`
  <div class="card"><h3><${Icone} n="trash-2" /> Lixeira</h3><div class="card-sub">Itens na lixeira não entram em saldos, gráficos nem relatórios. Restaure ou apague de vez.</div>
    ${lixeira.length === 0 ? html`<${Vazio} icone="trash-2" titulo="Lixeira vazia" />` : html`<div class="lista">${lixeira.map((l) => html`<div class="item">
      <${CatIcone} cat=${D.mapa.categorias[l.categoria_id]} />
      <div class="meio"><div class="t1">${l.descricao} · ${brl(l.valor_centavos)}</div><div class="t2">${dataBR(l.data_ocorrencia)} · Excluído por ${nomeUsuario(l.excluido_por)} em ${dataHoraBR(l.excluido_em)}</div></div>
      <div class="dir" style="display:flex;gap:6px">
        <button class="btn sec peq" onClick=${async () => { try { await restaurarDaLixeira(l); toast('Lançamento restaurado.'); } catch (e) { toast(e.message, 'erro'); } }}><${Icone} n="archive-restore" /> Restaurar</button>
        <button class="btn fantasma peq" style="color:var(--neg)" onClick=${async () => { if (await confirmar('Apagar definitivamente?', `“${l.descricao}” será apagado para sempre (o histórico de auditoria é mantido).`, { ok: 'Apagar de vez', perigo: true })) { try { await apagarDefinitivo(l); toast('Apagado definitivamente.'); } catch (e) { toast(e.message, 'erro'); } } }}><${Icone} n="trash-2" /></button>
      </div></div>`)}</div>`}
  </div>`}`;
}
