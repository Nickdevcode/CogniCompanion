/**
 * captura.js — "Criar com a Cogni": o pai manda o que a escola passou, e a IA monta
 * o plano.
 *
 * É o atalho que resolve o buraco número 1 da tela antiga: escrever plano dá
 * trabalho, e plano que dá trabalho não é criado. A informação já existe — está na
 * agenda escolar, na folha de exercícios, no PDF da lista, no áudio que a professora
 * mandou no grupo.
 *
 * Este arquivo é só o fluxo de AQUISIÇÃO:
 *   escolher → bandeja → [Ler com a Cogni] → progresso → revisão (`revisao.js`)
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
function propostaDeExemplo(materiais) {
  const cabecalhos = materiais
    .map((m) => `— ${m.nome} —\n(conteúdo lido deste material apareceria aqui)`)
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
      "AGENDA — 26/05\nMat: exercícios pág. 42 e 43 (frações equivalentes)\n" +
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
 * Manda os itens pra Vercel Function e devolve a proposta.
 *
 * @param {object[]} itens
 * @param {AbortSignal} signal
 * @returns {Promise<object>} a proposta (ou `{legivel:false, motivo}`)
 */
async function lerMaterial(itens, signal) {
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
      body: JSON.stringify({ itens, hoje: new Date().toISOString().slice(0, 10) }),
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

  /* ---- Etapa 1: escolher ------------------------------------------------- */

  function etapaEscolher(erro) {
    palco.replaceChildren();

    palco.append(
      el("h3", { class: "cap__etapa", text: "O que a escola mandou" }),
      el("p", {
        class: "cap__intro",
        text:
          "Manda o que a escola passou — foto, PDF, slides, planilha ou o áudio da " +
          "professora. A Cogni lê e monta as tarefas; você confere antes de valer.",
      })
    );

    /**
     * Câmera e galeria são botões SEPARADOS porque `capture="environment"` **não**
     * deixa o pai pegar a foto que ele tirou ontem — ele força a câmera a abrir.
     */
    const inputCamera = entrada({ accept: "image/*", capture: "environment" });
    const inputGaleria = entrada({ accept: "image/*", multiple: true });
    const inputArquivo = entrada({ accept: ACEITA_ARQUIVO, multiple: true });

    const botoes = el("div", {
      class: "cap__botoes",
      children: [
        botao("Tirar foto", ICON.camera, () => inputCamera.click(), "primary"),
        botao("Escolher foto", ICON.image, () => inputGaleria.click()),
        botao("Escolher arquivo", ICON.file, () => inputArquivo.click()),
        botao("Gravar áudio", ICON.mic, abrirGravador),
      ],
    });
    palco.append(botoes);

    if (erro) {
      palco.append(
        el("p", {
          class: "pl-form__erro",
          attrs: { role: "status", "aria-live": "polite" },
          text: erro,
        })
      );
    }

    if (materiais.length) palco.append(bandeja(), acoesDaBandeja());

    palco.append(
      el("p", {
        class: "cap__lgpd",
        text:
          "O material não fica guardado em lugar nenhum: ele é lido, vira texto, e é " +
          "descartado.",
      })
    );

    /**
     * Os `<input type="file">` ficam por ÚLTIMO no DOM de propósito: o foco inicial
     * do `openModal` pega o primeiro `input, select, textarea, button` em ordem de
     * documento, e um input de arquivo invisível e sem rótulo seria uma armadilha
     * pra quem usa teclado ou leitor de tela.
     */
    palco.append(inputCamera, inputGaleria, inputArquivo);
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
            m.aviso ? el("span", { class: "cap__item-aviso", text: m.aviso }) : null,
          ].filter(Boolean),
        }),
        remover,
      ].filter(Boolean);

      const linha = el("li", { class: "cap__item", children: corpo });

      if (m.miniatura) {
        linha.prepend(
          el("img", {
            class: "cap__thumb",
            attrs: { src: m.miniatura, alt: `Prévia de ${m.nome}` },
          })
        );
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

    return lista;
  }

  function acoesDaBandeja() {
    const ler = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      children: [
        el("span", { class: "pl-btn__ico", svg: ICON.sparkle }),
        el("span", { text: "Ler com a Cogni" }),
      ],
    });
    ler.addEventListener("click", executarLeitura);

    const usado = orcamento.usado();
    const contagem = el("span", {
      class: "cap__contagem",
      text:
        `${materiais.length} de ${MAX_ITENS} · ` +
        `${formatarBytes(usado)} de ${formatarBytes(CORPO_MAX)}`,
    });

    return el("div", { class: "cap__acoes", children: [contagem, ler] });
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
          "Quase não ouvi som nessa gravação — confira se o microfone estava aberto antes de mandar.";
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
    const corpo = { itens, hoje: new Date().toISOString().slice(0, 10) };

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
    etapaProgresso("enviando o material…");
    anunciar("Enviando o material pra Cogni.");

    const fases = temAudio
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
      const resposta = await lerMaterial(itens, controle.signal);
      limparFases();
      if (controle.signal.aborted) return;

      const proposta = resposta || propostaDeExemplo(materiais);
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
            ? "A Cogni está demorando demais pra responder. Tente de novo com menos material."
            : "Não consegui ler o material agora. Tente de novo em instantes.";
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
      "Confira se o arquivo tem mesmo o texto da lição — se for só imagem, tire uma foto bem enquadrada.";
    if (origens.has("foto")) {
      dica =
        "Tente de novo com a folha inteira no quadro, o celular parado e boa luz — sem sombra por cima do papel.";
    } else if (origens.has("audio") || origens.has("video")) {
      dica =
        "Tente gravar mais perto de quem está falando, num lugar mais silencioso — ou escreva o plano você mesmo.";
    }

    palco.replaceChildren();
    palco.append(
      el("div", {
        class: "cap__ruim",
        children: [
          el("span", { class: "cap__ruim-ico", svg: ICON.alert }),
          el("p", {
            class: "cap__ruim-titulo",
            text: motivo || "Não consegui usar esse material.",
          }),
          el("p", { class: "cap__ruim-dica", text: dica }),
        ],
      })
    );

    const tentar = el("button", {
      class: "dash-btn dash-btn--primary",
      attrs: { type: "button" },
      text: "Tentar outro material",
    });
    tentar.addEventListener("click", () => {
      materiais = [];
      orcamento = novoOrcamento();
      etapaEscolher();
    });
    palco.append(el("div", { class: "cap__acoes", children: [tentar] }));
    anunciar(motivo || "Não consegui usar esse material.");
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
    materiais = [];
    orcamento = novoOrcamento();

    palco.replaceChildren(
      montarRevisao({ proposta, materiais: resumo, ctx, close: fechar, aoSalvar })
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
    },
  };
}
