/**
 * mapa.js — Seção "Mapa da aula" (Mapa de Compreensão da Aula).
 *
 * A pergunta que esta tela responde não é "a criança estudou?", nem "por quanto
 * tempo?" — isso o Diário e o Aprendizado já contam. Aqui a pergunta é:
 *
 *     "em que minuto ela parou de entender, e sobre o quê?"
 *
 * O servidor cruza, durante a conversa, o assunto de cada turno com os sinais que
 * a câmera leu e os vereditos dos exercícios; o site só desenha o resultado. Nada
 * é correlacionado aqui — cada momento já chega com o tópico que estava valendo
 * naquele segundo.
 *
 * O que a tela mostra, em ordem de importância pro pai:
 *   1. O resumo em texto (IA), que é o que ele lê primeiro;
 *   2. O assunto que mais pediu ajuda + o minuto em que isso começou (destaque);
 *   3. A linha do tempo da aula;
 *   4. A mesma linha em lista de texto (não dá pra depender de cor e posição);
 *   5. O histórico das aulas anteriores.
 *
 * ⚠️ Regras de tom, inegociáveis (as mesmas da Trilha de aprendizado):
 *   - `sinal`/`resultado` (`travada`, `travou`) são internos e NUNCA aparecem: o
 *     que vai pra tela é o `rotulo`, já pronto e saneado em `mapa-api.js`.
 *   - Isto NÃO é placar. Sem % de acerto, sem nota, sem comparação. Os
 *     `contadores` que o servidor manda existem, e de propósito não viram números
 *     na tela: "4 acertos × 2 tropeços" é boletim com outro nome. O que interessa
 *     é ONDE ajudar, e isso a linha do tempo já diz.
 *   - Aula sem nenhum momento marcado é uma aula boa — "correu tranquila" —, não
 *     uma tela vazia com cara de erro.
 *   - O texto sugere o que fazer junto; nunca aponta defeito.
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon } from "../icons.js";
import { buildTimeline, reposicionarMarcadores, descreverMomento } from "../mapa-timeline.js";
import { carregarMapa, carregarResumoDaAula } from "../mapa-api.js";
import {
  formatDuracao,
  formatTempoNaAula,
  formatHora,
  formatDiaRelativo,
  materiaLabel,
  primeiroNome,
} from "../format.js";

/**
 * Ritmo do modo ao vivo. Com aula acontecendo, 10s é o que faz a linha "se
 * desenhar" na tela sem parecer travada. Sem aula, seguimos olhando de longe (o
 * pai pode ter aberto o painel um minuto antes de a criança sentar com o robô) —
 * e com o servidor fora do ar espaçamos mais, porque aí não há o que esperar.
 */
const POLL_AO_VIVO_MS = 10000;
const POLL_ESPERA_MS = 30000;
const POLL_SEM_SERVIDOR_MS = 60000;

/* --------------------------------------------------------------------------
   Peças de UI
   -------------------------------------------------------------------------- */

/**
 * Selo "acontecendo agora" (pulsa). Só existe quando há aula em andamento.
 * @param {boolean} [compacto] — versão curta pro cartão do histórico, onde o selo
 *   inteiro repetiria pela terceira vez a mesma informação e roubaria a linha.
 */
function seloAoVivo(compacto = false) {
  return el("span", {
    class: "mp-live" + (compacto ? " mp-live--mini" : ""),
    children: [
      el("span", { class: "mp-live__pulse", attrs: { "aria-hidden": "true" } }),
      el("span", { text: compacto ? "ao vivo" : "acontecendo agora" }),
    ],
  });
}

/** Título da sessão: "Hoje, 16:00" / "Ontem, 20:30" / "24 de maio, 16:20". */
function tituloDaSessao(sessao, now) {
  if (!sessao || !sessao.inicioEm) return "Aula sem data";
  const dia = formatDiaRelativo(sessao.inicioEm, now);
  return `${dia}, ${formatHora(sessao.inicioEm)}`;
}

