import { html, Icone, CatIcone, Autoria } from './comp.js';
import { abrirForm, marcarPago, toast, nomeUsuario } from '../data/store.js';
import { brl, dataBR, hoje } from '../lib/fmt.js';
import { dataPrevista } from '../lib/calc.js';

/** Linha de lançamento usada em listas. Mostra autoria, quem pagou e beneficiário separadamente. */
/** Etiqueta da conta/cartão com logo ou ícone. */
export function ContaTag({ c, cartao }) {
  if (!c) return null;
  return html`<span class="conta-tag" style=${`--c:${c.cor || '#64748B'}`}><${Icone} n=${c.icone || (cartao ? 'credit-card' : 'landmark')} />${c.nome}</span>`;
}

/** Linha de lançamento usada em listas: descrição, conta de origem em destaque, quem pagou/recebeu e autoria. */
export function ItemLanc({ l, D, compacto, semData }) {
  const cat = D.mapa.categorias[l.categoria_id];
  const sub = D.mapa.categorias[l.subcategoria_id];
  const conta = D.mapa.contas[l.conta_id]; const destino = D.mapa.contas[l.conta_destino_id]; const cartao = D.mapa.cartoes[l.cartao_id];
  const sinal = l.tipo === 'receita' || l.tipo === 'reembolso' ? 1 : l.tipo === 'transferencia' ? 0 : -1;
  const cor = sinal > 0 ? 'var(--pos)' : sinal < 0 ? 'var(--txt)' : '#0369A1';
  let corIc = cat?.cor, nIc = sub?.icone || cat?.icone;
  if (l.tipo === 'transferencia') { corIc = '#0369A1'; nIc = 'arrow-left-right'; }
  else if (l.tipo === 'pagamento_fatura') { corIc = '#5B21B6'; nIc = 'credit-card'; }
  const origem = l.tipo === 'transferencia' ? html`<${ContaTag} c=${conta} /> → <${ContaTag} c=${destino} />`
    : l.tipo === 'pagamento_fatura' ? html`<${ContaTag} c=${conta} /> → <${ContaTag} c=${cartao} cartao />`
    : cartao ? html`<${ContaTag} c=${cartao} cartao />` : html`<${ContaTag} c=${conta} />`;
  const pagador = D.mapa.pessoas[l.pagador_id]?.nome;
  const atrasado = l.status === 'previsto' && dataPrevista(l) < hoje();
  const pagar = async (e) => { e.stopPropagation(); try { await marcarPago(l); toast(l.tipo === 'receita' ? 'Marcado como recebido.' : 'Marcado como pago.'); } catch (er) { toast(er.message, 'erro'); } };
  const detalhes = [sub ? `${cat?.nome ?? ''} › ${sub.nome}` : cat?.nome, !semData && dataBR(l.status === 'previsto' ? dataPrevista(l) : l.data_ocorrencia), l.favorecido].filter(Boolean).join(' · ');
  return html`<div class=${`item click ${l.status}`} onClick=${() => abrirForm({ lancamento: l })} role="button" tabIndex="0" onKeyDown=${(e) => e.key === 'Enter' && abrirForm({ lancamento: l })}>
    <${CatIcone} cor=${corIc} icone=${nIc} />
    <div class="meio">
      <div class="t1">${l.descricao}${l.parcelas_total > 1 ? html` <span class="pilula pri">${l.parcela_num}/${l.parcelas_total}</span>` : ''}${l.recorrencia_id ? html` <${Icone} n="repeat" titulo="Recorrente" />` : ''}${l.divisao_id ? html` <span class="pilula pri" title="Despesa paga com mais de uma forma"><${Icone} n="coins" /> dividido · total ${brl(D.lancamentos.filter((x) => x.divisao_id === l.divisao_id && !x.excluido_em).reduce((s, x) => s + x.valor_centavos, 0))}</span>` : ''}${(l.anexos || []).length ? html` <${Icone} n="paperclip" titulo="Com anexo" />` : ''}</div>
      <div class="t2 linha-conta">${origem}${detalhes ? html`<span>${detalhes}</span>` : ''}</div>
      ${!compacto && html`<div class="t2">${pagador ? (l.tipo === 'receita' ? 'Recebido por ' : 'Pago por ') + pagador + ' · ' : ''}<${Autoria} l=${l} curto /></div>`}
    </div>
    <div class="dir">
      <div class="num" style=${`font-weight:800;color:${cor}`}>${sinal > 0 ? '+' : sinal < 0 ? '−' : ''}${brl(l.valor_centavos)}</div>
      ${l.status === 'previsto' ? html`<button class=${'pilula ' + (atrasado ? 'neg' : 'atn')} style="border:0;cursor:pointer;margin-top:3px" onClick=${pagar} title="Marcar como ${l.tipo === 'receita' ? 'recebido' : 'pago'} hoje">
          <${Icone} n=${atrasado ? 'triangle-alert' : 'clock'} /> ${atrasado ? 'Vencido' : l.tipo === 'receita' ? 'A receber' : 'A pagar'} · ${l.tipo === 'receita' ? 'Receber' : 'Pagar'}</button>`
        : l.status === 'cancelado' ? html`<span class="pilula zero">Cancelado</span>` : ''}
    </div>
  </div>`;
}
