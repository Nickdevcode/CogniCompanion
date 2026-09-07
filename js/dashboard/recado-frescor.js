/**
 * recado-frescor.js — "De quando é este recado da Cogni?"
 *
 * A Dica e o Bilhete da semana têm duas fontes que se complementam (a tabela do
 * Supabase, estável, e o endpoint do servidor local, fresco) e a cascata entre
 * elas é SILENCIOSA de propósito: robô desligado nunca vira mensagem de erro na
 * cara do pai.
 *
 * 🔴 O preço disso, que este módulo cobre. Sem nenhuma marca de tempo, os quatro
 * estados possíveis — recado novo, recado de três dias atrás, tabela vazia e bug
 * de verdade — chegam à tela com EXATAMENTE a mesma aparência. Quem olha não
 * consegue distinguir "a Cogni ainda não escreveu" de "isto aqui está velho", e
 * a pergunta que sobra é sempre a mesma: *isso está funcionando?*
 *
 * A resposta não é mostrar erro (não há erro nenhum: o robô costuma estar
 * desligado quando o pai abre o painel). É dizer QUANDO o recado foi escrito.
 * Uma linha discreta embaixo do texto transforma um card mudo num card honesto.
 */

import { el } from "./sections/_shared.js";
import { formatQuandoVisto } from "./format.js";

/**
 * De onde veio o recado que está na tela.
 * @typedef {"endpoint"|"tabela"|"padrao"} OrigemDoRecado
 * - `endpoint`: o servidor local respondeu agora — é o mais fresco que existe.
 * - `tabela`: a última linha salva no Supabase (o robô não estava ao alcance).
 * - `padrao`: não havia nada em lugar nenhum; o texto na tela é o genérico.
 */

/**
 * A linha "de quando é" de um recado. Devolve `null` quando não há o que dizer
 * (origem `padrao`: o próprio corpo do card já explica que ainda não há nada).
 *
 * @param {object} cfg
 * @param {OrigemDoRecado} cfg.origem
 * @param {string|Date|null} cfg.em — `criado_em` da linha salva (só na `tabela`)
 * @param {Date} [cfg.now] — o "agora" de referência (testabilidade)
 * @returns {HTMLElement|null}
 */
export function linhaDeFrescor({ origem, em, now = new Date() }) {
  const texto = textoDeFrescor({ origem, em, now });
  if (!texto) return null;
  return el("p", {
    class: "recado-frescor",
    text: texto,
    // Complemento, não substituto: quem só lê o recado não perde nada. Por isso
    // não é `role="status"` — não é novidade que mereça interromper a leitura.
    attrs: { "data-origem": origem },
  });
}

/**
 * O texto da linha, separado do DOM porque é ele que se testa (e porque a
 * mesma frase serve ao `console` de diagnóstico abaixo).
 * @returns {string} vazio quando não há o que dizer
 */
export function textoDeFrescor({ origem, em, now = new Date() }) {
  if (origem === "endpoint") return "Atualizado agora, direto do robô.";
  if (origem !== "tabela") return "";

  // Sem data utilizável a única verdade que sobra é a origem — e ela ainda vale
  // a linha: o pai fica sabendo que está lendo algo guardado, não algo de agora.
  const quando = em ? formatQuandoVisto(em, now) : "";
  return quando
    ? `Escrito ${quando}. Atualiza quando o robô estiver ligado.`
    : "Guardado da última conversa. Atualiza quando o robô estiver ligado.";
}

/**
 * Registra em console qual degrau da cascata pintou a tela.
 *
 * É `console.info` AFIRMATIVO, e não o `console.debug` de dentro de um `catch`:
 * o caminho degradado é o caso COMUM aqui, e um caminho comum que só deixa
 * rastro quando dá exceção é um caminho que ninguém consegue auditar. Com isto,
 * abrir o F12 responde "de onde veio este texto?" sem reler o código.
 *
 * @param {string} oQue — "Dica da Cogni" | "Bilhete da semana"
 * @param {OrigemDoRecado} origem
 * @param {string|Date|null} [em]
 */
export function registrarOrigem(oQue, origem, em) {
  const DE_ONDE = {
    endpoint: "do endpoint do servidor local (fresco)",
    tabela: "da tabela do Supabase (último salvo)",
    padrao: "de lugar nenhum — texto padrão, nada salvo ainda",
  };
  console.info(
    `[Companion] ${oQue}: ${DE_ONDE[origem] || origem}${em ? ` · escrito em ${em}` : ""}`
  );
}