/**
 * Linha de contexto: duração + trocas de conversa. Nada de contagem de acertos.
 *
 * Na aula ao vivo o tempo é dado com os segundos (`6min05`), e não arredondado:
 * é o mesmo número que a régua da linha do tempo mostra na ponta, e ver "6 min"
 * em cima de "5min40" embaixo faria a tela parecer imprecisa justo enquanto ela
 * está sendo observada de perto.
 */
function metaDaSessao(sessao) {
  const partes = [
    sessao.emAndamento
      ? formatTempoNaAula(sessao.duracaoMs)
      : formatDuracao(sessao.duracaoMs),
  ];
  if (sessao.turnos > 0) {
    partes.push(
      `${sessao.turnos} ${sessao.turnos === 1 ? "troca de conversa" : "trocas de conversa"}`
    );
  }
  return partes.join(" · ");
}

/**
 * Matéria de cada tópico, pra colorir os chips. Sai dos próprios momentos (que já
 * vêm cruzados pelo servidor) — o site não adivinha a que matéria um assunto
 * pertence.
 * @returns {Map<string,string>} topico -> materia
 */
function materiaPorTopico(sessao) {
  const mapa = new Map();
  for (const m of sessao.momentos) {
    if (m.topico && m.materia && !mapa.has(m.topico)) mapa.set(m.topico, m.materia);
  }
  return mapa;
}

/** Chips dos assuntos da aula (tópicos; matérias quando não houve tópico fino). */
function chipsDeAssunto(sessao) {
  const porTopico = materiaPorTopico(sessao);
  const itens = sessao.topicos.length
    ? sessao.topicos.map((t) => ({ nome: t, materia: porTopico.get(t) || null }))
    : sessao.materias.map((m) => ({ nome: materiaLabel(m), materia: m }));

  if (!itens.length) return null;

  return el("div", {
    class: "mp-assuntos",
    children: itens.map((item) =>
      el("span", {
        class: "mp-assunto",
        attrs: { "data-materia": item.materia || "outros" },
        children: [
          el("span", {
            class: "mp-assunto__ico",
            svg: materiaIcon(item.materia),
            attrs: { "aria-hidden": "true" },
          }),
          el("span", { text: item.nome }),
        ],
      })
    ),
  });
}

/**
 * O destaque da tela — e ele responde DUAS perguntas que não são a mesma:
 *
 *   `assuntoMaisDificil` → O QUE REVER. Soma todo o atrito da aula por tópico
 *      (com peso por confiança da fonte, conta feita no servidor). É o que merece
 *      os cinco minutos do pai amanhã.
 *   `pontoDeAtrito` → QUANDO FOI. Ancora a linha do tempo, mas é o PRIMEIRO sinal
 *      da sessão, e o primeiro nem sempre é o que mais importou: uma travada
 *      isolada às 2min em frações pesa menos que quatro tropeços em mmc.
 *
 * Quando os dois apontam pro mesmo assunto (o caso comum), a segunda linha vira
 * só a hora — repetir o tópico dois parágrafos seguidos soaria a formulário.
 * Sem o assunto (histórico lido direto da tabela, que não guarda o derivado), o
 * bloco continua sendo o que sempre foi: o momento que mais importa.
 *
 * As frases são construídas SEM pronome e SEM o nome da criança de propósito — o
 * perfil não guarda gênero, e colar um nome numa frase que flexiona produziria
 * concordância errada na cara do pai. (Desde ago/2026 os próprios rótulos que
 * vinham no feminino já chegam neutros aqui: quem os troca é o
 * `ROTULOS_ACENTUADOS` do `mapa-api.js`, e o porquê está escrito lá.)
 */
