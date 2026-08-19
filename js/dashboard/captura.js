/**
 * captura.js — "Criar com a Cogni": o pai diz o que quer (e/ou manda o que a escola
 * passou), e a IA monta o plano.
 *
 * É o atalho que resolve o buraco número 1 da tela antiga: escrever plano dá
 * trabalho, e plano que dá trabalho não é criado.
 *
 * ⭐ 16/ago/2026 — **o pedido do responsável virou a entrada principal, e o material
 * virou opcional.** A versão anterior só sabia perguntar "o que a escola mandou", e
 * isso era estreito demais: partia do princípio de que existe uma escola organizada
 * mandando foto de agenda e áudio de professora. Uma mãe que simplesmente quer que a
 * filha treine tabuada essa semana não tinha o que anexar — e ficava sem a feature
 * inteira, tendo que escrever o plano na mão. Agora ela escreve a frase, a Cogni
 * monta as tarefas, e o material da escola entra junto **quando existe**.
 *
 * ⭐ Rodada 3 (16/ago/2026) — **o material pode ser um LINK**: a videoaula que a
 * professora mandou no grupo, ou a página onde a escola publicou a lista. Duas decisões
 * de tela vieram junto, e as duas são de produto, não de código:
 *
 * 1. O separador *"e o que a escola mandou, se tiver"* SAIU. Ele sempre foi estreito, e
 *    com link ficou errado: quem acha uma boa videoaula no domingo não recebeu nada de
 *    escola nenhuma — e a frase **ensinava** o pai a achar que material que não veio da
 *    escola não serve aqui.
 * 2. O link **não ganha botão**. Material que se COLA não se escolhe num seletor, e um
 *    botão que abre um campo pra colar é um toque a mais por nada.
 *
 * Este arquivo é só o fluxo de AQUISIÇÃO:
 *   pedido e/ou material → [Montar o plano] → progresso → revisão (`revisao.js`)
 *
 * Quem transforma cada formato em item pronto é `material/` — este aqui não sabe o
 * que é um ZIP, um WAV ou um quadro de vídeo. Sabe só que existem materiais, que eles
 * ocupam um orçamento, e que o orçamento tem fim.
 *
 * 🔒 O MATERIAL NUNCA É GUARDADO — nem aqui, nem na função, nem no banco. Ele é lido,
 * vira `extraido_texto` + tarefas, e é descartado. É material de menor de idade:
 * decisão de LGPD, e vale dizer na banca.
 */

import { el } from "./sections/_shared.js";
import { ICON, origemIcon } from "./icons.js";
import { openModal } from "./modal.js";
import { USAR_SUPABASE } from "./mock-data.js";
import { montarRevisao } from "./revisao.js";
import { prepararMaterial, MaterialNaoSuportado } from "./material/index.js";
import { prepararLink, extrairUrl, ErroDeLink, MAX_LINKS } from "./material/link.js";
import { novoOrcamento, MAX_ITENS, TETO, CORPO_MAX } from "./material/orcamento.js";
import { criarGravador, suportaGravacao, ErroDeGravacao } from "./material/gravador.js";
import { formatarBytes, formatarDuracao, tamanhoSerializado } from "./material/bytes.js";

/** Endpoint da Vercel Function. Mesma origem do site — não precisa de CORS. */
const ENDPOINT = "/api/plano-de-material";

/**
 * Teto de espera do cliente.
 *
 * A função pode segurar até 300 s no Hobby com Fluid Compute; esperar tudo isso com
 * um spinner na tela não é aceitável. 2 minutos cobre transcrição + visão com folga.
 */
const TIMEOUT_MS = 120_000;

/**
 * Teto do pedido escrito. O servidor corta em 800 (`MAX_PEDIDO` em `_lib/itens.mjs`),
 * então o `maxlength` daqui é o que garante que nada seja cortado sem o pai ver.
 */
const PEDIDO_MAX = 600;

/**
 * Exemplos que viram o pedido num toque.
 *
 * Eles não são enfeite: um campo de texto vazio com um rótulo genérico é o lugar onde
 * a maioria das pessoas trava. Cada um destes é um FORMATO diferente de pedido —
 * assunto, dificuldade, rotina, prova — porque o que eles ensinam é o tipo de coisa
 * que dá pra pedir, não a frase em si.
 */
const EXEMPLOS_DE_PEDIDO = [
  // Nenhum repete o placeholder do campo: exemplo igual ao texto apagado que já está
  // ali não ensina nada — só ocupa um chip.
  "Reforçar divisão com dois algarismos",
  "Ela está com dificuldade em interpretação de texto",
  "Preparar pra prova de ciências sobre o corpo humano",
  "Uma rotina de leitura pra essa semana",
];

/** Extensões que o seletor de arquivo oferece. Mime E extensão: o iOS ignora um dos dois. */
const ACEITA_ARQUIVO = [
  ".pdf,application/pdf",
  ".docx,.pptx,.xlsx",
  ".txt,.md,.csv,.tsv,.json,text/plain",
  ".mp4,.mov,.m4v,.webm,video/*",
  ".mp3,.m4a,.wav,.ogg,.opus,audio/*",
].join(",");

/* ==========================================================================
   A chamada
   ========================================================================== */

/** Erro com mensagem já escrita pro pai (não é bug: é um estado previsto). */
class ErroDeLeitura extends Error {}

/**
 * Proposta de exemplo do modo mock, montada A PARTIR do que está na bandeja.
 *
 * Não é preguiça: é o que permite exercitar a revisão inteira — edição inline, chip
 * "confira", texto extraído editável, rascunho × aprovar — sem OpenAI, sem deploy e
 * sem login. E como só a REDE é falsa, toda a extração roda de verdade no modo mock:
 * o unzip do `.docx`, a decomposição do vídeo, a gravação do microfone. É assim que a
 * feature é testável antes de existir um deploy.
 */
