import { useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Vazio, Modal, Campo, Sel, CampoValor, SeletorCor, SeletorIcone, Barra, opcoesContas, opcoesPessoas, sugerirLogoDe, chaveLogo, ehLogo } from './comp.js';
import { useStore, salvar, apagar, toast, confirmar, abrirForm, inserir, store, abrirPagarFatura, fecharPagarFatura } from '../data/store.js';
import * as C from '../lib/calc.js';
import { brl, hoje, dataBR, nomeMesCap, uuid, addMesYM, primeiroDia } from '../lib/fmt.js';
import { ItemLanc } from './item.js';

const TIPOS_CONTA = [['corrente', 'Conta corrente'], ['poupanca', 'Poupança'], ['dinheiro', 'Dinheiro / carteira'], ['reserva', 'Reserva'], ['investimento', 'Investimento'], ['outro', 'Outra']];
const NOME_TC = Object.fromEntries(TIPOS_CONTA);
const ST_FAT = { aberta: ['pri', 'Aberta'], sem_movimento_aberta: ['zero', 'Aberta'], fechada: ['atn', 'Fechada — a pagar'], vencida: ['neg', '⚠ Vencida'], paga: ['pos', '✓ Paga'], sem_movimento: ['zero', 'Sem movimento'] };

export function Contas() {
  const { D } = useStore();
  const H = hoje();
  const [editConta, setEditConta] = useState(null);
  const [editCartao, setEditCartao] = useState(null);
  const [saldoIni, setSaldoIni] = useState(null);
  const [verArq, setVerArq] = useState(false);
  const contas = D.contas.filter((c) => verArq || !c.arquivada);
  const saldos = useMemo(() => Object.fromEntries(D.contas.map((c) => [c.id, C.saldoConta(D, c, H)])), [D]);
  const total = contas.filter((c) => !c.arquivada).reduce((s, c) => s + saldos[c.id], 0);

  return html`
  <div class="topo"><div><h2>Contas e cartões</h2><div class="sub">Saldos realizados, faturas e parcelamentos</div></div><span class="esp"></span>
    <button class="btn sec" onClick=${() => abrirForm({ tipo: 'transferencia' })}><${Icone} n="arrow-left-right" /> Transferir</button>
    <button class="btn" onClick=${() => setEditConta({})}><${Icone} n="plus" /> Conta</button>
    <button class="btn" onClick=${() => setEditCartao({})}><${Icone} n="credit-card" /> Cartão</button></div>

  <div class="card" style="margin-bottom:16px"><h3><${Icone} n="landmark" /> Contas <span class="acao" style="display:flex;gap:10px;align-items:center">
      <label class="chk" style="font-size:13px"><input type="checkbox" checked=${verArq} onChange=${(e) => setVerArq(e.target.checked)} /> Ver arquivadas</label>
      <span>Total: <${Tom} v=${total} sinal=${false} /></span></span></h3>
    ${contas.length === 0 ? html`<${Vazio} icone="wallet" titulo="Nenhuma conta cadastrada" texto="Cadastre conta corrente, carteira em dinheiro e reservas, com o saldo na data de referência.">
        <button class="btn" onClick=${() => setEditConta({})}><${Icone} n="plus" /> Cadastrar conta</button></${Vazio}>`
    : html`<div class="grade g-3">${contas.map((c) => html`<div class="card" style=${`border-left:5px solid ${c.cor};box-shadow:none${c.arquivada ? ';opacity:.6' : ''}`}>
        <div style="display:flex;gap:10px;align-items:center"><${CatIcone} cor=${c.cor} icone=${c.icone} /><div style="flex:1;min-width:0"><b>${c.nome}</b>
          <div class="t2" style="font-size:12px;color:var(--txt3)">${NOME_TC[c.tipo]}${c.instituicao ? ' · ' + c.instituicao : ''}${c.arquivada ? ' · arquivada' : ''}</div></div>
          <button class="btn fantasma ico peq" aria-label="Editar conta" onClick=${() => setEditConta(c)}><${Icone} n="pencil" /></button></div>
        <div style="font-size:24px;margin:10px 0 2px"><${Tom} v=${saldos[c.id]} sinal=${false} /></div>
        <div style="font-size:12px;color:var(--txt3)">Saldo inicial ${brl(c.saldo_inicial_centavos)} em ${dataBR(c.data_referencia)}</div>
        <a href=${'#/lancamentos/conta_id=' + c.id} style="font-size:13px;font-weight:700">Ver movimentações →</a>
      </div>`)}</div>`}
  </div>

  <h3 style="margin:22px 0 12px;font-size:18px"><${Icone} n="credit-card" /> Cartões de crédito</h3>
  ${D.cartoes.filter((c) => verArq || !c.arquivado).length === 0 ? html`<div class="card"><${Vazio} icone="credit-card" titulo="Nenhum cartão cadastrado" texto="Cadastre o cartão com limite, dia de fechamento e de vencimento — as compras e parcelas vão para a fatura certa automaticamente.">
      <button class="btn" onClick=${() => setEditCartao({})}><${Icone} n="plus" /> Cadastrar cartão</button></${Vazio}></div>`
    : D.cartoes.filter((c) => verArq || !c.arquivado).map((c) => html`<${Cartao} key=${c.id} c=${c} D=${D} H=${H} editar=${() => setEditCartao(c)} saldoAnterior=${() => setSaldoIni(c)} />`)}

  ${editConta && html`<${FormConta} c=${editConta} D=${D} fechar=${() => setEditConta(null)} />`}
  ${editCartao && html`<${FormCartao} c=${editCartao} D=${D} fechar=${() => setEditCartao(null)} depois=${(novo) => setSaldoIni(novo)} />`}
  ${saldoIni && html`<${SaldoAnteriorCartao} c=${D.mapa.cartoes[saldoIni.id] || saldoIni} D=${D} fechar=${() => setSaldoIni(null)} />`}`;
}

