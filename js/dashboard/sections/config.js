/**
 * config.js — Seção "Configurações" (título: "Configurações da família").
 *
 * Blocos (escopo MVP atualizado):
 *   - Perfil da criança pareada → card + modal de detalhe com edição FUNCIONAL
 *     (infos da criança + prompt_personalizado). Single-child: 1 perfil só.
 *   - Preferências de notificação → toggles dos avisos do sininho 🔔.
 *   - Conta do responsável (nome/e-mail + sair).
 *   - Tema (claro/escuro).
 *   - Status da conexão do Cogni (bloco informativo).
 *
 * Sem "Filtros de segurança", "Limites de tempo/horário" nem "Adicionar
 * responsável" (anulados no escopo). Edição do perfil salva no mock; ao
 * integrar vira update em `criancas` (RLS protege).
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon } from "../icons.js";
import { openModal } from "../modal.js";
import { MATERIAS, materiaLabel, idadeLabel } from "../format.js";

/* --------------------------------------------------------------------------
   Preferências de notificação (chaves locais; o backend liga ao sininho).
   "Conquistas" foi anulado, então não entra aqui.
   -------------------------------------------------------------------------- */
const NOTIF_PREFS = [
  {
    key: "resumo_diario",
    titulo: "Resumo diário",
    desc: "Receba um resumo das atividades da criança.",
    icon: ICON.calendar,
    padrao: true,
  },
  {
    key: "novas_conversas",
    titulo: "Novas conversas",
    desc: "Avise quando houver conversas novas com a Cogni.",
    icon: ICON.chat,
    padrao: true,
  },
  {
    key: "topicos_sensiveis",
    titulo: "Tópicos sensíveis",
    desc: "Seja avisado quando um tema sensível for detectado.",
    icon: ICON.shield,
    padrao: true,
  },
  {
    key: "novidades_dicas",
    titulo: "Novidades e dicas",
    desc: "Dicas para aproveitar melhor o Cogni.",
    icon: ICON.bulb,
    padrao: false,
  },
];

/* --------------------------------------------------------------------------
   Componentes de UI
   -------------------------------------------------------------------------- */

/** Cabeçalho de um card de configuração (ícone + título + subtítulo). */
function blocoHead(iconSvg, titulo, subtitulo) {
  return el("div", {
    class: "cfg-block__head",
    children: [
      el("span", { class: "cfg-block__ico", svg: iconSvg }),
      el("div", {
        class: "cfg-block__heading",
        children: [
          el("h2", { class: "cfg-block__title", text: titulo }),
          subtitulo
            ? el("p", { class: "cfg-block__sub", text: subtitulo })
            : null,
        ],
      }),
    ],
  });
}

/** Switch acessível (toggle) reutilizável. */
function toggle(checked, onChange, ariaLabel) {
  const btn = el("button", {
    class: "cfg-switch" + (checked ? " is-on" : ""),
    attrs: {
      type: "button",
      role: "switch",
      "aria-checked": String(checked),
      "aria-label": ariaLabel || "Alternar",
    },
    children: [el("span", { class: "cfg-switch__knob", attrs: { "aria-hidden": "true" } })],
  });
  btn.addEventListener("click", () => {
    const on = btn.classList.toggle("is-on");
    btn.setAttribute("aria-checked", String(on));
    if (onChange) onChange(on);
  });
  return btn;
}

/* --------------------------------------------------------------------------
   Bloco: Perfil da criança pareada
   -------------------------------------------------------------------------- */
