/**
 * dica.js — "Dica da Cogni" (Início), com fonte ESTÁVEL.
 *
 * Espelha a arquitetura do Resumo Semanal (jun/2026). A "dica de agora" tem duas
 * fontes que se complementam:
 *
 *   1) Tabela `dicas` (Supabase, RLS) — a dica mais recente persistida. Lida pela
 *      camada de dados (`mock.getDicaAtual()`). Pinta INSTANTÂNEO, inclusive com
 *      o robô offline. É o piso de estabilidade.
 *   2) Endpoint do servidor local — só REFRESCA quando o robô está ligado:
 *        GET {servidorUrl}/api/dica?criancaId=<id> → { dica, deCache, vazio }
 *      Já é estável lá (mesma dica até haver conversa nova). `deCache: true` =
 *      não houve conversa nova; `vazio: true` = perfil sem dados ainda.
 *
 * Regra de exibição:
 *   - Endpoint respondeu com dica → usa ela (mais fresca).
 *   - Endpoint falhou (robô off/CORS) mas a tabela tem dica → mostra a da tabela.
 *     SEM cair no texto genérico: offline não é "sem dica".
 *   - Tabela REALMENTE vazia (nenhuma dica jamais gerada) → texto amigável padrão.
 *
 * No modo mock (USAR_SUPABASE=false) não há servidor: a fonte é o `getDicaAtual()`
 * do mock (array de exemplo), pra a tela de demonstração ficar bonita offline.
 */

import { el } from "./sections/_shared.js";
import { ICON } from "./icons.js";
import { dicaInfo } from "./tooltip.js";
import { linhaDeFrescor, registrarOrigem } from "./recado-frescor.js";

/** Texto amigável de quando NÃO há nenhuma dica salva ainda (tabela vazia). */
const DICA_PADRAO =
  "Que tal puxar uma conversa com a criança sobre o que ela descobriu hoje? Curiosidade puxa curiosidade! 💜";

/**
 * Refresca a dica pelo endpoint do servidor. NÃO trata robô offline como erro:
 * devolve `null` quando o servidor não responde (ou sinaliza `vazio`) — cabe ao
 * chamador cair pra dica da tabela. Nunca lança.
 * @param {string} servidorUrl
 * @param {string} criancaId
 * @returns {Promise<string|null>} o texto fresco da dica, ou null se indisponível
 *   (servidor offline / sem dado) — sinal pra usar o fallback persistido.
 */