export const MODELOS_CARTAO = { 'nubank-roxo': 'Nubank (roxo, vertical)', 'santander-elite': 'Santander Elite (grafite)' };

/** Arte do cartão desenhada para parecer com o cartão físico. */
function ArteCartao({ modelo, nome }) {
  const MC = html`<svg viewBox="0 0 100 62" aria-hidden="true"><circle cx="31" cy="31" r="31" fill="#EB001B"/><circle cx="69" cy="31" r="31" fill="#F79E1B"/><path d="M50 7.3a31 31 0 0 1 0 47.4a31 31 0 0 1 0-47.4z" fill="#FF5F00"/></svg>`;
  const CHIP = html`<svg viewBox="0 0 46 60" aria-hidden="true"><rect x=".5" y=".5" width="45" height="59" rx="7" fill="#E9E3CF" stroke="#4A3B5C"/>
    <path d="M15 .5v19M31 .5v19M.5 20h45M.5 40h45M15 40v19.5M31 40v19.5M15 20q-3 10 0 20M31 20q3 10 0 20" fill="none" stroke="#9C927A" stroke-width="1.3"/></svg>`;
  if (modelo === 'nubank-roxo') return html`<div class="cc-arte vertical cc-nubank-roxo" role="img" aria-label="Cartão Nubank">
    <span class="nu-mc">${MC}</span><span class="nu-chip">${CHIP}</span>
    ${nome && html`<span class="nu-nome">${nome}</span>`}
    <img class="nu-logo" src="img/bancos/nubank.png" alt="" />
  </div>`;
  if (modelo === 'santander-elite') return html`<div class="cc-arte cc-santander-elite" role="img" aria-label="Cartão Santander Elite">
    <div class="sa-marca"><img src="img/bancos/santander.png" alt="" /><span>Santander</span></div>
    <svg class="sa-chip" viewBox="0 0 60 46" aria-hidden="true"><defs><linearGradient id="chipG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F4F4"/><stop offset=".5" stop-color="#C9CACC"/><stop offset="1" stop-color="#ECECEC"/></linearGradient></defs>
      <rect x=".5" y=".5" width="59" height="45" rx="7" fill="url(#chipG)" stroke="#9A9B9E"/>
      <path d="M0 15h17q5 0 7-5l3-10M60 15H43q-5 0-7-5l-3-10M0 31h17q5 0 7 5l3 10M60 31H43q-5 0-7 5l-3 10M24 15h12M24 31h12M24 15v16M36 15v16" fill="none" stroke="#8E8F92" stroke-width="1.4"/></svg>
    <span class="sa-elite">ELITE</span>
    <svg class="sa-nfc" viewBox="0 0 24 34" aria-hidden="true"><g fill="none" stroke="#D9D9D9" stroke-width="2.6" stroke-linecap="round"><path d="M3 13q2.5 4 0 8"/><path d="M8.5 9.5q5 7.5 0 15"/><path d="M14 6q7.5 11 0 22"/><path d="M19.5 2.5q10 14.5 0 29"/></g></svg>
    <svg class="sa-mc" viewBox="0 0 100 62" aria-hidden="true"><circle cx="31" cy="31" r="31" fill="#EB001B"/><circle cx="69" cy="31" r="31" fill="#F79E1B"/><path d="M50 7.3a31 31 0 0 1 0 47.4a31 31 0 0 1 0-47.4z" fill="#FF5F00"/></svg>
  </div>`;
  return null;
}

