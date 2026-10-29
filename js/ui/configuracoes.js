import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Vazio, Modal, Campo, Sel, SeletorCor, SeletorIcone, Avatar, opcoesContas } from './comp.js';
import { useStore, salvar, apagar, toast, confirmar, inserir, store, historicoRecente, nomeUsuario, restaurarBackup, carregar, encerrarRecorrencia, sair } from '../data/store.js';
import { brl, dataBR, dataHoraBR, hoje, parseData, parseValor, normalizar, uuid, primeiroDia } from '../lib/fmt.js';
import { baixar } from '../lib/exportar.js';
import { MarcaOficial } from './login.js';
import { formatarCampo } from './form-lancamento.js';

const ABAS = [['categorias', 'Categorias', 'tag'], ['pessoas', 'Pessoas', 'users'], ['recorrencias', 'Recorrências', 'repeat'], ['importar', 'Importar CSV', 'upload'],
  ['backup', 'Backup', 'database'], ['atividade', 'Atividade', 'history'], ['conta', 'Minha conta', 'user'], ['sobre', 'Sobre', 'info']];

export function Configuracoes({ arg }) {
  const [aba, setAba] = useState(ABAS.some(([a]) => a === arg) ? arg : 'categorias');
  return html`<div class="topo"><div><h2>Configurações</h2><div class="sub">Cadastros, dados e acesso</div></div></div>
    <div class="btn-grupo" style="margin-bottom:16px">${ABAS.map(([a, t, i]) => html`<button class=${aba === a ? 'on' : ''} onClick=${() => setAba(a)}><${Icone} n=${i} /> ${t}</button>`)}</div>
    ${aba === 'categorias' && html`<${Categorias} />`}${aba === 'pessoas' && html`<${Pessoas} />`}${aba === 'recorrencias' && html`<${Recorrencias} />`}
    ${aba === 'importar' && html`<${Importar} />`}${aba === 'backup' && html`<${Backup} />`}${aba === 'atividade' && html`<${Atividade} />`}
    ${aba === 'conta' && html`<${MinhaConta} />`}${aba === 'sobre' && html`<${Sobre} />`}`;
}