export async function buscarDica(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return null;
  try {
    const url = `${servidorUrl}/api/dica?criancaId=${encodeURIComponent(criancaId)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null; // servidor respondeu erro → usa a da tabela
    const dados = await resp.json();
    // `vazio` ou sem texto: não sobrepõe a tabela (ela pode ter algo melhor).
    if (dados.vazio || !dados.dica) return null;
    return dados.dica;
  } catch (err) {
    // Robô off / CORS: silencioso de propósito. A tabela cobre o conteúdo.
    console.debug("[Companion] Dica da Cogni: endpoint indisponível, usando a salva.", err);
    return null;
  }
}

/**
 * A dica resolvida, COM procedência — não só o texto.
 *
 * A origem existe porque os três degraus da cascata chegavam à tela com a mesma
 * aparência, e "dica de três dias atrás" ficava indistinguível de "a Cogni
 * acabou de escrever" e de "nada salvo ainda". Ver `recado-frescor.js`.
 *
 * @typedef {object} DicaResolvida
 * @property {string} texto — sempre pronto pra exibir
 * @property {"endpoint"|"tabela"|"padrao"} origem
 * @property {string|null} em — `criado_em` da linha salva (só na origem `tabela`)
 */

/**
 * Resolve a "dica de agora" combinando tabela (estável) + endpoint (fresco). Lê os
 * dois em paralelo; prefere o endpoint quando traz texto, senão cai pra última
 * dica salva, e por fim pro texto padrão (tabela realmente vazia).
 * @param {object} cfg
 * @param {string} cfg.servidorUrl
 * @param {object} cfg.crianca
 * @param {object} cfg.mock — camada de dados (pra ler a última de `dicas`)
 * @returns {Promise<DicaResolvida>}
 */
export async function resolverDicaAtual({ servidorUrl, crianca, mock }) {
  const criancaId = crianca && crianca.id;

  // Tabela: tolera falha (RLS/rede) sem derrubar — o endpoint ainda pode cobrir.
  const daTabelaP = mock
    ? mock.getDicaAtual().catch((err) => {
        console.debug("[Companion] Dica da Cogni: leitura da tabela falhou.", err);
        return null;
      })
    : Promise.resolve(null);

  const [doEndpoint, daTabela] = await Promise.all([
    buscarDica(servidorUrl, criancaId),
    daTabelaP,
  ]);

  // Endpoint trouxe texto fresco → vence.
  if (doEndpoint) return { texto: doEndpoint, origem: "endpoint", em: null };
  // Senão, a última dica salva é a fonte estável.
  if (daTabela && daTabela.texto) {
    return { texto: daTabela.texto, origem: "tabela", em: daTabela.criado_em || null };
  }
  // Nada salvo (tabela vazia de verdade) → texto amigável padrão.
  return { texto: DICA_PADRAO, origem: "padrao", em: null };
}

/**
 * Card "Dica da Cogni" pro Início. Lê a dica estável (tabela) e refresca pelo
 * endpoint; enquanto carrega, mostra um placeholder discreto. `onMais` é o clique
 * do rodapé.
 * @param {object} cfg
 * @param {string} cfg.servidorUrl
 * @param {object} cfg.crianca
 * @param {object} cfg.mock — camada de dados (pra ler a última de `dicas`)
 * @param {Function} cfg.onMais
 * @param {Date} [cfg.now] — o "agora" do painel (`ctx.now`). No modo demo ele é o
 *   relógio deslizado do mock, e a linha "Escrito há…" tem que contar a partir dele,
 *   como o mesmo card faz no Aprendizado — senão as duas telas discordam da idade da
 *   mesma dica.
 * @returns {HTMLElement}
 */
export function cardDica({ servidorUrl, crianca, mock, onMais, now }) {
  const card = el("article", { class: "dash-card ini-card ini-card--dica" });
  card.appendChild(
    el("div", {
      class: "dash-card__head",
      children: [
        el("span", { class: "dash-card__head-ico", svg: ICON.bulb }),
        el("span", { class: "dash-card__head-title", text: "Dica da Cogni" }),
        dicaInfo(
          "Uma sugestão que a Cogni escreve pra você, a partir do que a criança andou perguntando. Muda quando há conversa nova.",
          { rotulo: "Dica da Cogni", pos: "bottom" }
        ),
      ],
    })
  );

  const texto = el("p", {
    class: "ini-dica__text",
    text: "A Cogni está pensando numa dica pra você…",
  });
  // Host da linha "de quando é" — fica reservado desde já pra a troca do
  // placeholder não empurrar o rodapé do card quando a dica chegar.
  const frescor = el("div", { class: "recado-frescor__host" });
  const body = el("div", {
    class: "ini-card__body ini-dica__body",
    children: [texto, frescor],
  });
  card.appendChild(body);

  // Rodapé "ver mais dicas" (leva ao Aprendizado, como antes).
  const foot = el("div", { class: "ini-card__foot" });
  const btn = el("button", {
    class: "ini-cardlink",
    attrs: { type: "button" },
    children: [
      el("span", { text: "Ver mais dicas" }),
      el("span", {
        class: "ini-cardlink__chev",
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
      }),
    ],
  });
  if (onMais) btn.addEventListener("click", onMais);
  foot.appendChild(btn);
  card.appendChild(foot);

  // Resolve a dica (tabela + endpoint) e troca o placeholder.
  resolverDicaAtual({ servidorUrl, crianca, mock }).then((dica) => {
    texto.textContent = dica.texto;
    registrarOrigem("Dica da Cogni", dica.origem, dica.em);
    const linha = linhaDeFrescor({ origem: dica.origem, em: dica.em, now });
    if (linha) frescor.replaceChildren(linha);
  });

  return card;
}
