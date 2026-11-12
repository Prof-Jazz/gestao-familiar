import { useMemo } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Base, SeletorMes, Vazio, Barra, Grafico } from './comp.js';
import { useStore, abrirForm, abrirPagarFatura } from '../data/store.js';
import { ItemLanc } from './item.js';
import * as C from '../lib/calc.js';
import { brl, hoje, primeiroDia, ultimoDia, dataBR, nomeMes, difDias, pct, addDias } from '../lib/fmt.js';
import { corTema } from '../lib/tema.js';

/** Bom dia / Boa tarde / Boa noite pelo horário de Brasília. */
function saudacao() {
  const h = +new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function Painel() {
  const { D, mes, perfil } = useStore();
  const H = hoje();
  const k = useMemo(() => calcular(D, mes, H), [D, mes]);
  const vazioTotal = D.lancamentos.length === 0;

  return html`
  <div class="topo"><div><h2>${saudacao()}, ${perfil?.nome}!</h2><div class="sub">Resumo de ${nomeMes(mes)}</div></div><span class="esp"></span><${SeletorMes} /></div>

  ${vazioTotal && html`<div class="card" style="margin-bottom:16px"><${Vazio} icone="sparkles" titulo="Tudo pronto para começar"
    texto=${D.contas.length ? 'Registre a primeira receita ou despesa — os painéis e gráficos se montam a partir dos lançamentos.' : 'Comece cadastrando as contas da família (conta corrente, carteira, reserva) com o saldo de hoje. Depois, registre os lançamentos.'}>
    ${!D.contas.length ? html`<a class="btn" href="#/contas"><${Icone} n="wallet" /> Cadastrar contas</a>` : html`<button class="btn" onClick=${() => abrirForm({ tipo: 'despesa' })}><${Icone} n="plus" /> Novo lançamento</button>`}</${Vazio}></div>`}

  <div class="grade g-kpi">
    <div class="card kpi destaque">
      <div class="rot"><${Icone} n="wallet" /> Saldo disponível hoje</div>
      <div class="val"><${Tom} v=${k.saldoHoje} sinal=${false} /></div>
      <${Spark} vals=${k.sparkSaldo} cor="#FFFFFF" alto=${42} />
      <div class="det">Soma das contas · evolução dos últimos 30 dias</div>
    </div>
    <${Kpi} rot="Receitas recebidas" ic="arrow-down-left" cor="#12855A" v=${brl(k.caixa.receitas)} spark=${k.sparkRec} det="Acumulado no mês, dia a dia" />
    <${Kpi} rot="Despesas pagas" ic="arrow-up-right" cor="#D1343E" v=${brl(k.caixa.despesas)} spark=${k.sparkDesp} det="Acumulado no mês, dia a dia" />
    <${Kpi} rot="Resultado do mês" ic="scale" cor="#5B4FE9" v=${html`<${Tom} v=${k.caixa.resultado} />`} spark=${k.sparkRes} det="Receitas − despesas pagas" />
    <${Kpi} rot="Saldo projetado no fim do mês" ic="trending-up" cor="#0891B2" v=${html`<${Tom} v=${k.proj.valor} sinal=${false} />`}
      det=${k.proj.realizado ? 'Mês encerrado: saldo realizado' : 'Já descontando contas e faturas que ainda vencem'} />
    <${Kpi} rot="Contas a pagar no mês" ic="clock" cor="#B7791F" v=${brl(k.aPagar)} det=${`${k.qAPagar} compromisso(s), incluindo faturas`} href="#/calendario" />
    <${Kpi} rot="Valores vencidos" ic="triangle-alert" cor=${k.vencidos ? '#D1343E' : '#6B7280'} v=${html`<span style=${k.vencidos ? 'color:var(--neg)' : ''}>${brl(k.vencidos)}</span>`}
      det=${k.vencidos ? html`<b style="color:var(--neg)">⚠ ${k.qVencidos} em atraso</b>` : '✓ Nada em atraso'} href="#/calendario" />
    <${Kpi} rot="Receitas a receber" ic="hand-coins" cor="#12855A" v=${brl(k.aReceber)} det=${`${k.qAReceber} previstas no mês`} />
    <${Kpi} rot="Faturas de cartão em aberto" ic="credit-card" cor="#7C3AED" v=${brl(k.faturas)} det=${`${k.qFaturas} fatura(s) · atual e fechadas`} href="#/contas" />
    <${Kpi} rot="Orçamento utilizado" ic="target" cor=${k.orc.nivel === 'estourado' ? '#D1343E' : k.orc.nivel === 'atencao' ? '#B7791F' : '#12855A'}
      v=${k.orc.pct == null ? '—' : pct(k.orc.pct)} det=${k.orc.geral == null ? html`<a href="#/orcamento">Definir orçamento</a>` : html`${brl(k.orc.gasto)} de ${brl(k.orc.geral)}`}
      extra=${k.orc.pct != null && html`<div style="margin-top:8px"><${Barra} pct=${k.orc.pct} nivel=${k.orc.nivel} /></div>`} href="#/orcamento" />
    <${Kpi} rot="Projetos familiares" ic="folder-kanban" cor="#0EA5E9" v=${k.projetos.length ? pct(k.progProj) : '—'} det=${k.projetos.length ? `${k.projetos.length} em andamento · cobertura financeira média` : 'Nenhum projeto em andamento'} href="#/projetos" />
  </div>

  ${(k.sparkRec.length > 1) && html`<div class="card" style="margin-top:16px"><h3><${Icone} n="chart-line" /> Receitas e despesas acumuladas no mês</h3>
    <${Grafico} chave=${'fluxo' + mes + D.lancamentos.length + k.caixa.receitas + k.caixa.despesas} altura=${260} rotulo="Receitas e despesas acumuladas no mês" cfg=${cfgFluxo(k)} /></div>`}

  <div class="atalhos" style="margin:18px 0">
    <button class="atalho" onClick=${() => abrirForm({ tipo: 'despesa' })}><span class="ic" style="background:var(--neg)"><${Icone} n="arrow-up-right" /></span>Nova despesa</button>
    <button class="atalho" onClick=${() => abrirForm({ tipo: 'receita' })}><span class="ic" style="background:var(--pos)"><${Icone} n="arrow-down-left" /></span>Nova receita</button>
    <button class="atalho" onClick=${() => abrirForm({ tipo: 'transferencia' })}><span class="ic" style="background:#0369A1"><${Icone} n="arrow-left-right" /></span>Transferência</button>
  </div>

  <div class="grade g-21">
    <div class="grade" style="align-content:start">
      <div class="card"><h3><${Icone} n="calendar-days" /> Próximos vencimentos <a class="acao" href="#/calendario">Calendário</a></h3>
        ${k.proximos.length ? html`<div class="lista">${k.proximos.map((x) => x.fatura ? html`<${ItemFatura} f=${x} />` : html`<${ItemLanc} l=${x.l} D=${D} compacto />`)}</div>`
          : html`<${Vazio} icone="circle-check" titulo="Sem compromissos nos próximos 30 dias" texto="Contas previstas, recorrências e faturas aparecem aqui." />`}
      </div>
      <div class="card"><h3><${Icone} n="history" /> Últimos lançamentos <a class="acao" href="#/lancamentos">Ver todos</a></h3>
        ${k.ultimos.length ? html`<div class="lista">${k.ultimos.map((l) => html`<${ItemLanc} l=${l} D=${D} />`)}</div>` : html`<${Vazio} icone="list" titulo="Nenhum lançamento ainda" />`}
      </div>
    </div>
    <div class="grade" style="align-content:start">
      <div class="card"><h3><${Icone} n="bell" /> Alertas</h3>
        ${k.alertas.length ? html`<div class="lista">${k.alertas.map((a) => html`<a class="item" href=${a.href} style="text-decoration:none;color:inherit">
          <span class=${'pilula ' + a.tom}><${Icone} n=${a.icone} /></span><div class="meio"><div class="t1" style="white-space:normal">${a.t}</div><div class="t2" style="white-space:normal">${a.d}</div></div></a>`)}</div>`
          : html`<${Vazio} icone="circle-check" titulo="Nenhum alerta" texto="Orçamentos dentro do limite e nada vencido." />`}
      </div>
      <div class="card"><h3><${Icone} n="chart-pie" /> Maiores gastos do mês</h3>
        ${k.top.grupos.length ? html`
          <${Grafico} chave=${'top' + mes + D.lancamentos.length + k.top.total} altura=${170} rotulo="Distribuição dos maiores gastos" cfg=${{ type: 'doughnut',
            data: { labels: k.top.grupos.map((g) => g.rotulo), datasets: [{ data: k.top.grupos.map((g) => g.valor / 100), backgroundColor: k.top.grupos.map((g) => g.cor), borderWidth: 2, borderColor: corTema('--card', '#fff') }] },
            options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(Math.round(c.raw * 100))}` } } } } }} />
          <div class="legenda" style="margin-top:10px">${k.top.grupos.map((g) => html`<a class="lg" href=${'#/analises'} style="text-decoration:none;color:inherit"><${CatIcone} p cor=${g.cor} icone=${g.icone} /><span class="nm">${g.rotulo}</span><b class="num">${brl(g.valor)}</b><span class="pc">${pct(g.pct)}</span></a>`)}</div>`
          : html`<${Vazio} icone="chart-pie" titulo="Sem gastos neste mês" />`}
      </div>
      <div class="card"><h3><${Icone} n="folder-kanban" /> Projetos em andamento <a class="acao" href="#/projetos">Abrir</a></h3>
        ${k.projetos.length ? k.projetos.map(({ p, r }) => html`<div style="margin-bottom:14px"><div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
          <${CatIcone} p cor=${p.cor} icone=${p.icone} /><b style="flex:1">${p.nome}</b><span class="num" style="font-size:13px">${r.pctFinanceiro == null ? '' : pct(r.pctFinanceiro)}</span></div>
          <${Barra} pct=${r.pctFinanceiro} nivel="ok" />
          <div class="t2" style="font-size:12px;color:var(--txt3);margin-top:4px">Reservado ${brl(r.reservado)} · Gasto ${brl(r.gasto)} · Meta ${brl(r.estimado)}${r.tarefas ? ` · Tarefas ${r.feitas}/${r.tarefas}` : ''}</div></div>`)
          : html`<${Vazio} icone="rocket" titulo="Nenhum projeto em andamento"><a class="btn sec peq" href="#/projetos">Criar projeto</a></${Vazio}>`}
      </div>
    </div>
  </div>`;
}

// linha tracejada vertical acompanhando o ponteiro
const mira = { id: 'mira', afterDatasetsDraw(ch) { const a = ch.tooltip?.getActiveElements?.(); if (!a?.length) return; const x = a[0].element.x; const { top, bottom } = ch.chartArea; const g = ch.ctx;
  g.save(); g.setLineDash([5, 5]); g.strokeStyle = corTema('--txt3', '#8A90AB'); g.lineWidth = 1; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.restore(); } };
const degrade = (cor) => (ctx) => { const { chart } = ctx; const a = chart.chartArea; if (!a) return cor + '33'; const gr = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); gr.addColorStop(0, cor + '55'); gr.addColorStop(1, cor + '00'); return gr; };
function cfgFluxo(k) {
  const n = k.sparkRec.length; const labels = Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));
  return { type: 'line', plugins: [mira],
    data: { labels, datasets: [
      { label: 'Receitas', data: k.sparkRec.map((v) => v / 100), borderColor: '#22C55E', backgroundColor: degrade('#22C55E'), fill: true, tension: .4, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5 },
      { label: 'Despesas', data: k.sparkDesp.map((v) => v / 100), borderColor: '#3B82F6', backgroundColor: degrade('#3B82F6'), fill: true, tension: .4, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5 }] },
    options: { interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { title: (it) => 'Dia ' + it[0].label, label: (c) => ` ${c.dataset.label}: ${brl(Math.round(c.raw * 100))}` } } },
      scales: { y: { ticks: { callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }, grid: { color: corTema('--grade') } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } } } };
}

/** Minigráfico (linha + preenchimento em degradê). */
export function Spark({ vals, cor = '#5B4FE9', alto = 36 }) {
  if (!vals || vals.length < 2) return null;
  const W = 120, Hh = alto, min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, Hh - 3 - ((v - min) / amp) * (Hh - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const id = 'sp' + Math.random().toString(36).slice(2, 8);
  return html`<svg class="spark" viewBox=${`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true" style=${`height:${alto}px`}>
    <defs><linearGradient id=${id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${cor} stop-opacity=".35" /><stop offset="1" stop-color=${cor} stop-opacity="0" /></linearGradient></defs>
    <path d=${d + ` L${W} ${Hh} L0 ${Hh} Z`} fill=${`url(#${id})`} />
    <path d=${d} fill="none" stroke=${cor} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    <circle cx=${pts.at(-1)[0]} cy=${pts.at(-1)[1]} r="2.6" fill=${cor} /></svg>`;
}

function Kpi({ rot, ic, cor, v, det, extra, href, spark }) {
  const corpo = html`<div class="rot"><span class="ic" style=${`color:${cor};background:${cor}18;width:30px;height:30px;padding:7px;border-radius:10px;display:inline-grid`}><${Icone} n=${ic} /></span>${rot}</div>
    <div class="val num">${v}</div>${spark && html`<${Spark} vals=${spark} cor=${cor} />`}<div class="det">${det}</div>${extra}`;
  return href ? html`<a class="card kpi" href=${href} style="text-decoration:none;color:inherit">${corpo}</a>` : html`<div class="card kpi">${corpo}</div>`;
}

function ItemFatura({ f }) {
  const venc = f.vencimento < hoje();
  return html`<div class="item click" role="button" tabIndex="0" onClick=${() => abrirPagarFatura({ cartaoId: f.cartao.id, fatura: f.fatura })}><${CatIcone} cor="#5B21B6" icone=${f.cartao.icone || 'credit-card'} />
    <div class="meio"><div class="t1">Fatura ${f.cartao.nome}</div><div class="t2">Vence ${dataBR(f.vencimento)} · ${f.status === 'aberta' ? 'aberta' : 'fechada'}</div></div>
    <div class="dir"><div class="num" style="font-weight:800">−${brl(f.devido)}</div><span class=${'pilula ' + (venc ? 'neg' : 'atn')}>${venc ? '⚠ Vencida · Pagar' : 'A pagar · Pagar'}</span></div></div>`;
}

export function calcular(D, mes, H) {
  const ini = primeiroDia(mes), fim = ultimoDia(mes);
  const caixa = C.totaisMes(D, 'caixa', mes);
  const saldoHoje = C.saldoConsolidado(D, H);
  const proj = C.projecaoFimMes(D, mes, H);
  const prevMes = C.previstos(D, { ini, fim });
  const despPrev = prevMes.filter((l) => l.tipo === 'despesa');
  const recPrev = prevMes.filter((l) => l.tipo === 'receita');
  const fatMes = C.faturasEmAberto(D, H, fim, ini);
  const aPagar = despPrev.reduce((s, l) => s + l.valor_centavos, 0) + fatMes.reduce((s, f) => s + f.devido, 0);
  const vencLanc = C.previstos(D, { fim: addDias(H, -1) }).filter((l) => l.tipo === 'despesa');
  const vencFat = C.faturasEmAberto(D, H, addDias(H, -1));
  const vencidos = vencLanc.reduce((s, l) => s + l.valor_centavos, 0) + vencFat.reduce((s, f) => s + f.devido, 0);
  const todasFat = C.faturasEmAberto(D, H).filter((f) => f.fatura <= C.faturaAtual(f.cartao, H)); // atual + fechadas não pagas (parcelas futuras ficam fora)
  const orc = C.statusOrcamento(D, mes);
  const projetos = D.projetos.filter((p) => p.status === 'andamento').map((p) => ({ p, r: C.resumoProjeto(D, p, H) }));
  const comPct = projetos.filter((x) => x.r.pctFinanceiro != null);
  const progProj = comPct.length ? comPct.reduce((s, x) => s + x.r.pctFinanceiro, 0) / comPct.length : 0;
  const ultimos = C.vivos(D).filter((l) => !(l.recorrencia_id && l.recorrencia_seq > 1 && l.status === 'previsto')).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).slice(0, 8);
  const ate30 = addDias(H, 30);
  const proximos = [
    ...C.previstos(D, { fim: ate30 }).filter((l) => l.tipo !== 'transferencia').map((l) => ({ data: C.dataPrevista(l), l })),
    ...C.faturasEmAberto(D, H, ate30).map((f) => ({ data: f.vencimento, fatura: true, ...f })),
  ].sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  const alertas = [];
  if (vencidos) alertas.push({ tom: 'neg', icone: 'triangle-alert', t: `${brl(vencidos)} em contas vencidas`, d: 'Confirme o pagamento ou ajuste a data.', href: '#/calendario' });
  if (orc.nivel !== 'ok') alertas.push({ tom: orc.nivel === 'estourado' ? 'neg' : 'atn', icone: 'target', t: `Orçamento geral em ${pct(orc.pct)}`, d: `${brl(orc.gasto)} de ${brl(orc.geral)} no mês.`, href: '#/orcamento' });
  for (const l of orc.linhas.filter((x) => x.nivel !== 'ok')) alertas.push({ tom: l.nivel === 'estourado' ? 'neg' : 'atn', icone: l.nivel === 'estourado' ? 'triangle-alert' : 'bell',
    t: `${l.categoria.nome}: ${pct(l.pct)} do limite`, d: `${brl(l.gasto)} de ${brl(l.orcado)}${l.nivel === 'estourado' ? ' — limite ultrapassado' : ''}.`, href: '#/orcamento' });
  const dias = D.config?.dias_aviso_vencimento ?? 5;
  const breve = C.previstos(D, { ini: H, fim: addDias(H, dias) }).filter((l) => l.tipo === 'despesa');
  if (breve.length) alertas.push({ tom: 'atn', icone: 'clock', t: `${breve.length} conta(s) vencem em até ${dias} dias`, d: breve.slice(0, 3).map((l) => `${l.descricao} (${dataBR(C.dataPrevista(l))})`).join(', '), href: '#/calendario' });
  for (const f of C.faturasEmAberto(D, H, addDias(H, dias), H)) alertas.push({ tom: 'atn', icone: 'credit-card', t: `Fatura ${f.cartao.nome} vence em ${difDias(H, f.vencimento)} dia(s)`, d: `${brl(f.devido)} — vencimento ${dataBR(f.vencimento)}`, href: '#/contas' });
  const g = C.agrupar(D, C.itensBase(D, 'consumo', ini, fim, {}, { soPagas: true }), 'categoria');
  // minigráficos: acumulado do mês dia a dia (até hoje) e saldo dos últimos 30 dias
  const ateDia = H < fim ? H : fim;
  const itC = C.itensBase(D, 'caixa', ini, ateDia);
  const sparkRec = [], sparkDesp = [], sparkRes = [];
  let ar = 0, ad = 0;
  for (let d = ini; d <= ateDia; d = addDias(d, 1)) {
    for (const it of itC) if (it.data === d) { ar += C.valorReceita(it); ad += C.valorDespesa(it); }
    sparkRec.push(ar); sparkDesp.push(ad); sparkRes.push(ar - ad);
  }
  const sparkSaldo = []; for (let i = 29; i >= 0; i--) sparkSaldo.push(C.saldoConsolidado(D, addDias(H, -i)));
  const top = { grupos: C.rankingValor(g.grupos).slice(0, 5), total: g.total };
  return { caixa, saldoHoje, proj, aPagar, qAPagar: despPrev.length + fatMes.length, vencidos, qVencidos: vencLanc.length + vencFat.length,
    aReceber: recPrev.reduce((s, l) => s + l.valor_centavos, 0), qAReceber: recPrev.length, faturas: todasFat.reduce((s, f) => s + f.devido, 0), qFaturas: todasFat.length,
    orc, projetos, progProj, ultimos, proximos, alertas, top, sparkRec, sparkDesp, sparkRes, sparkSaldo };
}
