/**
 * aprendizado.js — Seção "Aprendizado".
 *
 * Painel de progresso, DERIVADO das conversas (a "chave de ouro" do doc:
 * somar duracao_ms por matéria e por dia resolve tempo/matéria + gráfico):
 *   - Cards de tempo por matéria (top matérias)
 *   - Trilha de aprendizado (o student model: `criancas.progresso`)
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
  formatQuandoVisto,
  formatQuandoRevisar,
  tempoPorMateria,
  tempoPorDia,
  tempoTotal,
  dayKey,
  primeiroNome,
  sujeito,
  capitalizar,
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
   Trilha de aprendizado (`criancas.progresso`)

   O servidor registra, a cada conversa, o que a criança estudou e como se saiu,
   pra retomar o assunto dias depois (prática espaçada). O site só LÊ essa coluna
   — quem escreve é o servidor (ver o contrato em docs/COMPANION-PLANO-TECNICO.md
   e a allowlist EDITAVEIS em supabase-data.js).

   ⚠️ Tom: `travou` é rótulo INTERNO e nunca chega à tela. Pro pai isto é apoio
   ("está praticando", "precisa de reforço"), nunca boletim, nota ou ranking — o
   mesmo cuidado que o robô já aplica ao falar com a criança.
   -------------------------------------------------------------------------- */

/** Valores de `progresso[].status` gravados pelo servidor (uso interno). */
const STATUS_REFORCO = "travou";
const STATUS_ACERTOU = "aprendeu";

/** Acertos seguidos a partir dos quais o conceito conta como consolidado. */
const ACERTOS_DOMINIO = 2;

/** Itens por coluna: a tela é um recorte acionável, não um histórico. */
const MAX_TRILHA = 5;

/**
 * Faixa do `nivel` — a dificuldade calibrada do PRÓXIMO exercício daquele
 * conceito. Espelha o servidor (`pratica.js`: NIVEL_MIN/NIVEL_MAX): todo
 * conceito começa no 1, sobe só quando a criança acerta de primeira (sem pista)
 * e desce quando ela trava.
 */
const NIVEL_MIN = 1;
const NIVEL_MAX = 3;

/** Timestamp numérico tolerante (data inválida/ausente vira 0, nunca NaN). */
function ts(valor) {
  const t = Date.parse(valor);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Nível saneado (1 a 3). Itens gravados antes do ciclo de prática não têm o
 * campo, e o jsonb é livre — ausente, sujo ou fora da faixa vira o piso, o mesmo
 * que o servidor faz ao ler a trilha.
 */
function normalizarNivel(valor) {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n)) return NIVEL_MIN;
  return Math.min(Math.max(n, NIVEL_MIN), NIVEL_MAX);
}

/**
 * Saneia um item cru do jsonb. A coluna é escrita pelo servidor, mas é jsonb
 * livre: um item malformado não pode derrubar a seção inteira.
 * @returns {object|null} o item normalizado, ou null se não der pra usar
 */
function normalizarItemTrilha(item) {
  if (!item || typeof item !== "object") return null;
  const conceito = String(item.conceito || "").trim();
  if (!conceito) return null;
  if (item.status !== STATUS_REFORCO && item.status !== STATUS_ACERTOU) return null;
  return {
    conceito,
    materia: MATERIAS.includes(item.materia) ? item.materia : "outros",
    status: item.status,
    acertos: Number(item.acertos) || 0,
    vezes: Number(item.vezes) || 0,
    nivel: normalizarNivel(item.nivel),
    visto: item.visto || null,
    proxima: item.proxima || null,
  };
}

/**
 * Separa a trilha nas duas leituras que interessam ao pai.
 *
 * "Praticando" junta o que ela travou E o que acertou uma vez só: os dois ainda
 * estão em construção, e deixar o de 1 acerto fora das duas listas faria o tema
 * sumir da tela sem explicação.
 *
 * @param {object|null} crianca — linha de `criancas` (usa `progresso`)
 * @returns {{praticando: Array<object>, dominados: Array<object>, total: number}}
 */
