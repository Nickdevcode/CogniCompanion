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
 * 1. **O quadro é do plano SELECIONADO**, não de todas as tarefas da criança. Cada
 *    card carrega `plano_id` e o servidor junta os quadros de todos os planos que
 *    ela segue — a tela mostra um de cada vez porque é assim que o pai pensa neles.
 * 2. **Selecionar um plano que a Cogni NÃO segue é permitido — e avisado.** O pai
 *    pode abrir o quadro de um plano pausado, concluído, vencido ou ainda em
 *    rascunho. Sem o aviso, ele arrastaria cards esperando o robô reagir, e o robô
 *    não reage. A regra de "quais estão valendo" é a mesma do servidor (ver
 *    `planosVigentes` em `format.js`) — e desde 16/ago/2026 são VÁRIOS ao mesmo
 *    tempo, até 5: o selo aparece em todos eles, e o aviso, em nenhum.
 * 3. **A faixa de planos é uma FILA, e ela é arrastável** (⭐ 16/ago/2026). A ordem
 *    dos chips é a prioridade que a Cogni segue: `planos_estudo.ordem`, fracionária
 *    como a dos cards, gravada com 1 UPDATE por movimento. O primeiro vigente ganha
 *    o selo "1º" — e a frase precisa ser esta, *"a Cogni começa por aqui"*, porque
 *    ela segue todos os vigentes; o primeiro é só por onde ela entra quando a
 *    conversa não pede outro assunto. O arraste vive na aba "Ativos" e some no modo
 *    de seleção (ver `ABA_DA_FILA` e `pintarSeletor`).
 * 4. **O canal do Realtime é `const` do escopo do render** e morre com a seção. O
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
  planosVigentes,
  ehVigente,
  motivoNaoVigente,
  ordenarPlanos,
  ordemDoPlano,
  avisoDeOrdem,
} from "../format.js";
import { criarQuadro } from "../dnd.js";
import { assinarMesa } from "../mesa-realtime.js";
import { abrirCapturaDeMaterial } from "../captura.js";
import { ligarCampoIA } from "../campo-ia.js";

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

/**
 * A aba em que a fila de planos pode ser arrastada.
 *
 * Só uma, e é uma decisão de produto: `ordem` só muda o que a Cogni faz entre os
 * planos VIGENTES, então deixar arrastar em "Todos" — onde ela conviveria com
 * pausados, concluídos e rascunhos — seria oferecer um gesto que, na maior parte da
 * lista, não faz nada. Arraste sem consequência ensina o pai a desconfiar do
 * arraste, inclusive onde ele funciona. Em "Ativos" a fila é a fila de verdade, e o
 * único caso de borda (um ativo VENCIDO, ou o 6º) ganha uma frase própria no card
 * dizendo que a posição dele só passa a valer quando ele voltar a valer.
 */
const ABA_DA_FILA = "ativos";

