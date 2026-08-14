/**
 * planos.js — Seção "Planos de estudo".
 *
 * Lista de planos com abas (Ativos / Todos / Concluídos), cards e um modal
 * de criar/editar FUNCIONAL (cria, edita e exclui no mock). Validação de
 * formulário. O pai escreve direto; ao integrar, as chamadas do mock viram
 * insert/update/delete no Supabase (RLS protege).
 *
 * Campos do contrato (planos_estudo) no MVP: titulo, conteudo, foco,
 * duracao_dias, status. (Sem tempo_diario_min/horario — removidos do schema.)
 *
 * Toda escrita (criar/editar/excluir) também dá um ping no servidor local pra
 * Cogni pegar o plano na hora — ver `refrescarPlanosNoRobo` abaixo.
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon } from "../icons.js";
import { openModal } from "../modal.js";
import { materiasAgrupadas, materiaLabel, statusLabel } from "../format.js";

/** Status possíveis (planos_estudo.status). */
const STATUS = ["ativo", "em_andamento", "pausado", "concluido"];

/** Teto do ping ao servidor: request pendurado não pode acumular na aba. */
const TIMEOUT_REFRESCAR_MS = 4000;

/**
 * Avisa o servidor local que os planos desta criança mudaram, pra ele recarregar
 * o plano vigente no cache e a Cogni já usar na conversa em andamento.
 *
 * É o PLANO B do Realtime do Supabase (que o servidor escuta em `planos_estudo`):
 * se a replicação for desabilitada no painel ou o canal cair, este ping mantém a
 * propagação instantânea. Idempotente — chamar duas vezes não custa nada.
 *
 * BEST-EFFORT de propósito, e por isso nada aqui é aguardado nem vira mensagem
 * de tela: o servidor do robô costuma estar DESLIGADO na hora em que o pai mexe
 * no plano, e isso não é erro — o plano já está salvo no Supabase e o robô o pega
 * no boot. Mostrar falha aqui só assustaria o pai à toa.
 *
 * @param {string} servidorUrl — base do servidor local da Cogni
 * @param {string} criancaId
 */
