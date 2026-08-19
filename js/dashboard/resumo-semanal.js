/**
 * resumo-semanal.js — "Resumo da semana da Cogni" (bilhete por IA).
 *
 * Fonte ESTÁVEL (jun/2026): o backend virou a referência. O card mostra sempre o
 * último resumo salvo — nunca mais um estado de "sem comunicação" quando o robô
 * está desligado. São duas fontes que se complementam:
 *
 *   1) Tabela `resumos_semanais` (Supabase, RLS) — o último resumo persistido.
 *      Lido pela camada de dados (`mock.getResumoSemanal()`). Pinta INSTANTÂNEO,
 *      inclusive com o robô offline. É o piso de estabilidade.
 *   2) Endpoint do servidor local — gera/atualiza sob demanda:
 *        GET {servidorUrl}/api/resumo-semanal?criancaId=<id>
 *        → { resumo, periodoDias, totalConversas, materias, topicos, vazio, deCache }
 *      Quando responde, traz a versão mais fresca (pega conversa nova). Com
 *      `deCache: true` é o mesmo resumo de antes (não regenerou à toa).
 *
 * Regra de exibição:
 *   - Endpoint respondeu com resumo → usa ele (mais fresco).
 *   - Endpoint falhou (robô off/CORS) mas a tabela tem resumo → mostra o da
 *     tabela. SEM mensagem de erro: offline não é falha aqui.
 *   - `vazio: true` E nada na tabela → vazio REAL (a criança nunca conversou);
 *     o `resumo` do endpoint já vem com uma mensagem amigável pronta.
 *   - Nada em lugar nenhum (sem criança, ou tabela vazia + endpoint offline) →
 *     estado neutro discreto, não um "erro de conexão".
 */

import { el } from "./sections/_shared.js";
import { ICON } from "./icons.js";
import { dicaInfo } from "./tooltip.js";
import { openModal } from "./modal.js";
import { materiaLabel } from "./format.js";

/**
 * Formato interno normalizado do resumo (vindo da tabela OU do endpoint), pra o
 * render não se importar com a origem.
 * @typedef {object} ResumoNormalizado
 * @property {string} texto — o bilhete completo
 * @property {string[]} materias — matérias da semana (códigos)
 * @property {string[]} topicos — tópicos explorados na semana
 * @property {number|null} totalConversas — conversas no período
 * @property {number} periodoDias — janela em dias (default 7)
 * @property {boolean} vazio — true = a criança ainda não conversou
 */

/** Normaliza uma linha de `resumos_semanais` (snake_case) pro formato interno. */
function normalizarDaTabela(linha) {
  if (!linha) return null;
  return {
    texto: linha.texto || "",
    materias: Array.isArray(linha.materias) ? linha.materias : [],
    topicos: Array.isArray(linha.topicos) ? linha.topicos : [],
    totalConversas:
      typeof linha.total_conversas === "number" ? linha.total_conversas : null,
    periodoDias: linha.periodo_dias || 7,
    vazio: false, // se há linha salva, houve conversa em algum momento
  };
}

/** Normaliza a resposta do endpoint (camelCase) pro formato interno. */
function normalizarDoEndpoint(dados) {
  if (!dados) return null;
  return {
    texto: dados.resumo || "",
    materias: Array.isArray(dados.materias) ? dados.materias : [],
    topicos: Array.isArray(dados.topicos) ? dados.topicos : [],
    totalConversas:
      typeof dados.totalConversas === "number" ? dados.totalConversas : null,
    periodoDias: dados.periodoDias || 7,
    vazio: !!dados.vazio,
  };
}

/**
 * Busca o resumo fresco no endpoint do servidor. Diferente de antes, NÃO trata
 * robô offline como erro fatal: devolve `null` quando o servidor não responde —
 * cabe ao chamador cair pro resumo da tabela. Nunca lança.
 * @param {string} servidorUrl
 * @param {string} criancaId
 * @returns {Promise<ResumoNormalizado|null>} o resumo do endpoint, ou null se
 *   indisponível (rede/servidor) — sinal pra usar o fallback persistido.
 */
