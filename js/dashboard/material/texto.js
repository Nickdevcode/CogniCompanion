/**
 * texto.js — Texto puro (txt/md/csv/tsv/json) e o corte que todo mundo usa.
 *
 * O corte mora aqui, e não em cada extrator, porque ele tem uma regra que é fácil
 * errar: **corte silencioso é pior que arquivo recusado**. Truncar uma lista de
 * exercícios no meio da questão 14 produz um plano faltando metade das tarefas, sem
 * aviso nem pro pai nem pro modelo — e os dois seguem achando que leram tudo.
 * Marcar o corte custa uma linha e transforma um bug invisível num fato visível.
 */

import { MAX_TEXTO_ITEM } from "./orcamento.js";

const MARCA = "\n\n…[o resto do material não coube. Mande o que faltou separado]";

/**
 * Corta em `max` caracteres, marcando o corte no próprio texto.
 *
 * @param {string} texto
 * @param {number} [max]
 * @returns {{texto: string, cortado: boolean}}
 */
export function cortarTexto(texto, max = MAX_TEXTO_ITEM) {
  const limpo = String(texto || "").trim();
  if (limpo.length <= max) return { texto: limpo, cortado: false };
  return {
    // Corta com folga pra marca caber sem estourar o teto que a função valida.
    texto: limpo.slice(0, Math.max(0, max - MARCA.length)).trimEnd() + MARCA,
    cortado: true,
  };
}

/**
 * Normaliza o texto extraído antes de mandar.
 *
 * Documento real vem cheio de linha em branco de formatação (parágrafo vazio no Word,
 * linha de célula vazia no Excel). Cada uma é um token pago que não diz nada — e
 * mais de duas seguidas nunca significam nada além de espaçamento visual.
 *
 * @param {string} texto
 * @returns {string}
 */
export function normalizar(texto) {
  return String(texto || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    // Espaço colado num tab: sai da célula de tabela do Word, onde o parágrafo
    // fecha com espaço e a célula fecha com tab. Deixar os dois faz a coluna
    // desalinhar e gasta token à toa.
    .replace(/ +\t/g, "\t")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Arquivo de texto puro → string.
 *
 * @param {File} file
 * @returns {Promise<{texto: string, cortado: boolean}>}
 */
export async function deArquivo(file) {
  const bruto = await file.text();
  return cortarTexto(normalizar(bruto));
}