// ------------------------------------------------------------------ categorias
function Categorias() {
  const { D } = useStore();
  const [tipo, setTipo] = useState('despesa');
  const [edit, setEdit] = useState(null);
  const [verArq, setVerArq] = useState(false);
  const maes = D.categorias.filter((c) => c.tipo === tipo && !c.parent_id && (verArq || !c.arquivada));
  const uso = useMemo(() => { const u = {}; for (const l of D.lancamentos) { if (l.categoria_id) u[l.categoria_id] = (u[l.categoria_id] || 0) + 1; if (l.subcategoria_id) u[l.subcategoria_id] = (u[l.subcategoria_id] || 0) + 1; } return u; }, [D.lancamentos]);
  async function mover(c, dir, irmaos) {
    const i = irmaos.findIndex((x) => x.id === c.id); const j = i + dir;
    if (j < 0 || j >= irmaos.length) return;
    const outro = irmaos[j];
    try { await salvar('categorias', { ...c, ordem: outro.ordem }); await salvar('categorias', { ...store.s.D.mapa.categorias[outro.id], ordem: c.ordem === outro.ordem ? c.ordem + dir : c.ordem }); } catch (e) { toast(e.message, 'erro'); }
  }
  const Linha = ({ c, irmaos, sub }) => html`<div class="item" style=${(sub ? 'padding-left:46px;' : '') + (c.arquivada ? 'opacity:.55' : '')}>
    <${CatIcone} cat=${c} p=${sub} /><div class="meio"><div class="t1">${c.nome}${c.arquivada ? ' (arquivada)' : ''}</div><div class="t2">${uso[c.id] ? `${uso[c.id]} lançamento(s)` : 'Sem uso'}</div></div>
    <button class="btn fantasma ico peq" aria-label="Subir" onClick=${() => mover(c, -1, irmaos)}><${Icone} n="arrow-up" /></button>
    <button class="btn fantasma ico peq" aria-label="Descer" onClick=${() => mover(c, 1, irmaos)}><${Icone} n="arrow-down" /></button>
    ${!sub && html`<button class="btn fantasma peq" onClick=${() => setEdit({ tipo, parent_id: c.id, cor: c.cor, icone: c.icone })}><${Icone} n="plus" /> Sub</button>`}
    <button class="btn fantasma ico peq" aria-label="Editar" onClick=${() => setEdit(c)}><${Icone} n="pencil" /></button></div>`;
  return html`<div class="card">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <div class="btn-grupo"><button class=${tipo === 'despesa' ? 'on' : ''} onClick=${() => setTipo('despesa')}>Despesas</button><button class=${tipo === 'receita' ? 'on' : ''} onClick=${() => setTipo('receita')}>Receitas</button></div>
      <label class="chk" style="font-size:13px"><input type="checkbox" checked=${verArq} onChange=${(e) => setVerArq(e.target.checked)} /> Mostrar arquivadas</label>
      <span style="flex:1"></span><button class="btn" onClick=${() => setEdit({ tipo })}><${Icone} n="plus" /> Nova categoria</button></div>
    <div class="info-msg" style="margin-bottom:8px">Categorias já usadas não são apagadas: <b>arquive</b> para impedir novos usos mantendo o histórico. Cor e ícone valem em formulários, listas, gráficos e relatórios.</div>
    <div class="lista">${maes.map((c) => { const subs = D.categorias.filter((s) => s.parent_id === c.id && (verArq || !s.arquivada)); return html`<${Linha} c=${c} irmaos=${maes} />${subs.map((s) => html`<${Linha} c=${s} irmaos=${subs} sub />`)}`; })}</div>
    ${edit && html`<${FormCategoria} c=${edit} D=${D} usada=${!!uso[edit.id]} fechar=${() => setEdit(null)} />`}
  </div>`;
}
function FormCategoria({ c, D, usada, fechar }) {
  const mae = c.parent_id ? D.mapa.categorias[c.parent_id] : null;
  const [x, setX] = useState({ nome: '', icone: mae?.icone || 'tag', cor: mae?.cor || '#5B4FE9', arquivada: false, ...c });
  const [erro, setErro] = useState(''); const set = (p) => setX({ ...x, ...p });
  const temSubs = c.id && D.categorias.some((s) => s.parent_id === c.id);
  async function ok() {
    if (!x.nome?.trim()) return setErro('Informe o nome.');
    const irmaos = D.categorias.filter((s) => s.tipo === x.tipo && (s.parent_id || null) === (x.parent_id || null));
    if (irmaos.some((s) => s.id !== x.id && normalizar(s.nome) === normalizar(x.nome))) return setErro('Já existe uma categoria com esse nome.');
    try { await salvar('categorias', { ...x, nome: x.nome.trim(), ordem: x.ordem ?? Math.max(0, ...irmaos.map((s) => s.ordem || 0)) + 1 }); toast('Categoria salva.'); fechar(); } catch (e) { setErro(e.message); }
  }
  async function excluir() {
    if (usada || temSubs) { await salvar('categorias', { ...x, arquivada: !x.arquivada }); toast(x.arquivada ? 'Categoria reativada.' : 'Categoria arquivada.'); fechar(); return; }
    if (await confirmar('Excluir categoria?', `“${x.nome}” não tem lançamentos e será excluída.`, { ok: 'Excluir', perigo: true })) { try { await apagar('categorias', c.id); fechar(); } catch (e) { setErro(e.message); } }
  }
  return html`<${Modal} titulo=${c.id ? 'Editar categoria' : mae ? 'Nova subcategoria de ' + mae.nome : 'Nova categoria'} onClose=${fechar}
    rodape=${html`${c.id && html`<button class="btn fantasma" style="margin-right:auto" onClick=${excluir}>${usada || temSubs ? (x.arquivada ? 'Reativar' : 'Arquivar') : 'Excluir'}</button>`}<button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" onClick=${ok}>Salvar</button>`}>
    <div class="pilha">
      <div style="display:flex;gap:12px;align-items:center"><${CatIcone} cor=${x.cor} icone=${x.icone} /><input class="inp" value=${x.nome} onInput=${(e) => set({ nome: e.target.value })} placeholder="Nome" aria-label="Nome da categoria" /></div>
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      <${Campo} rot="Ícone"><${SeletorIcone} valor=${x.icone} cor=${x.cor} onChange=${(v) => set({ icone: v })} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

// ------------------------------------------------------------------ pessoas
function Pessoas() {
  const { D } = useStore();
  const [edit, setEdit] = useState(null);
  const TIPOS = { familia: 'Família (todos)', membro: 'Membro com acesso', filho: 'Filho(a)', outro: 'Outro beneficiário' };
  return html`<div class="card"><h3><${Icone} n="users" /> Pessoas e beneficiários <span class="acao"><button class="btn peq" onClick=${() => setEdit({ tipo: 'filho' })}><${Icone} n="plus" /> Adicionar</button></span></h3>
    <div class="card-sub">Usados em “quem pagou/recebeu” e “a quem a despesa se refere”. Quem <b>registrou</b> o lançamento vem sempre do login.</div>
    <div class="lista">${D.pessoas.map((p) => html`<div class="item" style=${p.ativo === false ? 'opacity:.5' : ''}><${Avatar} nome=${p.nome} cor=${p.cor} /><div class="meio"><div class="t1">${p.nome}</div><div class="t2">${TIPOS[p.tipo]}${p.perfil_id ? ' · vinculado ao login' : ''}${p.ativo === false ? ' · inativo' : ''}</div></div>
      <button class="btn fantasma ico peq" aria-label="Editar" onClick=${() => setEdit(p)}><${Icone} n="pencil" /></button></div>`)}</div>
    ${edit && html`<${FormPessoa} p=${edit} D=${D} tipos=${TIPOS} fechar=${() => setEdit(null)} />`}</div>`;
}
function FormPessoa({ p, D, tipos, fechar }) {
  const [x, setX] = useState({ nome: '', tipo: 'filho', cor: '#F59E0B', ativo: true, ordem: D.pessoas.length + 1, ...p });
  const [erro, setErro] = useState('');
  async function ok() { if (!x.nome?.trim()) return setErro('Informe o nome.'); try { await salvar('pessoas', { ...x, nome: x.nome.trim() }); fechar(); } catch (e) { setErro(e.message); } }
  return html`<${Modal} titulo=${p.id ? 'Editar pessoa' : 'Nova pessoa'} larg="estreita" onClose=${fechar}
    rodape=${html`${p.id && !p.perfil_id && html`<button class="btn fantasma" style="margin-right:auto" onClick=${async () => { await salvar('pessoas', { ...x, ativo: !x.ativo }); fechar(); }}>${x.ativo === false ? 'Reativar' : 'Desativar'}</button>`}<button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" onClick=${ok}>Salvar</button>`}>
    <div class="pilha"><${Campo} rot="Nome" obrig><input class="inp" value=${x.nome} onInput=${(e) => setX({ ...x, nome: e.target.value })} /></${Campo}>
      ${!p.perfil_id && p.tipo !== 'familia' && html`<${Campo} rot="Tipo"><${Sel} valor=${x.tipo} onChange=${(v) => setX({ ...x, tipo: v })} opcoes=${[{ v: 'filho', r: tipos.filho }, { v: 'outro', r: tipos.outro }]} /></${Campo}>`}
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => setX({ ...x, cor: v })} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}</div></${Modal}>`;
}

// ------------------------------------------------------------------ recorrências
function Recorrencias() {
  const { D } = useStore();
  const FREQ = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', anual: 'Anual' };
  const [dias, setDias] = useState(D.config?.dias_aviso_vencimento ?? 5); const [hor, setHor] = useState(D.config?.horizonte_recorrencia_meses ?? 12);
  return html`<div class="pilha">
    <div class="card"><h3><${Icone} n="bell" /> Avisos dentro da plataforma</h3>
      <div class="filtros"><${Campo} rot="Avisar vencimentos com antecedência de (dias)"><input class="inp" type="number" min="0" max="60" value=${dias} onInput=${(e) => setDias(+e.target.value)} /></${Campo}>
        <${Campo} rot="Gerar previsões de recorrências para (meses)"><input class="inp" type="number" min="1" max="36" value=${hor} onInput=${(e) => setHor(+e.target.value)} /></${Campo}>
        <button class="btn sec" onClick=${async () => { try { await salvar('configuracoes', { ...D.config, id: 1, dias_aviso_vencimento: dias, horizonte_recorrencia_meses: hor }); toast('Preferências salvas.'); } catch (e) { toast(e.message, 'erro'); } }}>Salvar</button></div>
      <small style="color:var(--txt3)">Notificações fora da plataforma (e-mail, WhatsApp, push) não estão ativas: dependem de integração externa ainda não configurada.</small></div>
    <div class="card"><h3><${Icone} n="repeat" /> Recorrências cadastradas</h3><div class="card-sub">Para criar, marque “Repetir” ao lançar. Para alterar valores, edite uma ocorrência e escolha “esta e as próximas”.</div>
      ${D.recorrencias.length ? html`<div class="lista">${D.recorrencias.map((r) => html`<div class="item" style=${r.ativa ? '' : 'opacity:.55'}>
        <${CatIcone} cat=${D.mapa.categorias[r.categoria_id]} /><div class="meio"><div class="t1">${r.descricao} · ${brl(r.valor_centavos)}</div>
        <div class="t2">${FREQ[r.frequencia]} desde ${dataBR(r.inicio)}${r.fim ? ' até ' + dataBR(r.fim) : ''} · ${r.tipo === 'receita' ? 'Receita' : 'Despesa'} · ${D.mapa.contas[r.conta_id]?.nome || D.mapa.cartoes[r.cartao_id]?.nome || ''}${r.ativa ? '' : ' · encerrada'}</div></div>
        ${r.ativa && html`<button class="btn sec peq" onClick=${async () => { if (await confirmar('Encerrar recorrência?', 'As ocorrências previstas a partir de hoje vão para a lixeira. As já pagas ficam como estão.', { ok: 'Encerrar', perigo: true })) { try { await encerrarRecorrencia(r.id, hoje()); toast('Recorrência encerrada.'); } catch (e) { toast(e.message, 'erro'); } } }}>Encerrar</button>`}</div>`)}</div>`
        : html`<${Vazio} icone="repeat" titulo="Nenhuma recorrência" texto="Colégio, curso de inglês, diarista, academia, assinaturas e salários podem ser cadastrados como recorrentes." />`}</div></div>`;
}

// ------------------------------------------------------------------ importação CSV
const CAMPOS_IMP = [['data', 'Data *'], ['descricao', 'Descrição *'], ['valor', 'Valor *'], ['tipo', 'Tipo (receita/despesa)'], ['categoria', 'Categoria'], ['subcategoria', 'Subcategoria'], ['favorecido', 'Estabelecimento'], ['observacoes', 'Observações']];
function adivinhar(cols, campo) {
  const pistas = { data: ['data', 'date', 'dt'], descricao: ['descri', 'histor', 'memo', 'nome', 'title'], valor: ['valor', 'value', 'amount', 'quantia'], tipo: ['tipo', 'type', 'natureza'],
    categoria: ['categoria', 'category'], subcategoria: ['subcat'], favorecido: ['estabelec', 'favorec', 'loja', 'merchant'], observacoes: ['obs', 'nota', 'coment'] }[campo];
  return cols.find((c) => pistas.some((p) => normalizar(c).includes(p))) || '';
}
function Importar() {
  const { D } = useStore();
  const [arq, setArq] = useState(null); const [dados, setDados] = useState(null); const [mapa, setMapa] = useState({});
  const [conta, setConta] = useState(D.contas.find((c) => !c.arquivada)?.id || null);
  const [status, setStatus] = useState('efetivado'); const [sel, setSel] = useState({}); const [ocupado, setOcupado] = useState(false); const [etapa, setEtapa] = useState(1);
  function ler(file) {
    setArq(file);
    window.Papa.parse(file, { header: true, skipEmptyLines: 'greedy', encoding: 'UTF-8', complete: (r) => {
      const cols = r.meta.fields.filter(Boolean);
      setDados({ cols, linhas: r.data.slice(0, 5000) });
      setMapa(Object.fromEntries(CAMPOS_IMP.map(([c]) => [c, adivinhar(cols, c)]))); setEtapa(2);
    }, error: (e) => toast('Não foi possível ler o arquivo: ' + e.message, 'erro') });
  }
  const achaCat = (nome, tipo, parent = null) => { if (!nome) return null; const n = normalizar(nome); return D.categorias.find((c) => c.tipo === tipo && (c.parent_id || null) === parent && normalizar(c.nome) === n) || null; };
  const linhas = useMemo(() => {
    if (!dados || etapa < 3) return [];
    const chaves = new Set(D.lancamentos.filter((l) => !l.excluido_em).map((l) => `${l.data_ocorrencia}|${l.valor_centavos}|${normalizar(l.descricao)}`));
    const vistos = new Set();
    return dados.linhas.map((row, i) => {
      const erros = [];
      const data = parseData(row[mapa.data]); if (!data) erros.push('data inválida');
      let v = parseValor(row[mapa.valor]); if (v == null || v === 0) erros.push('valor inválido');
      const desc = String(row[mapa.descricao] ?? '').trim(); if (!desc) erros.push('sem descrição');
      const tipoTxt = mapa.tipo ? normalizar(row[mapa.tipo] || '') : '';
      let tipo = /^(r|entrada|credito)/.test(tipoTxt) ? 'receita' : /^(d|saida|debito|pagamento)/.test(tipoTxt) ? 'despesa' : null;
      if (!tipo) tipo = v != null && v < 0 ? 'despesa' : 'receita';
      const valor = v == null ? null : Math.abs(v);
      const cat = achaCat(row[mapa.categoria], tipo) || achaCat(tipo === 'receita' ? 'Outras receitas' : 'Outros', tipo);
      const sub = cat ? achaCat(row[mapa.subcategoria], tipo, cat.id) : null;
      const chave = `${data}|${valor}|${normalizar(desc)}`;
      const dup = chaves.has(chave) ? 'já cadastrado' : vistos.has(chave) ? 'repetido no arquivo' : null;
      vistos.add(chave);
      return { i, data, valor, desc, tipo, cat, sub, favorecido: row[mapa.favorecido] || null, obs: row[mapa.observacoes] || null, erros, dup };
    });
  }, [dados, mapa, etapa, D.lancamentos]);
  useEffect(() => { setSel(Object.fromEntries(linhas.map((l) => [l.i, !l.erros.length && !l.dup]))); }, [linhas]);
  const escolhidas = linhas.filter((l) => sel[l.i] && !l.erros.length);
  async function gravar() {
    if (!conta) return toast('Escolha a conta.', 'erro');
    if (!(await confirmar('Confirmar importação?', `${escolhidas.length} lançamento(s) serão gravados na conta ${D.mapa.contas[conta]?.nome} como ${status === 'efetivado' ? 'pagos/recebidos' : 'previstos'}.`, { ok: 'Importar' }))) return;
    setOcupado(true);
    try {
      const pessoaEu = D.pessoas.find((p) => p.perfil_id === store.s.perfil?.id);
      const rows = escolhidas.map((l) => ({ id: uuid(), tipo: l.tipo, descricao: l.desc.slice(0, 200), valor_centavos: l.valor, categoria_id: l.cat?.id || null, subcategoria_id: l.sub?.id || null,
        data_ocorrencia: l.data, competencia: primeiroDia(l.data.slice(0, 7)), data_efetiva: status === 'efetivado' ? l.data : null, vencimento: status === 'previsto' ? l.data : null,
        conta_id: conta, status, favorecido: l.favorecido, observacoes: l.obs, pagador_id: pessoaEu?.id || null, etiquetas: ['importado'] }));
      for (let i = 0; i < rows.length; i += 200) await inserir('lancamentos', rows.slice(i, i + 200), 'imp' + rows[i].id);
      toast(`${rows.length} lançamento(s) importados com a etiqueta “importado”.`); setEtapa(1); setDados(null); setArq(null);
    } catch (e) { toast(e.message, 'erro'); } finally { setOcupado(false); }
  }
  return html`<div class="card"><h3><${Icone} n="upload" /> Importar lançamentos de CSV</h3>
    <div class="chips" style="margin-bottom:12px">${['Arquivo', 'Mapear colunas', 'Revisar e confirmar'].map((t, i) => html`<span class=${'pilula ' + (etapa === i + 1 ? 'pri' : 'zero')}>${i + 1}. ${t}</span>`)}</div>
    ${etapa === 1 && html`<label class="btn"><${Icone} n="upload" /> Escolher arquivo CSV<input type="file" accept=".csv,text/csv" class="sr" onChange=${(e) => e.target.files[0] && ler(e.target.files[0])} /></label>
      <p style="color:var(--txt2);font-size:14px">Aceita separador vírgula ou ponto e vírgula, com cabeçalho. Valores como “1.250,90” ou “-45,00”; datas como 28/10/2026 ou 2026-10-28. Se não houver coluna de tipo, valores negativos viram despesas e positivos, receitas.</p>`}
    ${etapa === 2 && dados && html`<div class="pilha"><div class="info-msg">${arq?.name}: ${dados.linhas.length} linha(s), ${dados.cols.length} coluna(s).</div>
      <div class="linha">${CAMPOS_IMP.map(([c, r]) => html`<${Campo} rot=${r}><${Sel} valor=${mapa[c]} onChange=${(v) => setMapa({ ...mapa, [c]: v || '' })} vazio="— não usar —" opcoes=${dados.cols.map((x) => ({ v: x, r: x }))} /></${Campo}>`)}</div>
      <div class="linha"><${Campo} rot="Conta de destino" obrig><${Sel} valor=${conta} onChange=${setConta} opcoes=${opcoesContas(D)} /></${Campo}>
        <${Campo} rot="Situação"><${Sel} valor=${status} onChange=${setStatus} opcoes=${[{ v: 'efetivado', r: 'Pago/recebido' }, { v: 'previsto', r: 'Previsto' }]} /></${Campo}></div>
      <div style="display:flex;gap:8px"><button class="btn sec" onClick=${() => setEtapa(1)}>Voltar</button><button class="btn" disabled=${!mapa.data || !mapa.valor || !mapa.descricao} onClick=${() => setEtapa(3)}>Pré-visualizar</button></div></div>`}
    ${etapa === 3 && html`<div class="pilha">
      <div class="chips"><span class="pilula pos">${escolhidas.length} selecionada(s)</span><span class="pilula neg">${linhas.filter((l) => l.erros.length).length} com erro</span><span class="pilula atn">${linhas.filter((l) => l.dup).length} possível(is) duplicidade(s)</span></div>
      <div class="tabela-wrap" style="max-height:420px;overflow:auto"><table class="tab"><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map((l) => html`<tr style=${l.erros.length ? 'background:var(--neg-suave)' : l.dup ? 'background:var(--atn-suave)' : ''}>
          <td><input type="checkbox" disabled=${l.erros.length > 0} checked=${!!sel[l.i]} onChange=${(e) => setSel({ ...sel, [l.i]: e.target.checked })} aria-label="Importar linha" /></td>
          <td>${l.data ? dataBR(l.data) : '—'}</td><td>${l.desc}</td><td>${l.tipo === 'receita' ? '▲ Receita' : '▼ Despesa'}</td><td>${l.cat?.nome || '—'}${l.sub ? ' › ' + l.sub.nome : ''}</td>
          <td class="r num">${l.valor != null ? brl(l.valor) : '—'}</td><td>${l.erros.length ? html`<span class="pilula neg">${l.erros.join(', ')}</span>` : l.dup ? html`<span class="pilula atn">${l.dup}</span>` : html`<span class="pilula pos">ok</span>`}</td></tr>`)}
      </tbody></table></div>
      <small style="color:var(--txt3)">Linhas que parecem duplicadas vêm desmarcadas — marque se quiser importá-las mesmo assim. Categorias não encontradas vão para “Outros”/“Outras receitas”.</small>
      <div style="display:flex;gap:8px"><button class="btn sec" onClick=${() => setEtapa(2)}>Voltar</button><button class="btn" disabled=${!escolhidas.length || ocupado} onClick=${gravar}>${ocupado ? 'Gravando…' : `Importar ${escolhidas.length} lançamento(s)`}</button></div></div>`}
  </div>`;
}

// ------------------------------------------------------------------ backup
const TAB_BACKUP = ['pessoas', 'categorias', 'contas', 'cartoes', 'projetos', 'projeto_tarefas', 'metas', 'aportes', 'orcamentos', 'recorrencias', 'lancamentos'];
function Backup() {
  const { D, backend } = useStore();
  const [ocupado, setOcupado] = useState(false);
  async function exportar() {
    setOcupado(true);
    try {
      const raw = await backend.carregarTudo();
      const dados = { formato: 'gestao-familiar-backup', versao: 1, gerado_em: new Date().toISOString(), gerado_por: store.s.perfil?.nome, ambiente: backend.modo };
      for (const t of [...TAB_BACKUP, 'configuracoes']) dados[t] = raw[t] || [];
      baixar(`backup-gestao-familiar-${hoje()}.json`, JSON.stringify(dados, null, 1), 'application/json');
      toast('Backup gerado. Guarde o arquivo em local seguro.');
    } catch (e) { toast(e.message, 'erro'); } finally { setOcupado(false); }
  }
  async function restaurar(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.formato !== 'gestao-familiar-backup') throw new Error('Arquivo não reconhecido como backup desta plataforma.');
      const n = TAB_BACKUP.reduce((s, t) => s + (j[t]?.length || 0), 0);
      if (!(await confirmar('Restaurar backup?', `Backup de ${dataHoraBR(j.gerado_em)} com ${n} registros. Somente registros que NÃO existem hoje serão recriados (nada é sobrescrito ou apagado). A autoria original é preservada e a restauração fica no histórico.`, { ok: 'Restaurar' }))) return;
      setOcupado(true);
      const dados = {}; for (const t of TAB_BACKUP) if (j[t]) dados[t] = j[t].map((r) => (t === 'pessoas' ? { ...r, perfil_id: D.perfis.some((p) => p.id === r.perfil_id) ? r.perfil_id : null } : r));
      const res = await restaurarBackup(dados);
      const total = Object.values(res || {}).reduce((s, v) => s + v, 0);
      toast(`Restauração concluída: ${total} registro(s) recriado(s).`);
      await carregar({ silencioso: true });
    } catch (e) { toast(e.message, 'erro'); } finally { setOcupado(false); }
  }
  return html`<div class="grade g-2">
    <div class="card"><h3><${Icone} n="download" /> Exportar todos os dados</h3><p style="color:var(--txt2);font-size:14px">Gera um arquivo JSON com contas, cartões, categorias, lançamentos (inclusive lixeira), recorrências, orçamentos, metas e projetos. Os anexos ficam no armazenamento do Supabase e não entram no arquivo.</p>
      <button class="btn" disabled=${ocupado} onClick=${exportar}><${Icone} n="database" /> Baixar backup completo</button>
      <p style="color:var(--txt3);font-size:13px">Dica: para planilhas, use a exportação Excel/CSV em Lançamentos ou Relatórios.</p></div>
    <div class="card"><h3><${Icone} n="archive-restore" /> Restaurar backup</h3><p style="color:var(--txt2);font-size:14px">Recria registros que estejam faltando (por exemplo, após uma exclusão definitiva). Registros existentes não são alterados.</p>
      <label class="btn sec"><${Icone} n="upload" /> Escolher arquivo de backup<input type="file" accept=".json,application/json" class="sr" disabled=${ocupado} onChange=${(e) => e.target.files[0] && restaurar(e.target.files[0])} /></label>
      <p style="color:var(--txt3);font-size:13px">O banco do Supabase também tem backups diários automáticos (conforme o plano do projeto).</p></div></div>`;
}

// ------------------------------------------------------------------ atividade
function Atividade() {
  const { D, versaoD } = useStore();
  const [itens, setItens] = useState(null);
  useEffect(() => { historicoRecente(150).then(setItens).catch((e) => setItens({ erro: e.message })); }, [versaoD]);
  const NOMES = { lancamentos: 'Lançamento', contas: 'Conta', cartoes: 'Cartão', categorias: 'Categoria', projetos: 'Projeto', projeto_tarefas: 'Tarefa', metas: 'Meta', aportes: 'Reserva', orcamentos: 'Orçamento', recorrencias: 'Recorrência', pessoas: 'Pessoa', configuracoes: 'Configurações' };
  const ACOES = { criado: 'criou', alterado: 'alterou', enviado_lixeira: 'enviou à lixeira', restaurado: 'restaurou', apagado_definitivamente: 'apagou definitivamente', restaurado_backup: 'restaurou do backup' };
  if (!itens) return html`<div class="card">Carregando…</div>`;
  if (itens.erro) return html`<div class="erro-msg">${itens.erro}</div>`;
  return html`<div class="card"><h3><${Icone} n="history" /> Atividade recente da família</h3>
    ${itens.length ? html`<div class="lista">${itens.map((h) => { const r = h.depois || h.antes || {}; return html`<div class="item"><${Avatar} nome=${nomeUsuario(h.usuario) || '?'} cor=${D.pessoas.find((p) => p.perfil_id === h.usuario)?.cor} />
      <div class="meio"><div class="t1" style="white-space:normal">${nomeUsuario(h.usuario) || 'Sistema'} ${ACOES[h.acao] || h.acao} ${(NOMES[h.tabela] || h.tabela).toLowerCase()} “${r.descricao || r.nome || r.titulo || ''}”${r.valor_centavos ? ' · ' + brl(r.valor_centavos) : ''}</div>
      <div class="t2">${dataHoraBR(h.em)}</div></div></div>`; })}</div>` : html`<${Vazio} icone="history" titulo="Nenhuma atividade" />`}</div>`;
}

// ------------------------------------------------------------------ conta
function MinhaConta() {
  const { perfil, backend, D } = useStore();
  const [s1, setS1] = useState(''); const [s2, setS2] = useState(''); const [msg, setMsg] = useState(null);
  async function trocar(e) {
    e.preventDefault(); setMsg(null);
    if (s1.length < 8) return setMsg({ t: 'Use pelo menos 8 caracteres.' });
    if (s1 !== s2) return setMsg({ t: 'As senhas não conferem.' });
    try { await backend.definirSenha(s1); setS1(''); setS2(''); setMsg({ ok: true, t: 'Senha alterada.' }); } catch (er) { setMsg({ t: er.message }); }
  }
  return html`<div class="grade g-2">
    <div class="card"><${MarcaOficial} /></div>
    <div class="card"><h3><${Icone} n="user" /> ${perfil?.nome}</h3><div style="color:var(--txt2);margin:-6px 0 14px">${perfil?.email}</div>
      ${backend.modo === 'real' ? html`<form class="pilha" onSubmit=${trocar}><b>Alterar senha</b>
        <input class="inp" type="password" placeholder="Nova senha" autocomplete="new-password" value=${s1} onInput=${(e) => setS1(e.target.value)} />
        <input class="inp" type="password" placeholder="Repita a nova senha" autocomplete="new-password" value=${s2} onInput=${(e) => setS2(e.target.value)} />
        ${msg && html`<div class=${msg.ok ? 'info-msg' : 'erro-msg'}>${msg.t}</div>`}<button class="btn sec">Salvar nova senha</button></form>`
        : html`<div class="aviso-msg">Ambiente de demonstração: não há senha.</div>`}
      <button class="btn fantasma" style="margin-top:12px" onClick=${sair}><${Icone} n="log-out" /> Encerrar sessão</button>
      <div style="margin-top:14px;font-size:13px;color:var(--txt3)">Contas autorizadas: ${D.perfis.map((p) => p.nome).join(' e ')}. Novos acessos só podem ser liberados no painel do Supabase.</div></div></div>`;
}
function Sobre() {
  const { backend } = useStore();
  return html`<div class="card"><h3><${Icone} n="info" /> Sobre a plataforma</h3>
    <ul style="color:var(--txt2);line-height:1.7;margin:0;padding-left:20px">
      <li>Ambiente: <b>${backend.modo === 'demo' ? 'DEMONSTRAÇÃO (dados fictícios no navegador)' : 'Real (Supabase)'}</b>.</li>
      <li>Valores guardados em centavos; datas no fuso America/Sao_Paulo.</li>
      <li>Autoria e data de cada registro são definidas pelo servidor a partir do login; o histórico completo fica na tabela de auditoria.</li>
      <li>Edições simultâneas: se a outra pessoa salvar antes, a sua gravação é recusada e a versão mais recente é carregada para revisão — nada é sobrescrito em silêncio.</li>
      <li><b>Não ativo ainda:</b> notificações externas (e-mail/WhatsApp/push) e integração bancária automática. A plataforma funciona integralmente com lançamentos manuais e importação de CSV.</li>
    </ul></div>`;
}