export async function buscarResumoSemanal(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return null;
  try {
    const url = `${servidorUrl}/api/resumo-semanal?criancaId=${encodeURIComponent(
      criancaId
    )}`;
    const resp = await fetch(url);
    if (!resp.ok) return null; // servidor respondeu erro → usa o da tabela
    return normalizarDoEndpoint(await resp.json());
  } catch (err) {
    // Robô off / CORS: silencioso de propósito. A tabela cobre o conteúdo.
    console.debug("[Companion] Resumo semanal: endpoint indisponível, usando o salvo.", err);
    return null;
  }
}

/**
 * Card "Resumo da semana da Cogni" pro Início. Pinta o último resumo salvo na
 * hora (tabela) e atualiza com a versão fresca do endpoint quando o robô estiver
 * ligado. Clicar abre o texto completo num modal.
 *
 * @param {object} cfg
 * @param {string} cfg.servidorUrl — base do servidor local (endpoint)
 * @param {object} cfg.crianca — a criança pareada (precisa do id)
 * @param {object} cfg.mock — camada de dados (pra ler `resumos_semanais`)
 * @returns {HTMLElement} o card
 */
export function cardResumoSemanal({ servidorUrl, crianca, mock }) {
  const card = el("article", {
    class: "dash-card ini-card ini-card--bilhete",
  });

  card.appendChild(
    el("div", {
      class: "dash-card__head",
      children: [
        el("span", { class: "dash-card__head-ico", svg: ICON.heart }),
        // O card dos contadores no Início se chamava "Resumo da semana" também; os dois
        // lado a lado eram indistinguíveis pelo título. Este é o texto que a Cogni
        // escreve — e "bilhete" é como o resto da tela já o chamava ("Ler o bilhete
        // completo", `ini-bilhete__*`, o próprio comentário do módulo).
        el("span", { class: "dash-card__head-title", text: "O bilhete da semana" }),
        dicaInfo(
          "Um texto que a Cogni escreve sobre os últimos 7 dias de conversa. Depende do robô estar ligado pra ser atualizado.",
          { rotulo: "O bilhete da semana", pos: "bottom" }
        ),
      ],
    })
  );

  const body = el("div", { class: "ini-card__body ini-bilhete__body" });
  body.appendChild(skeletonCarregando());
  card.appendChild(body);

  const footHost = el("div", { class: "ini-card__foot" });
  card.appendChild(footHost);

  // Sem criança pareada: estado neutro (não é erro de conexão).
  if (!crianca || !crianca.id) {
    renderConteudo(body, footHost, null);
    return card;
  }

  carregarResumo({ servidorUrl, crianca, mock }).then((resumo) => {
    renderConteudo(body, footHost, resumo);
  });

  return card;
}

/**
 * Resolve o resumo a exibir combinando tabela (estável) + endpoint (fresco).
 * Lê os dois em paralelo; prefere o endpoint quando ele traz conteúdo, senão
 * cai pro último salvo. Único caso de "vazio real": endpoint diz `vazio` E não
 * há nada salvo.
 * @returns {Promise<ResumoNormalizado|null>} o resumo a renderizar, ou null
 *   (estado neutro) quando não há nada em lugar nenhum.
 */
async function carregarResumo({ servidorUrl, crianca, mock }) {
  // Tabela: tolera falha (RLS/rede) sem derrubar — o endpoint ainda pode cobrir.
  const daTabelaP = mock
    ? mock.getResumoSemanal().then(normalizarDaTabela).catch((err) => {
        console.debug("[Companion] Resumo semanal: leitura da tabela falhou.", err);
        return null;
      })
    : Promise.resolve(null);

  const [doEndpoint, daTabela] = await Promise.all([
    buscarResumoSemanal(servidorUrl, crianca.id),
    daTabelaP,
  ]);

  // Endpoint trouxe um resumo com texto → é o mais fresco, vence.
  if (doEndpoint && doEndpoint.texto && !doEndpoint.vazio) return doEndpoint;

  // Sem conteúdo fresco: o último salvo é a fonte estável.
  if (daTabela && daTabela.texto) return daTabela;

  // Nada salvo. Se o endpoint sinalizou vazio, é vazio REAL (com msg amigável).
  if (doEndpoint && doEndpoint.vazio) return doEndpoint;

  // Nada em lugar nenhum (tabela vazia + endpoint offline) → estado neutro.
  return null;
}

