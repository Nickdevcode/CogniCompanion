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
 *
 * 🩺 ago/2026 — dois eixos novos, e nenhum dos dois é cor nem forma (as duas já
 * estão ocupadas por tom e origem):
 *
 *   - **Traço.** Marcador de câmera que ninguém corroborou (`confianca: 'baixa'`)
 *     é desenhado VAZADO e TRACEJADO, com menos peso. Tracejado é a metáfora
 *     certa: a linha existe, mas não fecha. É o único jeito de a leitura facial
 *     continuar na tela sem afirmar sozinha.
 *   - **Halo.** Atrito que ela venceu depois (`superado: true`) ganha um anel
 *     verde em volta. Não é enfeite: é a melhor notícia da tela, e sem isso ele
 *     fica visualmente idêntico a um atrito que continua pendente.
 *
 * `repeticoes` entra só como TAMANHO (um episódio que se repetiu pesa mais na
 * vista), nunca como número: "3 caretas" seria placar do humor da criança.
 */

import { el } from "./sections/_shared.js";
import { formatTempoNaAula, materiaLabel, capitalizar } from "./format.js";

/**
 * Descrição de cada tom, usada só na legenda (o momento em si já traz o `rotulo`
 * pronto do servidor). Fala do que a Cogni PERCEBEU, nunca do que a criança "é".
 */
const LEGENDA_TONS = [
  { tom: "apoio", texto: "Precisou de mais ajuda" },
  { tom: "duvida", texto: "Ficou em dúvida" },
  // Mesma frase neutra do `ROTULOS_ACENTUADOS` (mapa-api.js) — a legenda e os
  // marcadores precisam dizer a mesma coisa, senão a legenda deixa de explicá-los.
  // Só a inicial muda: aqui o texto abre o item da legenda, lá ele entra no meio
  // da frase do `aria-label` ("Aos 2min40: estava no embalo.").
  { tom: "bom", texto: "Estava no embalo" },
];

/**
 * Onde o momento aconteceu, pronto pra tela: o tópico, ou a matéria com o nome
 * legível ("Matemática", não "matematica").
 *
 * ⚠️ Devolve `null` sem inventar nada — e é o ponto mais sensível do arquivo. Um
 * momento sem tópico é ESPERADO desde ago/2026 (o assunto vence em 4 min), e a
 * tentação de preencher com `sessao.topicos[0]` é literalmente o defeito nº 1 que
 * a reforma consertou: o mapa dizia "travou em frações" 44 min depois de frações
 * sair da mesa. Quem chama decide o que escrever no lugar; ninguém chuta aqui.
 *
 * @param {import('./mapa-api.js').Momento} momento
 * @returns {string|null}
 */
function ondeDoMomento(momento) {
  if (!momento) return null;
  if (momento.topico) return momento.topico;
  return momento.materia ? materiaLabel(momento.materia) : null;
}

/**
 * Quanto o marcador cresce quando o mesmo episódio se repetiu. Teto de 3 passos
 * porque a diferença entre "voltou muito" e "voltou muitíssimo" não muda nada pro
 * pai — e um marcador grande demais atropelaria os vizinhos na faixa.
 */
function escalaPorRepeticoes(repeticoes) {
  const extra = Math.min(Math.max((Number(repeticoes) || 1) - 1, 0), 3);
  return (1 + extra * 0.09).toFixed(2);
}

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

/**
 * Frase completa do momento — a mesma que o leitor de tela ouve, e a base do que
 * o balão mostra.
 *
 * As ressalvas viram FRASE, não adjetivo: quem navega por teclado ou leitor de
 * tela não vê o traço nem o halo, e sem elas a versão sonora afirmaria com mais
 * certeza do que a versão visual. Nenhuma delas usa a palavra "confiança".
 */
function descreverMomento(momento) {
  const quando = formatTempoNaAula(momento.emMs);
  const onde = ondeDoMomento(momento);
  const frases = [
    onde
      ? `Aos ${quando}: ${momento.rotulo}, em ${onde}.`
      : `Aos ${quando}: ${momento.rotulo}.`,
  ];
  if (momento.superado) frases.push("Destravou depois, ainda nesta aula.");
  if (momento.confianca === "baixa") {
    frases.push("Foi o que a câmera percebeu, sem outra confirmação.");
  }
  return frases.join(" ");
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
  const onde = ondeDoMomento(momento);

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
      // Só marcamos a ressalva, nunca a certeza: `data-confianca` existe apenas
      // no caso 'baixa'. Assim um payload sem o campo (aula antiga, tabela lida
      // direto) desenha o marcador cheio, que é o comportamento de sempre.
      ...(momento.confianca === "baixa" ? { "data-confianca": "baixa" } : {}),
      ...(momento.superado ? { "data-superado": "true" } : {}),
      style:
        `--pos:${pos.toFixed(2)}%; --i:${indice}; ` +
        `--rep:${escalaPorRepeticoes(momento.repeticoes)}`,
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
          el("span", { class: "mp-tl__tip-what", text: capitalizar(momento.rotulo) }),
          onde ? el("span", { class: "mp-tl__tip-where", text: onde }) : null,
          // A boa notícia vem antes da ressalva: se o balão for lido de relance,
          // que sobre "destravou depois".
          momento.superado
            ? el("span", { class: "mp-tl__tip-nota", text: "Destravou depois" })
            : null,
          momento.confianca === "baixa"
            ? el("span", {
                class: "mp-tl__tip-ressalva",
                text: "O que a câmera percebeu",
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
        text: i === 0 ? "Início" : formatTempoNaAula(ms),
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

/**
 * Legenda: o que cada forma e cada cor querem dizer.
 *
 * Os dois últimos itens são CONDICIONAIS, e por um motivo de higiene: o traço e o
 * halo (ago/2026) não aparecem em toda aula, e explicar um símbolo que não está na
 * tela é ruído que empurra pra baixo o que importa. A legenda cresce só quando a
 * aula tem o que explicar.
 *
 * @param {import('./mapa-api.js').Momento[]} momentos
 */
function legenda(momentos) {
  const amostra = (tom, tipo, extras = {}) =>
    el("span", {
      class: "mp-tl__key-dot",
      attrs: { "data-tom": tom, "data-tipo": tipo, "aria-hidden": "true", ...extras },
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
      children: [amostra("bom", "pratica"), el("span", { text: "Exercício conferido" })],
    }),
    el("li", {
      class: "mp-tl__key-item",
      children: [amostra("apoio", "compreensao"), el("span", { text: "Lido na conversa" })],
    })
  );

  if (momentos.some((m) => m.superado)) {
    itens.push(
      el("li", {
        class: "mp-tl__key-item",
        children: [
          amostra("apoio", "afeto", { "data-superado": "true" }),
          el("span", { text: "Destravou depois" }),
        ],
      })
    );
  }

  // "sem confirmação" e não "baixa confiança": o pai precisa saber que aquele
  // marcador é mais frouxo que os outros, não receber o vocabulário do motor.
  if (momentos.some((m) => m.confianca === "baixa")) {
    itens.push(
      el("li", {
        class: "mp-tl__key-item",
        children: [
          amostra("apoio", "afeto", { "data-confianca": "baixa" }),
          el("span", { text: "Só a câmera percebeu" }),
        ],
      })
    );
  }

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
    children: [trilha, eixo(duracaoMs), momentos.length ? legenda(momentos) : null],
  });
}

export { descreverMomento, ondeDoMomento };
