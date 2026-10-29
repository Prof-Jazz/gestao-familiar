import { useState } from 'preact/hooks';
import { html, Icone } from './comp.js';
import { entrar, recuperarSenha, definirSenha, sair, store, useStore } from '../data/store.js';

export const NOME_OFICIAL = 'GESTÃO FAMILIAR DE FINANÇAS E PROJETOS';
export const SUBTITULO = 'As finanças e os planos do nosso lar, em um só lugar';

export const Selo = () => html`<span class="marca-selo" aria-hidden="true"><${Icone} n="house-plus" /></span>`;
/** Nome completo em composição de 3 linhas (telas grandes). */
export const MarcaOficial = () => html`<div class="marca-oficial"><${Selo} />
  <h1 aria-label=${NOME_OFICIAL}>GESTÃO FAMILIAR<br /><span class="l2">DE FINANÇAS</span><br />E PROJETOS</h1><p>${SUBTITULO}</p></div>`;
/** Composição compacta em duas linhas (menu e celular). */
export const MarcaCompacta = () => html`<a href="#/painel" class="marca" aria-label=${NOME_OFICIAL}><${Selo} />
  <span class="marca-txt"><b>Gestão Familiar</b><span>de Finanças e Projetos</span></span></a>`;

export function Login() {
  const { backend } = useStore();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState('entrar');
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const demo = backend?.modo === 'demo';

  async function enviar(e) {
    e.preventDefault(); setMsg(null); setOcupado(true);
    try {
      if (modo === 'entrar') await entrar(email, senha);
      else { await recuperarSenha(email); setMsg({ ok: true, t: 'Se este e-mail estiver autorizado, você receberá um link para criar uma nova senha. Verifique também o spam.' }); }
    } catch (er) { setMsg({ t: er.message }); } finally { setOcupado(false); }
  }

  return html`<div class="login-tela"><div class="login-card">
    <${MarcaOficial} />
    ${demo ? html`<div class="pilha" style="margin-top:22px">
        <div class="aviso-msg"><b>Ambiente de demonstração.</b> Dados fictícios, guardados só neste navegador e apagados ao recarregar. Nada aqui afeta o ambiente real.</div>
        ${Object.values(backend.usuariosDemo).map((u) => html`<button class="btn" onClick=${() => entrar(u.email)}><${Icone} n="user" /> Entrar como ${u.nome} (demo)</button>`)}
      </div>`
    : html`<form class="pilha" style="margin-top:22px" onSubmit=${enviar}>
        <label class="campo"><span>E-mail</span><input class="inp" type="email" autocomplete="username" required value=${email} onInput=${(e) => setEmail(e.target.value)} /></label>
        ${modo === 'entrar' && html`<label class="campo"><span>Senha</span><input class="inp" type="password" autocomplete="current-password" required value=${senha} onInput=${(e) => setSenha(e.target.value)} /></label>`}
        ${msg && html`<div class=${msg.ok ? 'info-msg' : 'erro-msg'} role="alert">${msg.t}</div>`}
        <button class="btn" disabled=${ocupado}>${ocupado ? 'Aguarde…' : modo === 'entrar' ? html`<${Icone} n="lock" /> Entrar` : html`<${Icone} n="mail" /> Enviar link de recuperação`}</button>
        <button type="button" class="btn fantasma" onClick=${() => { setModo(modo === 'entrar' ? 'recuperar' : 'entrar'); setMsg(null); }}>
          ${modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar para o login'}</button>
      </form>`}
    <div class="login-rod">Acesso exclusivo de Jesrrael e Laucielly. Não há cadastro público.</div>
  </div></div>`;
}

export function RedefinirSenha() {
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('');
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  async function enviar(e) {
    e.preventDefault(); setErro('');
    if (s1.length < 8) return setErro('Use pelo menos 8 caracteres.');
    if (s1 !== s2) return setErro('As senhas não conferem.');
    setOcupado(true);
    try { await definirSenha(s1); } catch (er) { setErro(er.message); } finally { setOcupado(false); }
  }
  return html`<div class="login-tela"><div class="login-card"><${MarcaOficial} />
    <form class="pilha" style="margin-top:22px" onSubmit=${enviar}>
      <h3 style="margin:0">Criar nova senha</h3>
      <label class="campo"><span>Nova senha</span><input class="inp" type="password" autocomplete="new-password" value=${s1} onInput=${(e) => setS1(e.target.value)} /></label>
      <label class="campo"><span>Repita a nova senha</span><input class="inp" type="password" autocomplete="new-password" value=${s2} onInput=${(e) => setS2(e.target.value)} /></label>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
      <button class="btn" disabled=${ocupado}>Salvar nova senha</button>
    </form></div></div>`;
}

export function Negado() {
  return html`<div class="login-tela"><div class="login-card"><${MarcaOficial} />
    <div class="erro-msg" style="margin-top:20px">Esta conta não está autorizada a acessar a plataforma da família.</div>
    <button class="btn" style="width:100%;margin-top:12px" onClick=${sair}>Sair</button></div></div>`;
}
export function ErroCarga() {
  const { erro } = useStore();
  return html`<div class="login-tela"><div class="login-card"><${MarcaOficial} />
    <div class="erro-msg" style="margin-top:20px">Não foi possível carregar os dados: ${erro}</div>
    <button class="btn" style="width:100%;margin-top:12px" onClick=${() => location.reload()}>Tentar novamente</button>
    <button class="btn fantasma" style="width:100%;margin-top:6px" onClick=${sair}>Sair</button></div></div>`;
}
export function SemConfig() {
  return html`<div class="login-tela"><div class="login-card"><${MarcaOficial} />
    <div class="aviso-msg" style="margin-top:20px"><b>Configuração pendente.</b> Preencha <code>config.js</code> com a URL e a chave pública (anon) do projeto Supabase. Veja o LEIA-ME.</div>
    <a class="btn sec" style="width:100%;margin-top:12px" href="?demo">Abrir o ambiente de demonstração</a></div></div>`;
}