function Cartao({ c, D, H, editar, saldoAnterior }) {
  const faturas = useMemo(() => C.faturasDoCartao(D, c, H), [D, c]);
  const atualId = C.faturaAtual(c, H);
  const [selEscolhida, setSelF] = useState(null);
  const selF = selEscolhida || (faturas.find((f) => f.status === 'vencida' || f.status === 'fechada')?.fatura) || atualId;
  const [pagar, setPagar] = useState(null);
  const f = faturas.find((x) => x.fatura === selF) || faturas[0];
  const lim = C.limiteCartao(D, c);
  const parcelados = useMemo(() => {
    const ids = [...new Set(C.vivos(D).filter((l) => l.cartao_id === c.id && l.compra_id).map((l) => l.compra_id))];
    return ids.map((id) => ({ id, ...C.restanteCompra(D, id, H) })).filter((x) => x.restante > 0);
  }, [D, c]);
  const titular = D.mapa.pessoas[c.titular_id]?.nome;
  const catJuros = D.categorias.find((x) => x.nome === 'Tributos e serviços financeiros' && !x.parent_id);
  const subJuros = D.categorias.find((x) => x.parent_id === catJuros?.id && /encargos|juros/i.test(x.nome));
  const pctLim = c.limite_centavos ? (lim.comprometido / c.limite_centavos) * 100 : 0;

  return html`<div class="card" style="margin-bottom:16px${c.arquivado ? ';opacity:.6' : ''}">
    <div class="grade g-cc" style="align-items:start">
      <div class="pilha">
        ${MODELOS_CARTAO[c.modelo] ? html`<${ArteCartao} modelo=${c.modelo} nome=${c.nome_impresso || D.mapa.pessoas[c.titular_id]?.nome} />
          <div class="cc-info"><div style="display:flex;align-items:center;gap:8px"><span class="nm" style="flex:1">${c.nome}</span>
            <button class="btn fantasma ico peq" onClick=${editar} aria-label="Editar cartão"><${Icone} n="pencil" /></button></div>
            <div class="lim">Limite disponível</div><div style="font-size:24px;font-weight:800" class=${'num' + (lim.disponivel < 0 ? ' neg' : '')}>${brl(lim.disponivel)}</div>
            <div class="lim">de ${brl(c.limite_centavos)} · ${titular ? 'Titular: ' + titular + ' · ' : ''}fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}</div></div>`
        : html`<div class="cc-visual" style=${`background:linear-gradient(135deg, ${c.cor}, ${c.cor}AA)`}>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">${ehLogo(c.icone) && html`<span class="cc-logo"><${Icone} n=${c.icone} /></span>`}<span class="nm" style="flex:1">${c.nome}</span>
            <button class="btn fantasma ico peq" style="color:#fff;position:relative;z-index:1" onClick=${editar} aria-label="Editar cartão"><${Icone} n="pencil" /></button></div>
          <div><div class="lim">Limite disponível</div><div style="font-size:24px;font-weight:800" class="num">${brl(lim.disponivel)}</div>
            <div class="lim">de ${brl(c.limite_centavos)} · ${titular ? 'Titular: ' + titular + ' · ' : ''}fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}</div></div>
        </div>`}
        <div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>Limite comprometido</span><b class="num">${brl(lim.comprometido)}</b></div>
          <${Barra} pct=${pctLim} nivel=${pctLim >= 100 ? 'estourado' : pctLim >= 80 ? 'atencao' : ''} /></div>
        ${parcelados.length > 0 && html`<div><b style="font-size:14px">Parcelamentos em andamento</b>
          ${parcelados.map((p) => html`<div class="item" style="padding:8px 0"><div class="meio"><div class="t1">${p.parcelas[0].descricao}</div>
            <div class="t2">${p.restantes} de ${p.parcelas.length} parcelas restantes · total ${brl(p.total)}</div></div><b class="num">${brl(p.restante)}</b></div>`)}</div>`}
      </div>
      <div style="min-width:0">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <select class="inp" style="max-width:260px" value=${selF} onChange=${(e) => setSelF(e.target.value)} aria-label="Escolher fatura">
            ${faturas.map((x) => html`<option value=${x.fatura}>Fatura ${nomeMesCap(x.fatura.slice(0, 7))}${x.fatura === atualId ? ' (atual)' : ''}</option>`)}</select>
          ${f && html`<span class=${'pilula ' + ST_FAT[f.status][0]}>${ST_FAT[f.status][1]}</span>`}
          <span style="flex:1"></span>
          <button class="btn sec peq" onClick=${() => abrirForm({ tipo: 'despesa', chave: 'juros' + c.id, extra: { cartao_id: c.id, conta_id: null, categoria_id: catJuros?.id, subcategoria_id: subJuros?.id, descricao: 'Juros/encargos do cartão', forma_pagamento: 'credito' } })}>
            <${Icone} n="badge-percent" /> Juros/encargos</button>
          <button class="btn sec peq" onClick=${saldoAnterior} title="Informar o que já estava no cartão antes de usar a plataforma"><${Icone} n="history" /> Saldo anterior</button>
          <button class="btn sec peq" onClick=${() => abrirForm({ tipo: 'despesa', chave: 'compra' + c.id, extra: { cartao_id: c.id, conta_id: null, forma_pagamento: 'credito' } })}><${Icone} n="plus" /> Compra</button>
          ${f && f.aberto + f.previstas > 0 && f.status !== 'aberta' && html`<button class="btn verde peq" onClick=${() => setPagar(f)}><${Icone} n="check" /> Pagar fatura</button>`}
          ${f && f.status === 'aberta' && f.aberto > 0 && html`<button class="btn sec peq" onClick=${() => setPagar(f)}>Antecipar pagamento</button>`}
        </div>
        ${f && html`<div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px">
          <${Mini} r="Fechamento" v=${dataBR(f.fechamento)} /><${Mini} r="Vencimento" v=${dataBR(f.vencimento)} />
          <${Mini} r="Compras" v=${brl(f.compras)} /><${Mini} r="Créditos/estornos" v=${brl(f.creditos)} />
          <${Mini} r="Pago" v=${brl(f.pagamentos)} /><${Mini} r="Em aberto" v=${html`<b style=${f.aberto > 0 ? 'color:var(--neg)' : 'color:var(--pos)'}>${brl(Math.max(0, f.aberto))}</b>`} />
          ${f.previstas > 0 && html`<${Mini} r="Previstas (recorrentes)" v=${brl(f.previstas)} />`}
          ${f.aberto < 0 && html`<${Mini} r="Crédito para a próxima" v=${brl(-f.aberto)} />`}
        </div>`}
        ${f && f.itens.length ? html`<div class="lista" style="max-height:420px;overflow:auto">${f.itens.slice().sort((a, b) => b.data_ocorrencia.localeCompare(a.data_ocorrencia)).map((l) => html`<${ItemLanc} key=${l.id} l=${l} D=${D} compacto />`)}</div>`
          : html`<${Vazio} icone="receipt" titulo="Nenhuma compra nesta fatura" />`}
      </div>
    </div>
    ${pagar && html`<${PagarFatura} f=${pagar} c=${c} D=${D} fechar=${() => setPagar(null)} />`}
  </div>`;
}
const Mini = ({ r, v }) => html`<div style="background:var(--bg);border-radius:12px;padding:8px 10px"><div style="font-size:11.5px;color:var(--txt3);font-weight:700">${r}</div><div class="num" style="font-weight:700">${v}</div></div>`;

