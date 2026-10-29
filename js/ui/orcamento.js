import { useState } from 'preact/hooks';
import { html, Icone, CatIcone, Base, SeletorMes, Vazio, Modal, Campo, Sel, CampoValor, Barra, SeletorCor, SeletorIcone, opcoesContas } from './comp.js';
import { useStore, salvar, apagar, toast, confirmar, inserir, nomeUsuario } from '../data/store.js';
import * as C from '../lib/calc.js';
import { brl, pct, hoje, dataBR, nomeMesCap, primeiroDia, uuid } from '../lib/fmt.js';

const TIPOS_META = { economia: 'Meta de economia', emergencia: 'Reserva de emergência', provisao: 'Provisão para despesa anual' };

export function Orcamento() {
  const { D, mes } = useStore();
  const H = hoje();
  const st = C.statusOrcamento(D, mes);
  const [editOrc, setEditOrc] = useState(null);
  const [editMeta, setEditMeta] = useState(null);
  const [aporte, setAporte] = useState(null);
  const cats = D.categorias.filter((c) => c.tipo === 'despesa' && !c.parent_id && !c.arquivada);
  const linhaDe = (id) => st.linhas.find((l) => l.categoria.id === id);
  const metas = D.metas.filter((m) => !m.arquivada);

  return html`
  <div class="topo"><div><h2>Orçamento e metas</h2><div class="sub">Limites de gasto e objetivos de economia</div></div><span class="esp"></span><${SeletorMes} /></div>

  <div class="card" style="margin-bottom:16px"><h3><${Icone} n="target" /> Orçamento de ${nomeMesCap(mes)} <span class="acao"><${Base} base="consumo" /></span></h3>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-bottom:10px">
      <div style="flex:1;min-width:220px">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><b>Orçamento geral da família</b>
          <span class="num">${brl(st.gasto)} ${st.geral != null ? html`de <b>${brl(st.geral)}</b>` : ''}</span></div>
        ${st.geral != null ? html`<div style="margin:8px 0 4px"><${Barra} pct=${st.pct} nivel=${st.nivel === 'ok' ? 'ok' : st.nivel} marco=${D.config?.alerta_atencao_pct ?? 80} /></div>
          <div style="font-size:13px;color:var(--txt2)">${pct(st.pct)} utilizado · ${st.geral - st.gasto >= 0 ? `restam ${brl(st.geral - st.gasto)}` : html`<b style="color:var(--neg)">▲ ${brl(st.gasto - st.geral)} acima do limite</b>`}
            ${st.registroGeral && !st.registroGeral.mes ? ' · valor padrão mensal' : st.registroGeral ? ' · valor específico deste mês' : ''}</div>`
          : html`<div style="font-size:13px;color:var(--txt3)">Sem orçamento geral definido.</div>`}
      </div>
      <button class="btn sec" onClick=${() => setEditOrc({ categoria: null, linha: { orcado: st.geral, registro: st.registroGeral } })}><${Icone} n="pencil" /> Definir orçamento geral</button>
    </div>
    ${st.somaCats > 0 && st.geral != null && st.somaCats > st.geral && html`<div class="aviso-msg" style="margin-bottom:10px">A soma dos limites por categoria (${brl(st.somaCats)}) é maior que o orçamento geral (${brl(st.geral)}).</div>`}
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Categoria</th><th class="r">Limite</th><th class="r">Gasto</th><th style="min-width:160px">Uso</th><th></th></tr></thead><tbody>
      ${cats.map((c) => { const l = linhaDe(c.id); const o = C.orcamentoDoMes(D, mes, c.id); return html`<tr>
        <td><span style="display:flex;gap:8px;align-items:center"><${CatIcone} p cat=${c} />${c.nome}</span></td>
        <td class="r num">${o ? brl(o.valor) : html`<span style="color:var(--txt3)">—</span>`}${o?.especifico ? html`<br /><small style="color:var(--txt3)">só neste mês</small>` : ''}</td>
        <td class="r num">${brl(l?.gasto || 0)}</td>
        <td>${o ? html`<${Barra} pct=${l?.pct ?? 0} nivel=${l?.nivel === 'ok' ? 'ok' : l?.nivel} /><small class=${l?.nivel === 'estourado' ? 'tom neg' : l?.nivel === 'atencao' ? 'tom' : ''} style=${l?.nivel === 'atencao' ? 'color:var(--atn)' : ''}>${pct(l?.pct ?? 0)}${l?.nivel === 'estourado' ? ' ⚠ estourado' : l?.nivel === 'atencao' ? ' ● atenção' : ''}</small>` : ''}</td>
        <td class="r"><button class="btn fantasma peq" onClick=${() => setEditOrc({ categoria: c, linha: { orcado: o?.valor, registro: o?.registro } })}><${Icone} n="pencil" /> Limite</button></td></tr>`; })}
    </tbody></table></div>
    <${Alertas} D=${D} />
  </div>

  <div class="topo" style="margin-top:26px"><div><h2 style="font-size:20px">Metas e reservas</h2><div class="sub">Aportes separam dinheiro para um objetivo — <b>não</b> contam como despesa de consumo.</div></div><span class="esp"></span>
    <button class="btn" onClick=${() => setEditMeta({})}><${Icone} n="plus" /> Nova meta</button></div>
  ${metas.length === 0 ? html`<div class="card"><${Vazio} icone="piggy-bank" titulo="Nenhuma meta ainda" texto="Crie metas de economia, a reserva de emergência e provisões para despesas anuais como IPVA e material escolar." /></div>`
  : html`<div class="grade g-3">${metas.map((m) => { const r = C.resumoMeta(D, m, H); const ap = D.aportes.filter((a) => a.meta_id === m.id).sort((a, b) => b.data.localeCompare(a.data));
    return html`<div class="card proj-card" style=${`--c:${m.cor}`}>
      <div style="display:flex;gap:10px;align-items:center"><${CatIcone} cor=${m.cor} icone=${m.icone} /><div style="flex:1;min-width:0"><b>${m.nome}</b><div style="font-size:12px;color:var(--txt3)">${TIPOS_META[m.tipo]}${m.data_alvo ? ' · até ' + dataBR(m.data_alvo) : ''}</div></div>
        <button class="btn fantasma ico peq" aria-label="Editar meta" onClick=${() => setEditMeta(m)}><${Icone} n="pencil" /></button></div>
      <div style="display:flex;justify-content:space-between;margin:12px 0 6px"><b class="num" style="font-size:20px">${brl(r.acumulado)}</b><span class="num" style="color:var(--txt2)">de ${brl(m.valor_alvo_centavos)}</span></div>
      <${Barra} pct=${r.pct} nivel="ok" />
      <div style="font-size:13px;color:var(--txt2);margin-top:6px">${pct(r.pct)} · ${r.falta > 0 ? `faltam ${brl(r.falta)}` : '✓ meta atingida'}${r.porMes ? html` · <b>guardar ${brl(r.porMes)}/mês</b> (${r.meses} meses)` : ''}${r.atrasada ? html` · <b style="color:var(--neg)">⚠ prazo vencido</b>` : ''}</div>
      <div style="display:flex;gap:6px;margin-top:10px"><button class="btn verde peq" onClick=${() => setAporte({ meta: m, tipo: 'aporte' })}><${Icone} n="plus" /> Aportar</button>
        <button class="btn sec peq" onClick=${() => setAporte({ meta: m, tipo: 'resgate' })}><${Icone} n="minus" /> Resgatar</button></div>
      ${ap.length > 0 && html`<details style="margin-top:10px"><summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--pri)">Movimentos (${ap.length})</summary>
        ${ap.map((a) => html`<div class="item" style="padding:6px 0"><div class="meio"><div class="t1" style="font-size:13px">${a.descricao || (a.tipo === 'aporte' ? 'Aporte' : 'Resgate')}</div><div class="t2">${dataBR(a.data)} · por ${nomeUsuario(a.criado_por)}</div></div>
          <b class=${'num tom ' + (a.tipo === 'aporte' ? 'pos' : 'neg')}>${a.tipo === 'aporte' ? '+' : '−'}${brl(a.valor_centavos)}</b>
          <button class="btn fantasma ico peq" aria-label="Excluir movimento" onClick=${async () => { if (await confirmar('Excluir movimento?', `${brl(a.valor_centavos)} em ${dataBR(a.data)}`, { ok: 'Excluir', perigo: true })) apagar('aportes', a.id); }}><${Icone} n="trash-2" /></button></div>`)}</details>`}
    </div>`; })}</div>`}

  ${editOrc && html`<${FormOrc} cfg=${editOrc} D=${D} mes=${mes} fechar=${() => setEditOrc(null)} />`}
  ${editMeta && html`<${FormMeta} m=${editMeta} D=${D} fechar=${() => setEditMeta(null)} />`}
  ${aporte && html`<${FormAporte} cfg=${aporte} D=${D} fechar=${() => setAporte(null)} />`}`;
}

