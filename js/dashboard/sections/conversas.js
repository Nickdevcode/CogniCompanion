/**
 * conversas.js — Seção "Conversas" (o Diário).
 *
 * Timeline das conversas da criança, agrupada por dia, com balões
 * criança/Cogni. Busca por texto e filtros (matéria + tópicos sensíveis)
 * FUNCIONAIS: filtram a lista em memória e re-renderizam só a timeline.
 *
 * Read-only por design: o site nunca escreve em `conversas` (RLS). Ao integrar,
 * troca-se `ctx.mock.getConversas()` pela query do Supabase — o resto continua.
 *
 * Escopo: sem filtro de humor e sem "palavra-chave" separado (a busca cobre).
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon, chevronDown } from "../icons.js";
import {
  materiasAgrupadas,
  materiaLabel,
  formatHora,
  formatDiaRelativo,
  agruparConversasPorDia,
  primeiroNome,
  sujeito,
  capitalizar,
} from "../format.js";

/* --------------------------------------------------------------------------
   Estado local da seção (filtros). Vive enquanto a seção está montada.
   -------------------------------------------------------------------------- */
function createState() {
  return {
    busca: "",
    materia: "", // "" = todas
    apenasSensiveis: false,
  };
}

/* --------------------------------------------------------------------------
   Filtragem (pura) sobre a lista de conversas
   -------------------------------------------------------------------------- */