/** Pagamento de fatura acessível de qualquer tela (Novo lançamento, painel, calendário). */
export function PagarFaturaGlobal() {
  const { pagFat, D } = useStore();
  const H = hoje();
  const cartoes = D.cartoes.filter((c) => !c.arquivado);
  const [cartaoId, setCartaoId] = useState(null);
  const [fatura, setFatura] = useState(null);
  if (!pagFat) return null;
  const cid = cartaoId || pagFat.cartaoId || (cartoes.length === 1 ? cartoes[0].id : null);
  const c = cid ? D.mapa.cartoes[cid] : null;
  const fechar = () => { setCartaoId(null); setFatura(null); fecharPagarFatura(); };
  const abertas = c ? C.faturasDoCartao(D, c, H).filter((x) => x.aberto > 0) : [];
  const fid = fatura || pagFat.fatura || (abertas.find((x) => x.status !== 'aberta') || abertas[0])?.fatura;
  const f = c && fid ? C.resumoFatura(D, c, fid, H) : null;
  if (!cartoes.length) return html`<${Modal} titulo="Pagar fatura de cartão" larg="estreita" onClose=${fechar}><${Vazio} icone="credit-card" titulo="Nenhum cartão cadastrado" texto="Cadastre o cartão em Contas e cartões." /></${Modal}>`;
  if (!c || !f) return html`<${Modal} titulo="Pagar fatura de cartão" larg="estreita" onClose=${fechar}>
    <div class="pilha">
      <div class="campo"><span>Qual cartão?</span><div class="chips">${cartoes.map((k) => html`<button type="button" class=${'chip' + (k.id === cid ? ' on' : '')} style=${k.id === cid ? `background:${k.cor};border-color:${k.cor}` : ''}
        onClick=${() => { setCartaoId(k.id); setFatura(null); }}><${Icone} n=${k.icone || 'credit-card'} />${k.nome}</button>`)}</div></div>
      ${c && !abertas.length && html`<div class="info-msg">✓ Nenhuma fatura com valor em aberto neste cartão.</div>`}
    </div></${Modal}>`;
  return html`<${PagarFatura} key=${c.id + f.fatura} f=${f} c=${c} D=${D} fechar=${fechar}
    trocar=${html`<div class="linha">
      ${cartoes.length > 1 && html`<${Campo} rot="Cartão"><${Sel} valor=${c.id} onChange=${(v) => { setCartaoId(v); setFatura(null); }} opcoes=${cartoes.map((k) => ({ v: k.id, r: k.nome }))} /></${Campo}>`}
      <${Campo} rot="Fatura"><${Sel} valor=${f.fatura} onChange=${setFatura} opcoes=${(abertas.some((x) => x.fatura === f.fatura) ? abertas : [f, ...abertas]).map((x) => ({ v: x.fatura, r: `${nomeMesCap(x.fatura.slice(0, 7))} · vence ${dataBR(x.vencimento)} · ${brl(Math.max(0, x.aberto))}` }))} /></${Campo}>
    </div>`} />`;
}

