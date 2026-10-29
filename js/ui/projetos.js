import { useState } from 'preact/hooks';
import { html, Icone, CatIcone, Vazio, Modal, Campo, Sel, CampoValor, Barra, SeletorCor, SeletorIcone, opcoesPessoas, Avatar } from './comp.js';
import { useStore, salvar, apagar, toast, confirmar, inserir, abrirForm, atualizar, enviarAnexos, urlAnexo, removerAnexoArquivo, nomeUsuario } from '../data/store.js';
import { ItemLanc } from './item.js';
import { FormAporte } from './orcamento.js';
import * as C from '../lib/calc.js';
import { brl, pct, hoje, dataBR, uuid } from '../lib/fmt.js';

export const ST_PROJ = { planejado: ['zero', 'Planejado'], andamento: ['pri', 'Em andamento'], pausado: ['atn', 'Pausado'], concluido: ['pos', '✓ Concluído'] };

export function Projetos() {
  const { D } = useStore();
  const H = hoje();
  const [filtro, setFiltro] = useState('ativos');
  const [edit, setEdit] = useState(null);
  const [aporte, setAporte] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const lista = D.projetos.filter((p) => filtro === 'todos' || (filtro === 'ativos' ? p.status !== 'concluido' : p.status === filtro));

  return html`
  <div class="topo"><div><h2>Projetos familiares</h2><div class="sub">Viagens, reformas, troca de carro e outros planos</div></div><span class="esp"></span>
    <button class="btn" onClick=${() => setEdit({})}><${Icone} n="plus" /> Novo projeto</button></div>
  <div class="btn-grupo" style="margin-bottom:14px">${[['ativos', 'Ativos'], ['planejado', 'Planejados'], ['andamento', 'Em andamento'], ['pausado', 'Pausados'], ['concluido', 'Concluídos'], ['todos', 'Todos']].map(([v, t]) => html`<button class=${filtro === v ? 'on' : ''} onClick=${() => setFiltro(v)}>${t}</button>`)}</div>
  <div class="info-msg" style="margin-bottom:14px"><b>Reservado</b> é dinheiro separado para o projeto (não é despesa). <b>Gasto</b> são despesas já realizadas e vinculadas ao projeto — elas contam uma única vez nos totais da família.</div>

  ${lista.length === 0 ? html`<div class="card"><${Vazio} icone="folder-kanban" titulo="Nenhum projeto aqui" texto="Crie um projeto com valor estimado, data desejada e etapas. Depois, reserve valores e vincule as despesas."><button class="btn" onClick=${() => setEdit({})}><${Icone} n="plus" /> Criar projeto</button></${Vazio}></div>`
  : html`<div class="grade g-2">${lista.map((p) => html`<${CardProjeto} key=${p.id} p=${p} D=${D} H=${H} editar=${() => setEdit(p)} reservar=${(tipo) => setAporte({ projeto: p, tipo })} abrir=${() => setDetalhe(p)} />`)}</div>`}

  ${edit && html`<${FormProjeto} p=${edit} D=${D} fechar=${() => setEdit(null)} />`}
  ${aporte && html`<${FormAporte} cfg=${aporte} D=${D} fechar=${() => setAporte(null)} />`}
  ${detalhe && html`<${DetalheProjeto} p=${D.mapa.projetos[detalhe.id] || detalhe} D=${D} H=${H} fechar=${() => setDetalhe(null)} />`}`;
}

