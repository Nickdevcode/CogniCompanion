/**
 * aprendizado.js — Seção "Aprendizado".
 *
 * Painel de progresso, DERIVADO das conversas (a "chave de ouro" do doc:
 * somar duracao_ms por matéria e por dia resolve tempo/matéria + gráfico):
 *   - Cards de tempo por matéria (top matérias)
 *   - Tópicos explorados (chips)
 *   - Gráfico de evolução (min/dia) em SVG, com toggle Semanal/Mensal
 *   - Dicas da Cogni: dica atual (IA, /api/dica) + histórico (tabela `dicas`)
 *   - Contadores (sem conquistas)
 *
 * Sem conquistas (anulado). O 4º contador vira "Matérias" no lugar.
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon } from "../icons.js";
import { buildLineChart } from "../linechart.js";
import { resolverDicaAtual } from "../dica.js";
import {
  MATERIAS,
  materiaLabel,
  formatDuracao,
  formatMinutos,
  formatHora,
  formatDiaRelativo,
  tempoPorMateria,
  tempoPorDia,
  tempoTotal,
  dayKey,
  primeiroNome,
} from "../format.js";

/* --------------------------------------------------------------------------
   Derivações de dados
   -------------------------------------------------------------------------- */

/** Top matérias por tempo (ms), já com rótulo e minutos. */
function topMaterias(conversas, limite = 4) {
  const mapa = tempoPorMateria(conversas);
  return MATERIAS.map((m) => ({ materia: m, ms: mapa.get(m) || 0 }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limite);
}

/**
 * Série diária (min/dia) dos últimos N dias a partir do "agora".
 * @returns {Array<{label:string, value:number, key:string}>}
 */
function serieDiaria(conversas, now, dias = 7) {
  const porDia = tempoPorDia(conversas); // key -> ms
  const nomesDia = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const out = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const ms = porDia.get(k) || 0;
    out.push({
      key: k,
      label: nomesDia[d.getDay()],
      value: Math.round(ms / 60000), // minutos
    });
  }
  return out;
}

/**
 * Série semanal (min/semana) das últimas N semanas — usada no modo "Mensal".
 * @returns {Array<{label:string, value:number}>}
 */
function serieSemanal(conversas, now, semanas = 4) {
  const out = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const fim = new Date(now);
    fim.setDate(fim.getDate() - i * 7);
    const ini = new Date(fim);
    ini.setDate(ini.getDate() - 6);
    const ms = conversas
      .filter((c) => {
        const t = new Date(c.criado_em);
        return t >= ini && t <= fim;
      })
      .reduce((s, c) => s + (Number(c.duracao_ms) || 0), 0);
    out.push({
      label: i === 0 ? "Esta" : `S-${i}`,
      value: Math.round(ms / 60000),
    });
  }
  return out;
}

/**
 * Tópicos explorados: `topico` DISTINTOS (não-nulos), preservando a matéria
 * de origem (1ª ocorrência) pra colorir o chip. Mais recentes primeiro.
 * @returns {Array<{nome:string, materia:string}>}
 */
function topicosExplorados(conversas, limite = 8) {
  const vistos = new Map(); // topico -> materia
  for (const c of conversas) {
    const t = (c.topico || "").trim();
    if (!t) continue; // null/vazio = papo sem assunto → ignora
    if (!vistos.has(t)) vistos.set(t, c.materia || "outros");
  }
  return Array.from(vistos, ([nome, materia]) => ({ nome, materia })).slice(
    0,
    limite
  );
}

/* --------------------------------------------------------------------------
   Componentes de UI
   -------------------------------------------------------------------------- */