function aplicarFiltros(conversas, state) {
  const termo = state.busca.trim().toLowerCase();
  return conversas.filter((c) => {
    if (state.materia && c.materia !== state.materia) return false;
    if (state.apenasSensiveis && !c.sensivel) return false;
    if (termo) {
      const alvo = (
        (c.texto_usuario || "") +
        " " +
        (c.texto_resposta || "") +
        " " +
        materiaLabel(c.materia)
      ).toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

/* --------------------------------------------------------------------------
   Componentes de UI
   -------------------------------------------------------------------------- */

/** Badge da matéria (ícone + nome), colorida via classe data-materia. */
function badgeMateria(materia) {
  return el("span", {
    class: "cv-materia",
    attrs: { "data-materia": materia },
    children: [
      el("span", { class: "cv-materia__ico", svg: materiaIcon(materia) }),
      el("span", { text: materiaLabel(materia) }),
    ],
  });
}

/** Um balão de mensagem (criança ou Cogni). */
function balao({ autor, nome, hora, texto }) {
  const isCrianca = autor === "crianca";
  const avatar = el("span", {
    class: "cv-msg__avatar cv-msg__avatar--" + autor,
    svg: isCrianca ? ICON.user : ICON.robot,
    attrs: { "aria-hidden": "true" },
  });
  const head = el("div", {
    class: "cv-msg__head",
    children: [
      el("span", { class: "cv-msg__name", text: nome }),
      hora ? el("span", { class: "cv-msg__time", text: hora }) : null,
    ],
  });
  const bubble = el("div", {
    class: "cv-msg__bubble",
    children: [head, el("p", { class: "cv-msg__text", text: texto })],
  });
  return el("div", {
    class: "cv-msg cv-msg--" + autor,
    children: isCrianca ? [avatar, bubble] : [bubble, avatar],
  });
}

/** Card de uma conversa (uma entrada da timeline). */
function entradaConversa(conv, nomeCrianca, now) {
  const dot = el("span", { class: "cv-entry__dot", attrs: { "aria-hidden": "true" } });
  const hora = el("time", {
    class: "cv-entry__time",
    text: formatHora(conv.criado_em),
    attrs: { datetime: conv.criado_em },
  });

  const topo = el("div", { class: "cv-entry__topbar" });
  topo.appendChild(badgeMateria(conv.materia));
  if (conv.sensivel) {
    topo.appendChild(
      el("span", {
        class: "cv-flag",
        children: [
          el("span", { class: "cv-flag__ico", svg: ICON.shield }),
          el("span", { text: "Tópico sensível" }),
        ],
      })
    );
  }

  const card = el("article", {
    class: "cv-entry__card" + (conv.sensivel ? " cv-entry__card--sensivel" : ""),
    children: [
      topo,
      balao({
        autor: "crianca",
        nome: nomeCrianca,
        hora: "",
        texto: conv.texto_usuario,
      }),
      balao({
        autor: "cogni",
        nome: "Cogni",
        hora: formatHora(conv.criado_em),
        texto: conv.texto_resposta,
      }),
    ],
  });

  return el("div", {
    class: "cv-entry",
    children: [
      el("div", { class: "cv-entry__rail", children: [dot, hora] }),
      card,
    ],
  });
}

/** Estado vazio (nenhuma conversa após os filtros). */
function vazio(temFiltro) {
  return el("div", {
    class: "cv-empty",
    children: [
      el("span", { class: "cv-empty__ico", svg: ICON.search }),
      el("p", {
        class: "cv-empty__title",
        text: temFiltro ? "Nada com esse filtro" : "Ainda sem conversas",
      }),
      el("p", {
        class: "cv-empty__text",
        text: temFiltro
          ? "Tente outro termo de busca ou ajuste os filtros."
          : "A primeira conversa com a Cogni aparece aqui no mesmo dia.",
      }),
    ],
  });
}

/* --------------------------------------------------------------------------
   Dropdown simples de matéria (acessível por clique; fecha ao escolher)
   -------------------------------------------------------------------------- */
function filtroMateria(state, onChange) {
  const wrap = el("div", { class: "cv-filter" });

  const label = el("span", { class: "cv-filter__label", text: "Matéria" });
  const btn = el("button", {
    class: "cv-filter__btn",
    attrs: { type: "button", "aria-haspopup": "true", "aria-expanded": "false" },
    children: [
      el("span", { class: "cv-filter__ico", svg: ICON.book }),
      label,
      el("span", { class: "cv-filter__chev", svg: chevronDown() }),
    ],
  });

  const menu = el("div", { class: "cv-filter__menu", attrs: { role: "menu" } });
  menu.hidden = true;

  const mkOpt = (valor, texto) => {
    const opt = el("button", {
      class: "cv-filter__opt",
      attrs: {
        type: "button",
        role: "menuitemradio",
        "aria-checked": state.materia === valor ? "true" : "false",
      },
      text: texto,
    });
    opt.addEventListener("click", () => {
      state.materia = valor;
      label.textContent = valor ? texto : "Matéria";
      btn.classList.toggle("is-active", !!valor);
      // O estado marcado vive no menu inteiro, não só no item clicado: um
      // `menuitemradio` sem `aria-checked` correto mente pro leitor de tela.
      menu.querySelectorAll(".cv-filter__opt").forEach((o) =>
        o.setAttribute("aria-checked", o === opt ? "true" : "false")
      );
      close();
      onChange();
    });
    return opt;
  };

  menu.appendChild(mkOpt("", "Todas as matérias"));

  // Com 14 matérias, uma lista corrida vira parede de texto: os itens entram
  // separados por área do conhecimento. É só APRESENTAÇÃO — cada opção continua
  // filtrando pela matéria fina, e nenhum grupo existe no dado.
  materiasAgrupadas().forEach((grupo) => {
    menu.appendChild(
      el("div", {
        class: "cv-filter__group",
        // `role="group"` dentro do menu é o que amarra o rótulo da área aos itens
        // dela na árvore de acessibilidade (o título visual é decorativo).
        attrs: { role: "group", "aria-label": grupo.label },
        children: [
          el("span", {
            class: "cv-filter__group-title",
            attrs: { "aria-hidden": "true" },
            text: grupo.label,
          }),
          ...grupo.materias.map((m) => mkOpt(m.valor, m.label)),
        ],
      })
    );
  });

  function open() {
    menu.hidden = false;
    wrap.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocClick, true);
  }
  function close() {
    menu.hidden = true;
    wrap.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, true);
  }
  function onDocClick(e) {
    if (!wrap.contains(e.target)) close();
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    wrap.classList.contains("is-open") ? close() : open();
  });

  wrap.append(btn, menu);
  return wrap;
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */
export async function renderConversas(ctx) {
  const root = sectionRoot("conversas");
  const primeiro = primeiroNome(ctx.crianca && ctx.crianca.nome);
  const nome = sujeito(primeiro);
  const state = createState();

  // Cabeçalho + mascote
  const head = pageHead({
    title: "Diário de conversas",
    // "do {nome}" chutava o gênero da criança (o perfil não guarda um); "de {nome}"
    // vale pros dois. E a frase passou a dizer o que a tela faz de diferente do
    // resto do painel: aqui está a conversa INTEIRA, não o resumo dela.
    subtitle: `Tudo que ${nome} perguntou à Cogni, e o que ela respondeu.`,
  });
  head.appendChild(
    el("img", {
      class: "cv-mascot",
      attrs: {
        src: "assets/images/dash-robot-conversas.png",
        alt: "",
        "aria-hidden": "true",
        loading: "lazy",
      },
    })
  );
  root.appendChild(head);

  // Carrega as conversas uma vez; os filtros operam sobre esta lista.
  const todas = await ctx.mock.getConversas();

  /* ---- Barra de busca + filtros ---- */
  const input = el("input", {
    class: "cv-search__input",
    attrs: {
      type: "search",
      placeholder: "Buscar conversa ou palavra-chave",
      "aria-label": "Buscar conversa ou palavra-chave",
    },
  });
  const clearBtn = el("button", {
    class: "cv-search__clear",
    attrs: { type: "button", "aria-label": "Limpar busca" },
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  });
  clearBtn.hidden = true;

  const searchRow = el("div", {
    class: "cv-search",
    children: [
      el("span", { class: "cv-search__ico", svg: ICON.search }),
      input,
      clearBtn,
    ],
  });

  // Botão toggle "Tópicos sensíveis"
  const sensBtn = el("button", {
    class: "cv-filter__btn cv-filter__btn--toggle",
    attrs: { type: "button", "aria-pressed": "false" },
    children: [
      el("span", { class: "cv-filter__ico", svg: ICON.shield }),
      el("span", { text: "Tópicos sensíveis" }),
    ],
  });

  const filtros = el("div", {
    class: "cv-filters",
    children: [filtroMateria(state, rerender), sensBtn],
  });

  const toolbar = el("div", {
    class: "dash-card cv-toolbar",
    children: [searchRow, filtros],
  });
  root.appendChild(toolbar);

  /* ---- Container da timeline (re-renderizado pelos filtros) ---- */
  const timelineHost = el("div", { class: "cv-timeline-host" });
  root.appendChild(timelineHost);

  function rerender() {
    const filtradas = aplicarFiltros(todas, state);
    const temFiltro = !!(state.busca || state.materia || state.apenasSensiveis);

    timelineHost.replaceChildren();

    if (!filtradas.length) {
      timelineHost.appendChild(vazio(temFiltro));
      return;
    }

    const grupos = agruparConversasPorDia(filtradas, ctx.now);
    const tl = el("div", { class: "cv-timeline" });
    grupos.forEach((g) => {
      // o rótulo de dia abre o grupo ("hoje" → "Hoje", "27 de maio" → "27 de maio")
      tl.appendChild(el("h2", { class: "cv-daygroup__title", text: capitalizar(g.label) }));
      const lista = el("div", { class: "cv-daygroup__items" });
      g.itens.forEach((c) => lista.appendChild(entradaConversa(c, nome, ctx.now)));
      tl.appendChild(lista);
    });
    timelineHost.appendChild(tl);
  }

  /* ---- Liga os eventos ---- */
  input.addEventListener("input", () => {
    state.busca = input.value;
    clearBtn.hidden = !input.value;
    rerender();
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    state.busca = "";
    clearBtn.hidden = true;
    input.focus();
    rerender();
  });
  sensBtn.addEventListener("click", () => {
    state.apenasSensiveis = !state.apenasSensiveis;
    sensBtn.classList.toggle("is-active", state.apenasSensiveis);
    sensBtn.setAttribute("aria-pressed", String(state.apenasSensiveis));
    rerender();
  });

  // Primeira renderização
  rerender();

  return root;
}
