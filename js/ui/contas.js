import { useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Vazio, Modal, Campo, Sel, CampoValor, SeletorCor, SeletorIcone, Barra, opcoesContas, opcoesPessoas } from './comp.js';
import { useStore, salvar, apagar, toast, confirmar, abrirForm, inserir, store } from '../data/store.js';
import * as C from '../lib/calc.js';
import { brl, hoje, dataBR, nomeMesCap, uuid } from '../lib/fmt.js';
import { ItemLanc } from './item.js';

const TIPOS_CONTA = [['corrente', 'Conta corrente'], ['poupanca', 'Poupança'], ['dinheiro', 'Dinheiro / carteira'], ['reserva', 'Reserva'], ['investimento', 'Investimento'], ['outro', 'Outra']];
const NOME_TC = Object.fromEntries(TIPOS_CONTA);
const ST_FAT = { aberta: ['pri', 'Aberta'], sem_movimento_aberta: ['zero', 'Aberta'], fechada: ['atn', 'Fechada — a pagar'], vencida: ['neg', '⚠ Vencida'], paga: ['pos', '✓ Paga'], sem_movimento: ['zero', 'Sem movimento'] };

export function Contas() {
  const { D } = useStore();
  const H = hoje();
  const [editConta, setEditConta] = useState(null);
  const [editCartao, setEditCartao] = useState(null);
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
    : D.cartoes.filter((c) => verArq || !c.arquivado).map((c) => html`<${Cartao} key=${c.id} c=${c} D=${D} H=${H} editar=${() => setEditCartao(c)} />`)}

  ${editConta && html`<${FormConta} c=${editConta} D=${D} fechar=${() => setEditConta(null)} />`}
  ${editCartao && html`<${FormCartao} c=${editCartao} D=${D} fechar=${() => setEditCartao(null)} />`}`;
}

function Cartao({ c, D, H, editar }) {
  const faturas = useMemo(() => C.faturasDoCartao(D, c, H), [D, c]);
  const atualId = C.faturaAtual(c, H);
  const [selF, setSelF] = useState(() => (faturas.find((f) => f.status === 'vencida' || f.status === 'fechada')?.fatura) || atualId);
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
        <div class="cc-visual" style=${`background:linear-gradient(135deg, ${c.cor}, ${c.cor}AA)`}>
          <div style="display:flex;justify-content:space-between;align-items:center"><span class="nm">${c.nome}</span>
            <button class="btn fantasma ico peq" style="color:#fff;position:relative;z-index:1" onClick=${editar} aria-label="Editar cartão"><${Icone} n="pencil" /></button></div>
          <div><div class="lim">Limite disponível</div><div style="font-size:24px;font-weight:800" class="num">${brl(lim.disponivel)}</div>
            <div class="lim">de ${brl(c.limite_centavos)} · ${titular ? 'Titular: ' + titular + ' · ' : ''}fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}</div></div>
        </div>
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

function PagarFatura({ f, c, D, fechar }) {
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
      <div class="info-msg">Em aberto: <b>${brl(devido)}</b>. O pagamento reduz o saldo da conta e quita a obrigação do cartão. <b>Não</b> é uma nova despesa — as compras já foram contadas nas suas categorias.</div>
      <${Campo} rot="Valor pago" obrig><${CampoValor} valor=${valor} onChange=${setValor} autoFocus /></${Campo}>
      <div class="chips"><button class="chip" type="button" onClick=${() => setValor(devido)}>Total (${brl(devido)})</button></div>
      <${Campo} rot="Conta usada" obrig><${Sel} valor=${conta} onChange=${setConta} opcoes=${opcoesContas(D)} /></${Campo}>
      <${Campo} rot="Data do pagamento" obrig><input class="inp" type="date" value=${data} onInput=${(e) => setData(e.target.value)} /></${Campo}>
      <small style="color:var(--txt3)">Juros e encargos devem ser lançados separadamente (botão “Juros/encargos”) para aparecerem na categoria correta.</small>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

function FormConta({ c, D, fechar }) {
  const [x, setX] = useState({ nome: '', tipo: 'corrente', instituicao: '', saldo_inicial_centavos: 0, data_referencia: hoje(), cor: '#2563EB', icone: 'landmark', arquivada: false, ...c });
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const set = (p) => setX({ ...x, ...p });
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
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      <${Campo} rot="Ícone"><${SeletorIcone} valor=${x.icone} cor=${x.cor} onChange=${(v) => set({ icone: v })} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}

function FormCartao({ c, D, fechar }) {
  const [x, setX] = useState({ nome: '', titular_id: null, limite_centavos: 0, dia_fechamento: 25, dia_vencimento: 5, conta_pagamento_id: D.contas[0]?.id || null, cor: '#7C3AED', arquivado: false, ...c });
  const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  const set = (p) => setX({ ...x, ...p });
  const usado = c.id && D.lancamentos.some((l) => l.cartao_id === c.id);
  const dias = Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), r: String(i + 1) }));
  async function ok() {
    if (!x.nome.trim()) return setErro('Informe o nome do cartão.');
    if (x.limite_centavos == null || x.limite_centavos < 0) return setErro('Informe o limite.');
    if (+x.dia_fechamento === +x.dia_vencimento) return setErro('Fechamento e vencimento não podem ser no mesmo dia.');
    setOcupado(true);
    try { await salvar('cartoes', { ...x, nome: x.nome.trim(), dia_fechamento: +x.dia_fechamento, dia_vencimento: +x.dia_vencimento }); toast('Cartão salvo.'); fechar(); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
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
      <${Campo} rot="Conta usada para pagar a fatura"><${Sel} valor=${x.conta_pagamento_id} onChange=${(v) => set({ conta_pagamento_id: v })} vazio="—" opcoes=${opcoesContas(D)} /></${Campo}>
      <${Campo} rot="Cor"><${SeletorCor} valor=${x.cor} onChange=${(v) => set({ cor: v })} /></${Campo}>
      ${erro && html`<div class="erro-msg">${erro}</div>`}
    </div></${Modal}>`;
}
