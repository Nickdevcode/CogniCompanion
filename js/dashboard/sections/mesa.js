/**
 * mesa.js — Seção "Mesa de Estudos" (era "Planos").
 *
 * A tela deixou de ser uma lista de parágrafos e virou um quadro. O plano continua
 * existindo igual (título, conteúdo, foco, duração, status), mas agora ele tem
 * PROGRESSO: `A fazer · Fazendo · Feito`, com drag and drop de mouse, de toque e de
 * teclado. E o quadro é vivo — a Cogni move os cards sozinha enquanto conversa com a
 * criança, e o pai vê acontecer.
 *
 * Três decisões desta tela que não são óbvias no código:
 *
 * 1. **O quadro é do plano SELECIONADO**, não de todas as tarefas da criança. É o
 *    que o backend implementa (o servidor lê as tarefas embutidas no plano vigente),
 *    e é o que faz "o que a Cogni está seguindo" ter uma resposta única.
 * 2. **Selecionar um plano que a Cogni NÃO segue é permitido — e avisado.** O pai
 *    pode abrir o quadro de um plano pausado, concluído, vencido ou ainda em
 *    rascunho. Sem o aviso, ele arrastaria cards esperando o robô reagir, e o robô
 *    não reage. A regra de "qual é o vigente" é a mesma do servidor (ver
 *    `planoVigente` em `format.js`).
 * 3. **O canal do Realtime é `const` do escopo do render** e morre com a seção. O
 *    router não avisa quando desmonta — ver `aposentar()` no fim do arquivo.
 *
 * Campos do contrato: `planos_estudo` (titulo, conteudo, foco, duracao_dias, status,
 * origem, extraido_texto) e `plano_tarefas` (ver o schema no plano técnico).
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon, origemIcon } from "../icons.js";
import { openModal } from "../modal.js";
import {
  COLUNAS,
  colunaLabel,
  materiasAgrupadas,
  materiaLabel,
  statusLabel,
  origemLabel,
  formatPrazo,
  planoVigente,
  motivoNaoVigente,
} from "../format.js";
import { criarQuadro } from "../dnd.js";
import { assinarMesa } from "../mesa-realtime.js";
import { abrirCapturaDeMaterial } from "../captura.js";

/**
 * Status que o pai pode escolher no formulário.
 * `rascunho` fica de fora de propósito: é estado de sistema (plano que a IA montou —
 * do material da escola ou do que o pai pediu — e ele ainda não aprovou), não uma
 * opção de menu.
 */
const STATUS = ["ativo", "em_andamento", "pausado", "concluido"];

/** Abaixo disto o card ganha o chip "confira". */
const CONFIANCA_BAIXA = 0.6;

/** Pra onde o "Desfazer" devolve o card que a Cogni moveu. */
const COLUNA_ANTERIOR = { feito: "fazendo", fazendo: "a_fazer" };

/** O ✨ explicado — a partir de `plano_tarefas.evidencia.motivo`. */
function explicarCogni(evidencia) {
  const e = evidencia || {};
  if (e.motivo === "pratica") {
    const n = Number(e.acertos);
    return Number.isFinite(n) && n > 0
      ? `acertou ${n} ${n === 1 ? "exercício" : "exercícios"} disso`
      : "acertou os exercícios disso";
  }
  if (e.motivo === "fala") return "ela disse que terminou";
  if (e.motivo === "conversa") return "a Cogni trabalhou isso na conversa";
  // Motivo novo que o servidor passe a mandar: melhor uma frase honesta e vaga que
  // vazar a chave crua ('dispersa') pra tela do pai.
  return "a Cogni acompanhou isso na conversa";
}

const toast = (msg, type) => {
  if (window.cognifyToast) window.cognifyToast.show(msg, { type });
};

/* ==========================================================================
   Render
   ========================================================================== */