function trilhaAprendizado(crianca) {
  const bruto =
    crianca && Array.isArray(crianca.progresso) ? crianca.progresso : [];
  const itens = bruto.map(normalizarItemTrilha).filter(Boolean);

  const praticando = [];
  const dominados = [];
  for (const it of itens) {
    if (it.status === STATUS_ACERTOU && it.acertos >= ACERTOS_DOMINIO) {
      dominados.push(it);
    } else {
      praticando.push(it);
    }
  }

  // Praticando: quem precisa de reforço vem primeiro (é o mais acionável), e
  // dentro de cada grupo o visto mais recentemente.
  praticando.sort((a, b) => {
    if (a.status !== b.status) return a.status === STATUS_REFORCO ? -1 : 1;
    return ts(b.visto) - ts(a.visto);
  });
  // Dominados: o mais consolidado primeiro; empate desempata pelo mais recente.
  dominados.sort((a, b) => b.acertos - a.acertos || ts(b.visto) - ts(a.visto));

  return { praticando, dominados, total: itens.length };
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
      el("span", { class: "ap-topic__name", text: capitalizar(topico.nome) }),
      el("span", { class: "ap-topic__check", svg: ICON.check }),
    ],
  });
}

/**
 * Item da trilha: ícone da matéria + conceito + selo + linha de contexto.
 * @param {object} item — item já normalizado por `normalizarItemTrilha`
 * @param {{now: Date, dominado: boolean}} cfg
 */
function itemTrilha(item, { now, dominado }) {
  // Selo curto. Nada de "travou"/"errou": o pai lê apoio, não diagnóstico.
  const selo = dominado
    ? null
    : item.status === STATUS_REFORCO
    ? { texto: "Precisa de reforço", tom: "reforco" }
    : { texto: "Quase lá", tom: "quase" };

  // "Subiu de nível": a evidência mais direta de progresso conferido por código
  // (a criança está resolvendo exercícios mais duros do MESMO assunto), já que o
  // nível só sobe quando ela acerta de primeira, sem pista.
  //
  // Só entra quando o último veredito foi BOM, e por um motivo concreto: `nivel`
  // é um retrato do presente, não um evento — não há "nível anterior" no jsonb —,
  // e travar DERRUBA o nível. Num item em reforço, um nível 2 significa que ela
  // acabou de CAIR do 3; anunciar "subiu de nível" ali descreveria justamente o
  // que deixou de valer. Em "Já domina" também não aparece: lá a linha já fala em
  // acertos seguidos, e empilhar mais um selo transformaria o card num placar.
  const subiuDeNivel =
    !dominado && item.status === STATUS_ACERTOU && item.nivel > NIVEL_MIN;

  const partes = [materiaLabel(item.materia)];
  if (dominado) {
    partes.push(`${item.acertos} acertos seguidos`);
    const quando = formatQuandoVisto(item.visto, now);
    if (quando) partes.push(`visto ${quando}`);
  } else {
    const quando = formatQuandoVisto(item.visto, now);
    if (quando) partes.push(`visto ${quando}`);
    const revisao = formatQuandoRevisar(item.proxima, now);
    if (revisao) partes.push(`a Cogni retoma ${revisao}`);
  }

  const topo = el("div", {
    class: "ap-titem__top",
    children: [
      el("span", { class: "ap-titem__name", text: capitalizar(item.conceito) }),
      selo
        ? el("span", {
            class: "ap-titem__selo",
            attrs: { "data-tom": selo.tom },
            text: selo.texto,
          })
        : null,
      subiuDeNivel
        ? el("span", {
            class: "ap-titem__selo",
            attrs: {
              "data-tom": "nivel",
              // Complementa sem ser essencial: quem só lê a pílula continua
              // entendendo a linha. Explica o que "nível" quer dizer aqui, que
              // pro pai não é óbvio.
              title: `A Cogni já propõe exercícios mais difíceis de ${item.conceito}.`,
            },
            children: [
              el("span", {
                class: "ap-titem__selo-ico",
                svg: ICON.arrowUp,
                attrs: { "aria-hidden": "true" },
              }),
              el("span", { text: "Subiu de nível" }),
            ],
          })
        : null,
    ],
  });

  return el("li", {
    class: "ap-titem",
    attrs: { "data-materia": item.materia },
    children: [
      el("span", {
        class: "ap-titem__ico",
        svg: dominado ? ICON.check : materiaIcon(item.materia),
        attrs: { "aria-hidden": "true" },
      }),
      el("div", {
        class: "ap-titem__body",
        children: [
          topo,
          el("span", { class: "ap-titem__meta", text: partes.join(" · ") }),
        ],
      }),
    ],
  });
}