/** A "coluna" única da faixa — o `dnd.js` precisa de um id, e ninguém mais o vê. */
const COLUNA_DA_FILA = [{ id: "fila", titulo: "Fila de planos" }];

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
  // "a criança" é o fallback quando o perfil ainda não tem nome — e é o que
  // permite escrever as frases sem artigo (o perfil não guarda gênero, então
  // "o {nome}" acertava metade das famílias e errava a outra).
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
  /**
   * O drag and drop da FAIXA DE PLANOS — a prioridade que a Cogni segue.
   *
   * É o mesmo módulo do quadro (`criarQuadro`), com uma coluna só e eixo horizontal.
   * Dois motores de arraste diferentes na mesma tela seriam dois lugares pra
   * consertar cada bug de toque, de foco e de leitor de tela.
   */
  let fila = null;
  /** Uma releitura chegou no meio de um arraste da fila e a repintura ficou devendo. */
  let seletorPendente = false;
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
      subtitle: `O que ${primeiroNome} vai estudar — e como está indo.`,
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
   * Os planos que a Cogni está seguindo agora, **na ordem da fila** — o primeiro é
   * por onde ela começa quando a conversa não pede outro.
   *
   * `agora` é o instante do render, como no resto da seção: o quadro não é um
   * relógio, e recalcular "hoje" a cada pintura faria dois trechos da mesma tela
   * discordarem sobre um plano que vence no meio da visita.
   */
  const vigentes = () => planosVigentes(estado.planos, agora);

  /** O primeiro da fila — a resposta pra "o que abrir primeiro?". */
  const vigentePrincipal = () => vigentes()[0] || null;

  /**
   * O selo "1º" só existe quando há FILA — dois vigentes ou mais.
   *
   * Com um plano só, dizer "a Cogni começa por aqui" é verdade e é inútil: não há
   * outro por onde ela pudesse começar. O selo viraria decoração permanente, e
   * decoração permanente é a primeira coisa que o olho aprende a ignorar — inclusive
   * no dia em que ela passar a significar alguma coisa.
   */
  const temFila = () => vigentes().length > 1;

  /** Este plano é por onde ela começa? (só responde `true` quando há fila) */
  function ehPrimeiroDaFila(plano) {
    if (!plano || !temFila()) return false;
    const primeiro = vigentePrincipal();
    return !!primeiro && String(primeiro.id) === String(plano.id);
  }

  /**
   * Qual plano abrir numa lista — um vigente, se houver algum ali.
   *
   * Pegar só o primeiro da lista jogava o pai num plano antigo e vazio ao voltar
   * de "Para revisar" pra "Ativos". O que ele quer ver é o que está valendo — e
   * com vários valendo, aquele por onde a Cogni começa.
   */
  function melhorDaAba(lista) {
    if (!lista.length) return null;
    const naAba = vigentes().find((v) => lista.some((p) => String(p.id) === String(v.id)));
    return naAba ? naAba.id : lista[0].id;
  }

  async function carregarPlanos() {
    /**
     * Reordenar aqui, e não confiar só no `ORDER BY`, é de propósito: enquanto o SQL
     * da coluna `ordem` não roda, a consulta cai na válvula e volta pelo desempate
     * antigo. Passar tudo por `ordenarPlanos` garante que a fila da TELA é sempre a
     * mesma que o servidor monta — inclusive nesse intervalo, em que os dois leem
     * `ordem` ausente como 1000.
     */
    estado.planos = ordenarPlanos(await ctx.mock.getPlanos());
    if (!estado.planoId) {
      // Abre num plano que a Cogni está seguindo — é a resposta que o pai quer
      // primeiro ("o que está valendo agora?"). Sem nenhum vigente, o que importa
      // é o que está esperando aprovação; sem isso também, mostra tudo.
      const vigente = vigentePrincipal();
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

    // A faixa é recriada, então o arraste antigo aponta pra nós que já não existem.
    destruirFila();
    faixaHost.replaceChildren();
    if (!lista.length) return;
    if (lista.length < 2 && !estado.modoSelecao) return;

    /**
     * A faixa vira fila arrastável quando três coisas valem ao mesmo tempo: é a aba
     * dos ativos, há 2+ planos pra ordenar e o modo de seleção está DESLIGADO.
     *
     * ⚠️ A última é a que não pode faltar. Com a seleção ligada, o toque longo que
     * marca um plano pra excluir é exatamente o gesto que inicia um arraste (150ms
     * de dedo parado) — o pai reordenaria a prioridade da filha achando que estava
     * escolhendo o que apagar, e sem nada na tela sugerindo isso.
     */
    const arrastavel =
      !estado.modoSelecao && estado.aba === ABA_DA_FILA && lista.length > 1;

    const faixa = el("div", {
      class: "mesa-seletor" + (estado.modoSelecao ? " is-selecionando" : ""),
      attrs: estado.modoSelecao
        ? { role: "group", "aria-label": "Escolher planos para excluir" }
        : { role: "tablist", "aria-label": "Escolher plano" },
    });
    if (arrastavel) faixa.setAttribute("data-dnd-coluna", COLUNA_DA_FILA[0].id);

    // Um conjunto só pra faixa inteira: o teto é por CRIANÇA, então a resposta não
    // muda de chip pra chip e recalcular em cada um seria refazer a mesma conta.
    const idsVigentes = new Set(vigentes().map((v) => String(v.id)));
    lista.forEach((p) => faixa.appendChild(chipDePlano(p, idsVigentes, arrastavel)));

    // A raiz do arraste é um WRAPPER, não a faixa: o `dnd.js` pendura nela a região
    // de anúncio e o texto de instruções, e dois <p> soltos dentro de um flex
    // container que também é a lista virariam filhos do layout da fila.
    const wrap = el("div", { class: "mesa-fila", children: [faixa] });
    if (arrastavel) wrap.insertBefore(dicaDaFila(), faixa);
    faixaHost.appendChild(wrap);

    if (arrastavel) ligarFila(wrap);
  }

  /**
   * A linha que ensina o gesto.
   *
   * Um arraste que ninguém descobre é um arraste que não existe: a faixa parece uma
   * barra de abas, e nada nela sugere que a posição significa algo. A frase diz as
   * duas coisas de uma vez — que dá pra arrastar, e o que isso muda no robô.
   */
  function dicaDaFila() {
    return el("p", {
      class: "mesa-fila__dica",
      children: [
        el("span", {
          class: "mesa-fila__dica-ico",
          svg: ICON.grip,
          attrs: { "aria-hidden": "true" },
        }),
        el("span", {
          text: "Arraste os planos pra dizer por onde a Cogni começa.",
        }),
      ],
    });
  }

  /**
   * Um chip da faixa. Vira alvo de seleção quando o modo está ligado.
   *
   * O ✨ no chip existe desde que a Cogni passou a seguir vários planos: com dois
   * ativos e um pausado na mesma faixa, "quais ela está seguindo?" virou uma
   * pergunta de verdade — e a resposta só aparecia depois de abrir plano por plano.
   */
  /**
   * O que o leitor de tela ouve no chip.
   *
   * O título vem SEMPRE primeiro (regra do "label in name": quem usa comando de voz
   * fala o que está escrito no chip, e o que está escrito é o título). O resto é o
   * que a cor e o ícone dizem pra quem enxerga — sem isso, o ✨ e o "1º" seriam
   * informação que só existe pra parte das pessoas.
   */
  function rotuloDoChip(p, seguindo, primeiro) {
    if (primeiro) return `${p.titulo} — a Cogni começa por aqui`;
    if (seguindo) return `${p.titulo} — a Cogni está seguindo`;
    return null;
  }

  function chipDePlano(p, idsVigentes, arrastavel) {
    const id = String(p.id);
    const marcado = estado.selecionados.has(id);
    const on = !estado.modoSelecao && id === String(estado.planoId);
    const seguindo = idsVigentes.has(id);
    const primeiro = ehPrimeiroDaFila(p);

    const ico = el("span", {
      class: "mesa-chip-plano__ico",
      svg: estado.modoSelecao && marcado ? ICON.check : materiaIcon(p.foco),
    });
    /**
     * O "1º" e o ✨ nascem SEMPRE, escondidos quando não valem.
     *
     * Porque um arraste muda os dois em vários chips de uma vez (subir o 6º plano
     * promove ele e derruba o 5º), e a faixa não pode ser repintada no meio do
     * gesto — repintar destrói o chip que está sendo arrastado. Com os nós já no
     * lugar, atualizar é alternar `hidden`, o que não mexe em foco nem em layout.
     */
    const seloFila = el("span", {
      class: "mesa-chip-plano__fila",
      text: "1º",
      attrs: { "aria-hidden": "true", hidden: primeiro ? null : "hidden" },
    });
    const seloSeguindo = el("span", {
      class: "mesa-chip-plano__seguindo",
      svg: ICON.sparkle,
      attrs: { "aria-hidden": "true", hidden: seguindo ? null : "hidden" },
    });

    const chip = el("button", {
      class:
        "mesa-chip-plano" +
        (on ? " is-active" : "") +
        (seguindo ? " is-seguindo" : "") +
        (primeiro ? " is-primeiro" : "") +
        (estado.modoSelecao && marcado ? " is-marcado" : ""),
      attrs: estado.modoSelecao
        ? {
            type: "button",
            "aria-pressed": String(marcado),
            "aria-label": rotuloDoChip(p, seguindo, primeiro),
          }
        : {
            type: "button",
            role: "tab",
            "aria-selected": String(on),
            "aria-label": rotuloDoChip(p, seguindo, primeiro),
          },
      children: [
        ico,
        el("span", { class: "mesa-chip-plano__titulo", text: p.titulo }),
        seloFila,
        seloSeguindo,
        el("span", {
          class: "pl-status pl-status--mini",
          attrs: { "data-status": p.status },
          children: [el("span", { class: "pl-status__dot", attrs: { "aria-hidden": "true" } })],
        }),
      ],
    });

    // O contrato de DOM do `dnd.js`. Só quando a faixa é fila: sem estes atributos o
    // chip é um chip, e o arraste simplesmente não existe naquela aba.
    if (arrastavel) {
      chip.setAttribute("data-dnd-card", "");
      chip.setAttribute("data-id", id);
      chip.setAttribute("data-ordem", String(ordemDoPlano(p)));
      chip.setAttribute("data-titulo", p.titulo || "plano");
    }

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

  /* ---- A fila de planos: arrastar é dizer por onde ela começa ------------ */

  /** Liga o arraste da faixa. `wrap` é a raiz; a lista é a `.mesa-seletor` dentro. */
  function ligarFila(wrap) {
    fila = criarQuadro({
      raiz: wrap,
      colunas: COLUNA_DA_FILA,
      eixo: "horizontal",
      item: "plano",
      aoSoltar: gravarOrdemDoPlano,
      aoReindexar: reindexarFila,
    });
    // A mesma fila do Realtime do quadro: sem re-registrar aqui, um evento que
    // chegasse durante um arraste de PLANO ficaria preso pra sempre (o callback só
    // estava pendurado no quadro de tarefas, que não é quem está ocupado).
    if (drenarFila) fila.aoFicarLivre(drenarFila);
    // E a repintura que a releitura adiou por causa do arraste (ver `aoReler`).
    fila.aoFicarLivre(() => {
      if (!seletorPendente) return;
      seletorPendente = false;
      pintarSeletor();
    });
  }

  function destruirFila() {
    if (!fila) return;
    fila.destruir();
    fila = null;
  }

  /**
   * Grava a posição nova de um plano na fila — chamada pelo `dnd.js` a cada
   * movimento (arraste, teclado ou Home/End).
   *
   * É a MESMA mecânica fracionária dos cards: a `ordem` já vem calculada como a
   * média dos vizinhos, então é 1 UPDATE por movimento e não a lista inteira.
   *
   * Se a gravação falhar, o erro sobe: quem devolve o chip pro lugar é o `dnd.js`,
   * e é isso que garante que a faixa nunca fica mostrando uma fila que o banco
   * recusou — o pai veria o arraste "funcionar" e a Cogni seguir outra ordem.
   */
  async function gravarOrdemDoPlano({ id, ordem }) {
    try {
      const linha = await ctx.mock.reordenarPlano(id, ordem);
      // Sem linha (RLS, id que sumiu) atualizamos só a `ordem` em memória: o
      // movimento visual já aconteceu, e a próxima releitura conta a verdade.
      const i = estado.planos.findIndex((p) => String(p.id) === String(id));
      if (i !== -1) {
        estado.planos[i] = linha || { ...estado.planos[i], ordem: Number(ordem) };
      }
      estado.planos = ordenarPlanos(estado.planos);
      atualizarSelosDaFaixa();
      pintarPlano();
    } catch (err) {
      /**
       * A coluna `ordem` ainda não existe no banco (o SQL não foi rodado).
       *
       * Não é erro do pai, não é a rede, e "não consegui salvar" o faria tentar de
       * novo pra sempre. A frase precisa dizer que a FUNÇÃO ainda não está no ar —
       * e o `throw` logo abaixo é o que devolve o chip pro lugar, porque uma faixa
       * reordenada por cima de um banco que recusou a escrita é a tela mentindo.
       */
      if (ctx.mock.ehPrioridadeIndisponivel(err)) {
        toast("A prioridade dos planos ainda não está disponível neste banco.", "info");
      } else {
        console.error("[Companion] Falha ao reordenar o plano:", err);
        toast("Não consegui mudar a ordem agora.", "error");
      }
      throw err;
    }
  }

  /** Só quando o gap fracionário acabou — raro por construção. */
  async function reindexarFila(_colunaId, novas) {
    const linhas = await ctx.mock.reindexarPlanos(novas);
    for (const linha of linhas) {
      const i = estado.planos.findIndex((p) => String(p.id) === String(linha.id));
      if (i !== -1) estado.planos[i] = linha;
    }
    estado.planos = ordenarPlanos(estado.planos);
  }

  /**
   * Repinta os selos da faixa SEM recriar os chips.
   *
   * Um arraste muda mais coisa do que a posição: subir o 6º plano faz ele passar a
   * valer e derruba quem era o 5º, então o ✨ e o "1º" mudam em vários chips de uma
   * vez. Recriar a faixa resolveria — e destruiria o chip que o pai acabou de soltar
   * (e o foco de quem fez isso pelo teclado). Daí os selos já nascerem no DOM: aqui
   * só se liga e desliga o que já está lá.
   */
  function atualizarSelosDaFaixa() {
    const faixa = faixaHost.querySelector(".mesa-seletor");
    if (!faixa) return;
    const idsVigentes = new Set(vigentes().map((v) => String(v.id)));
    const primeiro = temFila() ? vigentePrincipal() : null;

    faixa.querySelectorAll("[data-id]").forEach((chip) => {
      const id = chip.getAttribute("data-id");
      const plano = estado.planos.find((p) => String(p.id) === id);
      if (!plano) return;
      const seguindo = idsVigentes.has(id);
      const ehPrimeiro = !!primeiro && String(primeiro.id) === id;

      chip.classList.toggle("is-seguindo", seguindo);
      chip.classList.toggle("is-primeiro", ehPrimeiro);
      alternar(chip.querySelector(".mesa-chip-plano__seguindo"), seguindo);
      alternar(chip.querySelector(".mesa-chip-plano__fila"), ehPrimeiro);

      const rotulo = rotuloDoChip(plano, seguindo, ehPrimeiro);
      if (rotulo) chip.setAttribute("aria-label", rotulo);
      else chip.removeAttribute("aria-label");
    });
  }

  /** `hidden` de um nó que pode não existir (chip de aba sem selo, por exemplo). */
  function alternar(no, mostrar) {
    if (!no) return;
    if (mostrar) no.removeAttribute("hidden");
    else no.setAttribute("hidden", "hidden");
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

    // "Está valendo?" é uma pergunta sobre ESTE plano, não sobre quem ganhou a
    // disputa: com vários vigentes ao mesmo tempo, não existe mais um vencedor.
    const seguindo = ehVigente(plano, estado.planos, agora);

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
    /**
     * A pílula diz em palavras o que está valendo. É o par do aviso de baixo: um
     * confirma, o outro corrige — e nenhum dos dois depende de o pai decifrar cor.
     *
     * ⭐ Ela é UMA só, e o texto é que muda. O primeiro da fila poderia ganhar um
     * segundo selo ao lado, mas duas pílulas começando com "a Cogni" e dizendo quase
     * a mesma coisa fazem o pai ler as duas pra descobrir que uma bastava. Como
     * *"começa por aqui"* já implica *"está seguindo"*, o primeiro simplesmente
     * recebe a frase mais específica — com o mesmo ✨, que é o sinal que ele já
     * aprendeu a reconhecer, e um preenchimento mais forte pra marcar o degrau.
     *
     * A frase foi escolhida com cuidado: ele **não** é "o único que vale" (ela segue
     * todos os vigentes), é por onde ela COMEÇA quando a conversa não pede outro
     * assunto. Prometer exclusividade aqui faria o pai concluir que a Cogni abandonou
     * os outros planos — e ele nos pegaria na primeira conversa em que ela não faz
     * isso. O "começa por aqui" só aparece com fila de verdade (2+ vigentes).
     */
    if (seguindo) {
      const primeiro = ehPrimeiroDaFila(plano);
      topo.appendChild(
        el("span", {
          class: "mesa-plano__selo" + (primeiro ? " mesa-plano__selo--fila" : ""),
          children: [
            el("span", { class: "mesa-plano__selo-ico", svg: ICON.sparkle }),
            el("span", {
              text: primeiro ? "a Cogni começa por aqui" : "a Cogni está seguindo",
            }),
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
    if (!seguindo) {
      /**
       * Na aba dos ativos a faixa é arrastável INTEIRA, e um plano pode estar ali
       * sem estar valendo (venceu, ou é o 6º). O aviso ganha a segunda frase só
       * nesse caso: arrastar aquele chip não muda nada no robô hoje, e um gesto sem
       * efeito, repetido, ensina o pai a desconfiar do arraste onde ele funciona.
       */
      const sobreAOrdem =
        estado.aba === ABA_DA_FILA ? avisoDeOrdem(plano, estado.planos, agora) : null;
      filhos.push(
        el("p", {
          class: "mesa-aviso",
          attrs: { role: "note" },
          children: [
            el("span", { class: "mesa-aviso__ico", svg: ICON.alert }),
            el("span", {
              text:
                "A Cogni não está seguindo este plano agora. " +
                (motivoNaoVigente(plano, estado.planos, agora) || "") +
                (sobreAOrdem ? " " + sobreAOrdem : ""),
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
        class: "dash-card mesa-plano" + (seguindo ? " is-vigente" : ""),
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

  /**
   * O que a IA precisa saber sobre a criança pra escrever no tom certo.
   *
   * A função confirma esses dois campos no banco (é ela que manda); mandar daqui
   * cobre o intervalo em que o perfil mudou e o cache da tela ainda não sabe.
   */
  const perfilDaCrianca = () => ({
    idade: (ctx.crianca && ctx.crianca.idade) || null,
    serie: (ctx.crianca && ctx.crianca.serie) || "",
  });

  /**
   * Liga os botões do ✨ de um formulário entre si.
   *
   * O contexto de um campo costuma ser OUTRO campo — o botão do título do plano só
   * acende quando o conteúdo tem texto —, então digitar em qualquer lugar redesenha
   * todos. `input` borbulha, então um listener na `<form>` cobre a folha inteira.
   */
  function ligarIADoFormulario(form, controles) {
    const vivos = controles.filter(Boolean);
    const aoDigitar = () => vivos.forEach((c) => c.atualizar());
    form.addEventListener("input", aoDigitar);
    return () => {
      form.removeEventListener("input", aoDigitar);
      vivos.forEach((c) => c.destruir());
    };
  }

  /** Formulário de plano (criar/editar) — a evolução do de "Planos". */
  function abrirFormulario(plano) {
    const editando = !!plano;
    /** Desligamento dos botões de IA — preenchido ao montar, chamado ao fechar. */
    let desligarIA = null;

    openModal({
      title: editando ? "Editar plano" : "Novo plano",
      size: "md",
      onClose: () => {
        if (desligarIA) desligarIA();
        desligarIA = null;
      },
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
              "Ex.: revisar frações — principalmente somar com denominadores diferentes.",
          },
        });
        if (editando) txt.value = plano.conteudo || "";

        const fTitulo = campoForm("Título do plano", inTitulo);
        const fDuracao = campoForm("Dura quantos dias", inDuracao);
        form.append(
          fTitulo,
          el("div", {
            class: "pl-form__grid",
            children: [
              campoForm("Matéria", selFoco),
              fDuracao,
              campoForm("Status", selStatus),
            ],
          }),
          // "Esse texto é injetado no que a Cogni sabe sobre o plano" era o commit
          // message vazando pra tela: "injetado" é palavra de quem escreveu o
          // system prompt, não de quem tem uma filha com prova na sexta. O que o pai
          // precisa saber é o efeito — que a Cogni LÊ isto antes de puxar o assunto.
          campoForm("O que a Cogni deve trabalhar", txt, {
            dica: "Ela lê isto antes de puxar o assunto com a criança.",
          })
        );

        /**
         * O ✨ nos dois campos de texto do plano.
         *
         * O contexto é lido NA HORA do clique, nunca aqui: o pai escreve o conteúdo
         * depois do título tanto quanto antes, e um contexto congelado na abertura do
         * modal mandaria a IA melhorar o título com um conteúdo que já mudou.
         */
        desligarIA = ligarIADoFormulario(form, [
          ligarCampoIA({
            controle: inTitulo,
            campo: "plano.titulo",
            contexto: () => ({
              conteudoDoPlano: txt.value.trim(),
              foco: selFoco.value,
              ...perfilDaCrianca(),
            }),
          }),
          ligarCampoIA({
            controle: txt,
            campo: "plano.conteudo",
            contexto: () => ({
              tituloDoPlano: inTitulo.value.trim(),
              foco: selFoco.value,
              ...perfilDaCrianca(),
            }),
          }),
        ]);

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
    let desligarIA = null;

    openModal({
      title: editando ? "Editar tarefa" : "Nova tarefa",
      size: "md",
      onClose: () => {
        if (desligarIA) desligarIA();
        desligarIA = null;
      },
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

        /**
         * Os outros cards do quadro entram como contexto do TÍTULO.
         *
         * É o que evita a quarta tarefa repetir a primeira: um quadro que já tem
         * "Exercícios da página 42" e "Ler o capítulo 3" diz à IA de que plano de aula
         * se trata melhor que qualquer campo do formulário. O card em edição sai da
         * lista — ele é justamente o que está sendo reescrito.
         */
        const outrosCards = () =>
          Array.from(estado.porId.values())
            .filter((t) => !editando || String(t.id) !== String(tarefa.id))
            .map((t) => t.titulo)
            .filter(Boolean);

        desligarIA = ligarIADoFormulario(form, [
          ligarCampoIA({
            controle: inTitulo,
            campo: "tarefa.titulo",
            contexto: () => ({
              tituloDoPlano: plano.titulo,
              conteudoDoPlano: plano.conteudo || "",
              foco: plano.foco,
              materia: selM.value,
              cards: outrosCards(),
              ...perfilDaCrianca(),
            }),
          }),
          ligarCampoIA({
            controle: inDetalhe,
            campo: "tarefa.detalhe",
            contexto: () => ({
              tituloDaTarefa: inTitulo.value.trim(),
              tituloDoPlano: plano.titulo,
              conteudoDoPlano: plano.conteudo || "",
              foco: plano.foco,
              materia: selM.value,
              ...perfilDaCrianca(),
            }),
          }),
        ]);

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
      // Os DOIS arrastes da tela contam como ocupado. A faixa de planos é repintada
      // por qualquer delta de `planos_estudo` — inclusive o eco do próprio arraste —,
      // e repintar no meio do gesto arrancaria o chip da mão do pai.
      estaOcupado: () =>
        (!!quadro && quadro.estaArrastando()) || (!!fila && fila.estaArrastando()),
      aoFicarLivre: (cb) => {
        drenarFila = cb;
        if (quadro) quadro.aoFicarLivre(cb);
        if (fila) fila.aoFicarLivre(cb);
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
        /**
         * ⚠️ A releitura NÃO passa pela fila de eventos do Realtime.
         *
         * `relerAgora()` é chamada direto ao (re)assinar o canal, no poll degradado e
         * ao voltar pra aba — nenhuma delas consulta `estaOcupado`. Antes isso era
         * inofensivo: repintar a faixa trocava chips que ninguém estava segurando.
         * Agora a faixa é arrastável, e um canal que reconecta no meio do gesto
         * arrancaria o chip da mão do pai. Então a repintura espera o arraste acabar.
         */
        if (fila && fila.estaArrastando()) seletorPendente = true;
        else pintarSeletor();
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
        const vigente = vigentePrincipal();
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
    destruirFila();
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