function Alertas({ D }) {
  const c = D.config || {};
  const [a, setA] = useState(c.alerta_atencao_pct ?? 80); const [b, setB] = useState(c.alerta_limite_pct ?? 100);
  const mudou = a !== (c.alerta_atencao_pct ?? 80) || b !== (c.alerta_limite_pct ?? 100);
  return html`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:14px;padding-top:14px;border-top:1px dashed var(--borda2)">
    <${Campo} rot="Alerta de atenção (%)"><input class="inp" type="number" min="1" max="200" value=${a} onInput=${(e) => setA(+e.target.value)} style="max-width:120px" /></${Campo}>
    <${Campo} rot="Alerta de limite (%)"><input class="inp" type="number" min="1" max="300" value=${b} onInput=${(e) => setB(+e.target.value)} style="max-width:120px" /></${Campo}>
    <button class="btn sec" disabled=${!mudou} onClick=${async () => { if (a >= b) return toast('O alerta de atenção deve ser menor que o de limite.', 'erro'); try { await salvar('configuracoes', { ...c, id: 1, alerta_atencao_pct: a, alerta_limite_pct: b }); toast('Alertas atualizados.'); } catch (e) { toast(e.message, 'erro'); } }}>Salvar alertas</button>
    <small style="color:var(--txt3);flex-basis:100%">Os alertas aparecem no painel quando o gasto da categoria (ou geral) atinge esses percentuais.</small></div>`;
}