function blocoPerfil(crianca, onAbrirDetalhe) {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--perfil" });
  bloco.appendChild(
    blocoHead(ICON.user, "Perfil da criança", "Quem usa o Cogni em casa.")
  );

  const body = el("div", { class: "cfg-block__body" });

  if (!crianca) {
    body.appendChild(
      el("div", {
        class: "cfg-nopair",
        children: [
          el("p", {
            class: "cfg-nopair__text",
            text: "Nenhuma criança pareada. Use o código do robô para vincular.",
          }),
        ],
      })
    );
    bloco.appendChild(body);
    return bloco;
  }

  const card = el("button", {
    class: "cfg-child",
    attrs: { type: "button" },
    children: [
      el("span", {
        class: "cfg-child__avatar",
        svg: ICON.user,
        attrs: { "aria-hidden": "true" },
      }),
      el("div", {
        class: "cfg-child__info",
        children: [
          el("div", {
            class: "cfg-child__namerow",
            children: [
              el("span", { class: "cfg-child__name", text: crianca.nome }),
              el("span", { class: "cfg-child__tag", text: "Perfil infantil" }),
            ],
          }),
          el("span", {
            class: "cfg-child__meta",
            text:
              [idadeLabel(crianca.idade), crianca.serie]
                .filter(Boolean)
                .join(" • ") || "Toque para ver os detalhes",
          }),
        ],
      }),
      el("span", {
        class: "cfg-child__chev",
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
      }),
    ],
  });
  card.addEventListener("click", onAbrirDetalhe);
  body.appendChild(card);
  bloco.appendChild(body);
  return bloco;
}

/** Campo do formulário de detalhe do perfil. */
function campo(labelText, control, { full } = {}) {
  const wrap = el("div", {
    class: "cfg-field" + (full ? " cfg-field--full" : ""),
  });
  const lbl = el("label", { class: "cfg-field__label", text: labelText });
  if (control.id) lbl.setAttribute("for", control.id);
  wrap.append(lbl, control);
  return wrap;
}