export async function renderMesa(ctx) {
  const raiz = sectionRoot("mesa");
  const primeiroNome = ((ctx.crianca && ctx.crianca.nome) || "a criança").split(/\s+/)[0];
  const agora = ctx.now || new Date();

  const estado = {
    aba: "ativos",
    planos: [],
    planoId: null,
    /** id → linha de `plano_tarefas` (a verdade; o DOM é só a vista) */
    porId: new Map(),
    /** id → o <article> do card */
    nos: new Map(),
    /**
     * Modo de seleção de PLANOS (não de tarefas).
     *
     * Ele é um modo, e não checkboxes sempre visíveis, porque o uso normal da tela é
     * abrir um plano — checkbox em cada chip o tempo todo transformaria o seletor
     * numa lista de formulário e roubaria o clique que hoje troca de plano.
     */
    modoSelecao: false,
    /** @type {Set<string>} ids marcados enquanto o modo está ligado */
    selecionados: new Set(),
  };

  let quadro = null;
  let sincronia = null;
  /**
   * O callback que drena a fila do Realtime quando o arraste acaba.
   *
   * Guardado aqui porque `pintarQuadro()` DESTRÓI e recria o `quadro` — e com ele os
   * callbacks registrados. Sem re-registrar no quadro novo, o primeiro repinte
   * deixaria a fila sem quem a esvaziasse, e os eventos seguintes ficariam presos
   * nela pra sempre.
   */
  let drenarFila = null;

  /* ---- Cabeçalho --------------------------------------------------------- */

  /**
   * Os dois botões competiam: "Da foto" e "Novo plano" criam plano do mesmo jeito, e
   * o primário era o caminho TRABALHOSO — o que dá trabalho não é feito. Agora o
   * primário é o atalho, e escrever à mão é a alternativa explícita ("Escrever eu
   * mesmo" já era o vocabulário do estado vazio).
   */
  const btnCogni = el("button", {
    class: "dash-btn dash-btn--primary mesa-acao",
    attrs: { type: "button" },
    children: [
      el("span", { class: "pl-btn__ico", svg: ICON.sparkle }),
      el("span", { text: "Criar com a Cogni" }),
    ],
  });
  const btnNovo = el("button", {
    class: "dash-btn dash-btn--ghost mesa-acao",
    attrs: { type: "button" },
    children: [
      el("span", { class: "pl-btn__ico", svg: ICON.plus }),
      el("span", { text: "Escrever eu mesmo" }),
    ],
  });

  raiz.appendChild(
    pageHead({
      title: "Mesa de Estudos",
      subtitle: `O que o ${primeiroNome} vai estudar — e como está indo.`,
      action: el("div", { class: "mesa-acoes", children: [btnCogni, btnNovo] }),
    })
  );

  /* ---- Abas -------------------------------------------------------------- */

  const ABAS = [
    { id: "revisar", label: "Para revisar" },
    { id: "ativos", label: "Ativos" },
    { id: "todos", label: "Todos" },
    { id: "concluidos", label: "Concluídos" },
  ];
  const tabBtns = {};
  const tabsWrap = el("div", { class: "pl-tabs", attrs: { role: "tablist" } });
  ABAS.forEach((a) => {
    const contador = el("span", { class: "pl-tab__badge", attrs: { hidden: "hidden" } });
    const b = el("button", {
      class: "pl-tab",
      attrs: { type: "button", role: "tab", "aria-selected": "false" },
      children: [el("span", { text: a.label }), contador],
    });
    b.addEventListener("click", async () => {
      estado.aba = a.id;
      // A seleção morre ao trocar de aba: ela some da vista, e excluir em lote o que
      // não está mais na tela é exatamente o acidente que o modo deveria evitar.
      estado.selecionados.clear();
      // Trocar de aba pode esconder o plano aberto: reancoramos no melhor da aba
      // nova em vez de deixar a tela mostrando um quadro que a lista já não lista.
      const visiveis = planosDaAba();
      if (visiveis.some((p) => String(p.id) === String(estado.planoId))) {
        pintarTudo();
        return;
      }
      await selecionarPlano(melhorDaAba(visiveis));
    });
    tabBtns[a.id] = { botao: b, contador };
    tabsWrap.appendChild(b);
  });

  /**
   * Liga o modo de seleção. Fica na toolbar, ao lado das abas, porque é uma ação
   * sobre a LISTA de planos — não sobre o plano aberto.
   */
  const btnSelecionar = el("button", {
    class: "dash-btn dash-btn--ghost mesa-selecionar",
    attrs: { type: "button", "aria-pressed": "false" },
    children: [
      el("span", { class: "pl-btn__ico", svg: ICON.check }),
      el("span", { class: "mesa-selecionar__texto", text: "Selecionar" }),
    ],
  });
  btnSelecionar.addEventListener("click", () => {
    estado.modoSelecao = !estado.modoSelecao;
    estado.selecionados.clear();
    pintarSeletor();
  });
  raiz.appendChild(el("div", { class: "pl-toolbar", children: [tabsWrap, btnSelecionar] }));

  /* ---- Barra do modo de seleção (nós VIVOS, atualizados no lugar) --------- */

  /**
   * Ela é montada uma vez e nunca é recriada — só escondida.
   *
   * Dois motivos, e os dois são de acessibilidade: o `aria-live` da contagem só
   * anuncia se a região **continuar a mesma** (região recriada é região nova, e o
   * leitor de tela não lê nada), e recriar os botões a cada marcação arrancaria o
   * foco de quem está usando teclado.
   */
  const selecaoContagem = el("span", {
    class: "mesa-selecao__contagem",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const selecaoTodos = el("button", {
    class: "dash-btn dash-btn--ghost",
    attrs: { type: "button" },
    text: "Selecionar todos",
  });
  const selecaoExcluirRotulo = el("span", { text: "Excluir plano" });
  const selecaoExcluir = el("button", {
    class: "pl-btn pl-btn--danger",
    attrs: { type: "button" },
    children: [el("span", { class: "pl-btn__ico", svg: ICON.trash }), selecaoExcluirRotulo],
  });
  const barraDeSelecao = el("div", {
    class: "mesa-selecao",
    attrs: { hidden: "hidden" },
    children: [selecaoContagem, selecaoTodos, selecaoExcluir],
  });

  selecaoTodos.addEventListener("click", () => {
    const lista = planosDaAba();
    const todos = lista.every((p) => estado.selecionados.has(String(p.id)));
    if (todos) estado.selecionados.clear();
    else lista.forEach((p) => estado.selecionados.add(String(p.id)));
    // Aqui a faixa É repintada: mudaram todos os chips de uma vez, e o foco está no
    // botão desta barra — que não é recriado.
    pintarSeletor();
  });
  selecaoExcluir.addEventListener("click", () => confirmarExclusaoEmLote(planosDaAba()));

  /** Atualiza os textos da barra a partir da seleção atual. */
  function pintarBarraDeSelecao() {
    const lista = planosDaAba();
    const n = estado.selecionados.size;
    const todos = lista.length > 0 && lista.every((p) => estado.selecionados.has(String(p.id)));

    selecaoContagem.textContent = n
      ? `${n} ${n === 1 ? "plano selecionado" : "planos selecionados"}`
      : "Toque nos planos que você quer excluir";
    selecaoTodos.textContent = todos ? "Limpar seleção" : "Selecionar todos";
    selecaoExcluirRotulo.textContent = n > 1 ? `Excluir ${n} planos` : "Excluir plano";
    selecaoExcluir.disabled = n === 0;
  }

  /* ---- Hosts ------------------------------------------------------------- */

  const faixaHost = el("div");
  const seletorHost = el("div", {
    class: "mesa-seletor-host",
    children: [barraDeSelecao, faixaHost],
  });
  const planoHost = el("div", { class: "mesa-plano-host" });
  const quadroHost = el("div", { class: "mesa-quadro-host" });
  raiz.append(seletorHost, planoHost, quadroHost);

  /* ==========================================================================
     Dados
     ========================================================================== */

  function planosDaAba() {
    const p = estado.planos;
    if (estado.aba === "revisar") return p.filter((x) => x.status === "rascunho");
    if (estado.aba === "ativos") {
      return p.filter((x) => x.status === "ativo" || x.status === "em_andamento");
    }
    if (estado.aba === "concluidos") return p.filter((x) => x.status === "concluido");
    return p.slice();
  }

  const planoAtual = () =>
    estado.planos.find((p) => String(p.id) === String(estado.planoId)) || null;

  /**
   * Qual plano abrir numa lista — o vigente, se ele estiver ali.
   *
   * Pegar só o primeiro da lista jogava o pai num plano antigo e vazio ao voltar
   * de "Para revisar" pra "Ativos". O que ele quer ver é o que está valendo.
   */
  function melhorDaAba(lista) {
    if (!lista.length) return null;
    const vigente = planoVigente(estado.planos, agora);
    const temVigente =
      vigente && lista.some((p) => String(p.id) === String(vigente.id));
    return temVigente ? vigente.id : lista[0].id;
  }

  async function carregarPlanos() {
    estado.planos = await ctx.mock.getPlanos();
    if (!estado.planoId) {
      // Abre no plano que a Cogni está seguindo — é a resposta que o pai quer
      // primeiro ("o que está valendo agora?"). Sem nenhum vigente, o que importa
      // é o que está esperando aprovação; sem isso também, mostra tudo.
      const vigente = planoVigente(estado.planos, agora);
      estado.planoId = vigente ? vigente.id : estado.planos[0] && estado.planos[0].id;
      if (vigente) estado.aba = "ativos";
      else if (estado.planos.some((p) => p.status === "rascunho")) estado.aba = "revisar";
      else estado.aba = "todos";
    }
  }

  async function carregarTarefas() {
    estado.porId.clear();
    if (estado.planoId == null) return;
    const linhas = await ctx.mock.getTarefas(estado.planoId);
    for (const t of linhas) estado.porId.set(String(t.id), t);
  }

  /* ==========================================================================
     Pintura
     ========================================================================== */

  function pintarTudo() {
    pintarAbas();
    pintarSeletor();
    pintarPlano();
    pintarQuadro();
  }

  function pintarAbas() {
    const rascunhos = estado.planos.filter((p) => p.status === "rascunho").length;
    ABAS.forEach((a) => {
      const { botao, contador } = tabBtns[a.id];
      const on = a.id === estado.aba;
      botao.classList.toggle("is-active", on);
      botao.setAttribute("aria-selected", String(on));
      // Só "Para revisar" ganha contador, e só quando há o que revisar: um badge
      // permanente em toda aba vira decoração e ninguém olha mais.
      if (a.id === "revisar" && rascunhos > 0) {
        contador.textContent = String(rascunhos);
        contador.removeAttribute("hidden");
        botao.classList.add("is-destaque");
      } else {
        contador.setAttribute("hidden", "hidden");
        botao.classList.remove("is-destaque");
      }
    });
  }

  /**
   * Faixa de planos da aba.
   *
   * Fora do modo de seleção ela some quando só há um plano — não há o que escolher.
   * DENTRO do modo ela aparece sempre, inclusive com um plano só: ali a faixa deixou
   * de ser um seletor e virou a lista onde se marca o que vai ser excluído.
   */
  function pintarSeletor() {
    const lista = planosDaAba();

    // Sem plano nenhum não há o que selecionar — e o modo não pode ficar ligado
    // apontando pra uma lista vazia.
    if (!estado.planos.length && estado.modoSelecao) {
      estado.modoSelecao = false;
      estado.selecionados.clear();
    }
    btnSelecionar.hidden = !estado.planos.length;
    btnSelecionar.setAttribute("aria-pressed", String(estado.modoSelecao));
    btnSelecionar.classList.toggle("is-active", estado.modoSelecao);
    btnSelecionar.querySelector(".mesa-selecionar__texto").textContent = estado.modoSelecao
      ? "Sair da seleção"
      : "Selecionar";

    barraDeSelecao.hidden = !estado.modoSelecao;
    if (estado.modoSelecao) pintarBarraDeSelecao();

    faixaHost.replaceChildren();
    if (!lista.length) return;
    if (lista.length < 2 && !estado.modoSelecao) return;

    const faixa = el("div", {
      class: "mesa-seletor" + (estado.modoSelecao ? " is-selecionando" : ""),
      attrs: estado.modoSelecao
        ? { role: "group", "aria-label": "Escolher planos para excluir" }
        : { role: "tablist", "aria-label": "Escolher plano" },
    });
    lista.forEach((p) => faixa.appendChild(chipDePlano(p)));
    faixaHost.appendChild(faixa);
  }

  /** Um chip da faixa. Vira alvo de seleção quando o modo está ligado. */
  function chipDePlano(p) {
    const id = String(p.id);
    const marcado = estado.selecionados.has(id);
    const on = !estado.modoSelecao && id === String(estado.planoId);

    const ico = el("span", {
      class: "mesa-chip-plano__ico",
      svg: estado.modoSelecao && marcado ? ICON.check : materiaIcon(p.foco),
    });
    const chip = el("button", {
      class:
        "mesa-chip-plano" +
        (on ? " is-active" : "") +
        (estado.modoSelecao && marcado ? " is-marcado" : ""),
      attrs: estado.modoSelecao
        ? { type: "button", "aria-pressed": String(marcado) }
        : { type: "button", role: "tab", "aria-selected": String(on) },
      children: [
        ico,
        el("span", { class: "mesa-chip-plano__titulo", text: p.titulo }),
        el("span", {
          class: "pl-status pl-status--mini",
          attrs: { "data-status": p.status },
          children: [el("span", { class: "pl-status__dot", attrs: { "aria-hidden": "true" } })],
        }),
      ],
    });

    chip.addEventListener("click", () => {
      if (!estado.modoSelecao) {
        selecionarPlano(p.id);
        return;
      }
      /**
       * Marcar atualiza o PRÓPRIO chip, sem repintar a faixa.
       *
       * Repintar destruiria o botão que acabou de ser clicado, e quem navega por
       * teclado perderia o foco a cada Enter — no meio de uma tarefa que é, por
       * definição, marcar vários seguidos.
       */
      const agora = !estado.selecionados.has(id);
      if (agora) estado.selecionados.add(id);
      else estado.selecionados.delete(id);
      chip.classList.toggle("is-marcado", agora);
      chip.setAttribute("aria-pressed", String(agora));
      // Markup de ícone ESTÁTICO dos dois lados (mesma regra do `svg:` do `el`):
      // `materiaIcon` só escolhe numa tabela do código — nada aqui vem de dado.
      ico.innerHTML = agora ? ICON.check : materiaIcon(p.foco);
      pintarBarraDeSelecao();
    });

    return chip;
  }

  /**
   * Abre o quadro de outro plano.
   *
   * Caminho ÚNICO, usado pelas abas e pelo seletor. Quando eram dois, trocar de
   * aba repintava o cabeçalho do plano novo com os cards do plano velho — o pai
   * via um quadro que não era daquele plano, sem nenhum aviso.
   */
  async function selecionarPlano(id) {
    if (String(id) === String(estado.planoId)) {
      pintarTudo();
      return;
    }
    estado.planoId = id;
    pintarAbas();
    pintarSeletor();
    pintarPlano();
    quadroHost.replaceChildren(carregando());
    await carregarTarefas();
    pintarQuadro();
  }

  const carregando = () =>
    el("div", {
      class: "dash-loading",
      children: [
        el("span", { class: "dash-loading__spinner", attrs: { "aria-hidden": "true" } }),
        el("p", { text: "Carregando…" }),
      ],
    });

  function pintarPlano() {
    planoHost.replaceChildren();
    const plano = planoAtual();
    if (!plano) return;

    const vigente = planoVigente(estado.planos, agora);
    const ehVigente = vigente && String(vigente.id) === String(plano.id);

    const editar = el("button", {
      class: "pl-card__edit",
      attrs: { type: "button", "aria-label": `Editar o plano ${plano.titulo}` },
      svg: ICON.edit,
    });
    editar.addEventListener("click", () => abrirFormulario(plano));

    /**
     * Excluir estava escondido DENTRO do formulário de edição: pra apagar um plano o
     * pai tinha que abrir "editar" — uma tela que promete o contrário do que ele
     * quer. O botão continua lá (quem já está editando e desistiu do plano não
     * precisa fechar o modal), e agora existe também aqui, um toque de distância.
     */
    const excluir = el("button", {
      class: "pl-card__edit mesa-plano__excluir",
      attrs: { type: "button", "aria-label": `Excluir o plano ${plano.titulo}` },
      svg: ICON.trash,
    });
    excluir.addEventListener("click", () => confirmarExclusaoPlano(plano));

    const topo = el("div", {
      class: "pl-card__topbar",
      children: [
        el("h2", { class: "pl-card__title", text: plano.titulo }),
        el("span", {
          class: "pl-status",
          attrs: { "data-status": plano.status },
          children: [
            el("span", { class: "pl-status__dot", attrs: { "aria-hidden": "true" } }),
            el("span", { text: statusLabel(plano.status) }),
          ],
        }),
      ],
    });
    // A pílula diz em palavras o que está valendo. É o par do aviso de baixo: um
    // confirma, o outro corrige — e nenhum dos dois depende de o pai decifrar cor.
    if (ehVigente) {
      topo.appendChild(
        el("span", {
          class: "mesa-plano__selo",
          children: [
            el("span", { class: "mesa-plano__selo-ico", svg: ICON.sparkle }),
            el("span", { text: "a Cogni está seguindo" }),
          ],
        })
      );
    }
    const filhos = [topo];

    if (plano.conteudo) {
      filhos.push(el("p", { class: "pl-card__desc", text: plano.conteudo }));
    }

    const metas = el("div", { class: "mesa-plano__metas" });
    metas.append(
      el("span", {
        class: "mesa-meta",
        children: [
          el("span", { class: "mesa-meta__ico", svg: ICON.book }),
          el("span", { text: materiaLabel(plano.foco) }),
        ],
      }),
      el("span", {
        class: "mesa-meta",
        children: [
          el("span", { class: "mesa-meta__ico", svg: ICON.calendar }),
          el("span", {
            text: plano.duracao_dias ? `${plano.duracao_dias} dias` : "sem prazo",
          }),
        ],
      })
    );
    // De onde o plano nasceu. Desde a rodada 2 são quatro origens possíveis, não só
    // foto — e o selo some sozinho quando o plano foi digitado à mão (`manual`).
    const rotuloOrigem = origemLabel(plano.origem);
    if (rotuloOrigem) {
      metas.append(
        el("span", {
          class: "mesa-meta mesa-meta--origem",
          children: [
            el("span", { class: "mesa-meta__ico", svg: origemIcon(plano.origem) }),
            el("span", { text: rotuloOrigem }),
          ],
        })
      );
    }
    filhos.push(metas);

    // O aviso que evita o pai arrastar card esperando reação do robô.
    if (!ehVigente) {
      filhos.push(
        el("p", {
          class: "mesa-aviso",
          attrs: { role: "note" },
          children: [
            el("span", { class: "mesa-aviso__ico", svg: ICON.alert }),
            el("span", {
              text:
                "A Cogni não está seguindo este plano agora. " +
                (motivoNaoVigente(plano, estado.planos, agora) || ""),
            }),
          ],
        })
      );
    }

    if (plano.extraido_texto) {
      filhos.push(
        el("details", {
          class: "cap__leitura",
          children: [
            el("summary", { text: "Ver o que a Cogni entendeu do material" }),
            el("pre", { class: "cap__leitura-texto", text: plano.extraido_texto }),
          ],
        })
      );
    }

    // Rascunho: o botão que fecha a trava de aprovação.
    if (plano.status === "rascunho") {
      const aprovar = el("button", {
        class: "dash-btn dash-btn--primary",
        attrs: { type: "button" },
        children: [
          el("span", { class: "pl-btn__ico", svg: ICON.check }),
          el("span", { text: "Aprovar e ativar" }),
        ],
      });
      aprovar.addEventListener("click", async () => {
        aprovar.disabled = true;
        try {
          await ctx.mock.aprovarPlano(plano.id);
          await carregarPlanos();
          estado.aba = "ativos";
          pintarTudo();
          toast("Plano aprovado! A Cogni já pode seguir.", "success");
        } catch (err) {
          console.error("[Companion] Falha ao aprovar o plano:", err);
          aprovar.disabled = false;
          toast("Não consegui aprovar agora.", "error");
        }
      });
      filhos.push(el("div", { class: "mesa-plano__acoes", children: [aprovar] }));
    }

    planoHost.appendChild(
      el("article", {
        class: "dash-card mesa-plano" + (ehVigente ? " is-vigente" : ""),
        children: [
          el("div", {
            class: "pl-card__disc",
            attrs: { "data-materia": plano.foco },
            children: [el("span", { svg: materiaIcon(plano.foco) })],
          }),
          el("div", { class: "pl-card__main", children: filhos }),
          el("div", { class: "mesa-plano__botoes", children: [editar, excluir] }),
        ],
      })
    );
  }

  /* ---- O quadro ---------------------------------------------------------- */

  function tarefasDaColuna(colunaId) {
    return Array.from(estado.porId.values())
      .filter((t) => (COLUNAS.some((c) => c.id === t.coluna) ? t.coluna : "a_fazer") === colunaId)
      .sort((a, b) => (a.ordem - b.ordem) || (Number(a.id) - Number(b.id)));
  }

  function pintarQuadro() {
    if (quadro) {
      quadro.destruir();
      quadro = null;
    }
    estado.nos.clear();
    quadroHost.replaceChildren();

    const plano = planoAtual();
    if (!plano) {
      quadroHost.appendChild(vazioGeral());
      return;
    }

    const board = el("div", {
      class: "mesa-board",
      attrs: { "aria-label": "Quadro de tarefas" },
    });

    COLUNAS.forEach((c) => {
      const lista = el("div", {
        class: "mesa-col__lista",
        attrs: { "data-dnd-coluna": c.id },
      });
      const itens = tarefasDaColuna(c.id);
      itens.forEach((t) => lista.appendChild(criarCard(t)));
      if (!itens.length) lista.appendChild(vazioDaColuna(c.id));

      const adicionar = el("button", {
        class: "mesa-col__add",
        attrs: { type: "button" },
        children: [
          el("span", { class: "mesa-col__add-ico", svg: ICON.plus }),
          el("span", { text: "Adicionar" }),
        ],
      });
      adicionar.addEventListener("click", () => abrirFormularioTarefa(null, c.id));

      board.appendChild(
        el("section", {
          class: "mesa-col",
          attrs: { "aria-label": c.titulo },
          children: [
            el("header", {
              class: "mesa-col__head",
              children: [
                el("h3", { class: "mesa-col__titulo", text: c.titulo }),
                el("span", { class: "mesa-col__contagem", text: String(itens.length) }),
              ],
            }),
            lista,
            adicionar,
          ],
        })
      );
    });

    quadroHost.appendChild(board);

    quadro = criarQuadro({
      raiz: board,
      colunas: COLUNAS,
      aoSoltar: gravarMovimento,
      aoReindexar: reindexarColuna,
    });
    if (drenarFila) quadro.aoFicarLivre(drenarFila);

    // O Realtime só é ligado depois que existe um quadro pra enfileirar nele.
    if (!sincronia) ligarRealtime();
  }

  function vazioDaColuna(colunaId) {
    const textos = {
      a_fazer: "Nada esperando aqui. Adicione uma tarefa ou crie um plano com a Cogni.",
      fazendo: "Nada em andamento. A Cogni move um card pra cá quando trabalha o assunto.",
      feito: "Ainda nada concluído — e tudo bem, o dia é longo.",
    };
    return el("p", { class: "mesa-col__vazio", text: textos[colunaId] });
  }

  function vazioGeral() {
    const comCogni = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.sparkle }),
        el("span", { text: "Criar com a Cogni" }),
      ],
    });
    comCogni.addEventListener("click", abrirCogni);
    const manual = el("button", {
      class: "dash-btn dash-btn--ghost",
      attrs: { type: "button" },
      text: "Escrever eu mesmo",
    });
    manual.addEventListener("click", () => abrirFormulario(null));

    return el("div", {
      class: "pl-empty mesa-empty",
      children: [
        el("span", { class: "pl-empty__ico", svg: ICON.columns }),
        el("p", {
          class: "pl-empty__title",
          text:
            estado.aba === "revisar"
              ? "Nada esperando revisão."
              : "Nenhum plano por aqui ainda.",
        }),
        el("p", {
          class: "pl-empty__text",
          text:
            "Diga o que você quer que ela estude — e, se a escola mandou foto, PDF, " +
            "slides ou o áudio da professora, junte também. A Cogni monta as tarefas, " +
            "você só confere.",
        }),
        el("div", { class: "mesa-empty__acoes", children: [comCogni, manual] }),
      ],
    });
  }

  /* ---- O card ------------------------------------------------------------ */

  function criarCard(t) {
    const id = String(t.id);
    const coluna = COLUNAS.some((c) => c.id === t.coluna) ? t.coluna : "a_fazer";

    const card = el("article", {
      class: "mesa-card",
      attrs: {
        "data-dnd-card": "",
        "data-id": id,
        "data-ordem": String(t.ordem),
        "data-coluna": coluna,
        "data-titulo": t.titulo || "tarefa",
      },
    });

    const menu = el("button", {
      class: "mesa-card__menu",
      attrs: {
        type: "button",
        "data-dnd-ignorar": "",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-label": `Ações da tarefa ${t.titulo || ""}`,
      },
      svg: ICON.dots,
    });
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirMenu(menu, t);
    });

    card.append(
      el("div", {
        class: "mesa-card__topo",
        children: [el("h4", { class: "mesa-card__titulo", text: t.titulo || "" }), menu],
      })
    );
    if (t.detalhe) {
      card.append(el("p", { class: "mesa-card__detalhe", text: t.detalhe }));
    }

    const meta = el("div", { class: "mesa-card__meta" });
    if (t.materia) {
      meta.append(
        el("span", {
          class: "mesa-chip mesa-chip--materia",
          attrs: { "data-materia": t.materia },
          children: [
            el("span", { class: "mesa-chip__ico", svg: materiaIcon(t.materia) }),
            el("span", { text: materiaLabel(t.materia) }),
          ],
        })
      );
    }
    const prazo = formatPrazo(t.prazo, agora);
    if (prazo) {
      meta.append(
        el("span", {
          class:
            "mesa-chip mesa-chip--prazo" +
            (prazo.atrasado ? " is-atrasado" : prazo.perto ? " is-perto" : ""),
          children: [
            el("span", { class: "mesa-chip__ico", svg: ICON.clock }),
            el("span", { text: prazo.texto }),
          ],
        })
      );
    }
    if (t.confianca != null && Number(t.confianca) < CONFIANCA_BAIXA) {
      meta.append(
        el("span", {
          class: "mesa-chip mesa-chip--confira",
          attrs: { title: "A Cogni não teve certeza do que leu nesta parte do material." },
          children: [
            el("span", { class: "mesa-chip__ico", svg: ICON.alert }),
            el("span", { text: "confira" }),
          ],
        })
      );
    }
    if (meta.childElementCount) card.append(meta);

    if (t.movida_por === "cogni") card.append(faixaDaCogni(t));

    estado.nos.set(id, card);
    return card;
  }

  /**
   * A faixa do ✨: o selo, o PORQUÊ e o Desfazer.
   *
   * O porquê não é enfeite — movimento sem rastro é mágica, e mágica assusta pai.
   * A frase sai de `evidencia.motivo`, que o servidor grava junto com o movimento.
   */
  function faixaDaCogni(t) {
    const desfazer = el("button", {
      class: "mesa-desfazer",
      attrs: { type: "button", "data-dnd-ignorar": "" },
      children: [
        el("span", { class: "mesa-desfazer__ico", svg: ICON.undo }),
        el("span", { text: "Desfazer" }),
      ],
    });
    desfazer.addEventListener("click", async (e) => {
      e.stopPropagation();
      const destino = COLUNA_ANTERIOR[t.coluna] || "a_fazer";
      desfazer.disabled = true;
      try {
        // Passa pelo MESMO caminho do arraste: `moverTarefa` limpa `movida_por`, que
        // é o que apaga o selo. Desfazer é do pai — a Cogni nunca move pra trás.
        await quadro.mover(String(t.id), destino, { posicao: "fim" });
      } catch (err) {
        desfazer.disabled = false;
      }
    });

    return el("div", {
      class: "mesa-card__cogni",
      children: [
        el("span", { class: "mesa-card__faisca", svg: ICON.sparkle }),
        el("span", { class: "mesa-card__porque", text: explicarCogni(t.evidencia) }),
        desfazer,
      ],
    });
  }

  /* ---- Menu "⋯": o caminho equivalente a todo arraste -------------------- */

  let menuAberto = null;
  function fecharMenu() {
    if (!menuAberto) return;
    menuAberto.node.remove();
    menuAberto.botao.setAttribute("aria-expanded", "false");
    menuAberto = null;
    document.removeEventListener("click", fecharMenu);
    document.removeEventListener("keydown", aoTeclarMenu);
  }
  function aoTeclarMenu(e) {
    if (e.key === "Escape") {
      const b = menuAberto && menuAberto.botao;
      fecharMenu();
      if (b) b.focus();
    }
  }

  function abrirMenu(botao, t) {
    const jaEra = menuAberto && menuAberto.botao === botao;
    fecharMenu();
    if (jaEra) return;

    const itens = [];
    COLUNAS.filter((c) => c.id !== t.coluna).forEach((c) => {
      const b = el("button", {
        class: "mesa-menu__item",
        attrs: { type: "button" },
        children: [
          el("span", { class: "mesa-menu__ico", svg: ICON.arrowRight }),
          el("span", { text: `Mover para ${c.titulo}` }),
        ],
      });
      b.addEventListener("click", async () => {
        fecharMenu();
        try {
          await quadro.mover(String(t.id), c.id, { posicao: "fim" });
        } catch (err) {
          /* o dnd já reverteu e anunciou */
        }
      });
      itens.push(b);
    });

    const editar = el("button", {
      class: "mesa-menu__item",
      attrs: { type: "button" },
      children: [
        el("span", { class: "mesa-menu__ico", svg: ICON.edit }),
        el("span", { text: "Editar tarefa" }),
      ],
    });
    editar.addEventListener("click", () => {
      fecharMenu();
      abrirFormularioTarefa(t, t.coluna);
    });

    const excluir = el("button", {
      class: "mesa-menu__item mesa-menu__item--perigo",
      attrs: { type: "button" },
      children: [
        el("span", { class: "mesa-menu__ico", svg: ICON.trash }),
        el("span", { text: "Excluir tarefa" }),
      ],
    });
    excluir.addEventListener("click", () => {
      fecharMenu();
      confirmarExclusaoTarefa(t);
    });

    const node = el("div", {
      class: "mesa-menu",
      attrs: { role: "menu" },
      children: [...itens, editar, excluir],
    });
    node.addEventListener("click", (e) => e.stopPropagation());

    botao.parentElement.appendChild(node);
    botao.setAttribute("aria-expanded", "true");
    menuAberto = { botao, node };
    // No próximo tick pra o clique que abriu não fechar na mesma hora.
    window.setTimeout(() => {
      document.addEventListener("click", fecharMenu);
      document.addEventListener("keydown", aoTeclarMenu);
    }, 0);
    const primeiro = node.querySelector("button");
    if (primeiro) primeiro.focus();
  }

  /* ==========================================================================
     Escrita
     ========================================================================== */

  /** Chamada pelo `dnd.js` a cada movimento (arraste, teclado ou menu). */
  async function gravarMovimento({ id, para, ordem }) {
    if (sincronia) sincronia.marcarPendente(id, { coluna: para, ordem });
    try {
      const linha = await ctx.mock.moverTarefa(Number(id), { coluna: para, ordem });
      if (linha) estado.porId.set(String(id), linha);
      atualizarContagens();
      // O card mudou de dono: o selo ✨ da Cogni sai, porque agora foi o pai.
      const no = estado.nos.get(String(id));
      const faixa = no && no.querySelector(".mesa-card__cogni");
      if (faixa) faixa.remove();
    } catch (err) {
      if (sincronia) sincronia.esquecerPendente(id);
      toast("Não consegui mover a tarefa.", "error");
      throw err; // o dnd devolve o card pro lugar
    }
  }

  /** Só roda quando o gap fracionário acabou — raro por construção. */
  async function reindexarColuna(colunaId, novas) {
    await Promise.all(
      novas.map((n) =>
        ctx.mock
          .atualizarTarefa(Number(n.id), { ordem: n.ordem })
          .then((linha) => linha && estado.porId.set(String(n.id), linha))
      )
    );
  }

  function atualizarContagens() {
    COLUNAS.forEach((c) => {
      const lista = quadroHost.querySelector(`[data-dnd-coluna="${c.id}"]`);
      if (!lista) return;
      const n = lista.querySelectorAll("[data-dnd-card]").length;
      const alvo = lista.parentElement.querySelector(".mesa-col__contagem");
      if (alvo) alvo.textContent = String(n);
      const vazio = lista.querySelector(".mesa-col__vazio");
      if (n && vazio) vazio.remove();
      if (!n && !vazio) lista.appendChild(vazioDaColuna(c.id));
    });
  }

  /* ==========================================================================
     Formulários
     ========================================================================== */

  function abrirCogni() {
    abrirCapturaDeMaterial({
      ctx,
      aoSalvar: async (plano, status) => {
        await carregarPlanos();
        estado.planoId = plano.id;
        estado.aba = status === "rascunho" ? "revisar" : "ativos";
        await carregarTarefas();
        pintarTudo();
        toast(
          status === "rascunho"
            ? "Rascunho salvo. Aprove quando quiser que a Cogni siga."
            : "Plano criado e ativo!",
          "success"
        );
      },
    });
  }
  btnCogni.addEventListener("click", abrirCogni);
  btnNovo.addEventListener("click", () => abrirFormulario(null));

  /** Formulário de plano (criar/editar) — a evolução do de "Planos". */
  function abrirFormulario(plano) {
    const editando = !!plano;
    openModal({
      title: editando ? "Editar plano" : "Novo plano",
      size: "md",
      content: ({ close }) => {
        const form = el("form", { class: "pl-form", attrs: { novalidate: "true" } });

        const inTitulo = el("input", {
          class: "pl-input",
          attrs: {
            id: "mesa-titulo",
            type: "text",
            maxlength: "80",
            placeholder: "Ex.: Semana da tabuada",
            value: editando ? plano.titulo : "",
          },
        });
        const selFoco = el("select", {
          class: "pl-input pl-select",
          attrs: { id: "mesa-foco" },
        });
        materiasAgrupadas().forEach((g) => {
          const og = el("optgroup", { attrs: { label: g.label } });
          g.materias.forEach((m) => {
            const o = el("option", { attrs: { value: m.valor }, text: m.label });
            if (editando && plano.foco === m.valor) o.selected = true;
            og.appendChild(o);
          });
          selFoco.appendChild(og);
        });
        const inDuracao = el("input", {
          class: "pl-input",
          attrs: {
            id: "mesa-duracao",
            type: "number",
            min: "1",
            max: "365",
            inputmode: "numeric",
            placeholder: "Ex.: 30",
            value: editando ? String(plano.duracao_dias) : "",
          },
        });
        const selStatus = el("select", {
          class: "pl-input pl-select",
          attrs: { id: "mesa-status" },
        });
        STATUS.forEach((s) => {
          const o = el("option", { attrs: { value: s }, text: statusLabel(s) });
          if (editando ? plano.status === s : s === "ativo") o.selected = true;
          selStatus.appendChild(o);
        });
        // Plano em rascunho não tem o status no <select>; a opção só aparece
        // enquanto ele existe, pra o formulário não "promover" o plano sem querer.
        if (editando && plano.status === "rascunho") {
          const o = el("option", { attrs: { value: "rascunho" }, text: "Rascunho" });
          o.selected = true;
          selStatus.insertBefore(o, selStatus.firstChild);
        }
        const txt = el("textarea", {
          class: "pl-input pl-textarea",
          attrs: {
            id: "mesa-conteudo",
            rows: "4",
            maxlength: "600",
            placeholder:
              "Descreva o objetivo do plano. Esse texto orienta a Cogni nas conversas.",
          },
        });
        if (editando) txt.value = plano.conteudo || "";

        const fTitulo = campoForm("Título do plano", inTitulo);
        const fDuracao = campoForm("Duração (dias)", inDuracao);
        form.append(
          fTitulo,
          el("div", {
            class: "pl-form__grid",
            children: [
              campoForm("Foco (matéria)", selFoco),
              fDuracao,
              campoForm("Status", selStatus),
            ],
          }),
          campoForm("Conteúdo do plano", txt, {
            dica: "Esse texto é injetado no que a Cogni sabe sobre o plano.",
          })
        );

        const acoes = el("div", { class: "pl-form__actions" });
        if (editando) {
          const del = el("button", {
            class: "pl-btn pl-btn--danger",
            attrs: { type: "button" },
            children: [
              el("span", { class: "pl-btn__ico", svg: ICON.trash }),
              el("span", { text: "Excluir" }),
            ],
          });
          del.addEventListener("click", () => confirmarExclusaoPlano(plano, close));
          acoes.appendChild(del);
        }
        const cancelar = el("button", {
          class: "dash-btn dash-btn--ghost",
          attrs: { type: "button" },
          text: "Cancelar",
        });
        cancelar.addEventListener("click", close);
        const salvar = el("button", {
          class: "dash-btn dash-btn--primary",
          attrs: { type: "submit" },
          text: editando ? "Salvar alterações" : "Criar plano",
        });
        acoes.append(el("div", { class: "pl-form__spacer" }), cancelar, salvar);
        const erro = el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
        });
        form.append(acoes, erro);

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const titulo = inTitulo.value.trim();
          const dur = parseInt(inDuracao.value, 10);
          let ok = true;
          if (!titulo) {
            marcarErro(fTitulo, "Dê um nome ao plano.");
            ok = false;
          } else marcarErro(fTitulo, "");
          if (!inDuracao.value.trim() || Number.isNaN(dur) || dur < 1 || dur > 365) {
            marcarErro(fDuracao, "Informe de 1 a 365 dias.");
            ok = false;
          } else marcarErro(fDuracao, "");
          if (!ok) return;

          const rotulo = salvar.textContent;
          salvar.disabled = true;
          salvar.textContent = "Salvando…";
          erro.textContent = "";
          try {
            const dados = {
              titulo,
              conteudo: txt.value.trim(),
              foco: selFoco.value,
              duracao_dias: dur,
              status: selStatus.value,
            };
            const linha = editando
              ? await ctx.mock.atualizarPlano(plano.id, dados)
              : await ctx.mock.criarPlano(dados);
            await carregarPlanos();
            if (!editando && linha) {
              estado.planoId = linha.id;
              estado.aba = "ativos";
              await carregarTarefas();
            }
            pintarTudo();
            close();
            toast(editando ? "Plano atualizado!" : "Plano criado com sucesso!", "success");
          } catch (err) {
            console.error("[Companion] Falha ao salvar o plano:", err);
            erro.textContent =
              "Não consegui salvar agora. Verifique sua conexão e tente de novo.";
            salvar.disabled = false;
            salvar.textContent = rotulo;
          }
        });

        return form;
      },
    });
  }

  /** Formulário de card (criar/editar). */
  function abrirFormularioTarefa(tarefa, colunaId) {
    const editando = !!tarefa;
    const plano = planoAtual();
    if (!plano) return;

    openModal({
      title: editando ? "Editar tarefa" : "Nova tarefa",
      size: "md",
      content: ({ close }) => {
        const form = el("form", { class: "pl-form", attrs: { novalidate: "true" } });
        const inTitulo = el("input", {
          class: "pl-input",
          attrs: {
            id: "mesa-t-titulo",
            type: "text",
            maxlength: "120",
            placeholder: "Ex.: Exercícios de fração",
            value: editando ? tarefa.titulo || "" : "",
          },
        });
        const inDetalhe = el("input", {
          class: "pl-input",
          attrs: {
            id: "mesa-t-detalhe",
            type: "text",
            maxlength: "240",
            placeholder: "Ex.: páginas 42 e 43",
            value: editando ? tarefa.detalhe || "" : "",
          },
        });
        const selM = el("select", {
          class: "pl-input pl-select",
          attrs: { id: "mesa-t-materia" },
        });
        materiasAgrupadas().forEach((g) => {
          const og = el("optgroup", { attrs: { label: g.label } });
          g.materias.forEach((m) => {
            const o = el("option", { attrs: { value: m.valor }, text: m.label });
            const atual = editando ? tarefa.materia : plano.foco;
            if (atual === m.valor) o.selected = true;
            og.appendChild(o);
          });
          selM.appendChild(og);
        });
        const inPrazo = el("input", {
          class: "pl-input",
          attrs: {
            id: "mesa-t-prazo",
            type: "date",
            value: editando ? tarefa.prazo || "" : "",
          },
        });

        const fTitulo = campoForm("Título da tarefa", inTitulo);
        form.append(
          fTitulo,
          campoForm("Detalhe", inDetalhe),
          el("div", {
            class: "pl-form__grid",
            children: [campoForm("Matéria", selM), campoForm("Prazo", inPrazo)],
          })
        );

        const cancelar = el("button", {
          class: "dash-btn dash-btn--ghost",
          attrs: { type: "button" },
          text: "Cancelar",
        });
        cancelar.addEventListener("click", close);
        const salvar = el("button", {
          class: "dash-btn dash-btn--primary",
          attrs: { type: "submit" },
          text: editando ? "Salvar" : "Adicionar",
        });
        const erro = el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
        });
        form.append(
          el("div", {
            class: "pl-form__actions",
            children: [el("div", { class: "pl-form__spacer" }), cancelar, salvar],
          }),
          erro
        );

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const titulo = inTitulo.value.trim();
          if (!titulo) {
            marcarErro(fTitulo, "Dê um nome à tarefa.");
            return;
          }
          marcarErro(fTitulo, "");
          salvar.disabled = true;
          salvar.textContent = "Salvando…";
          erro.textContent = "";
          const dados = {
            titulo,
            detalhe: inDetalhe.value.trim() || null,
            materia: selM.value,
            prazo: inPrazo.value || null,
          };
          try {
            if (editando) {
              const linha = await ctx.mock.atualizarTarefa(Number(tarefa.id), dados);
              if (linha) estado.porId.set(String(linha.id), linha);
            } else {
              const ultimas = tarefasDaColuna(colunaId);
              const ordem = ultimas.length
                ? Number(ultimas[ultimas.length - 1].ordem) + 1000
                : 1000;
              const linha = await ctx.mock.criarTarefa({
                ...dados,
                plano_id: plano.id,
                coluna: colunaId,
                ordem,
                origem: "pai",
              });
              if (linha) estado.porId.set(String(linha.id), linha);
            }
            pintarQuadro();
            close();
            toast(editando ? "Tarefa atualizada!" : "Tarefa adicionada!", "success");
          } catch (err) {
            console.error("[Companion] Falha ao salvar a tarefa:", err);
            erro.textContent = "Não consegui salvar agora. Tente de novo.";
            salvar.disabled = false;
            salvar.textContent = editando ? "Salvar" : "Adicionar";
          }
        });

        return form;
      },
    });
  }

  function confirmarExclusaoTarefa(t) {
    abrirConfirmacao({
      titulo: "Excluir tarefa",
      texto: `Tem certeza que deseja excluir “${t.titulo}”? Essa ação não pode ser desfeita.`,
      rotulo: "Excluir tarefa",
      aoConfirmar: async () => {
        await ctx.mock.removerTarefa(Number(t.id));
        estado.porId.delete(String(t.id));
        pintarQuadro();
        toast("Tarefa excluída.", "info");
      },
    });
  }

  function confirmarExclusaoPlano(plano, fecharEdicao) {
    abrirConfirmacao({
      titulo: "Excluir plano",
      texto:
        `Tem certeza que deseja excluir o plano “${plano.titulo}”? ` +
        "As tarefas dele também somem, e a ação não pode ser desfeita.",
      rotulo: "Excluir plano",
      aoConfirmar: async () => {
        await ctx.mock.removerPlano(plano.id);
        estado.planoId = null;
        await carregarPlanos();
        await carregarTarefas();
        pintarTudo();
        if (typeof fecharEdicao === "function") fecharEdicao();
        toast("Plano excluído.", "info");
      },
    });
  }

  /**
   * Exclusão em lote, a partir do modo de seleção.
   *
   * `allSettled` e não `all`: com `all`, uma linha que falha (RLS, rede caindo no
   * meio) deixaria as outras exclusões já feitas sem ninguém pra contar a história —
   * a tela mostraria só o erro, e o pai não saberia quantos planos sobreviveram.
   */
  function confirmarExclusaoEmLote(lista) {
    const alvos = lista.filter((p) => estado.selecionados.has(String(p.id)));
    if (!alvos.length) return;

    const n = alvos.length;
    abrirConfirmacao({
      titulo: n > 1 ? `Excluir ${n} planos` : "Excluir plano",
      texto:
        (n > 1
          ? `Tem certeza que deseja excluir estes ${n} planos? `
          : `Tem certeza que deseja excluir o plano “${alvos[0].titulo}”? `) +
        "As tarefas deles também somem, e a ação não pode ser desfeita.",
      rotulo: n > 1 ? `Excluir ${n} planos` : "Excluir plano",
      aoConfirmar: async () => {
        const resultados = await Promise.allSettled(
          alvos.map((p) => ctx.mock.removerPlano(p.id))
        );
        const falhas = resultados.filter((r) => r.status === "rejected");
        falhas.forEach((f) => console.error("[Companion] Falha ao excluir o plano:", f.reason));

        // Nenhum saiu: nada mudou no banco, então nada muda na tela — o diálogo
        // mostra o erro e continua aberto pro pai tentar de novo.
        if (falhas.length === n) {
          throw falhas[0].reason || new Error("Não consegui excluir os planos.");
        }

        // O plano aberto pode ter ido junto: zerar força o reancoramento em
        // `carregarPlanos()` no lugar de deixar a tela apontando pra um id morto.
        if (alvos.some((p) => String(p.id) === String(estado.planoId))) {
          estado.planoId = null;
        }
        estado.selecionados.clear();
        estado.modoSelecao = false;
        await carregarPlanos();
        await carregarTarefas();
        pintarTudo();

        const ok = n - falhas.length;
        toast(
          falhas.length
            ? `Excluí ${ok} de ${n}. Tente de novo nos que sobraram.`
            : ok > 1
              ? `${ok} planos excluídos.`
              : "Plano excluído.",
          falhas.length ? "error" : "info"
        );
      },
    });
  }

  function abrirConfirmacao({ titulo, texto, rotulo, aoConfirmar }) {
    openModal({
      title: titulo,
      size: "sm",
      content: ({ close }) => {
        const wrap = el("div", { class: "pl-confirm" });
        wrap.append(el("p", { class: "pl-confirm__text", text: texto }));
        const cancelar = el("button", {
          class: "dash-btn dash-btn--ghost",
          attrs: { type: "button" },
          text: "Cancelar",
        });
        cancelar.addEventListener("click", close);
        const confirmar = el("button", {
          class: "pl-btn pl-btn--danger",
          attrs: { type: "button" },
          children: [
            el("span", { class: "pl-btn__ico", svg: ICON.trash }),
            el("span", { text: rotulo }),
          ],
        });
        const erro = el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
        });
        confirmar.addEventListener("click", async () => {
          confirmar.disabled = true;
          cancelar.disabled = true;
          erro.textContent = "";
          try {
            await aoConfirmar();
            close();
          } catch (err) {
            console.error("[Companion] Falha ao excluir:", err);
            confirmar.disabled = false;
            cancelar.disabled = false;
            erro.textContent = "Não consegui excluir agora. Tente de novo.";
          }
        });
        wrap.append(
          el("div", { class: "pl-confirm__actions", children: [cancelar, confirmar] }),
          erro
        );
        return wrap;
      },
    });
  }

  function campoForm(label, controle, { dica } = {}) {
    const wrap = el("div", { class: "pl-field" });
    const lbl = el("label", { class: "pl-field__label", text: label });
    if (controle.id) lbl.setAttribute("for", controle.id);
    wrap.append(lbl);
    if (dica) wrap.append(el("p", { class: "pl-field__hint", text: dica }));
    wrap.append(controle);
    wrap.append(el("p", { class: "pl-field__error", attrs: { "aria-live": "polite" } }));
    return wrap;
  }

  function marcarErro(campo, msg) {
    const err = campo.querySelector(".pl-field__error");
    const ctrl = campo.querySelector("input, select, textarea");
    if (err) err.textContent = msg || "";
    campo.classList.toggle("is-error", !!msg);
    if (ctrl) {
      ctrl.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg) ctrl.focus();
    }
  }

  /* ==========================================================================
     Tempo real
     ========================================================================== */

  const selo = el("span", {
    class: "mesa-selo",
    attrs: { role: "status", "aria-live": "polite" },
  });
  raiz.appendChild(selo);

  function ligarRealtime() {
    const cliente = window.cognifyAuth && window.cognifyAuth.getClient();
    // Sem Supabase (modo mock/demo) não há canal — e a tela funciona igual.
    if (!cliente || !ctx.crianca || !ctx.crianca.id) return;

    sincronia = assinarMesa({
      client: cliente,
      criancaId: ctx.crianca.id,
      estaOcupado: () => !!quadro && quadro.estaArrastando(),
      aoFicarLivre: (cb) => {
        drenarFila = cb;
        if (quadro) quadro.aoFicarLivre(cb);
      },
      aoTarefa: aplicarTarefa,
      aoPlano: aplicarPlano,
      aoStatus: (modo) => {
        selo.classList.toggle("is-degradado", modo === "degradado");
        selo.textContent =
          modo === "degradado" ? "Sem atualização ao vivo" : "Atualizando ao vivo";
      },
      aoReler: async () => {
        const antes = new Map(estado.porId);
        await carregarPlanos();
        await carregarTarefas();
        pintarAbas();
        pintarSeletor();
        pintarPlano();
        // Repinta o quadro só quando o conteúdo mudou de verdade: repintar a cada
        // releitura mataria o foco de quem navega por teclado e cortaria animação.
        if (mudou(antes, estado.porId)) pintarQuadro();
      },
    });
  }

  function mudou(antes, depois) {
    if (antes.size !== depois.size) return true;
    for (const [id, t] of depois) {
      const a = antes.get(id);
      if (!a) return true;
      if (a.coluna !== t.coluna || a.ordem !== t.ordem) return true;
      if (a.atualizado_em !== t.atualizado_em) return true;
    }
    return false;
  }

  /** Um delta de `plano_tarefas`. */
  function aplicarTarefa(evt) {
    const id = String(evt.id);

    if (evt.tipo === "DELETE") {
      // O payload de DELETE traz só a PK, então não dá pra filtrar por plano aqui:
      // id que a gente não conhece simplesmente não é nosso.
      if (!estado.porId.has(id)) return;
      estado.porId.delete(id);
      pintarQuadro();
      return;
    }

    const linha = evt.linha;
    if (!linha) return;

    // O filtro do canal é por CRIANÇA, mas o quadro é de um plano só: evento de
    // tarefa de outro plano não mexe nesta tela.
    if (String(linha.plano_id) !== String(estado.planoId)) {
      if (estado.porId.has(id)) {
        estado.porId.delete(id); // o card mudou de plano: sai daqui
        pintarQuadro();
      }
      return;
    }

    // Eco da nossa própria escrita: a tela já está certa, mexer nela agora só
    // causaria um piscar.
    if (evt.origem === "eco") {
      estado.porId.set(id, linha);
      return;
    }

    const anterior = estado.porId.get(id);
    estado.porId.set(id, linha);

    if (!anterior) {
      pintarQuadro();
      return;
    }

    const trocouColuna = anterior.coluna !== linha.coluna;
    const trocouOrdem = Number(anterior.ordem) !== Number(linha.ordem);
    pintarQuadro();

    if (trocouColuna && evt.origem === "cogni") {
      // O momento "uau": o card acabou de andar sozinho. Realçamos e anunciamos —
      // sem toast, que a cada turno de conversa viraria barulho.
      const no = estado.nos.get(id);
      if (no) {
        no.classList.add("is-cogni-move");
        window.setTimeout(() => no.classList.remove("is-cogni-move"), 900);
      }
      if (quadro) {
        quadro.anunciar(
          `A Cogni moveu ${linha.titulo} para ${colunaLabel(linha.coluna)}.`
        );
      }
    } else if (!trocouColuna && !trocouOrdem) {
      // Só o texto mudou; nada a comemorar.
    }
  }

  /**
   * Um delta de `planos_estudo`.
   *
   * É `async` e ninguém a aguarda, então ela engole o próprio erro: uma rejeição
   * solta aqui viraria `unhandledrejection` no console do pai por causa de uma
   * piscada de rede que a tela já contorna.
   */
  async function aplicarPlano() {
    try {
      // Plano muda pouco e o cabeçalho é barato de repintar — releitura simples é
      // mais confiável aqui do que um diff que quase nunca roda.
      await carregarPlanos();
      if (!estado.planos.some((p) => String(p.id) === String(estado.planoId))) {
        // O plano aberto sumiu (apagado noutra aba, ou o cascade levou junto).
        const vigente = planoVigente(estado.planos, agora);
        estado.planoId = vigente ? vigente.id : estado.planos[0] && estado.planos[0].id;
        await carregarTarefas();
        pintarTudo();
        return;
      }
      pintarAbas();
      pintarSeletor();
      pintarPlano();
    } catch (err) {
      console.debug("[Companion] Delta de plano falhou:", err);
    }
  }

  /* ==========================================================================
     Desmontagem

     O router NÃO avisa quando troca de seção — e o `hashchange` sozinho não
     resolve: ele dispara ANTES de o router chamar `outlet.replaceChildren()`
     (o render é `await`ado), então nesse instante a raiz ainda está conectada e
     a checagem passaria batido, vazando um canal por visita.

     O gatilho certo é o próprio `replaceChildren`: um MutationObserver no outlet
     dispara exatamente nele. A DECISÃO continua sendo `raiz.isConnected`, que é o
     que fecha a corrida de sair da Mesa e voltar rápido — o observer velho vê a
     raiz velha desconectada e encerra o canal DELE, não o do render novo.
     Mesma família do observer auto-aposentado de `config.js`.
     ========================================================================== */

  const outlet = document.querySelector("[data-dash-outlet]");
  const observer = new MutationObserver(() => {
    if (raiz.isConnected) return;
    encerrar();
  });
  if (outlet) observer.observe(outlet, { childList: true });

  // `pagehide` é o caso em que a raiz AINDA está conectada (a página inteira está
  // indo embora), então aqui não se checa `isConnected`.
  function aoSairDaPagina() {
    encerrar();
  }
  window.addEventListener("pagehide", aoSairDaPagina);

  function encerrar() {
    observer.disconnect();
    window.removeEventListener("pagehide", aoSairDaPagina);
    document.removeEventListener("click", fecharMenu);
    document.removeEventListener("keydown", aoTeclarMenu);
    if (quadro) quadro.destruir();
    if (sincronia) sincronia.encerrar();
    quadro = null;
    sincronia = null;
  }

  /* ---- Primeiro carregamento (bloqueia o render, como as outras seções) --- */

  await carregarPlanos();
  await carregarTarefas();
  pintarTudo();

  return raiz;
}