function propostaDeExemplo(materiais, pedido) {
  // Sem material o exemplo tem que ser outro: `extraido_texto` de uma foto que
  // ninguém mandou faria o modo mock ensaiar uma tela que o modo real não mostra.
  if (!materiais.length) {
    return {
      legivel: true,
      titulo: "Plano da semana",
      conteudo: `Atender o que foi pedido: ${pedido}`,
      foco: "matematica",
      duracao_dias: 7,
      extraido_texto: "",
      truncado: false,
      aviso: null,
      tarefas: [
        {
          titulo: "Aquecimento do assunto",
          detalhe: `Primeira sessão do que você pediu: ${pedido}`,
          materia: "matematica",
          prazo: null,
          estimativa_min: 20,
          confianca: 0.9,
        },
        {
          titulo: "Praticar com exercícios",
          detalhe: "Uma rodada de exercícios do mesmo assunto, do fácil pro difícil.",
          materia: "matematica",
          prazo: null,
          estimativa_min: 30,
          confianca: 0.9,
        },
      ],
    };
  }

  const cabecalhos = materiais
    .map((m) => `[${m.nome}]\n(conteúdo lido deste material apareceria aqui)`)
    .join("\n\n");

  return {
    legivel: true,
    titulo: "Atividades da semana",
    conteudo:
      "Terminar a lista de frações e ler o capítulo do livro de português antes " +
      "da entrega de sexta.",
    foco: "matematica",
    duracao_dias: 7,
    extraido_texto:
      `${cabecalhos}\n\n` +
      "AGENDA 26/05\nMat: exercícios pág. 42 e 43 (frações equivalentes)\n" +
      "Port: ler cap. 3 do livro e responder as 5 perguntas\nEntregar sexta",
    truncado: false,
    aviso: null,
    tarefas: [
      {
        titulo: "Exercícios de frações",
        detalhe:
          "Somar e comparar frações de denominadores diferentes. Páginas 42 e 43, " +
          "questões 1 a 8.",
        materia: "matematica",
        prazo: null,
        estimativa_min: 30,
        confianca: 0.91,
      },
      {
        titulo: "Ler o capítulo 3 e responder",
        detalhe: "5 perguntas no fim do capítulo, sobre o narrador da história.",
        materia: "portugues",
        prazo: null,
        estimativa_min: 40,
        // Baixa de propósito: é o card que exercita o chip "confira" na demonstração.
        confianca: 0.48,
      },
    ],
  };
}

/** Traduz o status HTTP numa frase que diz o que fazer. */
function mensagemDeStatus(status) {
  if (status === 413) {
    return "O material ficou grande demais pra enviar. Tire um item e tente de novo.";
  }
  if (status === 429) {
    return "Você já criou muitos planos com a Cogni hoje. Tente de novo amanhã.";
  }
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 404) {
    // Site servido localmente (`python -m http.server`): a função só existe no
    // deploy. Dizer isso é muito melhor que um "erro inesperado" genérico.
    return "A leitura de material só funciona no site publicado. Rodando local, use o modo de demonstração.";
  }
  if (status >= 500) return "O servidor está fora do ar agora. Tente de novo em instantes.";
  return null;
}

/**
 * Manda o pedido e os itens pra Vercel Function e devolve a proposta.
 *
 * @param {object[]} itens
 * @param {string} pedido — o que o responsável escreveu (pode ser a única fonte)
 * @param {AbortSignal} signal
 * @returns {Promise<object>} a proposta (ou `{legivel:false, motivo}`)
 */
async function lerMaterial(itens, pedido, signal) {
  if (!USAR_SUPABASE) {
    await new Promise((r) => window.setTimeout(r, 900));
    return null; // quem chama monta o exemplo — ele depende da bandeja
  }

  const cliente = window.cognifyAuth && window.cognifyAuth.getClient();
  if (!cliente) throw new ErroDeLeitura("Entre na sua conta pra usar a leitura de material.");
  const { data } = await cliente.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new ErroDeLeitura("Sua sessão expirou. Entre de novo.");

  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itens, pedido, hoje: new Date().toISOString().slice(0, 10) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    console.error("[Companion] Rede falhou na leitura do material:", err);
    throw new ErroDeLeitura("Sem conexão agora. Tente de novo em instantes.");
  }

  /**
   * 🔴 Checar o STATUS antes de parsear.
   *
   * O código antigo fazia `resp.json()` primeiro, então tudo que não é JSON — o 413
   * da própria Vercel (que nunca chega no nosso código), um 504 de gateway, uma
   * página de erro da plataforma — virava "não consegui ler a resposta do servidor".
   * O pai era informado de que o site quebrou quando o problema era o PDF dele.
   */
  if (!resp.ok) {
    const conhecida = mensagemDeStatus(resp.status);
    let doServidor = null;
    try {
      doServidor = (await resp.json())?.erro || null;
    } catch (err) {
      // Resposta sem JSON: é da plataforma, não nossa. A mensagem por status serve.
      console.debug("[Companion] Resposta de erro sem JSON:", resp.status, err);
    }
    throw new ErroDeLeitura(
      doServidor || conhecida || "Não consegui ler o material agora."
    );
  }

  try {
    return await resp.json();
  } catch (err) {
    console.error("[Companion] Resposta ilegível da função:", err);
    throw new ErroDeLeitura("Não consegui ler a resposta do servidor.");
  }
}

/* ==========================================================================
   O modal
   ========================================================================== */

/**
 * Abre o fluxo "Criar com a Cogni".
 *
 * @param {object} cfg
 * @param {object} cfg.ctx — o contexto do painel (usa `ctx.mock` pra gravar)
 * @param {(plano:object, status:string) => void} cfg.aoSalvar
 */
export function abrirCapturaDeMaterial({ ctx, aoSalvar }) {
  const fluxo = criarFluxo({ ctx, aoSalvar });
  openModal({
    // Título constante: `openModal` não tem API pra trocá-lo depois de aberto, e a
    // etapa é anunciada por um <h3> dentro do corpo.
    title: "Criar plano com a Cogni",
    size: "lg",
    content: ({ close }) => fluxo.montar(close),
    onClose: () => fluxo.encerrar(),
  });
}