function destaqueDoAtrito(sessao) {
  const momento = sessao.pontoDeAtrito;
  const assunto = sessao.assuntoMaisDificil;
  if (!momento && !assunto) return faixaTranquila(sessao);

  const ondeMomento =
    momento && (momento.topico || (momento.materia ? materiaLabel(momento.materia) : null));
  // O assunto a rever manda; sem ele, quem nomeia o alvo é o ponto de atrito.
  const alvo = (assunto && assunto.topico) || ondeMomento;

  const linhas = [];

  if (assunto) {
    linhas.push(
      el("p", {
        class: "mp-atrito__frase",
        children: [
          el("span", { text: "O que mais pediu ajuda nesta aula: " }),
          el("strong", { class: "mp-atrito__topico", text: assunto.topico }),
          el("span", { text: "." }),
        ],
      })
    );
  }

  if (momento) {
    const quando = formatTempoNaAula(momento.emMs);
    // Mesmo assunto nas duas leituras: a segunda linha só situa no tempo.
    const mesmoAssunto =
      assunto && ondeMomento && ondeMomento.toLowerCase() === assunto.topico.toLowerCase();
    let texto;
    if (!assunto) {
      texto = ondeMomento
        ? `Aos ${quando}, em ${ondeMomento} — ${momento.rotulo}.`
        : `Aos ${quando} — ${momento.rotulo}.`;
    } else if (mesmoAssunto) {
      texto = `A primeira vez foi aos ${quando}: ${momento.rotulo}.`;
    } else {
      texto = ondeMomento
        ? `O primeiro tropeço veio antes, aos ${quando}, em ${ondeMomento}: ${momento.rotulo}.`
        : `O primeiro tropeço veio aos ${quando}: ${momento.rotulo}.`;
    }
    linhas.push(el("p", { class: "mp-atrito__ancora", text: texto }));
  }

  // `ocorrencias` vira texto, nunca número: "voltou algumas vezes" diz o que o
  // pai precisa saber; "3 ocorrências" é placar com outro nome. E o `peso` do
  // payload não chega aqui — ele é ranking interno do servidor.
  if (assunto && assunto.ocorrencias >= 2) {
    linhas.push(
      el("p", {
        class: "mp-atrito__ancora",
        text: "Esse ponto voltou algumas vezes ao longo da conversa.",
      })
    );
  }

  const sugestao = alvo
    ? `Um bom assunto pra retomarem juntos hoje: cinco minutinhos sobre ${alvo} já ajudam bastante.`
    : "Vale puxar esse assunto de novo com calma numa próxima conversa.";

  return el("div", {
    class: "mp-atrito",
    children: [
      el("span", { class: "mp-atrito__ico", svg: ICON.heart, attrs: { "aria-hidden": "true" } }),
      el("div", {
        class: "mp-atrito__body",
        children: [
          el("span", {
            class: "mp-atrito__label",
            text: assunto ? "O que vale rever" : "O momento que mais importa",
          }),
          ...linhas,
          el("p", { class: "mp-atrito__acao", text: sugestao }),
        ],
      }),
    ],
  });
}

/**
 * Aula sem nenhum momento marcado. Isso é uma aula BOA: nenhuma hora em que a
 * Cogni precisou mudar de estratégia. Tem que parecer boa notícia, não bug.
 */
function faixaTranquila(sessao) {
  const assunto = sessao.topicos[0] || (sessao.materias[0] ? materiaLabel(sessao.materias[0]) : null);
  return el("div", {
    class: "mp-tranquila",
    children: [
      el("span", { class: "mp-tranquila__ico", svg: ICON.check, attrs: { "aria-hidden": "true" } }),
      el("div", {
        class: "mp-tranquila__body",
        children: [
          el("p", { class: "mp-tranquila__titulo", text: "A aula correu tranquila" }),
          el("p", {
            class: "mp-tranquila__texto",
            text: assunto
              ? `Nenhum momento de atrito nesta conversa sobre ${assunto} — a Cogni não precisou mudar de estratégia em nenhum minuto.`
              : "Nenhum momento de atrito nesta conversa — a Cogni não precisou mudar de estratégia em nenhum minuto.",
          }),
        ],
      }),
    ],
  });
}