function refrescarPlanosNoRobo(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return;
  fetch(`${servidorUrl}/api/planos/refrescar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criancaId }),
    signal: AbortSignal.timeout(TIMEOUT_REFRESCAR_MS),
  }).catch(() => {
    // Servidor off, CORS, timeout: todos são o mesmo recado — "o robô não viu
    // ainda", que é um estado normal aqui.
  });
}

/* --------------------------------------------------------------------------
   Cards e listagem
   -------------------------------------------------------------------------- */

/** Badge de status (bolinha + rótulo, cor por status). */
function statusBadge(status) {
  return el("span", {
    class: "pl-status",
    attrs: { "data-status": status },
    children: [
      el("span", { class: "pl-status__dot", attrs: { "aria-hidden": "true" } }),
      el("span", { text: statusLabel(status) }),
    ],
  });
}

/** Item de meta do card (ícone + rótulo + valor). */
function metaItem(iconSvg, rotulo, valor) {
  return el("div", {
    class: "pl-meta",
    children: [
      el("span", {
        class: "pl-meta__label",
        children: [
          el("span", { class: "pl-meta__ico", svg: iconSvg }),
          el("span", { text: rotulo }),
        ],
      }),
      el("span", { class: "pl-meta__value", text: valor }),
    ],
  });
}

/** Card de um plano. */
function cardPlano(plano, { onEdit }) {
  const disco = el("div", {
    class: "pl-card__disc",
    attrs: { "data-materia": plano.foco },
    children: [el("span", { svg: materiaIcon(plano.foco) })],
  });

  const topo = el("div", {
    class: "pl-card__topbar",
    children: [
      el("h3", { class: "pl-card__title", text: plano.titulo }),
      statusBadge(plano.status),
    ],
  });

  const metas = el("div", {
    class: "pl-card__metas",
    children: [
      metaItem(ICON.calendar, "Duração", `${plano.duracao_dias} dias`),
      metaItem(ICON.book, "Foco", materiaLabel(plano.foco)),
    ],
  });

  const corpo = el("div", {
    class: "pl-card__main",
    children: [
      topo,
      plano.conteudo
        ? el("p", { class: "pl-card__desc", text: plano.conteudo })
        : null,
      metas,
    ],
  });

  const editBtn = el("button", {
    class: "pl-card__edit",
    attrs: { type: "button", "aria-label": `Editar plano ${plano.titulo}` },
    svg: ICON.edit,
  });
  editBtn.addEventListener("click", () => onEdit(plano));

  const card = el("article", {
    class: "dash-card pl-card",
    children: [disco, corpo, editBtn],
  });
  return card;
}

/* --------------------------------------------------------------------------
   Formulário do modal (criar/editar)
   -------------------------------------------------------------------------- */

/** Campo de formulário genérico (label + controle + slot de erro). */
function field(labelText, control, { hint } = {}) {
  const wrap = el("div", { class: "pl-field" });
  const lbl = el("label", { class: "pl-field__label", text: labelText });
  if (control.id) lbl.setAttribute("for", control.id);
  wrap.appendChild(lbl);
  if (hint) wrap.appendChild(el("p", { class: "pl-field__hint", text: hint }));
  wrap.appendChild(control);
  wrap.appendChild(el("p", { class: "pl-field__error", attrs: { "aria-live": "polite" } }));
  return wrap;
}

function setError(fieldEl, msg) {
  const err = fieldEl.querySelector(".pl-field__error");
  const ctrl = fieldEl.querySelector("input, select, textarea");
  if (err) err.textContent = msg || "";
  fieldEl.classList.toggle("is-error", !!msg);
  if (ctrl) ctrl.setAttribute("aria-invalid", msg ? "true" : "false");
}

/**
 * Constrói o conteúdo do modal de criar/editar plano.
 * @param {object|null} plano — null = criar; objeto = editar
 * @param {object} handlers — { onSubmit(dados), onDelete(plano), close }
 */
function formularioPlano(plano, { onSubmit, onDelete, close }) {
  const editando = !!plano;
  const form = el("form", { class: "pl-form", attrs: { novalidate: "true" } });

  // Título
  const inTitulo = el("input", {
    class: "pl-input",
    attrs: {
      id: "pl-titulo",
      type: "text",
      maxlength: "80",
      placeholder: "Ex.: Leitura divertida",
      value: editando ? plano.titulo : "",
    },
  });
  const fTitulo = field("Título do plano", inTitulo);

  // Foco (matéria) — agrupado por área: 14 opções soltas num <select> nativo
  // viram uma lista longa demais pra achar "Sociologia" de primeira.
  const selFoco = el("select", { class: "pl-input pl-select", attrs: { id: "pl-foco" } });
  materiasAgrupadas().forEach((grupo) => {
    const og = el("optgroup", { attrs: { label: grupo.label } });
    grupo.materias.forEach((m) => {
      const opt = el("option", { attrs: { value: m.valor }, text: m.label });
      if (editando && plano.foco === m.valor) opt.selected = true;
      og.appendChild(opt);
    });
    selFoco.appendChild(og);
  });
  const fFoco = field("Foco (matéria)", selFoco);

  // Duração (dias)
  const inDuracao = el("input", {
    class: "pl-input",
    attrs: {
      id: "pl-duracao",
      type: "number",
      min: "1",
      max: "365",
      inputmode: "numeric",
      placeholder: "Ex.: 30",
      value: editando ? String(plano.duracao_dias) : "",
    },
  });
  const fDuracao = field("Duração (dias)", inDuracao);

  // Status
  const selStatus = el("select", { class: "pl-input pl-select", attrs: { id: "pl-status" } });
  STATUS.forEach((s) => {
    const opt = el("option", { attrs: { value: s }, text: statusLabel(s) });
    if (editando ? plano.status === s : s === "ativo") opt.selected = true;
    selStatus.appendChild(opt);
  });
  const fStatus = field("Status", selStatus);

  // Conteúdo (texto livre injetado no prompt da Cogni)
  const txtConteudo = el("textarea", {
    class: "pl-input pl-textarea",
    attrs: {
      id: "pl-conteudo",
      rows: "4",
      maxlength: "600",
      placeholder:
        "Descreva o objetivo do plano. Esse texto orienta a Cogni nas conversas.",
    },
  });
  if (editando) txtConteudo.value = plano.conteudo || "";
  const fConteudo = field("Conteúdo do plano", txtConteudo, {
    hint: "Esse texto é injetado no que a Cogni sabe sobre o plano.",
  });

  // Linha com 2 colunas (foco + duração) e (status)
  const grid = el("div", {
    class: "pl-form__grid",
    children: [fFoco, fDuracao, fStatus],
  });

  form.append(fTitulo, grid, fConteudo);

  // Rodapé com ações
  const actions = el("div", { class: "pl-form__actions" });

  // Excluir (só ao editar) — fica à esquerda
  if (editando) {
    const delBtn = el("button", {
      class: "pl-btn pl-btn--danger",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.trash }),
        el("span", { text: "Excluir" }),
      ],
    });
    delBtn.addEventListener("click", () => onDelete(plano));
    actions.appendChild(delBtn);
  }

  const spacer = el("div", { class: "pl-form__spacer" });
  const cancelBtn = el("button", {
    class: "dash-btn dash-btn--ghost",
    attrs: { type: "button" },
    text: "Cancelar",
  });
  cancelBtn.addEventListener("click", close);
  const saveBtn = el("button", {
    class: "dash-btn dash-btn--primary",
    attrs: { type: "submit" },
    text: editando ? "Salvar alterações" : "Criar plano",
  });
  actions.append(spacer, cancelBtn, saveBtn);
  form.appendChild(actions);

  // Aviso de falha de gravação (rede/RLS). Fica junto das ações, com aria-live
  // pra o leitor de tela anunciar sem precisar de foco.
  const erroSalvar = el("p", {
    class: "pl-form__erro",
    attrs: { role: "status", "aria-live": "polite" },
  });
  form.appendChild(erroSalvar);

  // Validação + submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let ok = true;

    const titulo = inTitulo.value.trim();
    if (!titulo) {
      setError(fTitulo, "Dê um nome ao plano.");
      ok = false;
    } else setError(fTitulo, "");

    const dur = parseInt(inDuracao.value, 10);
    if (!inDuracao.value.trim() || Number.isNaN(dur) || dur < 1 || dur > 365) {
      setError(fDuracao, "Informe de 1 a 365 dias.");
      ok = false;
    } else setError(fDuracao, "");

    if (!ok) {
      const firstErr = form.querySelector(".is-error input, .is-error select, .is-error textarea");
      if (firstErr) firstErr.focus();
      return;
    }

    // Trava o botão durante a gravação: sem isso, um duplo clique (ou uma rede
    // lenta) cria dois planos iguais. E, se a escrita falhar, o pai PRECISA
    // saber — antes o erro morria como promise rejeitada e o modal ficava
    // parado, dando a impressão de que salvou.
    const rotulo = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando…";
    erroSalvar.textContent = "";
    try {
      await onSubmit({
        titulo,
        conteudo: txtConteudo.value.trim(),
        foco: selFoco.value,
        duracao_dias: dur,
        status: selStatus.value,
      });
    } catch (err) {
      console.error("[Companion] Falha ao salvar o plano:", err);
      erroSalvar.textContent =
        "Não consegui salvar agora. Verifique sua conexão e tente de novo.";
      toast("Não foi possível salvar o plano.", "error");
    } finally {
      // Em caso de sucesso o modal já fechou (nó removido) — inofensivo.
      saveBtn.disabled = false;
      saveBtn.textContent = rotulo;
    }
  });

  return form;
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */

export async function renderPlanos(ctx) {
  const root = sectionRoot("planos");
  const nome = (ctx.crianca && ctx.crianca.nome) || "a criança";
  const criancaId = ctx.crianca && ctx.crianca.id;

  /** Ping best-effort pro robô — chamado depois de toda escrita em planos. */
  const avisarRobo = () => refrescarPlanosNoRobo(ctx.servidorUrl, criancaId);

  // Estado local
  const state = { aba: "ativos", planos: [] };

  // Cabeçalho com botão "Criar novo plano"
  const criarBtn = el("button", {
    class: "dash-btn dash-btn--primary pl-create",
    attrs: { type: "button" },
    children: [
      el("span", { class: "pl-btn__ico", svg: ICON.plus }),
      el("span", { text: "Criar novo plano" }),
    ],
  });
  const head = pageHead({
    title: "Planos de estudo",
    subtitle: `Organize os estudos do ${nome.split(/\s+/)[0]} com planos personalizados.`,
    action: criarBtn,
  });
  root.appendChild(head);

  // Abas + contador
  const abas = ["ativos", "todos", "concluidos"];
  const abaLabels = { ativos: "Ativos", todos: "Todos", concluidos: "Concluídos" };
  const tabsWrap = el("div", { class: "pl-tabs" });
  const tabBtns = {};
  abas.forEach((a) => {
    const b = el("button", {
      class: "pl-tab" + (a === state.aba ? " is-active" : ""),
      attrs: { type: "button", role: "tab", "aria-selected": String(a === state.aba) },
      text: abaLabels[a],
    });
    b.addEventListener("click", () => {
      state.aba = a;
      Object.entries(tabBtns).forEach(([k, btn]) => {
        const on = k === a;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", String(on));
      });
      renderLista();
    });
    tabBtns[a] = b;
    tabsWrap.appendChild(b);
  });

  const contador = el("span", {
    class: "pl-count",
    children: [
      el("span", { class: "pl-count__ico", svg: ICON.calendar }),
      el("span", { class: "pl-count__text", text: "" }),
    ],
  });

  const toolbar = el("div", {
    class: "pl-toolbar",
    children: [tabsWrap, contador],
  });
  root.appendChild(toolbar);

  // Host da lista
  const listaHost = el("div", { class: "pl-list-host" });
  root.appendChild(listaHost);

  /* ---- Funções de dados/render ---- */
  async function carregar() {
    state.planos = await ctx.mock.getPlanos();
  }

  function filtrar() {
    if (state.aba === "ativos") {
      return state.planos.filter(
        (p) => p.status === "ativo" || p.status === "em_andamento"
      );
    }
    if (state.aba === "concluidos") {
      return state.planos.filter((p) => p.status === "concluido");
    }
    return state.planos.slice();
  }

  function renderLista() {
    const lista = filtrar();
    const ativos = state.planos.filter(
      (p) => p.status === "ativo" || p.status === "em_andamento"
    ).length;
    contador.querySelector(".pl-count__text").textContent =
      `${ativos} ${ativos === 1 ? "plano ativo" : "planos ativos"}`;

    listaHost.replaceChildren();
    if (!lista.length) {
      listaHost.appendChild(estadoVazio());
      return;
    }
    const grid = el("div", { class: "pl-list" });
    lista.forEach((p) =>
      grid.appendChild(cardPlano(p, { onEdit: abrirEditar }))
    );
    listaHost.appendChild(grid);
  }

  function estadoVazio() {
    const criar = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.plus }),
        el("span", { text: "Criar plano" }),
      ],
    });
    criar.addEventListener("click", abrirCriar);
    const labelAba =
      state.aba === "concluidos"
        ? "Nenhum plano concluído ainda."
        : state.aba === "ativos"
        ? "Nenhum plano ativo no momento."
        : "Nenhum plano criado ainda.";
    return el("div", {
      class: "pl-empty",
      children: [
        el("span", { class: "pl-empty__ico", svg: ICON.calendar }),
        el("p", { class: "pl-empty__title", text: labelAba }),
        el("p", {
          class: "pl-empty__text",
          text: "Crie um plano pra orientar os estudos com a Cogni.",
        }),
        criar,
      ],
    });
  }

  /* ---- Modal criar/editar ---- */
  function abrirCriar() {
    openModal({
      title: "Criar novo plano",
      size: "md",
      content: ({ close }) =>
        formularioPlano(null, {
          close,
          onSubmit: async (dados) => {
            await ctx.mock.criarPlano(dados);
            avisarRobo();
            await carregar();
            renderLista();
            close();
            toast("Plano criado com sucesso!", "success");
          },
          onDelete: () => {}, // não há excluir ao criar
        }),
    });
  }

  function abrirEditar(plano) {
    openModal({
      title: "Editar plano",
      size: "md",
      content: ({ close }) =>
        formularioPlano(plano, {
          close,
          onSubmit: async (dados) => {
            await ctx.mock.atualizarPlano(plano.id, dados);
            avisarRobo();
            await carregar();
            renderLista();
            close();
            toast("Plano atualizado!", "success");
          },
          onDelete: (p) => confirmarExclusao(p, close),
        }),
    });
  }

  function confirmarExclusao(plano, closeEdit) {
    openModal({
      title: "Excluir plano",
      size: "sm",
      content: ({ close }) => {
        const wrap = el("div", { class: "pl-confirm" });
        wrap.appendChild(
          el("p", {
            class: "pl-confirm__text",
            text: `Tem certeza que deseja excluir o plano “${plano.titulo}”? Essa ação não pode ser desfeita.`,
          })
        );
        const cancel = el("button", {
          class: "dash-btn dash-btn--ghost",
          attrs: { type: "button" },
          text: "Cancelar",
        });
        cancel.addEventListener("click", close);
        const confirm = el("button", {
          class: "pl-btn pl-btn--danger",
          attrs: { type: "button" },
          children: [
            el("span", { class: "pl-btn__ico", svg: ICON.trash }),
            el("span", { text: "Excluir plano" }),
          ],
        });
        const erro = el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
        });
        confirm.addEventListener("click", async () => {
          confirm.disabled = true;
          cancel.disabled = true;
          erro.textContent = "";
          try {
            await ctx.mock.removerPlano(plano.id);
            avisarRobo();
            await carregar();
            renderLista();
            close(); // fecha confirmação
            if (typeof closeEdit === "function") closeEdit(); // fecha edição
            toast("Plano excluído.", "info");
          } catch (err) {
            // Falha de rede/RLS não pode sumir em silêncio: sem isto o modal
            // ficava aberto e parecia que o plano tinha sido excluído.
            console.error("[Companion] Falha ao excluir o plano:", err);
            confirm.disabled = false;
            cancel.disabled = false;
            erro.textContent = "Não consegui excluir agora. Tente de novo.";
          }
        });
        wrap.appendChild(
          el("div", {
            class: "pl-confirm__actions",
            children: [cancel, confirm],
          })
        );
        wrap.appendChild(erro);
        return wrap;
      },
    });
  }

  criarBtn.addEventListener("click", abrirCriar);

  // Carrega e renderiza
  await carregar();
  renderLista();

  return root;
}

/** Atalho pro toast global (se existir). */
function toast(msg, type) {
  if (window.cognifyToast) window.cognifyToast.show(msg, { type });
}