function CardProjeto({ p, D, H, editar, reservar, abrir }) {
  const r = C.resumoProjeto(D, p, H);
  const tarefas = D.tarefas.filter((t) => t.projeto_id === p.id);
  const [nova, setNova] = useState('');
  const resp = (p.responsaveis || []).map((id) => D.mapa.pessoas[id]).filter(Boolean);
  async function addTarefa(e) {
    e.preventDefault(); if (!nova.trim()) return;
    try { await inserir('projeto_tarefas', [{ id: uuid(), projeto_id: p.id, titulo: nova.trim(), concluida: false, ordem: tarefas.length + 1 }]); setNova(''); } catch (er) { toast(er.message, 'erro'); }
  }
  return html`<div class="card proj-card" style=${`--c:${p.cor}`}>
    <div style="display:flex;gap:10px;align-items:center"><${CatIcone} cor=${p.cor} icone=${p.icone} />
      <div style="flex:1;min-width:0"><b style="font-size:16px">${p.nome}</b><div style="font-size:12px;color:var(--txt3)">${p.data_alvo ? 'Meta: ' + dataBR(p.data_alvo) : 'Sem data definida'}${p.descricao ? ' · ' + p.descricao : ''}</div></div>
      <span class=${'pilula ' + ST_PROJ[p.status][0]}>${ST_PROJ[p.status][1]}</span>
      <button class="btn fantasma ico peq" aria-label="Editar projeto" onClick=${editar}><${Icone} n="pencil" /></button></div>
    <div class="proj-stat"><div><small>Estimado</small><b class="num">${brl(r.estimado)}</b></div><div><small>Reservado</small><b class="num" style="color:#0369A1">${brl(r.reservado)}</b></div><div><small>Gasto</small><b class="num" style="color:var(--neg)">${brl(r.gasto)}</b></div></div>
    <div style="font-size:13px;font-weight:700;display:flex;justify-content:space-between"><span><${Icone} n="coins" /> Progresso financeiro</span><span class="num">${r.pctFinanceiro == null ? '—' : pct(r.pctFinanceiro)}</span></div>
    <div style="margin:6px 0 4px"><${Barra} pct=${r.pctFinanceiro} nivel="ok" /></div>
    <div style="font-size:12.5px;color:var(--txt2)">${r.falta > 0 ? html`Faltam <b>${brl(r.falta)}</b>${r.porMes ? html` · reservar <b>${brl(r.porMes)}/mês</b> até ${dataBR(p.data_alvo)}` : p.data_alvo && p.data_alvo < H ? html` · <b style="color:var(--neg)">⚠ data passou</b>` : ''}` : r.estimado ? '✓ Valor estimado coberto' : 'Defina um valor estimado'}
      ${r.saldoReserva < 0 ? html` · <span style="color:var(--neg)">gasto ${brl(-r.saldoReserva)} além do reservado</span>` : r.reservado > 0 ? ` · saldo da reserva ${brl(r.saldoReserva)}` : ''}${r.previsto ? ` · ${brl(r.previsto)} previstos` : ''}</div>
    <div style="font-size:13px;font-weight:700;display:flex;justify-content:space-between;margin-top:12px"><span><${Icone} n="square-check" /> Tarefas</span><span>${r.tarefas ? `${r.feitas}/${r.tarefas}` : '—'}</span></div>
    ${r.tarefas > 0 && html`<div style="margin:6px 0"><${Barra} pct=${r.pctTarefas} /></div>`}
    <div>${tarefas.map((t) => html`<div class=${'tarefa' + (t.concluida ? ' feita' : '')}>
      <input type="checkbox" checked=${t.concluida} aria-label=${t.titulo} style="width:18px;height:18px;accent-color:var(--pri)" onChange=${async (e) => { try { await atualizar('projeto_tarefas', t.id, { concluida: e.target.checked }, t.versao); } catch (er) { toast(er.message, 'erro'); } }} />
      <span style="flex:1">${t.titulo}</span>${t.responsavel_id && html`<small style="color:var(--txt3)">${D.mapa.pessoas[t.responsavel_id]?.nome}</small>`}
      <button class="btn fantasma ico peq" style="min-height:0;padding:3px" aria-label="Excluir tarefa" onClick=${async () => { if (await confirmar('Excluir tarefa?', t.titulo, { ok: 'Excluir', perigo: true })) apagar('projeto_tarefas', t.id); }}><${Icone} n="x" /></button></div>`)}
      <form onSubmit=${addTarefa} style="display:flex;gap:6px;margin-top:6px"><input class="inp" style="min-height:36px;padding:6px 10px" placeholder="Nova etapa ou tarefa…" value=${nova} onInput=${(e) => setNova(e.target.value)} /><button class="btn sec peq" aria-label="Adicionar tarefa"><${Icone} n="plus" /></button></form>
    </div>
    ${resp.length > 0 && html`<div style="display:flex;gap:6px;align-items:center;margin-top:10px;font-size:12.5px;color:var(--txt3)">Responsáveis: ${resp.map((x) => html`<span style="display:inline-flex;gap:4px;align-items:center"><${Avatar} nome=${x.nome} cor=${x.cor} /> ${x.nome}</span>`)}</div>`}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
      <button class="btn verde peq" onClick=${() => reservar('aporte')}><${Icone} n="piggy-bank" /> Reservar</button>
      <button class="btn sec peq" onClick=${() => abrirForm({ tipo: 'despesa', chave: 'pd' + p.id, extra: { projeto_id: p.id } })}><${Icone} n="receipt" /> Lançar gasto</button>
      <button class="btn sec peq" onClick=${abrir}><${Icone} n="eye" /> Detalhes</button>
    </div>
  </div>`;
}