/**
 * A linha do tempo em texto — a alternativa acessível ao desenho, e também o que
 * o pai lê no celular sem mirar num marcador de 14px.
 * @param {import('../mapa-api.js').Sessao} sessao
 */
function listaDeMomentos(sessao) {
  if (!sessao.momentos.length) return null;

  const lista = el("ol", {
    class: "mp-momentos",
    children: sessao.momentos.map((m, i) =>
      el("li", {
        class: "mp-momento",
        attrs: {
          "data-tom": m.tom,
          "data-tipo": m.tipo,
          "data-indice": String(i),
          tabindex: "-1", // recebe foco só por programa (clique num marcador)
        },
        children: [
          el("span", { class: "mp-momento__when", text: formatTempoNaAula(m.emMs) }),
          el("span", { class: "mp-momento__dot", attrs: { "aria-hidden": "true" } }),
          el("div", {
            class: "mp-momento__body",
            children: [
              el("span", { class: "mp-momento__what", text: m.rotulo }),
              m.topico || m.materia
                ? el("span", {
                    class: "mp-momento__where",
                    text: m.topico || materiaLabel(m.materia),
                  })
                : null,
            ],
          }),
        ],
      })
    ),
  });

  return el("div", {
    class: "mp-momentos-bloco",
    children: [
      el("h3", { class: "mp-subtitulo", text: "Momento a momento" }),
      lista,
    ],
  });
}

/**
 * Card da aula em destaque. Devolve também os ganchos que o modo ao vivo usa pra
 * atualizar sem repintar (ver `atualizarProgresso`).
 * @returns {{ node: HTMLElement, timeline: HTMLElement|null, meta: HTMLElement }}
 */
function cardDaSessao({ sessao, now, entradaAPartirDe }) {
  const meta = el("p", { class: "mp-sessao__meta", text: metaDaSessao(sessao) });

  const cabecalho = el("div", {
    class: "mp-sessao__head",
    children: [
      el("div", {
        class: "mp-sessao__heading",
        children: [
          el("h2", { class: "mp-sessao__titulo", text: tituloDaSessao(sessao, now) }),
          meta,
        ],
      }),
      sessao.emAndamento ? seloAoVivo() : null,
    ],
  });

  // Clicar num marcador leva o olho pro item correspondente da lista — é o que
  // dá sentido ao marcador no celular, onde não existe hover.
  let listaBloco = null;
  const timeline = buildTimeline({
    sessao,
    entradaAPartirDe,
    onSelecionar: (indice) => {
      if (!listaBloco) return;
      listaBloco.querySelectorAll(".mp-momento").forEach((li) => {
        li.classList.toggle("is-destacado", li.getAttribute("data-indice") === String(indice));
      });
      const alvo = listaBloco.querySelector(`.mp-momento[data-indice="${indice}"]`);
      if (alvo) {
        alvo.scrollIntoView({ behavior: "smooth", block: "nearest" });
        alvo.focus({ preventScroll: true });
      }
    },
  });
  listaBloco = listaDeMomentos(sessao);

  const node = el("article", {
    class: "dash-card mp-sessao" + (sessao.emAndamento ? " is-live" : ""),
    children: [
      cabecalho,
      el("div", {
        class: "mp-sessao__body",
        children: [
          chipsDeAssunto(sessao),
          destaqueDoAtrito(sessao),
          timeline,
          listaBloco,
        ],
      }),
    ],
  });

  return { node, timeline, meta };
}

/** Resumo curto de uma aula pro item do histórico (sem placar, sem sinal cru). */
function resumoDoItem(sessao) {
  if (sessao.pontoDeAtrito) {
    const onde = sessao.pontoDeAtrito.topico || materiaLabel(sessao.pontoDeAtrito.materia);
    return `${sessao.pontoDeAtrito.rotulo} · ${onde}`;
  }
  return "correu tranquila";
}