/**
 * Card de uma coluna da trilha (Praticando / Já domina).
 * @param {{titulo:string, subtitulo:string, iconSvg:string, variante:string,
 *   itens:Array<object>, vazio:string, now:Date, dominado:boolean}} cfg
 */
function cardTrilha({ titulo, subtitulo, iconSvg, variante, itens, vazio, now, dominado }) {
  const lista = itens.length
    ? el("ul", {
        class: "ap-tlist",
        children: itens
          .slice(0, MAX_TRILHA)
          .map((it) => itemTrilha(it, { now, dominado })),
      })
    : el("p", { class: "ap-empty", text: vazio });

  return el("article", {
    class: `dash-card ap-tcard ap-tcard--${variante}`,
    children: [
      el("div", {
        class: "ap-tcard__head",
        children: [
          el("span", { class: "ap-tcard__ico", svg: iconSvg, attrs: { "aria-hidden": "true" } }),
          el("div", {
            class: "ap-tcard__heading",
            children: [
              el("h3", { class: "ap-tcard__title", text: titulo }),
              el("p", { class: "ap-tcard__sub", text: subtitulo }),
            ],
          }),
        ],
      }),
      lista,
    ],
  });
}

/**
 * Bloco "Trilha de aprendizado": o que a criança está praticando e o que já
 * domina, a partir de `criancas.progresso` (read-only pro site).
 *
 * Sempre renderiza — inclusive vazio — porque a explicação do que vai aparecer
 * ali é, ela mesma, informação útil pro pai que acabou de parear.
 *
 * @param {{crianca: object|null, nome: string, now: Date}} cfg
 * @returns {HTMLElement}
 */