function DetalheProjeto({ p, D, H, fechar }) {
  const r = C.resumoProjeto(D, p, H);
  const ap = D.aportes.filter((a) => a.projeto_id === p.id).sort((a, b) => b.data.localeCompare(a.data));
  const [arqs, setArqs] = useState([]);
  async function enviar() {
    try { const novos = await enviarAnexos('projeto-' + p.id, arqs); await atualizar('projetos', p.id, { anexos: [...(p.anexos || []), ...novos] }, p.versao); setArqs([]); toast('Anexo(s) enviados.'); } catch (e) { toast(e.message, 'erro'); }
  }
  return html`<${Modal} titulo=${p.nome} larg="larga" onClose=${fechar} icone=${html`<${CatIcone} p cor=${p.cor} icone=${p.icone} />`}>
    <div class="grade g-2">
      <div class="pilha">
        <div class="proj-stat" style="margin:0"><div><small>Estimado</small><b>${brl(r.estimado)}</b></div><div><small>Reservado</small><b>${brl(r.reservado)}</b></div><div><small>Gasto</small><b>${brl(r.gasto)}</b></div></div>
        ${p.observacoes && html`<div class="card" style="box-shadow:none;padding:12px"><b>Observações</b><p style="margin:6px 0 0;white-space:pre-wrap">${p.observacoes}</p></div>`}
        <div><b>Reservas e resgates</b>${ap.length ? ap.map((a) => html`<div class="item" style="padding:7px 0"><div class="meio"><div class="t1" style="font-size:13.5px">${a.descricao || (a.tipo === 'aporte' ? 'Reserva' : 'Resgate')}</div><div class="t2">${dataBR(a.data)} · por ${nomeUsuario(a.criado_por)}</div></div>
          <b class=${'num tom ' + (a.tipo === 'aporte' ? 'pos' : 'neg')}>${a.tipo === 'aporte' ? '+' : '−'}${brl(a.valor_centavos)}</b>
          <button class="btn fantasma ico peq" aria-label="Excluir" onClick=${async () => { if (await confirmar('Excluir movimento?', brl(a.valor_centavos), { ok: 'Excluir', perigo: true })) apagar('aportes', a.id); }}><${Icone} n="trash-2" /></button></div>`) : html`<div style="color:var(--txt3);font-size:13px">Nenhuma reserva ainda.</div>`}</div>
        <div class="campo"><span>Anexos do projeto</span><div class="chips">${(p.anexos || []).map((a) => html`<span class="chip"><${Icone} n="paperclip" /><a href="#" onClick=${async (e) => { e.preventDefault(); const u = await urlAnexo(a.caminho); if (u) window.open(u, '_blank', 'noopener'); }}>${a.nome}</a>
          <button class="btn fantasma ico peq" style="min-height:0;padding:2px" aria-label="Remover" onClick=${async () => { if (await confirmar('Remover anexo?', a.nome, { ok: 'Remover', perigo: true })) { try { await removerAnexoArquivo(a.caminho); } catch {} await atualizar('projetos', p.id, { anexos: p.anexos.filter((x) => x.caminho !== a.caminho) }, p.versao); } }}><${Icone} n="x" /></button></span>`)}
          <label class="btn sec peq"><${Icone} n="upload" /> Escolher<input type="file" multiple class="sr" onChange=${(e) => setArqs([...e.target.files])} /></label>
          ${arqs.length > 0 && html`<button class="btn peq" onClick=${enviar}>Enviar ${arqs.length} arquivo(s)</button>`}</div></div>
      </div>
      <div><b>Lançamentos vinculados (${r.vinculados.length})</b>
        ${r.vinculados.length ? html`<div class="lista">${r.vinculados.sort((a, b) => b.data_ocorrencia.localeCompare(a.data_ocorrencia)).map((l) => html`<${ItemLanc} l=${l} D=${D} compacto />`)}</div>`
          : html`<${Vazio} icone="receipt" titulo="Nada vinculado" texto="Ao lançar uma despesa ou receita, escolha este projeto em “Mais detalhes”." />`}
        ${r.receitas > 0 && html`<div class="info-msg" style="margin-top:8px">Receitas vinculadas: ${brl(r.receitas)}</div>`}
      </div>
    </div></${Modal}>`;
}

