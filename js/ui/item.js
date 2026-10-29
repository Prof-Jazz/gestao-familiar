import { html, Icone, CatIcone, Autoria } from './comp.js';
import { abrirForm, marcarPago, toast, nomeUsuario } from '../data/store.js';
import { brl, dataBR, hoje } from '../lib/fmt.js';
import { dataPrevista } from '../lib/calc.js';

/** Linha de lançamento usada em listas. Mostra autoria, quem pagou e beneficiário separadamente. */
export function ItemLanc({ l, D, compacto, semData }) {
  const cat = D.mapa.categorias[l.categoria_id];
  const sub = D.mapa.categorias[l.subcategoria_id];
  const conta = D.mapa.contas[l.conta_id]; const destino = D.mapa.contas[l.conta_destino_id]; const cartao = D.mapa.cartoes[l.cartao_id];
  const sinal = l.tipo === 'receita' || l.tipo === 'reembolso' ? 1 : l.tipo === 'transferencia' ? 0 : -1;
  const cor = sinal > 0 ? 'var(--pos)' : sinal < 0 ? 'var(--txt)' : '#0369A1';
  let icone = cat, corIc, nIc;
  if (l.tipo === 'transferencia') { corIc = '#0369A1'; nIc = 'arrow-left-right'; }
  else if (l.tipo === 'pagamento_fatura') { corIc = '#5B21B6'; nIc = 'credit-card'; }
  const origem = l.tipo === 'transferencia' ? `${conta?.nome ?? '?'} → ${destino?.nome ?? '?'}` : l.tipo === 'pagamento_fatura' ? `${conta?.nome} → ${cartao?.nome}` : cartao ? `${cartao.nome}` : conta?.nome;
  const pagador = D.mapa.pessoas[l.pagador_id]?.nome;
  const benef = D.mapa.pessoas[l.beneficiario_id]?.nome;
  const atrasado = l.status === 'previsto' && dataPrevista(l) < hoje();
  const pagar = async (e) => { e.stopPropagation(); try { await marcarPago(l); toast(l.tipo === 'receita' ? 'Marcado como recebido.' : 'Marcado como pago.'); } catch (er) { toast(er.message, 'erro'); } };
  return html`<div class=${`item click ${l.status}`} onClick=${() => abrirForm({ lancamento: l })} role="button" tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && abrirForm({ lancamento: l })}>
    <${CatIcone} cat=${icone} cor=${corIc} icone=${nIc} />
    <div class="meio">
      <div class="t1">${l.descricao}${l.parcelas_total > 1 ? html` <span class="pilula pri">${l.parcela_num}/${l.parcelas_total}</span>` : ''}${l.recorrencia_id ? html` <${Icone} n="repeat" titulo="Recorrente" />` : ''}${(l.anexos || []).length ? html` <${Icone} n="paperclip" titulo="Com anexo" />` : ''}</div>
      <div class="t2">${[sub?.nome || cat?.nome, origem, !semData && dataBR(l.status === 'previsto' ? dataPrevista(l) : l.data_ocorrencia), l.favorecido].filter(Boolean).join(' · ')}</div>
      ${!compacto && html`<div class="t2">${pagador ? (l.tipo === 'receita' ? 'Recebido por ' : 'Pago por ') + pagador : ''}${benef ? ` · Para ${benef}` : ''}${pagador || benef ? ' · ' : ''}<${Autoria} l=${l} curto /></div>`}
    </div>
    <div class="dir">
      <div class="num" style=${`font-weight:800;color:${cor}`}>${sinal > 0 ? '+' : sinal < 0 ? '−' : ''}${brl(l.valor_centavos)}</div>
      ${l.status === 'previsto' ? html`<button class=${'pilula ' + (atrasado ? 'neg' : 'atn')} style="border:0;cursor:pointer;margin-top:3px" onClick=${pagar} title="Marcar como ${l.tipo === 'receita' ? 'recebido' : 'pago'} hoje">
          <${Icone} n=${atrasado ? 'triangle-alert' : 'clock'} /> ${atrasado ? 'Vencido' : l.tipo === 'receita' ? 'A receber' : 'A pagar'} · ${l.tipo === 'receita' ? 'Receber' : 'Pagar'}</button>`
        : l.status === 'cancelado' ? html`<span class="pilula zero">Cancelado</span>` : ''}
    </div>
  </div>`;
}