function blocoTrilha({ crianca, nome, now }) {
  const { praticando, dominados, total } = trilhaAprendizado(crianca);

  const head = el("div", {
    class: "ap-section-head ap-section-head--stack",
    children: [
      el("h2", {
        class: "ap-section-head__title",
        children: [
          el("span", { class: "ap-section-head__ico", svg: ICON.sprout }),
          el("span", { text: "Trilha de aprendizado" }),
        ],
      }),
      el("p", {
        class: "ap-section-head__note",
        text: total
          ? `Não é nota: é o que a Cogni guarda pra retomar com ${nome} nos próximos dias.`
          : `Conforme ${nome} estuda, a Cogni anota os assuntos aqui pra retomá-los depois.`,
      }),
    ],
  });

  return el("section", {
    class: "ap-block",
    children: [
      head,
      el("div", {
        class: "ap-trilha",
        children: [
          cardTrilha({
            titulo: "Praticando agora",
            subtitulo: "Assuntos que a Cogni vai reforçar",
            iconSvg: ICON.sprout,
            variante: "praticando",
            itens: praticando,
            vazio: total
              ? "Nada pendente de reforço no momento. 🎉"
              : "Quando a Cogni ajudar num assunto, ele fica listado aqui.",
            now,
            dominado: false,
          }),
          cardTrilha({
            titulo: "Já domina",
            subtitulo: "Acertou mais de uma vez sem ajuda",
            iconSvg: ICON.check,
            variante: "dominou",
            itens: dominados,
            vazio: "Assim que um assunto for dominado, ele aparece aqui.",
            now,
            dominado: true,
          }),
        ],
      }),
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
              text: "As dicas anteriores ficam guardadas aqui.",
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
  const primeiro = primeiroNome(ctx.crianca && ctx.crianca.nome);
  const nome = sujeito(primeiro);

  const head = pageHead({
    title: "Aprendizado",
    // Sem "ele": o perfil não guarda gênero. E sem "acompanhe o progresso", que é
    // a frase que qualquer painel do mundo escreveria — esta diz o que TEM na tela.
    subtitle: `Quanto tempo, em quê, e o que a Cogni já marcou pra retomar com ${nome}.`,
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

  const [conversas, dicas, criancaFresca] = await Promise.all([
    ctx.mock.getConversas(),
    ctx.mock.getDicas(),
    // A trilha muda a cada conversa do robô, então relemos o perfil em vez de
    // usar o `ctx.crianca` do boot do painel (que pode ter horas de idade). Se a
    // leitura falhar, caímos no do boot — a trilha some, o resto da tela não.
    ctx.mock.getCrianca().catch((e) => {
      console.debug("[Companion] Trilha: releitura do perfil falhou.", e);
      return null;
    }),
  ]);
  const crianca = criancaFresca || ctx.crianca;

  // Janela da semana (usada pelos contadores do rodapé).
  const semana = weekWindow(conversas, ctx.now);

  /* ---- Cards de matéria ---- */
  const mats = topMaterias(conversas, 4);
  root.appendChild(
    mats.length
      ? el("div", { class: "ap-mats", children: mats.map(cardMateria) })
      : el("p", {
          class: "ap-empty ap-empty--lead",
          text: `O tempo por matéria aparece aqui assim que ${nome} conversar com a Cogni.`,
        })
  );

  /* ---- Trilha de aprendizado (criancas.progresso — read-only) ---- */
  root.appendChild(blocoTrilha({ crianca, nome, now: ctx.now }));

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
            text: "Cada assunto novo que aparecer nas conversas entra nesta lista.",
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

  /**
   * Abaixo de 620px o gráfico troca de sistema de coordenadas (ver MEDIDAS em
   * `linechart.js`): no viewBox largo, os rótulos chegariam na tela com ~4,6px.
   * O `matchMedia` fica vivo enquanto a seção estiver no DOM — girar o aparelho
   * atravessa esse limite, e um gráfico ilegível até a próxima navegação seria o
   * mesmo defeito com um passo a mais.
   */
  const telaEstreita = window.matchMedia("(max-width: 620px)");
  let modoAtual = "semanal";

  function renderChart(modo) {
    modoAtual = modo;
    const serie =
      modo === "mensal"
        ? serieSemanal(conversas, ctx.now, 4)
        : serieDiaria(conversas, ctx.now, 7);
    chartHost.replaceChildren(
      buildLineChart({
        points: serie,
        compacto: telaEstreita.matches,
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
    // Sem minutos no período não cabe elogio ("Muito bem! …dedicou 0 min" soa
    // irônico justamente pro pai que abriu o painel e não achou nada).
    const texto = !total
      ? modo === "mensal"
        ? `Ainda não há tempo de estudo registrado nas últimas 4 semanas.`
        : `Ainda não há tempo de estudo registrado nesta semana.`
      : modo === "mensal"
      ? `Nas últimas 4 semanas, ${nome} estudou ${formatMinutos(total)}.`
      : `Muito bem! ${nome} dedicou ${formatMinutos(total)} aos estudos essa semana.`;
    resumoFaixa.replaceChildren(
      el("span", { class: "ap-chart__note-ico", svg: ICON.chart }),
      el("p", { text: texto })
    );
  }

  // Se auto-remove quando a seção some: o router troca o conteúdo do outlet sem
  // avisar ninguém, e um listener por navegação vaza um gráfico por visita.
  const aoTrocarLargura = () => {
    if (!document.contains(chartHost)) {
      telaEstreita.removeEventListener("change", aoTrocarLargura);
      return;
    }
    renderChart(modoAtual);
  };
  telaEstreita.addEventListener("change", aoTrocarLargura);

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