function criarFluxo({ ctx, aoSalvar }) {
  const raiz = el("div", { class: "cap" });

  /**
   * Região de anúncio que SOBREVIVE às trocas de etapa.
   *
   * As etapas fazem `replaceChildren` no palco; se a região viva lá dentro, ela é
   * destruída junto e o leitor de tela nunca ouve que a tela mudou. Por isso o palco
   * é um filho, e o anúncio é irmão dele.
   */
  const anuncio = el("p", {
    class: "sr-only",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const palco = el("div", { class: "cap__palco" });
  raiz.append(anuncio, palco);

  /** @type {Array<object>} materiais na bandeja */
  let materiais = [];
  /**
   * O que o responsável escreveu.
   *
   * Vive AQUI, e não no `<textarea>`, porque `etapaEscolher()` repinta o palco inteiro
   * a cada material adicionado ou removido — o campo é destruído e recriado. Sem esta
   * cópia, anexar uma foto apagaria a frase que a mãe acabou de escrever.
   */
  let pedido = "";
  /**
   * O que está escrito no campo de link, pela mesma razão do `pedido`: o palco é
   * repintado a cada material, e um link digitado pela metade não pode sumir porque o
   * pai anexou uma foto no meio do caminho.
   */
  let textoDoLink = "";
  /** A URL sendo lida agora — é o que faz o card de "carregando" aparecer NA bandeja. */
  let lendoLink = null;
  /** Depois de repintar, devolve o foco pra onde o pai estava (só o link precisa). */
  let devolverFocoAoLink = false;
  let orcamento = novoOrcamento();
  let preparando = false;
  let gravador = null;
  let fechar = () => {};
  const controle = new AbortController();
  let trocaDeFase = null;

  function anunciar(texto) {
    // Limpa antes: repetir o mesmo texto num live region não dispara leitura nova.
    anuncio.textContent = "";
    window.setTimeout(() => (anuncio.textContent = texto), 60);
  }

  /* ---- Etapa 1: o pedido, e o material se houver -------------------------- */

  const primeiroNome = ((ctx.crianca && ctx.crianca.nome) || "").split(/\s+/)[0];

  /** O botão primário da etapa. Recriado a cada repintura — ver `atualizarAcao`. */
  let btnMontar = null;

  /**
   * Liga/desliga o botão principal conforme existe alguma fonte.
   *
   * Desabilitar é melhor que deixar clicar e reclamar: a regra ("preciso de uma das
   * duas coisas") fica visível enquanto ele escreve, e não depois de uma ida ao
   * servidor. O `title` diz o porquê pra quem não deduz do estado.
   */
  function atualizarAcao() {
    if (!btnMontar) return;
    const temFonte = !!pedido.trim() || materiais.length > 0;
    // Montar o plano no meio da leitura de um link entregaria o plano SEM ele — e o
    // pai só descobriria na revisão, procurando as tarefas da aula que ele colou.
    btnMontar.disabled = !temFonte || !!lendoLink;
    btnMontar.title = lendoLink
      ? "Estou lendo o link que você colou."
      : temFonte
        ? ""
        : "Escreva o que você quer, ou junte um material.";
  }

  function etapaEscolher(erro) {
    palco.replaceChildren();

    palco.append(
      el("h3", {
        class: "cap__etapa",
        text: primeiroNome ? `O que ${primeiroNome} vai estudar` : "O que estudar agora",
      }),
      el("p", {
        class: "cap__intro",
        text:
          // Havia dois problemas na frase antiga ("…que a Cogni trabalhe com ela"):
          // o "ela" tanto podia ser a Cogni quanto a criança, e assumia uma filha.
          "Escreva o que quer que seja estudado. Se a escola mandou material, ou se " +
          "você achou algum bom, junte aqui: a Cogni lê, monta as tarefas e você " +
          "confere antes de valer.",
      }),
      campoDoPedido()
    );

    /**
     * Câmera e galeria são botões SEPARADOS porque `capture="environment"` **não**
     * deixa o pai pegar a foto que ele tirou ontem — ele força a câmera a abrir.
     */
    const inputCamera = entrada({ accept: "image/*", capture: "environment" });
    const inputGaleria = entrada({ accept: "image/*", multiple: true });
    const inputArquivo = entrada({ accept: ACEITA_ARQUIVO, multiple: true });

    palco.append(
      el("p", {
        class: "cap__ou",
        children: [el("span", { text: "Junte um material, se quiser" })],
      }),
      el("p", {
        class: "cap__formatos",
        text:
          "Foto da agenda, PDF da lista, áudio da professora, videoaula do YouTube ou " +
          "o link de uma página.",
      }),
      // O link vem ANTES dos botões de propósito: é a única entrada que se resolve
      // colando, e quem chegou com um link na área de transferência já está com ele na
      // mão. Os quatro botões continuam ali embaixo, na mesma ordem de sempre.
      campoDoLink(),
      el("div", {
        class: "cap__botoes",
        children: [
          botao("Tirar foto", ICON.camera, () => inputCamera.click()),
          botao("Escolher foto", ICON.image, () => inputGaleria.click()),
          botao("Escolher arquivo", ICON.file, () => inputArquivo.click()),
          botao("Gravar áudio", ICON.mic, abrirGravador),
        ],
      })
    );

    if (erro) {
      palco.append(
        el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
          text: erro,
        })
      );
    }

    if (materiais.length || lendoLink) palco.append(bandeja());

    // A nota de LGPD vem ANTES da barra de ações de propósito: no celular a barra
    // fica grudada no rodapé da folha (ver `.cap__acoes` no CSS), e qualquer
    // parágrafo depois dela nasceria escondido atrás do botão. Além disso ela lê
    // melhor aqui — é a resposta à pergunta que o pai acabou de fazer ao anexar a
    // foto do caderno da filha, e não uma letra miúda depois do "Montar o plano".
    palco.append(
      el("p", {
        class: "cap__lgpd",
        text:
          "O material não fica guardado em lugar nenhum: ele é lido, vira texto, e é " +
          "descartado.",
      })
    );

    palco.append(acoesDoPalco());

    /**
     * Os `<input type="file">` ficam por ÚLTIMO no DOM de propósito: o foco inicial
     * do `openModal` pega o primeiro `input, select, textarea, button` em ordem de
     * documento, e um input de arquivo invisível e sem rótulo seria uma armadilha
     * pra quem usa teclado ou leitor de tela.
     */
    palco.append(inputCamera, inputGaleria, inputArquivo);

    // Depois de juntar (ou de errar) um link, o foco volta pro campo de link: repintar
    // o palco joga o foco pro começo do modal, e quem estava colando links perderia o
    // lugar a cada tentativa.
    if (devolverFocoAoLink) {
      devolverFocoAoLink = false;
      palco.querySelector(".cap__link-campo")?.focus();
    }
  }

  /**
   * O campo do pedido, com os exemplos.
   *
   * Os exemplos SUBSTITUEM o texto em vez de acrescentar: quem toca num exemplo com o
   * campo vazio quer aquilo ali, e quem já escreveu não toca. Concatenar produziria
   * frases coladas que ninguém releu antes de mandar pra IA.
   */
  function campoDoPedido() {
    const id = "cap-pedido";
    const campo = el("textarea", {
      class: "pl-input pl-textarea cap__pedido",
      attrs: {
        id,
        rows: "3",
        maxlength: String(PEDIDO_MAX),
        placeholder: "Ex.: revisar a tabuada do 7 e do 8, uns 20 minutos por dia",
      },
    });
    campo.value = pedido;
    campo.addEventListener("input", () => {
      pedido = campo.value;
      atualizarAcao();
    });

    /**
     * Colar um link AQUI também funciona — quem chega com o link na mão cola no
     * primeiro campo que vê, e recusar isso seria punir o comportamento mais natural
     * que existe na tela.
     *
     * A URL é retirada do texto depois de virar card. Sem isso, o `https://…` cru iria
     * junto no `pedido`, e a IA tentaria interpretar um endereço como instrução.
     *
     * É o evento `paste`, não o `input`: no `input`, a regex casaria com "https://a" no
     * meio da digitação e a leitura dispararia com o endereço pela metade.
     */
    campo.addEventListener("paste", (evt) => {
      const colado = evt.clipboardData?.getData("text") || "";
      const url = extrairUrl(colado);
      if (!url) return;

      evt.preventDefault();
      const resto = colado.replace(url, "").replace(/\s{2,}/g, " ").trim();
      const antes = campo.value.slice(0, campo.selectionStart);
      const depois = campo.value.slice(campo.selectionEnd);
      campo.value = `${antes}${resto}${depois}`.slice(0, PEDIDO_MAX);
      pedido = campo.value;
      atualizarAcao();
      juntarLink(url);
    });

    const exemplos = el("div", {
      class: "cap__exemplos",
      attrs: { "aria-label": "Exemplos de pedido" },
    });
    EXEMPLOS_DE_PEDIDO.forEach((texto) => {
      const chip = el("button", {
        class: "cap__exemplo",
        attrs: { type: "button" },
        text: texto,
      });
      chip.addEventListener("click", () => {
        pedido = texto;
        campo.value = texto;
        campo.focus();
        atualizarAcao();
      });
      exemplos.appendChild(chip);
    });

    return el("div", {
      class: "cap__pedido-bloco",
      children: [
        el("label", {
          class: "pl-field__label",
          attrs: { for: id },
          text: "Seu pedido pra Cogni",
        }),
        campo,
        exemplos,
      ],
    });
  }

  /* ---- O link ------------------------------------------------------------ */

  /**
   * O campo de link + o botão "Juntar".
   *
   * `type="url"` seria o correto no papel e é errado na prática: ele liga a validação
   * nativa do navegador, que recusa "youtube.com/watch?v=…" sem `https://` — que é
   * exatamente como metade das pessoas cola. A validação de verdade acontece no
   * `extrairUrl`, que aceita o endereço com frase em volta.
   */
  function campoDoLink() {
    const id = "cap-link";
    const campo = el("input", {
      class: "pl-input cap__link-campo",
      attrs: {
        id,
        type: "text",
        inputmode: "url",
        autocomplete: "off",
        spellcheck: "false",
        placeholder: "Cole um link aqui",
      },
    });
    campo.value = textoDoLink;
    campo.addEventListener("input", () => (textoDoLink = campo.value));
    campo.addEventListener("keydown", (evt) => {
      // Enter dentro de um campo de uma linha significa "manda" em qualquer formulário
      // do mundo — e aqui ele evita o pulo até o botão no celular.
      if (evt.key !== "Enter") return;
      evt.preventDefault();
      juntarLink(campo.value);
    });

    const juntar = el("button", {
      class: "dash-btn dash-btn--ghost cap__link-botao",
      attrs: { type: "button" },
      text: lendoLink ? "Lendo…" : "Juntar",
    });
    juntar.disabled = !!lendoLink || preparando;
    juntar.addEventListener("click", () => juntarLink(campo.value));

    return el("div", {
      class: "cap__link",
      children: [
        el("label", { class: "sr-only", attrs: { for: id }, text: "Link do material" }),
        el("span", { class: "cap__link-ico", svg: ICON.link, attrs: { "aria-hidden": "true" } }),
        campo,
        juntar,
      ],
    });
  }

  /**
   * Lê um link e põe o resultado na bandeja.
   *
   * O estado de carregando fica NA BANDEJA, e não no palco inteiro: ler um link é I/O
   * de rede (o servidor é que espera o YouTube), diferente de foto e vídeo, que são CPU
   * do aparelho e travam a tela de qualquer jeito. Cobrir o modal por 8 segundos aqui
   * impediria o pai de continuar escrevendo o pedido enquanto espera.
   */
  async function juntarLink(bruto) {
    if (lendoLink || preparando) return;

    const url = extrairUrl(bruto);
    devolverFocoAoLink = true;
    if (!url) {
      textoDoLink = bruto || "";
      etapaEscolher(
        "Não achei um link aí. Copie o endereço do vídeo ou da página e cole de novo."
      );
      return;
    }
    if (materiais.length >= MAX_ITENS) {
      etapaEscolher(`Você já tem ${MAX_ITENS} materiais. Remova um pra adicionar outro.`);
      return;
    }
    if (materiais.filter((m) => m.origem === "link").length >= MAX_LINKS) {
      etapaEscolher(
        `Dá pra juntar ${MAX_LINKS} links por plano. Remova um da lista pra colar outro.`
      );
      return;
    }

    textoDoLink = "";
    lendoLink = url;
    etapaEscolher();
    anunciar("Lendo o link. Isso leva alguns segundos.");

    try {
      const material = await prepararLink(url, orcamento, {
        signal: controle.signal,
        jaNaBandeja: materiais.map((m) => m.chave).filter(Boolean),
      });
      if (controle.signal.aborted) return;
      materiais.push(material);
      lendoLink = null;
      etapaEscolher();
      anunciar(`${material.rotulo} adicionado.`);
    } catch (err) {
      lendoLink = null;
      if (controle.signal.aborted) return;
      if (!(err instanceof ErroDeLink)) {
        console.error("[Companion] Falha ao ler o link:", err);
      }
      // O texto volta pro campo: o erro mais comum é link errado, e reescrever o
      // endereço do zero por causa disso seria punir o pai duas vezes.
      textoDoLink = url;
      etapaEscolher(
        err instanceof ErroDeLink ? err.message : "Não consegui abrir esse link agora."
      );
    }
  }

  /** Botão do grid de entradas. */
  function botao(rotulo, icone, aoClicar, estilo = "ghost") {
    const b = el("button", {
      class: `dash-btn dash-btn--${estilo} cap__botao`,
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: icone }),
        el("span", { text: rotulo }),
      ],
    });
    b.addEventListener("click", aoClicar);
    if (preparando) b.disabled = true;
    return b;
  }

  /** Input de arquivo escondido, e fora da ordem de tabulação. */
  function entrada({ accept, capture, multiple }) {
    const attrs = { type: "file", accept, tabindex: "-1", "aria-hidden": "true" };
    if (capture) attrs.capture = capture;
    if (multiple) attrs.multiple = "multiple";

    const input = el("input", { class: "cap__input", attrs });
    input.addEventListener("change", () => {
      const arquivos = Array.from(input.files || []);
      // O evento `change` NÃO dispara pro mesmo arquivo duas vezes se o valor ficar
      // preso: remover um material e re-escolhê-lo não faria nada.
      input.value = "";
      receber(arquivos);
    });
    return input;
  }

  /**
   * Recebe arquivos e prepara um por um.
   *
   * A flag `preparando` não é enfeite: dois cliques durante a decomposição de um
   * vídeo rodariam duas extrações concorrentes — dois AudioContexts, memória
   * dobrada — em cima do cenário que já é o mais apertado de todos.
   */
  async function receber(arquivos) {
    if (preparando || !arquivos.length) return;

    const vagas = MAX_ITENS - materiais.length;
    if (vagas <= 0) {
      etapaEscolher(`Você já tem ${MAX_ITENS} materiais. Remova um pra adicionar outro.`);
      return;
    }

    preparando = true;
    const falhas = [];
    etapaProgresso("preparando o material…", { cancelavel: false });

    for (const file of arquivos.slice(0, vagas)) {
      if (controle.signal.aborted) break;
      try {
        const material = await prepararMaterial(file, orcamento, {
          onProgresso: (t) => etapaProgresso(t, { cancelavel: false }),
          signal: controle.signal,
        });
        materiais.push(material);
      } catch (err) {
        const amigavel =
          err instanceof MaterialNaoSuportado || err?.name === "ErroDeZip"
            ? err.message
            : err?.message && err.message.length < 200
              ? err.message
              : `Não consegui abrir "${file.name}".`;
        if (!(err instanceof MaterialNaoSuportado)) {
          console.error("[Companion] Falha ao preparar o material:", err);
        }
        falhas.push(amigavel);
      }
    }

    preparando = false;
    if (controle.signal.aborted) return;

    /**
     * Sucesso PARCIAL: um `.docx` corrompido no meio de quatro materiais não pode
     * abortar o lote. O que deu certo fica na bandeja, e o que falhou é dito.
     */
    etapaEscolher(falhas.length ? falhas.join(" ") : null);
    anunciar(
      materiais.length
        ? `${materiais.length} ${materiais.length === 1 ? "material pronto" : "materiais prontos"}.`
        : "Nenhum material foi adicionado."
    );
  }

  /* ---- A bandeja --------------------------------------------------------- */

  function bandeja() {
    const lista = el("ul", { class: "cap__bandeja" });

    materiais.forEach((m, i) => {
      const remover = el("button", {
        class: "cap__remover",
        attrs: { type: "button", "aria-label": `Remover ${m.nome}` },
        svg: ICON.trash,
      });
      remover.addEventListener("click", () => {
        orcamento.devolver(m.bytes);
        materiais.splice(i, 1);
        etapaEscolher();
        anunciar(`${m.nome} removido.`);
      });

      const corpo = [
        // Miniatura já diz que é foto; o ícone ao lado dela seria repetição.
        m.miniatura
          ? null
          : el("span", { class: "cap__item-ico", svg: origemIcon(m.origem) || ICON.file }),
        el("span", {
          class: "cap__item-texto",
          children: [
            el("span", { class: "cap__item-nome", text: m.rotulo }),
            /**
             * O SELO é obrigatório no material de link, e é a peça que faz a
             * degradação ser honesta: "sem legenda, o plano vai sair mais genérico"
             * dito AQUI custa um olhar; descoberto depois, custa um plano ruim que o
             * pai aprovou achando que a Cogni tinha assistido à aula.
             */
            m.selo
              ? el("span", {
                  class: `cap__selo cap__selo--${m.selo.tom}`,
                  text: m.selo.texto,
                })
              : null,
            m.aviso ? el("span", { class: "cap__item-aviso", text: m.aviso }) : null,
          ].filter(Boolean),
        }),
        remover,
      ].filter(Boolean);

      const linha = el("li", { class: "cap__item", children: corpo });

      if (m.miniatura) {
        const thumb = el("img", {
          // A miniatura do YouTube é 16:9; a de foto é quadrada. Recortar a capa do
          // vídeo num quadrado corta justamente o quadro com o assunto escrito.
          class: m.ehVideo ? "cap__thumb cap__thumb--video" : "cap__thumb",
          attrs: {
            src: m.miniatura,
            alt: `Prévia de ${m.nome}`,
            loading: "lazy",
            referrerpolicy: "no-referrer",
          },
        });
        // A capa do vídeo vem do i.ytimg.com — rede de terceiro. Se ela não carregar,
        // o card some com a imagem e mostra o ícone: melhor que um retângulo quebrado
        // ao lado de um título perfeitamente legível.
        thumb.addEventListener("error", () => {
          thumb.replaceWith(
            el("span", { class: "cap__item-ico", svg: origemIcon(m.origem) || ICON.file })
          );
        });
        linha.prepend(thumb);
      }
      if (m.reproduzivel) {
        // Player nativo: acessível de graça, e é o que evita o pai mandar (e pagar)
        // dois minutos de silêncio sem perceber.
        const player = el("audio", { class: "cap__player", attrs: { controls: "controls" } });
        player.src = m.reproduzivel;
        linha.append(player);
      }

      lista.append(linha);
    });

    /**
     * O link sendo lido ocupa o LUGAR do card que vai nascer ali. É a diferença entre
     * "o site travou" e "estou indo buscar": o resto da tela continua vivo, e o pai
     * pode escrever o pedido enquanto o YouTube responde.
     */
    if (lendoLink) {
      lista.append(
        el("li", {
          class: "cap__item is-lendo",
          attrs: { role: "status", "aria-live": "polite" },
          children: [
            el("span", {
              class: "dash-loading__spinner cap__item-spinner",
              attrs: { "aria-hidden": "true" },
            }),
            el("span", {
              class: "cap__item-texto",
              children: [
                el("span", { class: "cap__item-nome", text: "lendo o link…" }),
                el("span", { class: "cap__item-aviso", text: encurtarUrl(lendoLink) }),
              ],
            }),
          ],
        })
      );
    }

    return lista;
  }

  /** URL curta o bastante pra caber no card sem virar parágrafo. */
  function encurtarUrl(url) {
    const limpo = String(url).replace(/^https?:\/\//, "").replace(/^www\./, "");
    return limpo.length > 52 ? `${limpo.slice(0, 52)}…` : limpo;
  }

  /**
   * A barra de ação da etapa. Existe SEMPRE agora, e não só quando há bandeja: o
   * caminho principal virou escrever o pedido, e um botão que só aparece depois de
   * anexar arquivo escondia justamente o caminho que a gente quer que seja o padrão.
   */
  function acoesDoPalco() {
    btnMontar = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.sparkle }),
        el("span", { text: "Montar o plano" }),
      ],
    });
    btnMontar.addEventListener("click", executarLeitura);

    const filhos = [];
    if (materiais.length) {
      const usado = orcamento.usado();
      filhos.push(
        el("span", {
          class: "cap__contagem",
          text:
            `${materiais.length} de ${MAX_ITENS} · ` +
            `${formatarBytes(usado)} de ${formatarBytes(CORPO_MAX)}`,
        })
      );
    }
    filhos.push(btnMontar);

    const barra = el("div", { class: "cap__acoes", children: filhos });
    atualizarAcao();
    return barra;
  }

  /* ---- O gravador -------------------------------------------------------- */

  async function abrirGravador() {
    if (materiais.some((m) => m.origem === "audio")) {
      etapaEscolher("Já tem um áudio aqui. Remova o atual pra gravar outro.");
      return;
    }
    if (!suportaGravacao()) {
      etapaEscolher(
        "Este navegador não grava áudio. Use “Escolher arquivo” e mande o áudio pronto."
      );
      return;
    }

    palco.replaceChildren();
    palco.append(el("h3", { class: "cap__etapa", text: "Gravar áudio" }));

    const cronometro = el("span", {
      class: "cap__cronometro",
      // O leitor de tela NÃO pode ler o relógio a cada segundo: afogaria tudo. Os
      // eventos que importam (começou, parou, está no fim) vão pro `anunciar`.
      attrs: { "aria-hidden": "true" },
      text: "0s",
    });
    const nivel = el("div", {
      class: "cap__nivel",
      attrs: { "aria-hidden": "true" },
      children: [el("span", { class: "cap__nivel-barra" })],
    });
    const barra = nivel.firstChild;

    const alternar = el("button", {
      class: "dash-btn dash-btn--primary cap__gravar",
      attrs: { type: "button", "aria-pressed": "false" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.mic }),
        el("span", { text: "Começar a gravar" }),
      ],
    });

    const voltar = el("button", {
      class: "dash-btn dash-btn--ghost",
      attrs: { type: "button" },
      text: "Voltar",
    });
    voltar.addEventListener("click", () => {
      pararGravador();
      etapaEscolher();
    });

    const erro = el("p", {
      class: "pl-form__erro",
      attrs: { role: "status", "aria-live": "polite" },
    });

    palco.append(
      el("p", {
        class: "cap__intro",
        text:
          "Grave o recado da professora ou leia a lição em voz alta. A Cogni transcreve " +
          "e monta as tarefas.",
      }),
      el("div", { class: "cap__gravador", children: [alternar, cronometro, nivel] }),
      erro,
      el("div", { class: "cap__acoes", children: [voltar] })
    );

    /** Troca o RÓTULO no mesmo nó: recriar o botão perderia o foco no meio da ação. */
    function pintarBotao(gravando) {
      alternar.setAttribute("aria-pressed", gravando ? "true" : "false");
      alternar.classList.toggle("is-gravando", gravando);
      alternar.replaceChildren(
        el("span", { class: "pl-btn__ico", svg: gravando ? ICON.stop : ICON.mic }),
        el("span", { text: gravando ? "Parar" : "Começar a gravar" })
      );
    }

    alternar.addEventListener("click", async () => {
      if (gravador && gravador.gravando()) {
        const { blob, duracao_s, mudo } = await gravador.parar();
        pintarBotao(false);
        pararGravador();
        await guardarGravacao(blob, duracao_s, mudo, erro);
        return;
      }

      erro.textContent = "";
      /**
       * Trava o botão enquanto o navegador pergunta pela permissão. A caixa de
       * diálogo é do sistema e pode ficar aberta o tempo que o pai quiser — sem
       * isto, cada clique impaciente dispara um `getUserMedia` novo, e o que sobra
       * são vários streams abertos disputando o microfone.
       */
      alternar.disabled = true;
      try {
        gravador = await criarGravador({
          maxBytes: Math.min(TETO.audio, orcamento.restante()) * 0.7,
          aoTempo: (s) => (cronometro.textContent = formatarDuracao(s)),
          aoNivel: (n) => (barra.style.transform = `scaleX(${Math.max(0.02, n)})`),
          aoLimite: (motivo) =>
            anunciar(
              motivo === "tempo"
                ? "Limite de tempo atingido; a gravação foi encerrada."
                : "A gravação atingiu o tamanho máximo e foi encerrada."
            ),
        });
        gravador.iniciar();
        pintarBotao(true);
        anunciar("Gravando. Toque em Parar quando terminar.");
      } catch (err) {
        if (!(err instanceof ErroDeGravacao)) {
          console.error("[Companion] Falha ao iniciar a gravação:", err);
        }
        erro.textContent =
          err instanceof ErroDeGravacao ? err.message : "Não consegui ligar o microfone.";
      } finally {
        alternar.disabled = false;
      }
    });
  }

  async function guardarGravacao(blob, duracao_s, mudo, erro) {
    if (!blob || !blob.size) {
      erro.textContent = "A gravação saiu vazia. Tente de novo.";
      return;
    }
    try {
      const arquivo = new File([blob], `gravacao.${(blob.type.split("/")[1] || "webm").split(";")[0]}`, {
        type: blob.type,
      });
      const material = await prepararMaterial(arquivo, orcamento, {
        signal: controle.signal,
      });
      // A duração medida pelo cronômetro é mais confiável que a do cabeçalho: WebM
      // gravado por MediaRecorder costuma vir sem duração declarada.
      material.itens[0].duracao_s = Math.round(duracao_s);
      material.rotulo = `gravação · ${formatarDuracao(duracao_s)}`;
      if (mudo) {
        material.aviso =
          "Quase não ouvi som nessa gravação. Confira se o microfone estava aberto antes de mandar.";
      }
      materiais.push(material);
      etapaEscolher();
      anunciar(`Gravação de ${formatarDuracao(duracao_s)} salva.`);
    } catch (err) {
      console.error("[Companion] Falha ao guardar a gravação:", err);
      erro.textContent = err?.message || "Não consegui guardar essa gravação.";
    }
  }

  function pararGravador() {
    if (!gravador) return;
    gravador.descartar();
    gravador = null;
  }

  /* ---- Etapa 2: progresso honesto ---------------------------------------- */

  function etapaProgresso(texto, { cancelavel = true } = {}) {
    const filhos = [
      el("span", { class: "dash-loading__spinner", attrs: { "aria-hidden": "true" } }),
      el("p", { class: "cap__carregando-texto", text: texto }),
    ];

    if (cancelavel) {
      const cancelar = el("button", {
        class: "dash-btn dash-btn--ghost",
        attrs: { type: "button" },
        text: "Cancelar",
      });
      cancelar.addEventListener("click", () => {
        controle.abort();
        etapaEscolher();
      });
      filhos.push(cancelar);
    }

    palco.replaceChildren(
      el("div", {
        class: "cap__carregando",
        attrs: { role: "status", "aria-live": "polite" },
        children: filhos,
      })
    );
  }

  async function executarLeitura() {
    const itens = materiais.flatMap((m) => m.itens);
    const texto = pedido.trim();
    if (!itens.length && !texto) {
      etapaEscolher("Escreva o que você quer que ela estude, ou mande o material da escola.");
      return;
    }
    const corpo = { itens, pedido: texto, hoje: new Date().toISOString().slice(0, 10) };

    /**
     * A última checagem, e a única que mede o que a plataforma mede. Estourar aqui é
     * raro (a bandeja já avisa item a item), mas o 413 alternativo viria da Vercel,
     * antes do nosso código — e aí a mensagem não seria nossa.
     */
    const tamanho = tamanhoSerializado(corpo);
    if (tamanho > CORPO_MAX) {
      etapaEscolher(
        `Junto, esse material dá ${formatarBytes(tamanho)} e o limite é ${formatarBytes(CORPO_MAX)}. Tire um item e tente de novo.`
      );
      return;
    }

    /**
     * Progresso HONESTO: a primeira fase é a única que o cliente conhece de verdade
     * (o envio está acontecendo). As seguintes são estimativas de tempo, mas
     * correspondem ao que a função de fato faz nessa ordem — transcrever, ler,
     * estruturar — e não a uma barra decorativa.
     */
    const temAudio = itens.some((i) => i.tipo === "audio");
    etapaProgresso(itens.length ? "enviando o material…" : "mandando o pedido…");
    anunciar(itens.length ? "Enviando o material pra Cogni." : "Enviando o pedido pra Cogni.");

    const fases = !itens.length
      ? [[3000, "montando as tarefas…"]]
      : temAudio
        ? [
            [5000, "transcrevendo o áudio…"],
            [18000, "lendo o material…"],
            [32000, "montando as tarefas…"],
          ]
        : [
            [5000, "lendo o material…"],
            [16000, "montando as tarefas…"],
          ];
    trocaDeFase = fases.map(([ms, texto]) =>
      window.setTimeout(() => etapaProgresso(texto), ms)
    );

    try {
      const resposta = await lerMaterial(itens, texto, controle.signal);
      limparFases();
      if (controle.signal.aborted) return;

      const proposta = resposta || propostaDeExemplo(materiais, texto);
      if (!proposta || proposta.legivel === false) {
        etapaMaterialRuim(proposta && proposta.motivo);
        return;
      }
      etapaRevisao(proposta);
    } catch (err) {
      limparFases();
      if (controle.signal.aborted) return;

      const msg =
        err instanceof ErroDeLeitura
          ? err.message
          : err?.name === "TimeoutError"
            ? itens.length
              ? "A Cogni está demorando demais pra responder. Tente de novo com menos material."
              : "A Cogni está demorando demais pra responder. Tente de novo em instantes."
            : itens.length
              ? "Não consegui ler o material agora. Tente de novo em instantes."
              : "Não consegui montar o plano agora. Tente de novo em instantes.";
      if (!(err instanceof ErroDeLeitura)) {
        console.error("[Companion] Leitura de material falhou:", err);
      }
      etapaEscolher(msg);
    }
  }

  function limparFases() {
    (trocaDeFase || []).forEach((t) => window.clearTimeout(t));
    trocaDeFase = null;
  }

  /* ---- Material ruim: mensagem com dica, nunca erro genérico ------------- */

  function etapaMaterialRuim(motivo) {
    // A dica acompanha o que foi mandado: mandar dica de enquadramento pra quem
    // enviou um PDF é ruído, e ruído ensina o pai a ignorar as nossas mensagens.
    const origens = new Set(materiais.map((m) => m.origem));
    let dica =
      "Confira se o arquivo tem mesmo o texto da lição. Se for só imagem, tire uma foto bem enquadrada.";
    if (!materiais.length) {
      dica =
        "Diga o assunto e o que você quer que ela faça. Por exemplo: “revisar frações, " +
        "meia hora por dia até sexta”.";
    } else if (origens.has("link")) {
      dica =
        "Tente uma videoaula ou uma página que expliquem o assunto. Ou escreva no pedido o que você quer que ela treine.";
    } else if (origens.has("foto")) {
      dica =
        "Tente de novo com a folha inteira no quadro, o celular parado e boa luz, sem sombra por cima do papel.";
    } else if (origens.has("audio") || origens.has("video")) {
      dica =
        "Tente gravar mais perto de quem está falando, num lugar mais silencioso. Ou escreva o plano você mesmo.";
    }

    palco.replaceChildren();
    palco.append(
      el("div", {
        class: "cap__ruim",
        children: [
          el("span", { class: "cap__ruim-ico", svg: ICON.alert }),
          el("p", {
            class: "cap__ruim-titulo",
            text:
              motivo ||
              (materiais.length
                ? "Não consegui usar esse material."
                : "Não consegui montar um plano com esse pedido."),
          }),
          el("p", { class: "cap__ruim-dica", text: dica }),
        ],
      })
    );

    const tentar = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      // O pedido escrito NÃO é descartado no caminho de volta (só os materiais são):
      // reescrever a frase do zero por causa de uma foto ruim seria punir a mãe pelo
      // erro do arquivo.
      text: materiais.length ? "Tentar outro material" : "Voltar e ajustar o pedido",
    });
    tentar.addEventListener("click", () => {
      materiais = [];
      orcamento = novoOrcamento();
      etapaEscolher();
    });
    palco.append(el("div", { class: "cap__acoes", children: [tentar] }));
    anunciar(motivo || "Não consegui usar o que você mandou.");
  }

  /* ---- Etapa 3: revisão -------------------------------------------------- */

  function etapaRevisao(proposta) {
    // Os materiais já cumpriram o papel: soltamos as data URLs aqui pra não segurar
    // alguns MB de base64 em memória enquanto o pai revisa com calma. Os rótulos
    // ficam, porque a revisão lista o que foi lido.
    const resumo = materiais.map((m) => ({
      nome: m.nome,
      origem: m.origem,
      rotulo: m.rotulo,
    }));
    const pedidoFeito = pedido.trim();
    materiais = [];
    orcamento = novoOrcamento();

    palco.replaceChildren(
      montarRevisao({
        proposta,
        materiais: resumo,
        pedido: pedidoFeito,
        ctx,
        close: fechar,
        aoSalvar,
      })
    );
    anunciar("Confira o que a Cogni entendeu antes de salvar.");
  }

  /* ---- Ciclo de vida ----------------------------------------------------- */

  return {
    montar(close) {
      fechar = close;
      etapaEscolher();
      return raiz;
    },
    /**
     * Chamado pelo `onClose` do modal.
     *
     * 🔴 Isto não é higiene opcional. Sem ele: o `fetch` continua em voo, os
     * `setTimeout` de fase escrevem numa árvore desconectada, a promise chama a
     * revisão no vazio — e, o pior de tudo, **o microfone continua ligado**. Num
     * produto sobre criança, indicador de gravação aceso depois de fechar o diálogo
     * não é vazamento de recurso: é o que faz um pai desinstalar.
     *
     * A janela também cresceu: antes o fluxo inteiro durava ~5 s; com upload,
     * transcrição e visão são 60-90 s.
     */
    encerrar() {
      controle.abort();
      limparFases();
      pararGravador();
      materiais = [];
      pedido = "";
      textoDoLink = "";
      lendoLink = null;
    },
  };
}
