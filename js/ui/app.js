import { useEffect, useState } from 'preact/hooks';
import { html, Icone, Avatar, Dialogos, Toasts, Modal, corPessoa } from './comp.js';
import { useStore, abrirForm, sair } from '../data/store.js';
import { Login, RedefinirSenha, Negado, ErroCarga, SemConfig, MarcaCompacta } from './login.js';
import { FormLancamento } from './form-lancamento.js';
import { Painel } from './painel.js';
import { Lancamentos } from './lancamentos.js';
import { Calendario } from './calendario.js';
import { Contas } from './contas.js';
import { Analises } from './analises.js';
import { Orcamento } from './orcamento.js';
import { Projetos } from './projetos.js';
import { Relatorios } from './relatorios.js';
import { Configuracoes } from './configuracoes.js';

export const ROTAS = [
  { id: 'painel', nome: 'Painel', icone: 'layout-dashboard', C: Painel },
  { id: 'lancamentos', nome: 'Lançamentos', icone: 'list', C: Lancamentos },
  { id: 'calendario', nome: 'Calendário', icone: 'calendar-days', C: Calendario },
  { id: 'contas', nome: 'Contas e cartões', icone: 'wallet', C: Contas },
  { id: 'analises', nome: 'Análises', icone: 'chart-pie', C: Analises },
  { id: 'orcamento', nome: 'Orçamento e metas', icone: 'target', C: Orcamento },
  { id: 'projetos', nome: 'Projetos', icone: 'folder-kanban', C: Projetos },
  { id: 'relatorios', nome: 'Relatórios', icone: 'printer', C: Relatorios },
  { id: 'config', nome: 'Configurações', icone: 'settings', C: Configuracoes },
];
const lerRota = () => { const [id, ...q] = (location.hash.replace(/^#\/?/, '') || 'painel').split('?')[0].split('/'); return { id: ROTAS.some((r) => r.id === id) ? id : 'painel', arg: q.join('/') }; };

export function App() {
  const s = useStore();
  const [rota, setRota] = useState(lerRota());
  const [mais, setMais] = useState(false);
  useEffect(() => { const f = () => { setRota(lerRota()); setMais(false); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const demo = s.backend?.modo === 'demo';
  const faixa = demo && html`<div class="faixa-demo" role="note">AMBIENTE DE DEMONSTRAÇÃO — dados fictícios, separados do ambiente real</div>`;

  if (s.fase === 'config') return html`<${SemConfig} />`;
  if (s.fase === 'iniciando' || s.fase === 'carregando') return html`${faixa}<div class="carregando"><div><div class="giro"></div>Carregando as finanças da família…</div></div>`;
  if (s.fase === 'login') return html`${faixa}<${Login} /><${Toasts} />`;
  if (s.fase === 'redefinir') return html`<${RedefinirSenha} /><${Toasts} />`;
  if (s.fase === 'negado') return html`<${Negado} />`;
  if (s.fase === 'erro') return html`<${ErroCarga} />`;

  const R = ROTAS.find((r) => r.id === rota.id);
  const nome = s.perfil?.nome || '';
  const cor = corPessoa(s.D, s.perfil?.id);
  const sinc = !s.online ? ['off', 'Sem internet'] : s.sinc === 'ok' ? ['ok', 'Sincronizado'] : s.sinc === 'off' ? ['off', 'Reconectando…'] : ['', 'Conectando…'];

  return html`${faixa}<div class="app">
    <aside class="lateral" aria-label="Menu principal">
      <${MarcaCompacta} />
      <button class="btn btn-novo-lat" onClick=${() => abrirForm({ tipo: 'despesa' })}><${Icone} n="plus" /> Novo lançamento</button>
      <nav class="nav">${ROTAS.map((r, i) => html`${i === 7 ? html`<div class="nav-sep"></div>` : ''}<a href=${'#/' + r.id} class=${r.id === rota.id ? 'ativo' : ''} aria-current=${r.id === rota.id ? 'page' : undefined}><${Icone} n=${r.icone} />${r.nome}</a>`)}</nav>
      <div class="usuario-chip"><${Avatar} nome=${nome} cor=${cor} /><div style="flex:1;min-width:0"><div class="nome">${nome}</div>
        <div class=${'selo-sinc ' + sinc[0]}><i></i>${sinc[1]}</div></div>
        <button class="btn fantasma ico" onClick=${sair} title="Sair" aria-label="Sair"><${Icone} n="log-out" /></button></div>
    </aside>
    <header class="barra-movel"><${MarcaCompacta} /><span style="flex:1"></span><span class=${'selo-sinc ' + sinc[0]} title=${sinc[1]}><i></i></span><${Avatar} nome=${nome} cor=${cor} /></header>
    <main class="principal" id="conteudo"><${R.C} arg=${rota.arg} /></main>
    <nav class="nav-movel" aria-label="Navegação">
      <a href="#/painel" class=${rota.id === 'painel' ? 'ativo' : ''}><${Icone} n="layout-dashboard" />Painel</a>
      <a href="#/lancamentos" class=${rota.id === 'lancamentos' ? 'ativo' : ''}><${Icone} n="list" />Lançamentos</a>
      <span></span>
      <a href="#/analises" class=${rota.id === 'analises' ? 'ativo' : ''}><${Icone} n="chart-pie" />Análises</a>
      <button class=${['painel', 'lancamentos', 'analises'].includes(rota.id) ? '' : 'ativo'} onClick=${() => setMais(true)}><${Icone} n="menu" />Mais</button>
    </nav>
    <button class="fab" onClick=${() => abrirForm({ tipo: 'despesa' })} aria-label="Adicionar lançamento"><${Icone} n="plus" /></button>
    ${mais && html`<${Modal} titulo="Menu" onClose=${() => setMais(false)}>
      <div class="mais-menu">${ROTAS.map((r) => html`<a href=${'#/' + r.id}><${Icone} n=${r.icone} />${r.nome}</a>`)}</div>
      <button class="btn sec" style="width:100%;margin-top:14px" onClick=${sair}><${Icone} n="log-out" /> Sair (${nome})</button>
    </${Modal}>`}
  </div>
  <${FormLancamento} /><${Dialogos} /><${Toasts} />`;
}
