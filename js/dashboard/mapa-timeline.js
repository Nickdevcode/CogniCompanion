/**
 * mapa-timeline.js — A linha do tempo da aula (o desenho do Mapa de Compreensão).
 *
 * Uma faixa horizontal de 0 até `duracaoMs`, com um marcador em cada momento que
 * importa. É a peça que transforma "ela estudou frações" em "aos 4min12, quando
 * entrou frações equivalentes, ela precisou de mais ajuda".
 *
 * Escolhas de construção, e o porquê:
 *
 *   - **HTML/CSS, não SVG.** Cada marcador é um `<button>` de verdade: recebe
 *     foco por teclado, anuncia o momento inteiro no leitor de tela e responde a
 *     toque. Num SVG isso tudo daria trabalho e sairia pior.
 *   - **Cor E forma.** O tipo do momento vira FORMA (círculo = leitura da câmera,
 *     losango = exercício conferido, anel = leitura da conversa) e o tom vira COR.
 *     Quem não distingue cores continua lendo a linha — e, de todo jeito, a lista
 *     "momento a momento" da seção repete tudo em texto.
 *   - **A forma diz o PESO da fonte.** As três não valem o mesmo: exercício
 *     conferido é fato, câmera é impressão, conversa é leitura. Por isso o
 *     `compreensao` (o mais abundante desde ago/2026) é um anel vazado, mais
 *     discreto que os dois preenchidos — ele não pode dominar a linha só por ser
 *     o que mais aparece.
 *   - **Nada de `sinal` cru na tela.** O que aparece é sempre o `rotulo`, já
 *     saneado em `mapa-api.js`.
 */

import { el } from "./sections/_shared.js";
import { formatTempoNaAula } from "./format.js";

/**
 * Descrição de cada tom, usada só na legenda (o momento em si já traz o `rotulo`
 * pronto do servidor). Fala do que a Cogni PERCEBEU, nunca do que a criança "é".
 */
const LEGENDA_TONS = [
  { tom: "apoio", texto: "precisou de mais ajuda" },
  { tom: "duvida", texto: "ficou em dúvida" },
  { tom: "bom", texto: "estava embalada" },
];

/** Posição do momento na faixa, em % (0–100). Sessão de duração 0 não divide. */
function posicaoPercentual(emMs, duracaoMs) {
  if (!duracaoMs || duracaoMs <= 0) return 0;
  const bruto = (emMs / duracaoMs) * 100;
  return Math.min(100, Math.max(0, bruto));
}

/**
 * Alinhamento do balão de detalhe: perto das pontas ele encosta na borda do card
 * e cortaria. Nas laterais ancoramos pelo início/fim em vez do centro.
 * @returns {'start'|'mid'|'end'}
 */
function alinhamentoDoBalao(pos) {
  if (pos < 18) return "start";
  if (pos > 82) return "end";
  return "mid";
}

/** Frase completa do momento — a mesma que o leitor de tela ouve e o balão mostra. */
function descreverMomento(momento) {
  const quando = formatTempoNaAula(momento.emMs);
  const onde = momento.topico || momento.materia;
  return onde
    ? `Aos ${quando}: ${momento.rotulo}, em ${onde}.`
    : `Aos ${quando}: ${momento.rotulo}.`;
}

/**
 * Um marcador da faixa.
 * @param {object} cfg
 * @param {import('./mapa-api.js').Momento} cfg.momento
 * @param {number} cfg.duracaoMs
 * @param {number} cfg.indice — posição no array (vira z-index e id de seleção)
 * @param {boolean} cfg.novo — entra com animação (momento que acabou de chegar)
 * @param {(indice:number)=>void} [cfg.onSelecionar]
 */
function marcador({ momento, duracaoMs, indice, novo, onSelecionar }) {
  const pos = posicaoPercentual(momento.emMs, duracaoMs);
  const descricao = descreverMomento(momento);

  const btn = el("button", {
    class: "mp-tl__mark" + (novo ? " is-novo" : ""),
    attrs: {
      type: "button",
      "data-tom": momento.tom,
      "data-tipo": momento.tipo,
      "data-tip": alinhamentoDoBalao(pos),
      "data-indice": String(indice),
      // Guardado no DOM porque no modo ao vivo a duração cresce a cada tick e as
      // posições precisam ser recalculadas sem recriar os marcadores (ver
      // `reposicionarMarcadores`) — recriar tiraria o foco do teclado a cada 10s.
      "data-em-ms": String(momento.emMs),
      style: `--pos:${pos.toFixed(2)}%; --i:${indice}`,
      "aria-label": descricao,
    },
    children: [
      el("span", { class: "mp-tl__dot", attrs: { "aria-hidden": "true" } }),
      // Balão visual (o leitor de tela já ouviu tudo pelo aria-label do botão).
      el("span", {
        class: "mp-tl__tip",
        attrs: { "aria-hidden": "true" },
        children: [
          el("span", { class: "mp-tl__tip-when", text: formatTempoNaAula(momento.emMs) }),
          el("span", { class: "mp-tl__tip-what", text: momento.rotulo }),
          momento.topico || momento.materia
            ? el("span", {
                class: "mp-tl__tip-where",
                text: momento.topico || momento.materia,
              })
            : null,
        ],
      }),
    ],
  });

  if (onSelecionar) {
    btn.addEventListener("click", () => onSelecionar(indice));
  }
  return btn;
}