/**
 * Histórico: todas as aulas registradas, com a exibida em destaque marcada.
 * Some quando só existe uma aula (não há o que comparar).
 * @param {object} cfg
 * @param {import('../mapa-api.js').Sessao[]} cfg.sessoes
 * @param {string|null} cfg.chaveSelecionada
 * @param {(chave:string)=>void} cfg.onEscolher
 */
function blocoHistorico({ sessoes, chaveSelecionada, now, onEscolher }) {
  if (sessoes.length < 2) return null;


  return el("section", {
    class: "mp-bloco",
    children: [
      el("h2", {
        class: "mp-bloco__titulo",
        children: [
          el("span", { class: "mp-bloco__ico", svg: ICON.clock, attrs: { "aria-hidden": "true" } }),
          el("span", { text: "Aulas registradas" }),
        ],
      }),
      el("div", {
        class: "mp-hist",
        children: sessoes.map((s) => {
          const selecionada = s.chave === chaveSelecionada;
          const btn = el("button", {
            class: "mp-hist__item" + (selecionada ? " is-selecionada" : ""),
            attrs: {
              type: "button",
              "aria-pressed": selecionada ? "true" : "false",
              "data-tom": s.pontoDeAtrito ? s.pontoDeAtrito.tom : "bom",
            },
            children: [
              el("span", {
                class: "mp-hist__quando",
                children: [
                  el("span", { text: tituloDaSessao(s, now) }),
                  s.emAndamento ? seloAoVivo(true) : null,
                ],
              }),
              el("span", { class: "mp-hist__meta", text: metaDaSessao(s) }),
              el("span", { class: "mp-hist__resumo", text: resumoDoItem(s) }),
            ],
          });
          btn.addEventListener("click", () => onEscolher(s.chave));
          return btn;
        }),
      }),
    ],
  });
}

/**
 * Card do resumo em texto (IA). Começa em skeleton e nunca vira erro.
 * @returns {{ node: HTMLElement, aplicar: (texto: string|null) => void }}
 */
function cardResumo() {
  const corpo = el("div", {
    class: "mp-resumo__body",
    children: [
      el("span", { class: "mp-resumo__spinner", attrs: { "aria-hidden": "true" } }),
      el("p", { class: "mp-resumo__loading", text: "A Cogni está lendo o mapa da aula…" }),
    ],
  });

  const node = el("article", {
    class: "dash-card mp-resumo",
    children: [
      el("div", {
        class: "dash-card__head",
        children: [
          el("span", { class: "dash-card__head-ico", svg: ICON.bulb }),
          el("span", { class: "dash-card__head-title", text: "O que rolou nesta aula" }),
        ],
      }),
      corpo,
    ],
  });

  /**
   * @param {string|null} texto — null = servidor offline, IA indisponível ou aula
   *   nenhuma. Em todos esses casos a tela segue valendo pelo desenho, então o
   *   card sai de cena em vez de gritar erro.
   */
  function aplicar(texto) {
    if (!texto) {
      node.remove();
      return;
    }
    corpo.replaceChildren(el("p", { class: "mp-resumo__texto", text: texto }));
  }

  return { node, aplicar };
}