/** Skeleton de carregamento (bilhete sendo escrito). */
function skeletonCarregando() {
  return el("div", {
    class: "ini-bilhete__loading",
    children: [
      el("span", { class: "ini-bilhete__spinner", attrs: { "aria-hidden": "true" } }),
      el("p", { class: "ini-bilhete__loadtext", text: "A Cogni está escrevendo o bilhete da semana…" }),
    ],
  });
}

/**
 * Troca o conteúdo do card conforme o resumo resolvido.
 * @param {HTMLElement} body
 * @param {HTMLElement} footHost
 * @param {ResumoNormalizado|null} resumo
 */
function renderConteudo(body, footHost, resumo) {
  body.replaceChildren();
  footHost.replaceChildren();

  // Estado neutro: ainda não há resumo (e nada pra mostrar agora). Discreto, sem
  // alarme de "sem comunicação" — quando a Cogni gerar o primeiro, ele aparece.
  if (!resumo || !resumo.texto) {
    body.appendChild(
      el("p", {
        class: "ini-bilhete__text is-vazio",
        text: "O bilhete chega no fim da primeira semana de conversas.",
      })
    );
    return;
  }

  // Texto do bilhete (trecho no card; completo no modal). No caso `vazio`, o
  // texto já é uma mensagem amigável pronta (criança ainda não conversou).
  const trecho = recortar(resumo.texto, 220);
  body.appendChild(
    el("p", {
      class: "ini-bilhete__text" + (resumo.vazio ? " is-vazio" : ""),
      text: trecho,
    })
  );

  // "Ler completo": quando há mais texto que o trecho, ou dados extras a mostrar
  // (matérias/tópicos/contagem). Não oferece no estado vazio (nada a expandir).
  const temExtras =
    !resumo.vazio &&
    (resumo.materias.length > 0 ||
      resumo.topicos.length > 0 ||
      typeof resumo.totalConversas === "number");
  const temMais = resumo.texto.length > trecho.length || temExtras;

  if (temMais) {
    const btn = el("button", {
      class: "ini-cardlink",
      attrs: { type: "button" },
      children: [
        el("span", { text: "Ler o bilhete completo" }),
        el("span", {
          class: "ini-cardlink__chev",
          svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
        }),
      ],
    });
    btn.addEventListener("click", () => abrirModalResumo(resumo));
    footHost.appendChild(btn);
  }
}

/** Abre o modal com o bilhete completo + chips de matérias/tópicos da semana. */
function abrirModalResumo(resumo) {
  openModal({
    title: "O bilhete da semana",
    size: "md",
    content: () => {
      const wrap = el("div", { class: "rs-modal" });

      // Bilhete completo.
      wrap.appendChild(
        el("div", {
          class: "rs-modal__bilhete",
          children: [
            el("span", { class: "rs-modal__quote", svg: ICON.heart }),
            el("p", { class: "rs-modal__text", text: resumo.texto || "" }),
          ],
        })
      );

      // Resumo numérico (conversas no período).
      if (typeof resumo.totalConversas === "number") {
        wrap.appendChild(
          el("p", {
            class: "rs-modal__meta",
            text: `${resumo.totalConversas} ${
              resumo.totalConversas === 1 ? "conversa" : "conversas"
            } nos últimos ${resumo.periodoDias || 7} dias.`,
          })
        );
      }

      // Chips de matérias da semana.
      if (resumo.materias.length) {
        wrap.appendChild(
          blocoChips(
            "Matérias da semana",
            resumo.materias.map((m) => materiaLabel(m))
          )
        );
      }

      // Chips de tópicos explorados na semana.
      if (resumo.topicos.length) {
        wrap.appendChild(blocoChips("Tópicos explorados", resumo.topicos));
      }

      return wrap;
    },
  });
}

/** Bloco rotulado de chips (matérias/tópicos). */
function blocoChips(rotulo, valores) {
  return el("div", {
    class: "rs-modal__chips-block",
    children: [
      el("h3", { class: "rs-modal__chips-title", text: rotulo }),
      el("div", {
        class: "rs-modal__chips",
        children: valores.map((v) =>
          el("span", { class: "rs-chip", text: v })
        ),
      }),
    ],
  });
}

/** Recorta um texto até `max` chars, sem cortar palavra no meio. */
function recortar(texto, max) {
  const t = String(texto || "").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return (ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte).trimEnd() + "…";
}