/** Conteúdo do modal de detalhe/edição do perfil. */
function formularioPerfil(crianca, { onSubmit, close }) {
  const form = el("form", { class: "cfg-form", attrs: { novalidate: "true" } });

  const txt = (id, valor, attrs = {}) =>
    el("input", {
      class: "cfg-input",
      attrs: { id, type: "text", value: valor || "", ...attrs },
    });

  const inNome = txt("cf-nome", crianca.nome, { maxlength: "60" });
  const inIdade = el("input", {
    class: "cfg-input",
    attrs: {
      id: "cf-idade",
      type: "number",
      min: "1",
      max: "18",
      inputmode: "numeric",
      value: crianca.idade != null ? String(crianca.idade) : "",
    },
  });
  const inSerie = txt("cf-serie", crianca.serie, { maxlength: "30" });

  // Matéria favorita / difícil (selects com as matérias)
  const mkSelect = (id, valor) => {
    const sel = el("select", { class: "cfg-input cfg-select", attrs: { id } });
    sel.appendChild(el("option", { attrs: { value: "" }, text: "— não definido —" }));
    MATERIAS.forEach((m) => {
      const o = el("option", { attrs: { value: m }, text: materiaLabel(m) });
      if (valor === m) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  };
  const selFav = mkSelect("cf-fav", crianca.materia_favorita);
  const selDif = mkSelect("cf-dif", crianca.materia_dificil);

  const inHobbies = txt("cf-hobbies", crianca.hobbies, { maxlength: "120" });
  const inComoAprende = el("textarea", {
    class: "cfg-input cfg-textarea",
    attrs: { id: "cf-como", rows: "2", maxlength: "200" },
  });
  inComoAprende.value = crianca.como_aprende || "";
  const inEstilo = el("textarea", {
    class: "cfg-input cfg-textarea",
    attrs: { id: "cf-estilo", rows: "2", maxlength: "200" },
  });
  inEstilo.value = crianca.estilo_linguagem || "";

  // Prompt personalizado (o destaque — instruções do pai pra Cogni)
  const inPrompt = el("textarea", {
    class: "cfg-input cfg-textarea cfg-textarea--prompt",
    attrs: {
      id: "cf-prompt",
      rows: "4",
      maxlength: "600",
      placeholder:
        "Ex.: Incentive a curiosidade sobre ciências e use exemplos com dinossauros.",
    },
  });
  inPrompt.value = crianca.prompt_personalizado || "";

  // Seção 1: dados básicos (grid)
  const grid = el("div", {
    class: "cfg-form__grid",
    children: [
      campo("Nome", inNome, { full: true }),
      campo("Idade", inIdade),
      campo("Série", inSerie),
      campo("Matéria favorita", selFav),
      campo("Matéria difícil", selDif),
      campo("Hobbies", inHobbies, { full: true }),
      campo("Como aprende melhor", inComoAprende, { full: true }),
      campo("Estilo de linguagem", inEstilo, { full: true }),
    ],
  });

  // Seção 2: prompt personalizado (destacada)
  const promptSection = el("div", {
    class: "cfg-prompt",
    children: [
      el("div", {
        class: "cfg-prompt__head",
        children: [
          el("span", { class: "cfg-prompt__ico", svg: ICON.robot }),
          el("div", {
            children: [
              el("h3", {
                class: "cfg-prompt__title",
                text: "Personalização da Cogni",
              }),
              el("p", {
                class: "cfg-prompt__hint",
                text: "Instruções suas que a Cogni segue ao conversar com esta criança.",
              }),
            ],
          }),
        ],
      }),
      campo("Prompt personalizado", inPrompt, { full: true }),
    ],
  });

  form.append(grid, promptSection);

  // Ações
  const cancelBtn = el("button", {
    class: "dash-btn dash-btn--ghost",
    attrs: { type: "button" },
    text: "Cancelar",
  });
  cancelBtn.addEventListener("click", close);
  const saveBtn = el("button", {
    class: "dash-btn dash-btn--primary",
    attrs: { type: "submit" },
    text: "Salvar perfil",
  });
  form.appendChild(
    el("div", {
      class: "cfg-form__actions",
      children: [el("div", { class: "cfg-form__spacer" }), cancelBtn, saveBtn],
    })
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const idadeVal = parseInt(inIdade.value, 10);
    onSubmit({
      nome: inNome.value.trim() || crianca.nome,
      idade: Number.isNaN(idadeVal) ? null : idadeVal,
      serie: inSerie.value.trim(),
      materia_favorita: selFav.value || null,
      materia_dificil: selDif.value || null,
      hobbies: inHobbies.value.trim(),
      como_aprende: inComoAprende.value.trim(),
      estilo_linguagem: inEstilo.value.trim(),
      prompt_personalizado: inPrompt.value.trim(),
    });
  });

  return form;
}

/* --------------------------------------------------------------------------
   Bloco: Preferências de notificação
   -------------------------------------------------------------------------- */
function blocoNotificacoes() {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--notif" });
  bloco.appendChild(
    blocoHead(
      ICON.bell,
      "Preferências de notificação",
      "Escolha quais avisos chegam no sininho."
    )
  );
  const lista = el("div", { class: "cfg-notif-list" });
  NOTIF_PREFS.forEach((p) => {
    const row = el("div", {
      class: "cfg-notif",
      children: [
        el("span", { class: "cfg-notif__ico", svg: p.icon }),
        el("div", {
          class: "cfg-notif__info",
          children: [
            el("span", { class: "cfg-notif__title", text: p.titulo }),
            el("span", { class: "cfg-notif__desc", text: p.desc }),
          ],
        }),
        toggle(p.padrao, null, p.titulo),
      ],
    });
    lista.appendChild(row);
  });
  bloco.appendChild(el("div", { class: "cfg-block__body", children: [lista] }));
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Conta do responsável
   -------------------------------------------------------------------------- */
function blocoConta(responsavel) {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--conta" });
  bloco.appendChild(
    blocoHead(ICON.user, "Conta", "Seus dados de responsável.")
  );

  const linha = (rotulo, valor) =>
    el("div", {
      class: "cfg-data",
      children: [
        el("span", { class: "cfg-data__label", text: rotulo }),
        el("span", { class: "cfg-data__value", text: valor || "—" }),
      ],
    });

  const sairBtn = el("button", {
    class: "cfg-logout",
    attrs: { type: "button" },
    children: [
      el("span", {
        class: "cfg-logout__ico",
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
      }),
      el("span", { text: "Sair da conta" }),
    ],
  });
  sairBtn.addEventListener("click", async () => {
    sairBtn.disabled = true;
    try {
      if (window.cognifyAuth) await window.cognifyAuth.signOut();
      window.location.href = "index.html";
    } catch (e) {
      sairBtn.disabled = false;
      if (window.cognifyToast)
        window.cognifyToast.show("Não foi possível sair agora.", { type: "error" });
    }
  });

  bloco.appendChild(
    el("div", {
      class: "cfg-block__body",
      children: [
        linha("Nome", responsavel.nome),
        linha("E-mail", responsavel.email),
        sairBtn,
      ],
    })
  );
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Tema
   -------------------------------------------------------------------------- */
function blocoTema() {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--tema" });
  bloco.appendChild(
    blocoHead(ICON.bulb, "Aparência", "Escolha o tema do painel.")
  );

  const isDark = () =>
    document.documentElement.getAttribute("data-theme") === "dark";

  const sw = toggle(isDark(), (on) => {
    const theme = on ? "dark" : "light";
    try {
      localStorage.setItem("cognify-theme", theme);
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", theme);
  }, "Alternar tema escuro");

  const row = el("div", {
    class: "cfg-themerow",
    children: [
      el("div", {
        class: "cfg-notif__info",
        children: [
          el("span", { class: "cfg-notif__title", text: "Modo escuro" }),
          el("span", {
            class: "cfg-notif__desc",
            text: "Reduz o brilho e descansa a vista à noite.",
          }),
        ],
      }),
      sw,
    ],
  });

  // Mantém o switch em sincronia se o tema mudar pelo toggle do header.
  const obs = new MutationObserver(() => {
    const on = isDark();
    sw.classList.toggle("is-on", on);
    sw.setAttribute("aria-checked", String(on));
  });
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  bloco.appendChild(el("div", { class: "cfg-block__body", children: [row] }));
  return bloco;
}

/* --------------------------------------------------------------------------
   Bloco: Status da conexão do Cogni (informativo)
   -------------------------------------------------------------------------- */
function blocoStatus() {
  const bloco = el("section", { class: "dash-card cfg-block cfg-block--status" });
  bloco.appendChild(
    blocoHead(ICON.robot, "Status da conexão do Cogni", "Informações sobre o robô e a conexão.")
  );

  const linha = (iconSvg, rotulo, valor, ok) =>
    el("div", {
      class: "cfg-status-row",
      children: [
        el("span", { class: "cfg-status-row__ico", svg: iconSvg }),
        el("span", { class: "cfg-status-row__label", text: rotulo }),
        el("span", {
          class: "cfg-status-row__value" + (ok ? " is-ok" : ""),
          text: valor,
        }),
      ],
    });

  // Topo: foto do robô (quadro com borda dourada) + infos de conexão ao lado.
  const foto = el("div", {
    class: "cfg-status__photo",
    children: [
      el("img", {
        attrs: {
          src: "assets/images/dash-robot-inicio.png",
          alt: "Robô Cogni",
          loading: "lazy",
        },
      }),
      el("span", { class: "cfg-status__live", attrs: { "aria-hidden": "true" } }),
    ],
  });

  const info = el("div", {
    class: "cfg-status__info",
    children: [
      el("div", {
        class: "cfg-status-badge is-online",
        children: [
          el("span", { class: "cfg-status-badge__dot", attrs: { "aria-hidden": "true" } }),
          el("span", { text: "Cogni conectada" }),
        ],
      }),
      linha(ICON.wifi, "Wi-Fi", "Casa Carvalho", false),
      linha(ICON.wifi, "Sinal", "Excelente", true),
    ],
  });

  // Barra de "última sincronização" com botão de atualizar (refresh) funcional.
  const syncValor = el("span", {
    class: "cfg-sync__value",
    text: "Hoje, 17:48",
  });
  const refreshBtn = el("button", {
    class: "cfg-sync__btn",
    attrs: { type: "button", "aria-label": "Atualizar sincronização" },
    svg: ICON.refresh,
  });
  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("is-spinning");
    refreshBtn.disabled = true;
    // Simula a sincronização; ao integrar, dispara a checagem real e atualiza
    // o horário com o retorno do servidor. A sincronização ocorre AGORA — daí
    // usar a hora atual (no navegador new Date() é permitido).
    window.setTimeout(() => {
      const agora = new Date();
      const hh = String(agora.getHours()).padStart(2, "0");
      const mm = String(agora.getMinutes()).padStart(2, "0");
      syncValor.textContent = `Hoje, ${hh}:${mm}`;
      refreshBtn.classList.remove("is-spinning");
      refreshBtn.disabled = false;
      if (window.cognifyToast)
        window.cognifyToast.show("Cogni sincronizada agora.", { type: "success" });
    }, 900);
  });

  const syncBar = el("div", {
    class: "cfg-sync",
    children: [
      el("div", {
        class: "cfg-sync__text",
        children: [
          el("span", { class: "cfg-sync__label", text: "Última sincronização" }),
          syncValor,
        ],
      }),
      refreshBtn,
    ],
  });

  bloco.appendChild(
    el("div", {
      class: "cfg-block__body",
      children: [
        el("div", { class: "cfg-status__top", children: [foto, info] }),
        syncBar,
      ],
    })
  );
  return bloco;
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */
export async function renderConfig(ctx) {
  const root = sectionRoot("config");

  root.appendChild(
    pageHead({
      title: "Configurações da família",
      subtitle: "Gerencie o perfil, as notificações e as preferências do Cogni.",
    })
  );

  const [crianca, responsavel] = await Promise.all([
    ctx.mock.getCrianca(),
    ctx.mock.getResponsavel(),
  ]);

  // Estado local da criança (atualizado ao salvar o perfil).
  let criancaAtual = crianca;

  // Host do bloco de perfil (re-renderizado ao salvar).
  const perfilHost = el("div", { class: "cfg-perfil-host" });

  function abrirDetalhe() {
    openModal({
      title: "Detalhes do perfil",
      size: "lg",
      content: ({ close }) =>
        formularioPerfil(criancaAtual, {
          close,
          onSubmit: async (patch) => {
            criancaAtual = await ctx.mock.atualizarCrianca(patch);
            renderPerfil();
            // Atualiza o card da sidebar (nome/idade) ao vivo.
            const nameEl = document.querySelector("[data-dash-child-name]");
            const metaEl = document.querySelector("[data-dash-child-meta]");
            if (nameEl) nameEl.textContent = criancaAtual.nome || "Criança";
            if (metaEl) metaEl.textContent = idadeLabel(criancaAtual.idade);
            close();
            if (window.cognifyToast)
              window.cognifyToast.show("Perfil salvo!", { type: "success" });
          },
        }),
    });
  }

  function renderPerfil() {
    perfilHost.replaceChildren(blocoPerfil(criancaAtual, abrirDetalhe));
  }
  renderPerfil();

  // Monta o grid de blocos (2 colunas no desktop).
  const grid = el("div", {
    class: "cfg-grid",
    children: [
      perfilHost,
      blocoNotificacoes(),
      blocoConta(responsavel),
      blocoTema(),
      blocoStatus(),
    ],
  });
  root.appendChild(grid);

  return root;
}