/** Card de uma matéria: ícone colorido + nome + tempo dedicado. */
function cardMateria({ materia, ms }) {
  return el("article", {
    class: "ap-mat",
    attrs: { "data-materia": materia },
    children: [
      el("span", { class: "ap-mat__accent", attrs: { "aria-hidden": "true" } }),
      el("span", {
        class: "ap-mat__ico",
        children: [el("span", { svg: materiaIcon(materia) })],
      }),
      el("div", {
        class: "ap-mat__info",
        children: [
          el("h3", { class: "ap-mat__name", text: materiaLabel(materia) }),
          el("div", {
            class: "ap-mat__time",
            children: [
              el("span", { class: "ap-mat__time-ico", svg: ICON.clock }),
              el("span", { text: formatDuracao(ms) }),
            ],
          }),
          el("span", { class: "ap-mat__label", text: "Tempo dedicado" }),
        ],
      }),
    ],
  });
}

/** Chip de tópico explorado (com check). */
function chipTopico(topico) {
  return el("span", {
    class: "ap-topic",
    attrs: { "data-materia": topico.materia },
    children: [
      el("span", { class: "ap-topic__ico", svg: materiaIcon(topico.materia) }),
      el("span", { class: "ap-topic__name", text: topico.nome }),
      el("span", { class: "ap-topic__check", svg: ICON.check }),
    ],
  });
}

/** Item do histórico de dicas: texto + quando foi gerada (relativo). */
function itemDica(dica, now) {
  const quando = `${formatDiaRelativo(dica.criado_em, now)}, ${formatHora(
    dica.criado_em
  )}`;
  return el("div", {
    class: "ap-dica",
    children: [
      el("span", { class: "ap-dica__ico", svg: ICON.bulb }),
      el("div", {
        class: "ap-dica__body",
        children: [
          el("p", { class: "ap-dica__text", text: dica.texto }),
          el("span", { class: "ap-dica__time", text: quando }),
        ],
      }),
    ],
  });
}

/**
 * Card "Dicas da Cogni": dica ATUAL em destaque + HISTÓRICO (tabela `dicas`, mais
 * recentes primeiro). A dica atual tem fonte ESTÁVEL (igual ao Resumo Semanal): a
 * última linha de `dicas` aparece na hora — mesmo com o robô offline — e o endpoint
 * /api/dica só refresca quando o servidor está ligado. Enquanto carrega, mostra
 * placeholders e a tela nunca quebra. A dica atual costuma coincidir com a 1ª do
 * histórico — nesse caso ela é omitida da lista pra não duplicar.
 * @param {{ servidorUrl:string, crianca:object, now:Date, dicas:Array<object>, mock:object }} cfg
 */
function cardDicasCogni({ servidorUrl, crianca, now, dicas, mock }) {
  // Destaque: a dica atual (placeholder até o /api/dica responder).
  const atualTexto = el("p", {
    class: "ap-dica-now__text",
    text: "A Cogni está preparando uma dica pra você…",
  });
  const destaque = el("div", {
    class: "ap-dica-now",
    children: [
      el("span", { class: "ap-dica-now__ico", svg: ICON.bulb }),
      el("div", {
        class: "ap-dica-now__body",
        children: [
          el("span", { class: "ap-dica-now__label", text: "Dica de agora" }),
          atualTexto,
        ],
      }),
    ],
  });

  // Histórico: lista rolável (cabe na coluna estreita ao lado do gráfico).
  const lista = el("div", { class: "ap-dicas__list" });
  const host = el("div", { class: "ap-dicas__scroll", children: [lista] });

  /** Renderiza a lista do histórico, omitindo a que repete a dica atual. */
  function pintarHistorico(historico, atual) {
    const norm = (s) => (s || "").trim();
    const itens = historico.filter((d) => norm(d.texto) !== norm(atual));
    lista.replaceChildren(
      ...(itens.length
        ? itens.map((d) => itemDica(d, now))
        : [
            el("p", {
              class: "ap-empty",
              text: "As próximas dicas da Cogni aparecerão aqui.",
            }),
          ])
    );
  }

  // Pinta o histórico já recebido; ao resolver a dica atual, repinta (pra dedup).
  // A dica atual vem da fonte estável (tabela + endpoint refresca), igual ao topo
  // do histórico — então o destaque bate com `dicas[0]` mesmo com o robô offline.
  //
  // Na 1ª pintura já omitimos `dicas[0]` (a candidata a virar destaque), em vez de
  // passar `null`: do contrário a dica mais recente apareceria por um instante na
  // LISTA e depois saltaria pro destaque amarelo — a "piscada". Quando a dica atual
  // resolve (caso raro de o endpoint trazer outra), repintamos com o texto real.
  const provavelAtual = dicas.length ? dicas[0].texto : null;
  pintarHistorico(dicas, provavelAtual);
  resolverDicaAtual({ servidorUrl, crianca, mock }).then((textoAtual) => {
    atualTexto.textContent = textoAtual;
    pintarHistorico(dicas, textoAtual);
  });

  return el("article", {
    class: "dash-card ap-dicas",
    children: [
      el("div", {
        class: "ap-dicas__head",
        children: [
          el("h2", { class: "ap-dicas__title", text: "Dicas da Cogni" }),
          el("span", { class: "ap-dicas__ico", svg: ICON.bulb }),
        ],
      }),
      destaque,
      host,
    ],
  });
}