/** Régua embaixo da faixa: início, meio e fim da aula. */
function eixo(duracaoMs) {
  const marcas = [0, duracaoMs / 2, duracaoMs];
  return el("div", {
    class: "mp-tl__axis",
    attrs: { "aria-hidden": "true" },
    children: marcas.map((ms, i) =>
      el("span", {
        class: "mp-tl__axis-label",
        attrs: { "data-mp-axis": String(i) },
        text: i === 0 ? "início" : formatTempoNaAula(ms),
      })
    ),
  });
}

/**
 * Reposiciona os marcadores e a régua de uma linha do tempo já montada, pra uma
 * nova duração. É o caminho do modo ao vivo: a aula cresce a cada tick e tudo
 * reescala, mas os `<button>` continuam sendo os MESMOS nós — quem estava com o
 * teclado num marcador não perde o foco, e nada pisca sem motivo.
 *
 * @param {HTMLElement} raiz — o elemento devolvido por `buildTimeline`
 * @param {number} duracaoMs — a duração nova
 */
export function reposicionarMarcadores(raiz, duracaoMs) {
  if (!raiz) return;
  raiz.querySelectorAll(".mp-tl__mark").forEach((btn) => {
    const emMs = Number(btn.getAttribute("data-em-ms")) || 0;
    const pos = posicaoPercentual(emMs, duracaoMs);
    btn.style.setProperty("--pos", `${pos.toFixed(2)}%`);
    btn.setAttribute("data-tip", alinhamentoDoBalao(pos));
  });
  const meio = raiz.querySelector('[data-mp-axis="1"]');
  const fim = raiz.querySelector('[data-mp-axis="2"]');
  if (meio) meio.textContent = formatTempoNaAula(duracaoMs / 2);
  if (fim) fim.textContent = formatTempoNaAula(duracaoMs);
}

/** Legenda: o que cada forma e cada cor querem dizer. */
function legenda() {
  const amostra = (tom, tipo) =>
    el("span", {
      class: "mp-tl__key-dot",
      attrs: { "data-tom": tom, "data-tipo": tipo, "aria-hidden": "true" },
    });

  const itens = LEGENDA_TONS.map((l) =>
    el("li", {
      class: "mp-tl__key-item",
      children: [amostra(l.tom, "afeto"), el("span", { text: l.texto })],
    })
  );

  // A forma diz a ORIGEM do momento, e isso muda o peso da informação: círculo é
  // impressão da câmera; losango é exercício conferido pelo servidor (objetivo);
  // anel é o que a Cogni entendeu do que a criança disse.
  itens.push(
    el("li", {
      class: "mp-tl__key-item",
      children: [amostra("bom", "pratica"), el("span", { text: "exercício conferido" })],
    }),
    el("li", {
      class: "mp-tl__key-item",
      children: [amostra("apoio", "compreensao"), el("span", { text: "lido na conversa" })],
    })
  );

  return el("div", {
    class: "mp-tl__key",
    children: [
      el("span", { class: "mp-tl__key-title", text: "Como ler:" }),
      el("ul", { class: "mp-tl__key-list", children: itens }),
    ],
  });
}

/**
 * Monta a linha do tempo de uma sessão.
 *
 * @param {object} cfg
 * @param {import('./mapa-api.js').Sessao} cfg.sessao
 * @param {number} [cfg.entradaAPartirDe=Infinity] — índice a partir do qual os
 *   marcadores entram animados. No modo ao vivo a seção passa a contagem anterior,
 *   pra só o momento NOVO piscar (redesenhar tudo com animação a cada 10s cansa).
 * @param {(indice:number)=>void} [cfg.onSelecionar] — clique num marcador
 * @returns {HTMLElement}
 */
export function buildTimeline({ sessao, entradaAPartirDe = Infinity, onSelecionar } = {}) {
  const momentos = (sessao && sessao.momentos) || [];
  const duracaoMs = (sessao && sessao.duracaoMs) || 0;
  const aoVivo = !!(sessao && sessao.emAndamento);

  const trilha = el("div", {
    class: "mp-tl__track",
    attrs: {
      role: "group",
      "aria-label": momentos.length
        ? `Linha do tempo da aula: ${momentos.length} ${
            momentos.length === 1 ? "momento marcado" : "momentos marcados"
          } em ${formatTempoNaAula(duracaoMs)}.`
        : `Linha do tempo da aula: ${formatTempoNaAula(duracaoMs)} sem nenhum momento marcado.`,
    },
    children: [
      el("span", { class: "mp-tl__rail", attrs: { "aria-hidden": "true" } }),
      // No ao vivo a ponta é o "agora": ganha um pulso, que é o sinal visual de
      // que a aula está se desenhando enquanto o pai olha.
      aoVivo
        ? el("span", { class: "mp-tl__head", attrs: { "aria-hidden": "true" } })
        : null,
      ...momentos.map((momento, indice) =>
        marcador({
          momento,
          duracaoMs,
          indice,
          novo: indice >= entradaAPartirDe,
          onSelecionar,
        })
      ),
    ],
  });

  return el("div", {
    class: "mp-tl" + (aoVivo ? " is-live" : ""),
    children: [trilha, eixo(duracaoMs), momentos.length ? legenda() : null],
  });
}

export { descreverMomento };