function FormOrc({ cfg, D, mes, fechar }) {
  const reg = cfg.linha.registro;
  const [valor, setValor] = useState(cfg.linha.orcado ?? null);
  const [escopo, setEscopo] = useState(reg?.mes ? 'mes' : 'padrao');
  const [ocupado, setOcupado] = useState(false); const [erro, setErro] = useState('');
  const catId = cfg.categoria?.id || null;
  const alvoMes = escopo === 'mes' ? primeiroDia(mes) : null;
  const existente = D.orcamentos.find((o) => (o.categoria_id || null) === catId && (o.mes || null) === alvoMes);
  async function ok() {
    if (valor == null || valor < 0) return setErro('Informe um valor (0 ou mais).');
    setOcupado(true);
    try {
      if (existente) await salvar('orcamentos', { ...existente, valor_centavos: valor });
      else await inserir('orcamentos', [{ id: uuid(), categoria_id: catId, mes: alvoMes, valor_centavos: valor }]);
      toast('Orçamento salvo.'); fechar();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  }
  async function remover() { if (existente) { await apagar('orcamentos', existente.id); toast('Limite removido.'); } fechar(); }
  return html`<${Modal} titulo=${cfg.categoria ? 'Limite: ' + cfg.categoria.nome : 'Orçamento geral da família'} larg="estreita" onClose=${fechar}
    rodape=${html`${existente && html`<button class="btn fantasma" style="margin-right:auto;color:var(--neg)" onClick=${remover}>Remover</button>`}<button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" disabled=${ocupado} onClick=${ok}>Salvar</button>`}>
    <div class="pilha">
      <div class="btn-grupo"><button class=${escopo === 'padrao' ? 'on' : ''} onClick=${() => setEscopo('padrao')}>Todos os meses</button><button class=${escopo === 'mes' ? 'on' : ''} onClick=${() => setEscopo('mes')}>Só ${nomeMesCap(mes)}</button></div>
      <${Campo} rot="Valor mensal" obrig><${CampoValor} valor=${valor} onChange=${setValor} autoFocus /></${Campo}>
      <small style="color:var(--txt3)">Um valor “só deste mês” substitui o padrão apenas no mês escolhido.</small>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

function FormMeta({ m, D, fechar }) {
  const [x, setX] = useState({ nome: '', tipo: 'economia', valor_alvo_centavos: null, data_alvo: '', conta_id: null, icone: 'piggy-bank', cor: '#059669', observacoes: '', arquivada: false, ...m });
  const [erro, setErro] = useState(''); const set = (p) => setX({ ...x, ...p });
  async function ok() {
    if (!x.nome?.trim()) return setErro('Informe o nome.');
    if (!x.valor_alvo_centavos || x.valor_alvo_centavos <= 0) return setErro('Informe o valor da meta.');
    try { await salvar('metas', { ...x, data_alvo: x.data_alvo || null }); toast('Meta salva.'); fechar(); } catch (e) { setErro(e.message); }
  }
  return html`<${Modal} titulo=${m.id ? 'Editar meta' : 'Nova meta'} onClose=${fechar}
    rodape=${html`${m.id && html`<button class="btn fantasma" style="margin-right:auto" onClick=${async () => { await salvar('metas', { ...x, arquivada: true }); fechar(); }}>Arquivar</button>`}<button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" onClick=${ok}>Salvar</button>`}>
    <div class="pilha">
      <div class="linha"><${Campo} rot="Nome" obrig><input class="inp" value=${x.nome} onInput=${(e) => set({ nome: e.target.value })} placeholder="Ex.: Material escolar 2027" /></${Campo}>
        <${Campo} rot="Tipo"><${Sel} valor=${x.tipo} onChange=${(v) => set({ tipo: v })} opcoes=${Object.entries(TIPOS_META).map(([v, r]) => ({ v, r }))} /></${Campo}></div>
      <div class="linha"><${Campo} rot="Valor da meta" obrig><${CampoValor} valor=${x.valor_alvo_centavos} onChange=${(v) => set({ valor_alvo_centavos: v })} /></${Campo}>
        <${Campo} rot="Data desejada"><input class="inp" type="date" value=${x.data_alvo || ''} onInput=${(e) => set({ data_alvo: e.target.value })} /></${Campo}>
        <${Campo} rot="Conta onde fica guardado"><${Sel} valor=${x.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="—" opcoes=${opcoesContas(D)} /></${Campo}></div>
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      <${Campo} rot="Ícone"><${SeletorIcone} valor=${x.icone} cor=${x.cor} onChange=${(v) => set({ icone: v })} /></${Campo}>
      <${Campo} rot="Observações"><textarea class="inp" value=${x.observacoes || ''} onInput=${(e) => set({ observacoes: e.target.value })}></textarea></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

export function FormAporte({ cfg, D, fechar }) {
  const alvo = cfg.meta || cfg.projeto;
  const [valor, setValor] = useState(null); const [data, setData] = useState(hoje()); const [desc, setDesc] = useState(''); const [conta, setConta] = useState(cfg.meta?.conta_id || null);
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  async function ok() {
    if (!valor || valor <= 0) return setErro('Informe o valor.');
    setOcupado(true);
    try {
      await inserir('aportes', [{ id: uuid(), meta_id: cfg.meta?.id || null, projeto_id: cfg.projeto?.id || null, tipo: cfg.tipo, valor_centavos: valor, data, descricao: desc || null, conta_id: conta }]);
      toast(cfg.tipo === 'aporte' ? 'Valor reservado.' : 'Resgate registrado.'); fechar();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  }
  return html`<${Modal} titulo=${(cfg.tipo === 'aporte' ? 'Reservar para ' : 'Resgatar de ') + alvo.nome} larg="estreita" onClose=${fechar}
    rodape=${html`<button class="btn sec" onClick=${fechar}>Cancelar</button><button class=${'btn ' + (cfg.tipo === 'aporte' ? 'verde' : '')} disabled=${ocupado} onClick=${ok}>Confirmar</button>`}>
    <div class="pilha">
      <div class="info-msg">${cfg.tipo === 'aporte' ? 'Reservar não é gastar: o valor fica separado para o objetivo e não entra nas despesas. Se quiser mover o dinheiro de fato para outra conta, registre também uma transferência.' : 'O resgate reduz o valor reservado para este objetivo.'}</div>
      <${Campo} rot="Valor" obrig><${CampoValor} valor=${valor} onChange=${setValor} autoFocus /></${Campo}>
      <div class="linha"><${Campo} rot="Data"><input class="inp" type="date" value=${data} onInput=${(e) => setData(e.target.value)} /></${Campo}>
        <${Campo} rot="Conta (opcional)"><${Sel} valor=${conta} onChange=${setConta} vazio="—" opcoes=${opcoesContas(D)} /></${Campo}></div>
      <${Campo} rot="Descrição"><input class="inp" value=${desc} onInput=${(e) => setDesc(e.target.value)} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}