/** Estado inicial: ainda não há nenhuma aula registrada. Não é erro. */
function estadoSemAula(nome) {
  return el("div", {
    class: "dash-card mp-vazio",
    children: [
      el("span", { class: "mp-vazio__ico", svg: ICON.timeline, attrs: { "aria-hidden": "true" } }),
      el("h2", { class: "mp-vazio__titulo", text: "O mapa da primeira aula aparece aqui" }),
      el("p", {
        class: "mp-vazio__texto",
        text:
          `Quando ${nome} conversar alguns minutinhos com a Cogni, esta tela mostra a ` +
          "aula minuto a minuto: em que momento cada assunto entrou e onde a Cogni " +
          "precisou explicar de outro jeito.",
      }),
      el("p", {
        class: "mp-vazio__dica",
        text: "Com a câmera ligada, o mapa fica mais rico — é ela que percebe a hora de ajudar.",
      }),
    ],
  });
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */

export async function renderMapa(ctx) {
  const { crianca, servidorUrl, mock, now } = ctx;
  const nome = primeiroNome(crianca && crianca.nome) || "a criança";

  const root = sectionRoot("mapa");
  root.classList.add("dash-mapa");

  const seloTopo = el("div", { class: "mp-topo-selo" });
  const head = pageHead({
    title: "Mapa da aula",
    subtitle:
      `Não é só quanto tempo ${nome} estudou: é em que minuto cada assunto entrou ` +
      "e onde a Cogni precisou dar mais apoio.",
    action: seloTopo,
  });
  root.appendChild(head);

  // Região viva: anuncia o momento NOVO no leitor de tela sem reler o card
  // inteiro a cada 10 segundos. É o equivalente sonoro do marcador que aparece.
  const anuncio = el("p", {
    class: "sr-only",
    attrs: { "aria-live": "polite", "aria-atomic": "true" },
  });

  const resumoHost = el("div", { class: "mp-resumo-host" });
  const sessaoHost = el("div", { class: "mp-sessao-host" });
  const historicoHost = el("div", { class: "mp-hist-host" });
  root.append(anuncio, resumoHost, sessaoHost, historicoHost);

  /* ---- Estado local da seção ------------------------------------------- */

  /** @type {import('../mapa-api.js').Sessao[]} */
  let sessoes = [];
  let emAndamento = false;
  let aoVivoDisponivel = false;
  /** Aula exibida em destaque (`Sessao.chave`). Null = sempre a mais recente. */
  let chaveSelecionada = null;
  /** Ganchos do card em destaque, pra atualizar ao vivo sem repintar. */
  let cardAtual = null;
  /** Retrato do que já está pintado — o que decide repintar ou só reposicionar. */
  let pintado = { chave: null, momentos: 0, sessoes: 0 };
  let timer = null;

  const sessaoExibida = () =>
    sessoes.find((s) => s.chave === chaveSelecionada) || sessoes[0] || null;

  /* ---- Pintura ---------------------------------------------------------- */

  function pintar({ animarNovos = false } = {}) {
    // `replaceChildren(null)` escreveria o texto "null" na tela: sem selo, o
    // argumento tem que simplesmente não existir.
    if (emAndamento) seloTopo.replaceChildren(seloAoVivo());
    else seloTopo.replaceChildren();

    const sessao = sessaoExibida();
    if (!sessao) {
      cardAtual = null;
      pintado = { chave: null, momentos: 0, sessoes: 0 };
      sessaoHost.replaceChildren(estadoSemAula(nome));
      historicoHost.replaceChildren();
      return;
    }

    // Só os momentos que chegaram desde o último render entram animados: piscar a
    // linha inteira a cada tick cansaria a vista sem informar nada.
    const entradaAPartirDe = animarNovos ? pintado.momentos : Infinity;
    cardAtual = cardDaSessao({ sessao, now, entradaAPartirDe });
    sessaoHost.replaceChildren(cardAtual.node);

    const historico = blocoHistorico({
      sessoes,
      chaveSelecionada: sessao.chave,
      now,
      onEscolher: (chave) => {
        chaveSelecionada = chave;
        pintar();
      },
    });
    if (historico) historicoHost.replaceChildren(historico);
    else historicoHost.replaceChildren();

    pintado = {
      chave: sessao.chave,
      momentos: sessao.momentos.length,
      sessoes: sessoes.length,
    };
  }

  /**
   * Modo ao vivo, caso barato: nada de novo aconteceu, só o relógio andou. Move as
   * posições e o texto de duração sem tocar na árvore — o marcador que estava sob
   * o dedo (ou com foco) continua lá.
   */
  function atualizarProgresso(sessao) {
    if (!cardAtual) return;
    cardAtual.meta.textContent = metaDaSessao(sessao);
    reposicionarMarcadores(cardAtual.timeline, sessao.duracaoMs);
  }

  /* ---- Carregamento ----------------------------------------------------- */

  /**
   * Aplica um mapa recém-carregado. Decide sozinho entre repintar (mudou a
   * estrutura da tela) e só mexer nas posições (só o tempo andou).
   * @returns {boolean} true se a aula ao vivo TERMINOU neste ciclo
   */
  function aplicar(mapa) {
    const estavaAoVivo = emAndamento;

    sessoes = mapa.sessoes;
    emAndamento = mapa.emAndamento;
    aoVivoDisponivel = mapa.aoVivoDisponivel;

    // O pai pode ter escolhido uma aula antiga pra olhar: respeitamos a escolha
    // dele, mesmo com aula nova entrando. Só reancoramos se ela sumiu da lista.
    if (chaveSelecionada && !sessoes.some((s) => s.chave === chaveSelecionada)) {
      chaveSelecionada = null;
    }

    const sessao = sessaoExibida();
    const mesmaSessao = !!sessao && sessao.chave === pintado.chave;
    const soAndouORelogio =
      mesmaSessao &&
      sessao.emAndamento &&
      sessao.momentos.length === pintado.momentos &&
      sessoes.length === pintado.sessoes;

    if (soAndouORelogio) {
      atualizarProgresso(sessao);
    } else {
      const momentosNovos = mesmaSessao && sessao.momentos.length > pintado.momentos;
      const ultimo = momentosNovos ? sessao.momentos[sessao.momentos.length - 1] : null;
      pintar({ animarNovos: mesmaSessao });
      if (ultimo) anuncio.textContent = `Novo momento na aula. ${descreverMomento(ultimo)}`;
    }

    return estavaAoVivo && !emAndamento;
  }

  /** Intervalo do próximo tick, conforme o que está acontecendo agora. */
  function proximoIntervalo() {
    if (emAndamento) return POLL_AO_VIVO_MS;
    return aoVivoDisponivel ? POLL_ESPERA_MS : POLL_SEM_SERVIDOR_MS;
  }

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(tick, proximoIntervalo());
  }

  async function tick() {
    // A seção saiu da tela (o router trocou de rota): o timer morre com ela. É o
    // jeito de não vazar poll sem precisar de um hook de destruição no router.
    if (!document.contains(root)) return;

    // Aba em segundo plano não precisa de mapa novo — economiza rede e bateria do
    // celular, que é justamente onde o pai abre isso.
    if (document.hidden) {
      agendar();
      return;
    }

    try {
      const mapa = await carregarMapa({ servidorUrl, crianca, mock });
      if (!document.contains(root)) return;
      const terminou = aplicar(mapa);
      // A aula acabou de fechar: vale UM resumo novo (agora ele fala da aula
      // inteira, não de metade dela). Fora isso, o texto não é regerado no poll —
      // é endpoint de IA, com rate limit.
      if (terminou) buscarResumo();
    } catch (err) {
      console.debug("[Companion] Mapa da aula: ciclo ao vivo falhou.", err);
    }
    agendar();
  }

  let resumoCard = null;
  function buscarResumo() {
    if (!crianca || !crianca.id) return;
    const card = cardResumo();
    resumoCard = card;
    resumoHost.replaceChildren(card.node);
    carregarResumoDaAula(servidorUrl, crianca.id).then((texto) => {
      // Uma resposta antiga não pode sobrescrever um card mais novo.
      if (resumoCard === card && document.contains(root)) card.aplicar(texto);
    });
  }

  /* ---- Primeiro carregamento (bloqueia o render, como as outras seções) -- */

  const mapa = await carregarMapa({ servidorUrl, crianca, mock });
  aplicar(mapa);

  // Só pedimos o texto quando há aula pra resumir — o endpoint passa por rate
  // limit de IA e não faz sentido gastá-lo com "sem_sessao".
  if (sessoes.length) buscarResumo();

  agendar();

  return root;
}
