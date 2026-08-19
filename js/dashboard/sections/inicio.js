/**
 * inicio.js — Seção "Início" do painel.
 *
 * Cartão de visita do dia, em bento grid:
 *   - Última conversa (timeline curta dos últimos turnos da criança)
 *   - Próximo plano de estudo (o plano ativo)
 *   - Resumo da semana (contadores: conversas · matérias · tempo total)
 *   - Dica do Cogni (mensagem da IA)
 *
 * Tudo lido do contrato (snake_case). Sem chips de humor/concentração e sem
 * conquistas (anulados no escopo). O 3º contador do resumo é "Tempo total"
 * (derivado de duracao_ms), no lugar de "Conquistas".
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import {
  ICON,
  materiaIcon,
  chevronRight,
} from "../icons.js";
import { cardResumoSemanal } from "../resumo-semanal.js";
import { cardDica } from "../dica.js";
import { criarPreviewRosto, ROSTO_PADRAO } from "../rosto-preview.js";
import {
  formatHora,
  formatDiaRelativo,
  formatDuracao,
  materiaLabel,
  statusLabel,
  tempoTotal,
  primeiroNome,
  planosVigentes,
  sujeito,
  deQuem,
} from "../format.js";

/* --------------------------------------------------------------------------
   Helpers de UI locais
   -------------------------------------------------------------------------- */

/** Cabeçalho navy de um card do bento (ícone + título). */
function cardHead(iconSvg, title) {
  return el("div", {
    class: "dash-card__head",
    children: [
      el("span", { class: "dash-card__head-ico", svg: iconSvg }),
      el("span", { class: "dash-card__head-title", text: title }),
    ],
  });
}

/** Rodapé de card com link de ação (texto + chevron). */
function cardFootLink(label, onClick) {
  const btn = el("button", {
    class: "ini-cardlink",
    attrs: { type: "button" },
    children: [
      el("span", { text: label }),
      el("span", { class: "ini-cardlink__chev", svg: chevronRight() }),
    ],
  });
  if (onClick) btn.addEventListener("click", onClick);
  return el("div", { class: "ini-card__foot", children: [btn] });
}

/**
 * Balão de conversa (criança ou Cogni). `autor` = "crianca" | "cogni".
 * @param {{ autor:string, nome:string, hora:string, texto:string }} cfg
 */
function balao({ autor, nome, hora, texto }) {
  const isCrianca = autor === "crianca";
  const avatar = el("span", {
    class: "ini-msg__avatar ini-msg__avatar--" + autor,
    svg: isCrianca ? ICON.user : ICON.robot,
    attrs: { "aria-hidden": "true" },
  });

  const meta = el("div", {
    class: "ini-msg__meta",
    children: [
      el("span", { class: "ini-msg__name", text: nome }),
      hora ? el("span", { class: "ini-msg__time", text: hora }) : null,
    ],
  });
  const bubble = el("div", {
    class: "ini-msg__bubble",
    children: [meta, el("p", { class: "ini-msg__text", text: texto })],
  });

  return el("div", {
    class: "ini-msg ini-msg--" + autor,
    children: isCrianca ? [avatar, bubble] : [bubble, avatar],
  });
}

/* --------------------------------------------------------------------------
   Cards do bento
   -------------------------------------------------------------------------- */

/** Card "Última conversa" — mostra os últimos turnos (até 3 mensagens). */
function cardUltimaConversa(conversas, nomeCrianca, now, onVerTodas) {
  const card = el("article", { class: "dash-card ini-card ini-card--conversa" });
  card.appendChild(cardHead(ICON.chat, "Última conversa"));

  const body = el("div", { class: "ini-card__body ini-conversa__body" });

  if (!conversas.length) {
    body.appendChild(
      el("p", {
        class: "ini-empty",
        text:
          "Nada por aqui ainda. A primeira conversa com a Cogni aparece neste " +
          "card no mesmo dia.",
      })
    );
  } else {
    // A conversa mais recente: mostramos a pergunta da criança, a resposta da
    // Cogni e (se houver) o turno seguinte — recriando o "vai e volta".
    const ultima = conversas[0];
    const quando = `${formatDiaRelativo(ultima.criado_em, now)}, ${formatHora(
      ultima.criado_em
    )}`;

    body.appendChild(
      balao({
        autor: "crianca",
        nome: nomeCrianca,
        hora: quando,
        texto: ultima.texto_usuario,
      })
    );
    body.appendChild(
      balao({
        autor: "cogni",
        nome: "Cogni",
        hora: "",
        texto: ultima.texto_resposta,
      })
    );
    // Se houver uma conversa anterior próxima, mostra a pergunta dela como 3º
    // balão (dá a sensação de continuidade, como no design).
    if (conversas[1]) {
      const ant = conversas[1];
      body.appendChild(
        balao({
          autor: "crianca",
          nome: nomeCrianca,
          hora: `${formatDiaRelativo(ant.criado_em, now)}, ${formatHora(
            ant.criado_em
          )}`,
          texto: ant.texto_usuario,
        })
      );
    }
  }

  card.appendChild(body);
  card.appendChild(cardFootLink("Ver todas as conversas", onVerTodas));
  return card;
}