function FormProjeto({ p, D, fechar }) {
  const [x, setX] = useState({ nome: '', descricao: '', icone: 'rocket', cor: '#0EA5E9', valor_estimado_centavos: 0, data_alvo: '', status: 'planejado', responsaveis: [], observacoes: '', anexos: [], ...p });
  const [erro, setErro] = useState(''); const set = (q) => setX({ ...x, ...q });
  const usado = p.id && (D.lancamentos.some((l) => l.projeto_id === p.id) || D.aportes.some((a) => a.projeto_id === p.id));
  async function ok() {
    if (!x.nome?.trim()) return setErro('Informe o nome do projeto.');
    try { await salvar('projetos', { ...x, nome: x.nome.trim(), data_alvo: x.data_alvo || null, valor_estimado_centavos: x.valor_estimado_centavos || 0 }); toast('Projeto salvo.'); fechar(); } catch (e) { setErro(e.message); }
  }
  async function excluir() {
    if (usado) return toast('O projeto tem lançamentos ou reservas. Marque-o como concluído ou pausado.', 'erro');
    if (await confirmar('Excluir projeto?', `“${x.nome}” e suas tarefas serão excluídos.`, { ok: 'Excluir', perigo: true })) { await apagar('projetos', p.id); fechar(); }
  }
  return html`<${Modal} titulo=${p.id ? 'Editar projeto' : 'Novo projeto'} onClose=${fechar}
    rodape=${html`${p.id && html`<button class="btn fantasma" style="margin-right:auto;color:var(--neg)" onClick=${excluir}>Excluir</button>`}<button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" onClick=${ok}>Salvar</button>`}>
    <div class="pilha">
      <div class="linha"><${Campo} rot="Nome" obrig><input class="inp" value=${x.nome} onInput=${(e) => set({ nome: e.target.value })} placeholder="Ex.: Viagem de férias" /></${Campo}>
        <${Campo} rot="Situação"><${Sel} valor=${x.status} onChange=${(v) => set({ status: v })} opcoes=${Object.entries(ST_PROJ).map(([v, [, r]]) => ({ v, r: r.replace('✓ ', '') }))} /></${Campo}></div>
      <${Campo} rot="Descrição"><input class="inp" value=${x.descricao || ''} onInput=${(e) => set({ descricao: e.target.value })} /></${Campo}>
      <div class="linha"><${Campo} rot="Valor estimado"><${CampoValor} valor=${x.valor_estimado_centavos} onChange=${(v) => set({ valor_estimado_centavos: v })} /></${Campo}>
        <${Campo} rot="Data desejada para conclusão"><input class="inp" type="date" value=${x.data_alvo || ''} onInput=${(e) => set({ data_alvo: e.target.value })} /></${Campo}></div>
      <div class="campo"><span>Responsáveis</span><div class="chips">${D.pessoas.filter((q) => q.ativo !== false && q.tipo !== 'familia').map((q) => html`<button type="button" class=${'chip' + (x.responsaveis.includes(q.id) ? ' on' : '')}
        onClick=${() => set({ responsaveis: x.responsaveis.includes(q.id) ? x.responsaveis.filter((i) => i !== q.id) : [...x.responsaveis, q.id] })}>${q.nome}</button>`)}</div></div>
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      <${Campo} rot="Ícone"><${SeletorIcone} valor=${x.icone} cor=${x.cor} onChange=${(v) => set({ icone: v })} /></${Campo}>
      <${Campo} rot="Observações"><textarea class="inp" value=${x.observacoes || ''} onInput=${(e) => set({ observacoes: e.target.value })}></textarea></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}