/** Contador do rodapé. */
function contador(valor, rotulo, iconSvg) {
  return el("div", {
    class: "ap-stat",
    children: [
      el("span", { class: "ap-stat__ico", svg: iconSvg }),
      el("div", {
        class: "ap-stat__body",
        children: [
          el("span", { class: "ap-stat__value", text: String(valor) }),
          el("span", { class: "ap-stat__label", text: rotulo }),
        ],
      }),
    ],
  });
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */

export async function renderAprendizado(ctx) {
  const root = sectionRoot("aprendizado");
  const nome = primeiroNome(ctx.crianca && ctx.crianca.nome) || "a criança";

  const head = pageHead({
    title: "Painel de aprendizado",
    subtitle: `Acompanhe o progresso do ${nome} e veja como ele está aprendendo com a Cogni.`,
  });
  head.appendChild(
    el("img", {
      class: "ap-mascot",
      attrs: {
        src: "assets/images/dash-robot-aprendizado.png",
        alt: "",
        "aria-hidden": "true",
        loading: "lazy",
      },
    })
  );
  root.appendChild(head);

  const [conversas, dicas] = await Promise.all([
    ctx.mock.getConversas(),
    ctx.mock.getDicas(),
  ]);

  // Janela da semana (usada pelos contadores do rodapé).
  const semana = weekWindow(conversas, ctx.now);

  /* ---- Cards de matéria ---- */
  const mats = topMaterias(conversas, 4);
  const matsGrid = el("div", {
    class: "ap-mats",
    children: mats.map(cardMateria),
  });
  root.appendChild(matsGrid);

  /* ---- Tópicos explorados ---- */
  const topicosHead = el("div", {
    class: "ap-section-head",
    children: [
      el("h2", {
        class: "ap-section-head__title",
        children: [
          el("span", { class: "ap-section-head__ico", svg: ICON.book }),
          el("span", { text: "Tópicos explorados" }),
        ],
      }),
    ],
  });
  // Tópicos = `topico` distintos (não-nulos) das conversas.
  const listaTopicos = topicosExplorados(conversas, 8);
  const topicos = el("div", {
    class: "ap-topics",
    children: listaTopicos.length
      ? listaTopicos.map(chipTopico)
      : [
          el("p", {
            class: "ap-empty",
            text: "Os assuntos que a criança explorar aparecerão aqui.",
          }),
        ],
  });
  root.appendChild(
    el("section", {
      class: "ap-block",
      children: [topicosHead, topicos],
    })
  );

  /* ---- Gráfico de evolução + Curiosidades (grid 2 col) ---- */
  // Card do gráfico, com toggle Semanal/Mensal.
  const chartHost = el("div", { class: "ap-chart__canvas" });
  const resumoFaixa = el("div", { class: "ap-chart__note" });

  function renderChart(modo) {
    const serie =
      modo === "mensal"
        ? serieSemanal(conversas, ctx.now, 4)
        : serieDiaria(conversas, ctx.now, 7);
    chartHost.replaceChildren(
      buildLineChart({
        points: serie,
        formatValue: (v) => `${v}min`,
        ariaLabel:
          modo === "mensal"
            ? "Minutos de estudo por semana"
            : "Minutos de estudo por dia da semana",
      })
    );
    const total =
      modo === "mensal"
        ? serie.reduce((s, p) => s + p.value, 0)
        : Math.round(tempoTotal(weekWindow(conversas, ctx.now)) / 60000);
    resumoFaixa.replaceChildren(
      el("span", { class: "ap-chart__note-ico", svg: ICON.chart }),
      el("p", {
        text:
          modo === "mensal"
            ? `Nas últimas 4 semanas, ${nome} estudou ${formatMinutos(total)}.`
            : `Muito bem! ${nome} dedicou ${formatMinutos(total)} aos estudos essa semana.`,
      })
    );
  }

  const segWeek = el("button", {
    class: "ap-seg__btn is-active",
    attrs: { type: "button" },
    text: "Semanal",
  });
  const segMonth = el("button", {
    class: "ap-seg__btn",
    attrs: { type: "button" },
    text: "Mensal",
  });
  segWeek.addEventListener("click", () => {
    segWeek.classList.add("is-active");
    segMonth.classList.remove("is-active");
    renderChart("semanal");
  });
  segMonth.addEventListener("click", () => {
    segMonth.classList.add("is-active");
    segWeek.classList.remove("is-active");
    renderChart("mensal");
  });

  const chartCard = el("article", {
    class: "dash-card ap-chart",
    children: [
      el("div", {
        class: "ap-chart__head",
        children: [
          el("h2", { class: "ap-chart__title", text: "Evolução" }),
          el("div", {
            class: "ap-seg",
            children: [segWeek, segMonth],
          }),
        ],
      }),
      chartHost,
      resumoFaixa,
    ],
  });

  // Card "Dicas da Cogni": dica atual (servidor) + histórico (tabela `dicas`).
  // Substitui o antigo bloco de curiosidades. Busca a dica atual sozinho.
  const dicasCard = cardDicasCogni({
    servidorUrl: ctx.servidorUrl,
    crianca: ctx.crianca,
    now: ctx.now,
    dicas,
    mock: ctx.mock,
  });

  root.appendChild(
    el("div", {
      class: "ap-grid",
      children: [chartCard, dicasCard],
    })
  );

  renderChart("semanal");

  /* ---- Contadores do rodapé (janela da semana) ---- */
  const nConversas = semana.length;
  // Tópicos distintos (não-nulos) explorados na semana.
  const nTopicos = new Set(
    semana.map((c) => (c.topico || "").trim()).filter(Boolean)
  ).size;
  const nMaterias = new Set(semana.map((c) => c.materia)).size;
  const tempoSemana = formatDuracao(tempoTotal(semana));

  root.appendChild(
    el("div", {
      class: "ap-stats",
      children: [
        contador(nConversas, "Conversas essa semana", ICON.chat),
        contador(nTopicos, "Tópicos explorados", ICON.book),
        contador(nMaterias, "Matérias exploradas", ICON.chart),
        contador(tempoSemana, "Tempo total essa semana", ICON.clock),
      ],
    })
  );

  return root;
}

/** Conversas dos últimos 7 dias a partir do "agora". */
function weekWindow(conversas, now) {
  const limite = new Date(now);
  limite.setDate(limite.getDate() - 7);
  return conversas.filter((c) => new Date(c.criado_em) >= limite);
}
