// Exportação de lançamentos (CSV / Excel) e utilidades de download.
import { brl, dataBR, dataHoraBR, hoje } from './fmt.js';

const TIPOS = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência', pagamento_fatura: 'Pagamento de fatura', reembolso: 'Reembolso/estorno' };
const STATUS = { previsto: 'Previsto', efetivado: 'Pago/recebido', cancelado: 'Cancelado' };

export function linhasExport(D, lancs) {
  const nm = (m, id) => (id ? m[id]?.nome ?? '' : '');
  return lancs.map((l) => ({
    'Data': dataBR(l.data_ocorrencia), 'Tipo': TIPOS[l.tipo], 'Descrição': l.descricao,
    'Categoria': nm(D.mapa.categorias, l.categoria_id), 'Subcategoria': nm(D.mapa.categorias, l.subcategoria_id),
    'Valor (R$)': ((l.tipo === 'despesa' || l.tipo === 'pagamento_fatura') ? -1 : 1) * l.valor_centavos / 100,
    'Situação': STATUS[l.status], 'Conta': nm(D.mapa.contas, l.conta_id), 'Conta destino': nm(D.mapa.contas, l.conta_destino_id),
    'Cartão': nm(D.mapa.cartoes, l.cartao_id), 'Fatura': l.fatura ? l.fatura.slice(5, 7) + '/' + l.fatura.slice(0, 4) : '',
    'Competência': l.competencia ? l.competencia.slice(5, 7) + '/' + l.competencia.slice(0, 4) : '', 'Vencimento': dataBR(l.vencimento),
    'Data efetiva': dataBR(l.data_efetiva), 'Forma de pagamento': l.forma_pagamento || '', 'Quem pagou/recebeu': nm(D.mapa.pessoas, l.pagador_id),
    'Beneficiário': nm(D.mapa.pessoas, l.beneficiario_id), 'Estabelecimento/favorecido': l.favorecido || '', 'Projeto': nm(D.mapa.projetos, l.projeto_id),
    'Etiquetas': (l.etiquetas || []).join(', '), 'Observações': l.observacoes || '', 'Parcela': l.parcelas_total ? `${l.parcela_num}/${l.parcelas_total}` : '',
    'Lançado por': nm(D.mapa.perfis, l.criado_por), 'Lançado em': dataHoraBR(l.criado_em),
    'Alterado por': nm(D.mapa.perfis, l.alterado_por), 'Alterado em': dataHoraBR(l.alterado_em), 'ID': l.id,
  }));
}

export function baixar(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportarCSV(D, lancs, nome = `lancamentos-${hoje()}.csv`) {
  const linhas = linhasExport(D, lancs);
  if (!linhas.length) return false;
  const cab = Object.keys(linhas[0]);
  const esc = (v) => { const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cab.join(';'), ...linhas.map((r) => cab.map((c) => esc(r[c])).join(';'))].join('\r\n');
  baixar(nome, csv, 'text/csv;charset=utf-8');
  return true;
}

export function exportarXLSX(D, lancs, nome = `lancamentos-${hoje()}.xlsx`, extras = []) {
  const XLSX = window.XLSX;
  const linhas = linhasExport(D, lancs);
  if (!linhas.length) return false;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas);
  const cab = Object.keys(linhas[0]);
  const iValor = cab.indexOf('Valor (R$)');
  for (let r = 1; r <= linhas.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: iValor })]; if (c) c.z = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; }
  ws['!cols'] = cab.map((c) => ({ wch: Math.min(40, Math.max(10, c.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
  for (const { nome: n, linhas: ls } of extras) if (ls.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ls), n.slice(0, 31));
  XLSX.writeFile(wb, nome);
  return true;
}
export { brl };