function PagarFatura({ f, c, D, fechar, trocar }) {
  const devido = Math.max(0, f.aberto) + (f.status === 'aberta' ? 0 : 0);
  const [valor, setValor] = useState(devido || f.previstas);
  const [conta, setConta] = useState(c.conta_pagamento_id || D.contas.find((x) => !x.arquivada)?.id);
  const [data, setData] = useState(hoje());
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const pessoa = D.pessoas.find((p) => p.perfil_id === store.s.perfil?.id);
  async function ok() {
    setErro('');
    if (!valor || valor <= 0) return setErro('Informe o valor pago.');
    if (!conta) return setErro('Escolha a conta.');
    setOcupado(true);
    try {
      await inserir('lancamentos', [{ id: uuid(), tipo: 'pagamento_fatura', descricao: `Pagamento fatura ${c.nome} — ${nomeMesCap(f.fatura.slice(0, 7))}`, valor_centavos: valor,
        conta_id: conta, cartao_id: c.id, fatura: f.fatura, data_ocorrencia: data, data_efetiva: data, vencimento: f.vencimento, competencia: f.fatura,
        status: 'efetivado', forma_pagamento: 'transferencia', pagador_id: pessoa?.id || null }]);
      toast(valor < devido ? 'Pagamento parcial registrado. O restante continua em aberto.' : 'Fatura paga.');
      fechar();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  }
  return html`<${Modal} titulo=${'Pagar fatura de ' + nomeMesCap(f.fatura.slice(0, 7))} larg="estreita" onClose=${fechar}
    rodape=${html`<button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn verde" disabled=${ocupado} onClick=${ok}><${Icone} n="check" /> Confirmar pagamento</button>`}>
    <div class="pilha">
      ${trocar}
      <div class="info-msg">Em aberto: <b>${brl(devido)}</b>. O pagamento reduz o saldo da conta e quita a obrigação do cartão. <b>Não</b> é uma nova despesa — as compras já foram contadas nas suas categorias.</div>
      <${Campo} rot="Valor pago" obrig><${CampoValor} valor=${valor} onChange=${setValor} autoFocus /></${Campo}>
      <div class="chips"><button class="chip" type="button" onClick=${() => setValor(devido)}>Total (${brl(devido)})</button></div>
      <${Campo} rot="Conta usada" obrig><${Sel} valor=${conta} onChange=${setConta} opcoes=${opcoesContas(D)} /></${Campo}>
      <${Campo} rot="Data do pagamento" obrig><input class="inp" type="date" value=${data} onInput=${(e) => setData(e.target.value)} /></${Campo}>
      <small style="color:var(--txt3)">Juros e encargos devem ser lançados separadamente (botão “Juros/encargos”) para aparecerem na categoria correta.</small>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

/** Saldo anterior de um cartão que já estava em uso antes da plataforma.
 *  Fatura fechada e gastos da fatura atual entram como "saldo anterior" (fatura + limite, fora dos gastos do mês).
 *  Compras parceladas em andamento geram as parcelas restantes nas próximas faturas. */
function SaldoAnteriorCartao({ c, D, fechar }) {
  const H = hoje();
  const atual = C.faturaAtual(c, H);
  const fechada = primeiroDia(addMesYM(atual.slice(0, 7), -1));
  const dAtual = C.datasFatura(c, atual), dFech = C.datasFatura(c, fechada);
  const [vFech, setVFech] = useState(null);
  const [vAtual, setVAtual] = useState(null);
  const [parc, setParc] = useState([]);
  const [contar, setContar] = useState(true);
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const catsDesp = D.categorias.filter((x) => x.tipo === 'despesa' && !x.parent_id && !x.arquivada);
  const setP = (i, q) => setParc(parc.map((p, j) => (j === i ? { ...p, ...q } : p)));
  const parcValidas = parc.filter((p) => p.valor > 0 && p.atual >= 1 && p.total >= p.atual);
  const restantesDe = (p) => p.total - p.atual + 1;
  const naAtual = parcValidas.reduce((s, p) => s + p.valor, 0);
  const futuras = parcValidas.reduce((s, p) => s + p.valor * (restantesDe(p) - 1), 0);
  const lim = C.limiteCartao(D, c);
  const novoComprometido = lim.comprometido + (vFech || 0) + (vAtual || 0) + naAtual + futuras;
  async function salvar() {
    setErro('');
    for (const [i, p] of parc.entries()) {
      if (!p.desc?.trim()) return setErro(`Informe a descrição da compra parcelada ${i + 1}.`);
      if (!(p.valor > 0)) return setErro(`Informe o valor da parcela da compra ${i + 1}.`);
      if (!(p.total >= 2 && p.atual >= 1 && p.atual <= p.total)) return setErro(`Confira “parcela X de N” na compra ${i + 1}.`);
    }
    if (!vFech && !vAtual && !parc.length) return setErro('Informe ao menos um valor.');
    const linhas = [];
    const pessoa = D.pessoas.find((p) => p.perfil_id === store.s.perfil?.id);
    const ajuste = (valor, fatura, rot) => ({ id: uuid(), tipo: 'despesa', descricao: rot, valor_centavos: valor, cartao_id: c.id, conta_id: null, fatura,
      data_ocorrencia: H, competencia: primeiroDia(H.slice(0, 7)), data_efetiva: H, status: 'efetivado', forma_pagamento: 'credito', ajuste_inicial: true,
      pagador_id: pessoa?.id || null, observacoes: 'Saldo que já estava no cartão antes de começar a usar a plataforma.' });
    if (vFech > 0) linhas.push(ajuste(vFech, fechada, `Saldo anterior — fatura de ${nomeMesCap(fechada.slice(0, 7))}`));
    if (vAtual > 0) linhas.push(ajuste(vAtual, atual, `Saldo anterior — fatura de ${nomeMesCap(atual.slice(0, 7))}`));
    for (const p of parc) {
      const compraId = uuid();
      for (let n = p.atual, k = 0; n <= p.total; n++, k++) {
        const fat = primeiroDia(addMesYM(atual.slice(0, 7), k));
        linhas.push({ id: uuid(), tipo: 'despesa', descricao: p.desc.trim(), valor_centavos: p.valor, cartao_id: c.id, conta_id: null, fatura: fat,
          data_ocorrencia: H, competencia: primeiroDia(addMesYM(H.slice(0, 7), k)), data_efetiva: H, status: 'efetivado', forma_pagamento: 'credito',
          categoria_id: p.categoria_id || null, compra_id: compraId, parcela_num: n, parcelas_total: p.total, ajuste_inicial: !contar, pagador_id: pessoa?.id || null,
          observacoes: 'Compra parcelada feita antes de começar a usar a plataforma.' });
      }
    }
    setOcupado(true);
    try { await inserir('lancamentos', linhas, 'saldoini' + c.id); toast('Saldo anterior do cartão registrado.'); fechar(); }
    catch (e) { setErro(e.message); } finally { setOcupado(false); }
  }
  return html`<${Modal} titulo=${'Saldo anterior — ' + c.nome} onClose=${fechar} larg="larga"
    rodape=${html`<button class="btn sec" onClick=${fechar}>Agora não</button><button class="btn" disabled=${ocupado} onClick=${salvar}><${Icone} n="check" /> Registrar</button>`}>
    <div class="pilha">
      <div class="info-msg">Informe o que <b>já estava no cartão</b> antes de você começar a lançar aqui. Esses valores entram nas faturas e no limite, mas <b>não</b> aparecem como gastos deste mês nos gráficos (eles aconteceram antes). Use o aplicativo do banco como referência.</div>
      <div class="linha">
        <${Campo} rot=${`Fatura fechada a pagar (${nomeMesCap(fechada.slice(0, 7))})`} dica=${`Fechou em ${dataBR(dFech.fechamento)} · vence ${dataBR(dFech.vencimento)}${dFech.vencimento < H ? ' — se já pagou, deixe em branco' : ''}`}>
          <${CampoValor} valor=${vFech} onChange=${setVFech} /></${Campo}>
        <${Campo} rot=${`Já gasto na fatura atual (${nomeMesCap(atual.slice(0, 7))})`} dica=${`Fecha em ${dataBR(dAtual.fechamento)}. Informe SEM as parcelas listadas abaixo — o app soma as parcelas sozinho.`}>
          <${CampoValor} valor=${vAtual} onChange=${setVAtual} /></${Campo}>
      </div>
      <div class="campo"><span>Compras parceladas em andamento</span>
        ${parc.map((p, i) => html`<div class="dividir-linha" key=${i}>
          <label class="campo" style="flex:2 1 160px"><span>Descrição</span><input class="inp" value=${p.desc} placeholder="Ex.: Geladeira" onInput=${(e) => setP(i, { desc: e.target.value })} /></label>
          <label class="campo" style="flex:1 1 110px"><span>Valor da parcela</span><${CampoValor} valor=${p.valor} onChange=${(valor) => setP(i, { valor })} /></label>
          <label class="campo" style="flex:0 1 90px"><span>Próxima parcela</span><input class="inp" type="number" min="1" value=${p.atual} onInput=${(e) => setP(i, { atual: +e.target.value })} /></label>
          <label class="campo" style="flex:0 1 90px"><span>de (total)</span><input class="inp" type="number" min="2" max="120" value=${p.total} onInput=${(e) => setP(i, { total: +e.target.value })} /></label>
          <label class="campo" style="flex:1 1 150px"><span>Categoria</span><${Sel} valor=${p.categoria_id} vazio="—" opcoes=${catsDesp.map((x) => ({ v: x.id, r: x.nome }))} onChange=${(categoria_id) => setP(i, { categoria_id })} /></label>
          <button type="button" class="btn fantasma ico peq" aria-label="Remover" onClick=${() => setParc(parc.filter((_, j) => j !== i))}><${Icone} n="x" /></button>
          ${p.valor > 0 && p.total >= p.atual && html`<small class="dividir-nota">Parcelas ${p.atual} a ${p.total} (${restantesDe(p)}× de ${brl(p.valor)} = ${brl(p.valor * restantesDe(p))}) nas faturas de ${nomeMesCap(atual.slice(0, 7))} a ${nomeMesCap(addMesYM(atual.slice(0, 7), restantesDe(p) - 1))}.</small>`}
        </div>`)}
        <button type="button" class="btn sec peq" style="align-self:flex-start" onClick=${() => setParc([...parc, { desc: '', valor: null, atual: 1, total: 2, categoria_id: null }])}><${Icone} n="plus" /> Compra parcelada</button>
        <small style="color:var(--txt3)">“Próxima parcela” é a que vai cair na fatura atual (${nomeMesCap(atual.slice(0, 7))}). Ex.: se a fatura atual traz a parcela 4/10, informe 4 de 10.</small>
        ${parc.length > 0 && html`<label class="chk" style="font-size:13.5px"><input type="checkbox" checked=${contar} onChange=${(e) => setContar(e.target.checked)} /> Contar as próximas parcelas nos gastos de cada mês (por categoria)</label>`}
      </div>
      <div class="det-kpis">
        <div class="det-kpi"><small>Fatura de ${nomeMesCap(fechada.slice(0, 7))}</small><b class="num">${brl((vFech || 0))}</b><span>vence ${dataBR(dFech.vencimento)}</span></div>
        <div class="det-kpi"><small>Fatura atual (${nomeMesCap(atual.slice(0, 7))})</small><b class="num">${brl((vAtual || 0) + naAtual + (C.resumoFatura(D, c, atual, H).total))}</b><span>já lançado + saldo + parcelas</span></div>
        <div class="det-kpi"><small>Parcelas futuras</small><b class="num">${brl(futuras)}</b><span>nas faturas seguintes</span></div>
        <div class="det-kpi" style=${c.limite_centavos - novoComprometido < 0 ? 'border-color:var(--neg)' : ''}><small>Limite disponível ficará</small><b class="num" style=${c.limite_centavos - novoComprometido < 0 ? 'color:var(--neg)' : 'color:var(--pos)'}>${brl(c.limite_centavos - novoComprometido)}</b><span>de ${brl(c.limite_centavos)} — confira com o app do banco</span></div>
      </div>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

function FormConta({ c, D, fechar }) {
  const [x, setX] = useState({ nome: '', tipo: 'corrente', instituicao: '', saldo_inicial_centavos: 0, data_referencia: hoje(), cor: '#2563EB', icone: 'landmark', arquivada: false, ...c });
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const [iconeManual, setIconeManual] = useState(!!c.id);
  const set = (p) => setX((v) => {
    const n = { ...v, ...p };
    if (!iconeManual && ('nome' in p || 'instituicao' in p)) { const l = sugerirLogoDe('banco', n.nome, n.instituicao); if (l) Object.assign(n, { icone: chaveLogo(l), cor: l.cor }); }
    return n;
  });
  const usada = c.id && D.lancamentos.some((l) => l.conta_id === c.id || l.conta_destino_id === c.id);
  async function ok() {
    if (!x.nome.trim()) return setErro('Informe o nome.');
    if (x.saldo_inicial_centavos == null) return setErro('Informe o saldo inicial (pode ser 0).');
    setOcupado(true);
    try { await salvar('contas', { ...x, nome: x.nome.trim(), ordem: x.ordem ?? D.contas.length + 1 }); toast('Conta salva.'); fechar(); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  }
  async function excluir() {
    if (usada) { if (await confirmar('Arquivar conta?', 'Esta conta tem lançamentos. Ela será arquivada: some das escolhas, mas o histórico e os saldos passados são mantidos.', { ok: 'Arquivar' })) { await salvar('contas', { ...x, arquivada: true }); fechar(); } return; }
    if (await confirmar('Excluir conta?', `“${x.nome}” não tem lançamentos e será excluída.`, { ok: 'Excluir', perigo: true })) { try { await apagar('contas', c.id); fechar(); } catch (e) { setErro(e.message); } }
  }
  return html`<${Modal} titulo=${c.id ? 'Editar conta' : 'Nova conta'} onClose=${fechar}
    rodape=${html`${c.id && html`<button class="btn fantasma" style="margin-right:auto;color:var(--neg)" onClick=${excluir}>${usada ? 'Arquivar' : 'Excluir'}</button>`}
      ${c.arquivada && html`<button class="btn sec" onClick=${() => { set({ arquivada: false }); }}>Desarquivar</button>`}
      <button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" disabled=${ocupado} onClick=${ok}>Salvar</button>`}>
    <div class="pilha">
      <div class="linha"><${Campo} rot="Nome" obrig><input class="inp" value=${x.nome} onInput=${(e) => set({ nome: e.target.value })} placeholder="Ex.: Conta Nubank" /></${Campo}>
        <${Campo} rot="Tipo"><${Sel} valor=${x.tipo} onChange=${(v) => set({ tipo: v })} opcoes=${TIPOS_CONTA.map(([v, r]) => ({ v, r }))} /></${Campo}></div>
      <div class="linha"><${Campo} rot="Instituição"><input class="inp" value=${x.instituicao || ''} onInput=${(e) => set({ instituicao: e.target.value })} /></${Campo}>
        <${Campo} rot="Saldo inicial" obrig dica="Pode ser negativo (ex.: −50,00)."><${CampoValor} valor=${x.saldo_inicial_centavos} onChange=${(v) => set({ saldo_inicial_centavos: v })} /></${Campo}>
        <${Campo} rot="Data de referência" obrig dica="Saldo no início deste dia."><input class="inp" type="date" value=${x.data_referencia} onInput=${(e) => set({ data_referencia: e.target.value })} /></${Campo}></div>
      <${Campo} rot="Visual do cartão"><${Sel} valor=${x.modelo || ''} onChange=${(v) => set({ modelo: v || null })} vazio="Padrão (cor e ícone abaixo)"
        opcoes=${Object.entries(MODELOS_CARTAO).map(([v, r]) => ({ v, r }))} /></${Campo}>
      ${MODELOS_CARTAO[x.modelo] && html`<div style="max-width:340px"><${ArteCartao} modelo=${x.modelo} nome=${D.mapa.pessoas[x.titular_id]?.nome} /></div>`}
      <label class="chk" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" checked=${!!x.limite_so_principal} onChange=${(e) => set({ limite_so_principal: e.target.checked })} />
        <span>O banco reserva no limite <b>só o valor principal</b> dos parcelamentos (os juros de cada parcela só ocupam o limite quando a fatura dela fecha). Ex.: Santander.</span></label>
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      <${Campo} rot="Ícone"><${SeletorIcone} logos valor=${x.icone} cor=${x.cor} onChange=${(v) => { setIconeManual(true); set({ icone: v }); }} onLogo=${(l) => set({ cor: l.cor })} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

function FormCartao({ c, D, fechar, depois }) {
  const [x, setX] = useState({ nome: '', titular_id: null, limite_centavos: 0, dia_fechamento: 25, dia_vencimento: 5, conta_pagamento_id: D.contas[0]?.id || null, cor: '#7C3AED', icone: 'credit-card', arquivado: false, ...c });
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const [iconeManual, setIconeManual] = useState(!!c.id);
  const set = (p) => setX((v) => {
    const n = { ...v, ...p };
    if (!iconeManual && 'nome' in p) { const l = sugerirLogoDe('banco', n.nome); if (l) Object.assign(n, { icone: chaveLogo(l), cor: l.cor }); }
    return n;
  });
  const usado = c.id && D.lancamentos.some((l) => l.cartao_id === c.id);
  const [emUso, setEmUso] = useState(!c.id);
  const dias = Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), r: String(i + 1) }));
  async function ok() {
    if (!x.nome.trim()) return setErro('Informe o nome do cartão.');
    if (x.limite_centavos == null || x.limite_centavos < 0) return setErro('Informe o limite.');
    if (+x.dia_fechamento === +x.dia_vencimento) return setErro('Fechamento e vencimento não podem ser no mesmo dia.');
    setOcupado(true);
    try { const r = await salvar('cartoes', { ...x, nome: x.nome.trim(), dia_fechamento: +x.dia_fechamento, dia_vencimento: +x.dia_vencimento }); toast('Cartão salvo.'); fechar(); if (!c.id && emUso && r) depois?.(r); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  }
  async function excluir() {
    if (usado) { if (await confirmar('Arquivar cartão?', 'O cartão tem compras registradas e será arquivado (histórico preservado).', { ok: 'Arquivar' })) { await salvar('cartoes', { ...x, arquivado: true }); fechar(); } return; }
    if (await confirmar('Excluir cartão?', `“${x.nome}” será excluído.`, { ok: 'Excluir', perigo: true })) { try { await apagar('cartoes', c.id); fechar(); } catch (e) { setErro(e.message); } }
  }
  return html`<${Modal} titulo=${c.id ? 'Editar cartão' : 'Novo cartão de crédito'} onClose=${fechar}
    rodape=${html`${c.id && html`<button class="btn fantasma" style="margin-right:auto;color:var(--neg)" onClick=${excluir}>${usado ? 'Arquivar' : 'Excluir'}</button>`}
      ${c.arquivado && html`<button class="btn sec" onClick=${() => set({ arquivado: false })}>Desarquivar</button>`}
      <button class="btn sec" onClick=${fechar}>Cancelar</button><button class="btn" disabled=${ocupado} onClick=${ok}>Salvar</button>`}>
    <div class="pilha">
      <div class="linha"><${Campo} rot="Nome" obrig><input class="inp" value=${x.nome} onInput=${(e) => set({ nome: e.target.value })} placeholder="Ex.: Nubank Laucielly" /></${Campo}>
        <${Campo} rot="Titular"><${Sel} valor=${x.titular_id} onChange=${(v) => set({ titular_id: v })} vazio="—" opcoes=${opcoesPessoas(D)} /></${Campo}></div>
      <div class="linha"><${Campo} rot="Limite total" obrig><${CampoValor} valor=${x.limite_centavos} onChange=${(v) => set({ limite_centavos: v })} /></${Campo}>
        <${Campo} rot="Dia do fechamento" obrig><${Sel} valor=${String(x.dia_fechamento)} onChange=${(v) => set({ dia_fechamento: +v })} opcoes=${dias} /></${Campo}>
        <${Campo} rot="Dia do vencimento" obrig><${Sel} valor=${String(x.dia_vencimento)} onChange=${(v) => set({ dia_vencimento: +v })} opcoes=${dias} /></${Campo}></div>
      <small style="color:var(--txt3)">Compras feitas no dia do fechamento ou depois entram na fatura seguinte.</small>
      ${!c.id && html`<label class="chk aviso-msg" style="display:flex"><input type="checkbox" checked=${emUso} onChange=${(e) => setEmUso(e.target.checked)} />
        <span>Este cartão <b>já está em uso</b> (tem fatura a pagar ou compras parceladas). Depois de salvar, vou pedir esses valores para o limite ficar certo.</span></label>`}
      <${Campo} rot="Conta usada para pagar a fatura"><${Sel} valor=${x.conta_pagamento_id} onChange=${(v) => set({ conta_pagamento_id: v })} vazio="—" opcoes=${opcoesContas(D)} /></${Campo}>
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      <${Campo} rot="Ícone"><${SeletorIcone} logos valor=${x.icone || 'credit-card'} cor=${x.cor} onChange=${(v) => { setIconeManual(true); set({ icone: v }); }} onLogo=${(l) => set({ cor: l.cor })} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}