/** Card "Próximo plano de estudo" — destaca o plano ativo. */
function cardProximoPlano(plano, onVerPlano) {
  const card = el("article", { class: "dash-card ini-card ini-card--plano" });
  // "Próximo" era mentira: o card mostra o PRIMEIRO DA FILA, ou seja, o plano por
  // onde a Cogni começa hoje — não um que ainda vai começar. O pai lia "próximo" e
  // ia procurar na Mesa qual seria "o de agora".
  card.appendChild(cardHead(ICON.calendar, "O plano de agora"));

  const body = el("div", { class: "ini-card__body ini-plano__body" });

  if (!plano) {
    body.appendChild(
      el("p", {
        class: "ini-empty",
        text:
          "Nenhum plano valendo agora. Na Mesa de Estudos dá pra criar um em um " +
          "minuto — é o que a Cogni puxa nas conversas.",
      })
    );
    card.appendChild(body);
    return card;
  }

  // Ícone grande da matéria (disco navy com ícone dourado)
  const disco = el("div", {
    class: "ini-plano__disc",
    children: [el("span", { svg: materiaIcon(plano.foco) })],
  });

  // Destaque dourado: a matéria de foco do plano.
  const info = el("div", {
    class: "ini-plano__info",
    children: [
      el("p", { class: "ini-plano__when", text: materiaLabel(plano.foco) }),
      el("h3", { class: "ini-plano__title", text: plano.titulo }),
      el("p", { class: "ini-plano__desc", text: plano.conteudo }),
      el("div", {
        class: "ini-plano__chips",
        children: [
          el("span", {
            class: "ini-pill",
            children: [
              el("span", { class: "ini-pill__ico", svg: ICON.calendar }),
              el("span", { text: `${plano.duracao_dias} dias` }),
            ],
          }),
          el("span", {
            class: "ini-pill ini-pill--status",
            attrs: { "data-status": plano.status },
            children: [
              el("span", { class: "ini-pill__dot", attrs: { "aria-hidden": "true" } }),
              el("span", { text: statusLabel(plano.status) }),
            ],
          }),
        ],
      }),
    ],
  });

  body.appendChild(disco);
  body.appendChild(info);
  card.appendChild(body);

  // Botão grande "Ver plano completo"
  const btn = el("button", {
    class: "dash-btn dash-btn--primary ini-plano__cta",
    attrs: { type: "button" },
    children: [
      el("span", { text: "Ver plano completo" }),
      el("span", { class: "ini-cardlink__chev", svg: chevronRight() }),
    ],
  });
  if (onVerPlano) btn.addEventListener("click", onVerPlano);
  card.appendChild(el("div", { class: "ini-plano__foot", children: [btn] }));
  return card;
}

/** Card "Resumo da semana" — 3 contadores (conversas · matérias · tempo). */
function cardResumoSemana(conversas, now, onRelatorio) {
  const card = el("article", { class: "dash-card ini-card ini-card--resumo" });
  // Havia dois cards chamados "Resumo da semana" no mesmo Início (este e o bilhete
  // da IA logo abaixo). Este é o dos números; o outro é o texto.
  card.appendChild(cardHead(ICON.chart, "A semana em números"));

  // Janela dos últimos 7 dias a partir do "agora" de referência.
  const limite = new Date(now);
  limite.setDate(limite.getDate() - 7);
  const semana = conversas.filter((c) => new Date(c.criado_em) >= limite);

  const nConversas = semana.length;
  const nMaterias = new Set(semana.map((c) => c.materia)).size;
  const tempo = formatDuracao(tempoTotal(semana));

  const body = el("div", { class: "ini-card__body ini-resumo__body" });
  // Onde havia "continue incentivando essa jornada" agora há o recorte dos números.
  // A frase antiga não dizia nada que o pai não soubesse, e ocupava a linha em que
  // cabia a única informação que faltava: de quando são estes números.
  body.appendChild(
    el("p", {
      class: "ini-resumo__lead",
      text: "Os últimos 7 dias.",
    })
  );

  const counter = (valor, rotulo, iconSvg) =>
    el("div", {
      class: "ini-counter",
      children: [
        el("span", { class: "ini-counter__ico", svg: iconSvg }),
        el("span", { class: "ini-counter__value", text: String(valor) }),
        el("span", { class: "ini-counter__label", text: rotulo }),
      ],
    });

  body.appendChild(
    el("div", {
      class: "ini-counters",
      children: [
        counter(nConversas, "Conversas", ICON.chat),
        counter(nMaterias, "Matérias", ICON.book),
        counter(tempo, "Tempo total", ICON.clock),
      ],
    })
  );

  card.appendChild(body);
  card.appendChild(cardFootLink("Ver tudo no Aprendizado", onRelatorio));
  return card;
}


/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */

export async function renderInicio(ctx) {
  const root = sectionRoot("inicio");
  // Pode vir vazio (criança sem nome no perfil): quem resolve o fallback são o
  // `sujeito()` e o `deQuem()`, que também são o que mantém as frases sem gênero.
  const primeiro = primeiroNome(ctx.crianca && ctx.crianca.nome);
  const nome = sujeito(primeiro);

  // Cabeçalho com mascote ao lado (decorativo).
  const head = pageHead({
    title: `O dia ${deQuem(primeiro)}`,
    subtitle: "O que rolou hoje: a conversa mais recente, o plano de agora e o que a Cogni notou.",
  });
  head.appendChild(
    el("img", {
      class: "ini-mascot",
      attrs: {
        src: "assets/images/dash-robot-inicio.png",
        alt: "",
        "aria-hidden": "true",
        loading: "lazy",
      },
    })
  );
  root.appendChild(head);

  // Busca os dados em paralelo. (A "Dica do Cogni" busca sozinha dentro do card,
  // como o Resumo Semanal — ambas vêm do servidor local, não do Supabase.)
  const [conversas, planos] = await Promise.all([
    ctx.mock.getConversas(),
    ctx.mock.getPlanos(),
  ]);

  /**
   * Plano "próximo": o PRIMEIRO DA FILA — por onde a Cogni começa.
   *
   * ⭐ 16/ago/2026 — era `find(status === 'ativo')`, ou seja, o primeiro que
   * aparecesse no array. Agora que o pai ordena a fila na Mesa, o Início tem que
   * mostrar o mesmo plano que ela: dois lugares do painel apontando planos
   * diferentes como "o de agora" é pior do que nenhum deles apontar.
   *
   * O fallback antigo continua pros casos que a fila não cobre (todos vencidos, por
   * exemplo): melhor um plano desatualizado no card do que um card vazio.
   */
  const planoAtivo =
    planosVigentes(planos, ctx.now)[0] ||
    planos.find((p) => p.status === "ativo") ||
    planos.find((p) => p.status === "em_andamento") ||
    null;

  // Navegações entre seções (reusa o roteador por hash).
  const go = (rota) => () => {
    window.location.hash = "#/" + rota;
  };

  const grid = el("div", {
    class: "ini-grid",
    children: [
      cardUltimaConversa(conversas, nome, ctx.now, go("conversas")),
      cardProximoPlano(planoAtivo, go("mesa")),
      cardResumoSemana(conversas, ctx.now, go("aprendizado")),
      // Bilhete da semana gerado por IA. Fonte estável: lê o último resumo salvo
      // (tabela `resumos_semanais`, via ctx.mock) na hora e atualiza com a versão
      // fresca do endpoint quando o robô está ligado. Nunca mostra "sem
      // comunicação" — o módulo resolve os estados internamente.
      cardResumoSemanal({
        servidorUrl: ctx.servidorUrl,
        crianca: ctx.crianca,
        mock: ctx.mock,
      }),
      // Dica do Cogni. Fonte estável: lê a última dica salva (tabela `dicas`, via
      // ctx.mock) na hora e refresca pelo endpoint quando o robô está ligado.
      // Nunca cai no texto genérico só por o servidor estar offline.
      cardDica({
        servidorUrl: ctx.servidorUrl,
        crianca: ctx.crianca,
        mock: ctx.mock,
        onMais: go("aprendizado"),
      }),
    ],
  });
  root.appendChild(grid);

  // Convite pro editor de rosto. Fica FORA do grid e depois dele de propósito: os
  // cards acima são leitura pro pai, e este é o único elemento do Início que pede
  // pra ele passar o aparelho pra criança. Mostra o rosto atual dela, não um
  // genérico — é o que faz o pai (e ela) reconhecerem do que se trata.
  root.appendChild(conviteRosto(ctx.crianca, nome));

  return root;
}

/**
 * Faixa de chamada pro editor de rosto, com preview do rosto atual da criança.
 * @param {object} crianca — linha de `criancas` (usa `rosto_robo`)
 * @param {string} nome — primeiro nome, pra falar dela e não "da criança"
 * @returns {HTMLElement}
 */
function conviteRosto(crianca, nome) {
  const preview = criarPreviewRosto({
    class: "dash-rosto-convite__tela",
    // O texto ao lado já diz o que é; o SVG só repetiria pro leitor de tela.
    decorativo: true,
  });
  preview.atualizar((crianca && crianca.rosto_robo) || ROSTO_PADRAO);

  return el("a", {
    class: "dash-rosto-convite",
    attrs: { href: "#/rosto" },
    children: [
      preview.node,
      el("div", {
        class: "dash-rosto-convite__txt",
        children: [
          el("p", {
            class: "dash-rosto-convite__titulo",
            // Sem artigo antes do nome: o perfil não guarda gênero, e "Deixa o Ana"
            // era o que a metade das famílias lia na primeira tela do painel.
            text: nome + " pode desenhar o rosto da Cogni",
          }),
          el("p", {
            class: "dash-rosto-convite__sub",
            text:
              "Esta tela é a única do painel feita pra criança usar — passa o " +
              "aparelho e a Cogni muda de cara na hora.",
          }),
        ],
      }),
    ],
  });
}
