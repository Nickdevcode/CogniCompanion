/**
 * campo-ia.js — O ✨ da Cogni dentro de um campo de texto do formulário.
 *
 * A IA da Mesa era tudo ou nada: ou o pai usava "Criar com a Cogni" e recebia um
 * plano inteiro, ou clicava em "Escrever eu mesmo" e ficava sozinho com um campo em
 * branco. Este módulo é a terceira opção — ele escreve, e a Cogni ajuda ali mesmo,
 * na frase que ele acabou de digitar.
 *
 * Liga em QUALQUER `<input>`/`<textarea>` que esteja dentro de um `.pl-field`
 * (o wrapper que `campoForm()` monta), e desliga junto com o modal.
 *
 * 🔴 As três regras que fazem ou quebram isso — as três estão neste arquivo:
 *
 * 1. **Desfazer é obrigatório.** A IA SUBSTITUI o texto do pai. Sem um desfazer ao
 *    lado do campo, a feature é hostil: a pessoa perde o próprio texto num clique. O
 *    valor anterior fica em memória e o botão some sozinho quando ele digita de novo.
 * 2. **O corte é da função, não do `maxlength`.** A resposta já chega cortada no
 *    teto (e sem partir palavra); o atributo do `<input>` é só a última rede. Se o
 *    corte fosse dele, o pai veria uma frase mutilada sem entender por quê.
 * 3. **Nunca inventar fato.** Essa é do lado do servidor (`api/_lib/melhorar.mjs`),
 *    mas o que a tela faz por ela é não esconder o resultado: o texto novo aparece
 *    no campo, editável, com o desfazer do lado — e o pai lê antes de salvar.
 *
 * ⚠️ A regra do "tem de onde tirar?" (`temFonte`) existe NAS DUAS PONTAS: aqui, pra
 * o botão já nascer desabilitado com a dica; e na função, que é quem decide de fato.
 * Gerar um título do nada não dá — não há de onde tirar, e a IA inventaria. Com
 * alguma coisa escrita ("fração prova sexta") ela tem contexto e devolve uma frase.
 */

import { el } from "./sections/_shared.js";
import { ICON } from "./icons.js";
import { USAR_SUPABASE } from "./mock-data.js";

/** Endpoint da Vercel Function. Mesma origem do site — não precisa de CORS. */
const ENDPOINT = "/api/melhorar-texto";

/**
 * Teto de espera do cliente.
 *
 * Curto de propósito: o pai está com o cursor no campo, não esperando um plano. A
 * função já para em 20 s; estes 25 s são a folga da rede dele.
 */
const TIMEOUT_MS = 25_000;

/**
 * Os tetos, por campo. Espelham `LIM` (`api/_lib/prompt.mjs`) e o `maxlength` de cada
 * campo do formulário — quando o controle declara o dele, ele ganha.
 */
const TETOS = {
  "plano.titulo": 80,
  "plano.conteudo": 600,
  "tarefa.titulo": 120,
  "tarefa.detalhe": 240,
};

/** Quais ações cada campo oferece. Espelha `CAMPOS` em `api/_lib/melhorar.mjs`. */
const ACOES_DO_CAMPO = {
  "plano.titulo": ["melhorar"],
  "plano.conteudo": ["melhorar", "encurtar", "detalhar"],
  "tarefa.titulo": ["melhorar"],
  "tarefa.detalhe": ["melhorar", "encurtar", "detalhar"],
};

const ROTULO = {
  gerar: "Gerar",
  melhorar: "Melhorar",
  encurtar: "Encurtar",
  detalhar: "Detalhar",
};

const ROTULO_ACESSIVEL = {
  gerar: "Gerar este texto com a Cogni",
  melhorar: "Melhorar este texto com a Cogni",
  encurtar: "Encurtar este texto com a Cogni",
  detalhar: "Detalhar este texto com a Cogni",
};

/** A dica de quando não há de onde tirar o texto. */
const DICA_SEM_FONTE = "Escreva umas palavras aqui e eu melhoro.";

/** Erro com mensagem já escrita pro pai — estado previsto, não bug. */
export class ErroDeEscrita extends Error {}

/* ==========================================================================
   As duas regras que também vivem no servidor
   ========================================================================== */

/**
 * Tem de onde tirar o texto?
 *
 * Gêmea de `temFonte()` em `api/_lib/melhorar.mjs`. A de lá é a que vale; esta existe
 * pra o pai saber ANTES de clicar — nunca um erro depois do clique.
 *
 * `foco`/`materia` NÃO contam: são `<select>` que sempre têm valor, então contariam
 * sempre — e um título gerado só de "matemática" é a invenção que queremos evitar.
 */
function temFonte(campo, texto, ctx) {
  if (texto && texto.trim()) return true;
  if (campo === "plano.titulo") return !!ctx.conteudoDoPlano;
  if (campo === "plano.conteudo") return !!ctx.tituloDoPlano;
  if (campo === "tarefa.titulo") {
    return !!(ctx.tituloDoPlano || ctx.conteudoDoPlano || (ctx.cards && ctx.cards.length));
  }
  if (campo === "tarefa.detalhe") return !!ctx.tituloDaTarefa;
  return false;
}

/**
 * Corta no teto sem partir palavra. Gêmea de `cortarSemPartirPalavra()`
 * (`api/_lib/sanear.mjs`), e aqui ela é a rede de baixo: a resposta já vem cortada,
 * mas o modo de demonstração e um servidor mais velho não passariam por lá.
 */
function cortarSemPartirPalavra(valor, max) {
  const t = String(valor || "").trim();
  if (t.length <= max) return t;
  const bruto = t.slice(0, max);
  const ultimoEspaco = bruto.lastIndexOf(" ");
  const cortado = ultimoEspaco > max / 2 ? bruto.slice(0, ultimoEspaco) : bruto;
  return cortado.replace(/[\s,;:.\-–—]+$/, "").trimEnd();
}

/* ==========================================================================
   A chamada
   ========================================================================== */

/** Traduz o status HTTP numa frase que diz o que fazer. */
function mensagemDeStatus(status) {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Pareie o robô com o perfil da criança pra usar a Cogni aqui.";
  if (status === 429) {
    return "Você pediu ajuda muitas vezes seguidas. Tente de novo daqui a pouco.";
  }
  if (status === 404) {
    // Site servido localmente: a função só existe no deploy.
    return "Escrever com a Cogni só funciona no site publicado. Rodando local, use o modo de demonstração.";
  }
  if (status >= 500) return "O servidor está fora do ar agora. Tente de novo em instantes.";
  return null;
}

/**
 * Texto de exemplo do modo mock (`USAR_SUPABASE = false`).
 *
 * Só a REDE é falsa — mesma prática do resto do fluxo de material. O suficiente pra
 * exercitar offline o que realmente precisa de olho: o desfazer, o corte no teto, o
 * botão desabilitado sem contexto e o estado "escrevendo…".
 *
 * ⚠️ O texto SAI PLAUSÍVEL de propósito. Antes ele carimbava "(exemplo, sem rede)"
 * no resultado, o que era ótimo pra depurar e péssimo no lugar onde este código
 * mais aparece: o modo demonstração, em que alguém avalia o produto pela tela. Quem
 * precisa saber que é exemplo lê este comentário — o visitante lê a interface.
 */
function exemploLocal({ campo, acao, texto, contexto, teto }) {
  const base = String(texto || "").replace(/\s+/g, " ").trim();
  const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  if (acao === "gerar") {
    const fonte =
      campo === "plano.titulo"
        ? contexto.conteudoDoPlano
        : campo === "plano.conteudo"
          ? contexto.tituloDoPlano
          : campo === "tarefa.titulo"
            ? contexto.tituloDoPlano || (contexto.cards || [])[0]
            : contexto.tituloDaTarefa;
    const limpa = maiuscula(String(fonte || "").replace(/\.$/, ""));
    // Título é campo curto: qualquer complemento só seria cortado pelo teto.
    const ehTitulo = campo === "plano.titulo" || campo === "tarefa.titulo";
    return cortarSemPartirPalavra(
      ehTitulo
        ? limpa
        : `${limpa}: um pouco por dia, no ritmo da criança, com a Cogni puxando exemplos do dia a dia.`,
      teto
    );
  }
  if (acao === "encurtar") return cortarSemPartirPalavra(maiuscula(base), Math.ceil(teto / 2));
  if (acao === "detalhar") {
    return cortarSemPartirPalavra(
      `${maiuscula(base)}: o que fazer, com que assunto e em que ordem.`,
      teto
    );
  }
  return cortarSemPartirPalavra(maiuscula(base.replace(/\s*\.\s*$/, "")), teto);
}

/**
 * Manda o texto pra função e devolve a resposta.
 *
 * @returns {Promise<{ok:boolean, texto?:string, motivo?:string}>}
 * @throws {ErroDeEscrita}
 */
async function pedirTexto({ campo, acao, texto, contexto, teto, signal }) {
  if (!USAR_SUPABASE) {
    await new Promise((r) => window.setTimeout(r, 600));
    return { ok: true, texto: exemploLocal({ campo, acao, texto, contexto, teto }) };
  }

  const cliente = window.cognifyAuth && window.cognifyAuth.getClient();
  if (!cliente) throw new ErroDeEscrita("Entre na sua conta pra escrever com a Cogni.");
  const { data } = await cliente.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new ErroDeEscrita("Sua sessão expirou. Entre de novo.");

  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ campo, acao, texto, contexto }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    if (err?.name === "TimeoutError") {
      throw new ErroDeEscrita("Demorou demais pra responder. Tente de novo.");
    }
    console.error("[Companion] Rede falhou ao melhorar o texto:", err);
    throw new ErroDeEscrita("Sem conexão agora. Tente de novo em instantes.");
  }

  // O status vem ANTES do parse: o que não é JSON (504 de gateway, página de erro da
  // plataforma) não pode virar "resposta ilegível", que diria que o site quebrou.
  if (!resp.ok) {
    let doServidor = null;
    try {
      doServidor = (await resp.json())?.erro || null;
    } catch (err) {
      console.debug("[Companion] Resposta de erro sem JSON:", resp.status, err);
    }
    throw new ErroDeEscrita(
      doServidor || mensagemDeStatus(resp.status) || "Não consegui escrever isso agora."
    );
  }

  try {
    return await resp.json();
  } catch (err) {
    console.error("[Companion] Resposta ilegível da função de texto:", err);
    throw new ErroDeEscrita("Não consegui ler a resposta do servidor.");
  }
}

/* ==========================================================================
   O controle
   ========================================================================== */

/**
 * Põe a barra do ✨ embaixo de um campo e devolve o controle dela.
 *
 * A barra fica ABAIXO do campo, alinhada à direita, e não flutuando dentro dele: os
 * campos de conteúdo e de detalhe têm TRÊS ações (melhorar, encurtar, detalhar), e
 * três botões dentro de um `<input>` de 240 caracteres cobririam o texto que o pai
 * está lendo. Um lugar só pros quatro campos também evita a tela onde metade dos
 * botões está por dentro e a outra metade por fora.
 *
 * @param {object} cfg
 * @param {HTMLInputElement|HTMLTextAreaElement} cfg.controle — já dentro do `.pl-field`
 * @param {"plano.titulo"|"plano.conteudo"|"tarefa.titulo"|"tarefa.detalhe"} cfg.campo
 * @param {() => object} cfg.contexto — lido NA HORA do clique (os outros campos mudam)
 * @returns {{ destruir: () => void }}
 */
export function ligarCampoIA({ controle, campo, contexto }) {
  const teto = controle.maxLength > 0 ? controle.maxLength : TETOS[campo] || 240;
  const lerContexto = () => (typeof contexto === "function" ? contexto() || {} : {});

  /** O texto de antes da última troca. `null` = não há o que desfazer. */
  let anterior = null;
  let emCurso = null;

  const msg = el("p", {
    class: "campo-ia__msg",
    // A mesma região serve pro anúncio de sucesso e pra falha: as duas coisas
    // acontecem no mesmo lugar da tela, e o pai não tem que procurar em dois cantos.
    attrs: { role: "status", "aria-live": "polite" },
  });

  const botoes = new Map();
  const barra = el("div", { class: "campo-ia" });

  function criarBotao(acao, primario) {
    const b = el("button", {
      class: "campo-ia__btn" + (primario ? " campo-ia__btn--primario" : ""),
      attrs: { type: "button", "aria-label": ROTULO_ACESSIVEL[acao] },
      children: [
        primario
          ? el("span", {
              class: "campo-ia__ico",
              svg: ICON.sparkle,
              attrs: { "aria-hidden": "true" },
            })
          : null,
        el("span", { class: "campo-ia__rotulo", text: ROTULO[acao] }),
      ],
    });
    b.addEventListener("click", () => executar(acao, b));
    botoes.set(acao, b);
    barra.appendChild(b);
    return b;
  }

  /**
   * O desfazer é o PRIMEIRO da barra — na ordem do DOM, não só na visual.
   *
   * Ele fica na ponta esquerda e as ações na direita, e resolver isso com `order` do
   * CSS deixaria a ordem do Tab diferente da ordem da tela: quem navega por teclado
   * pularia o desfazer depois das três ações, que é exatamente onde ele não está.
   */
  const desfazer = el("button", {
    class: "campo-ia__btn campo-ia__desfazer",
    attrs: { type: "button", hidden: "hidden" },
    children: [
      el("span", { class: "campo-ia__ico", svg: ICON.undo, attrs: { "aria-hidden": "true" } }),
      el("span", { text: "Desfazer" }),
    ],
  });
  desfazer.addEventListener("click", () => {
    if (anterior == null) return;
    controle.value = anterior;
    anterior = null;
    pintar();
    avisar("Voltei o seu texto.", false);
    devolverFoco();
  });
  barra.appendChild(desfazer);

  // O primário troca de ação conforme o campo (vazio = gerar), então é UM botão só —
  // o mesmo lugar, a mesma promessa visual do "Criar com a Cogni".
  const btnPrimario = criarBotao("melhorar", true);
  ACOES_DO_CAMPO[campo]
    .filter((a) => a !== "melhorar")
    .forEach((a) => criarBotao(a, false));

  // Depois do controle e ANTES do `.pl-field__error`: a ordem de leitura é campo →
  // o que dá pra fazer com ele → o que deu errado ao salvar.
  const pai = controle.parentNode;
  if (pai) {
    pai.insertBefore(barra, controle.nextSibling);
    pai.insertBefore(msg, barra.nextSibling);
  }

  /* ---- Estado ------------------------------------------------------------ */

  function avisar(texto, erro) {
    msg.textContent = texto || "";
    msg.classList.toggle("is-erro", !!erro);
  }

  /** O cursor vai pro fim: o texto mudou embaixo dele, e continuar de onde parou é o esperado. */
  function devolverFoco() {
    controle.focus();
    const fim = controle.value.length;
    try {
      controle.setSelectionRange(fim, fim);
    } catch {
      /* tipo de campo que não aceita seleção — o foco já resolve */
    }
  }

  /** Redesenha os botões a partir do que está escrito agora. */
  function pintar() {
    const texto = controle.value.trim();
    const acao = texto ? "melhorar" : "gerar";
    // Enquanto processa, o rótulo é "Escrevendo…" e quem manda nele é `ocupar()`.
    if (!btnPrimario.dataset.rotulo) {
      btnPrimario.querySelector(".campo-ia__rotulo").textContent = ROTULO[acao];
    }
    btnPrimario.setAttribute("aria-label", ROTULO_ACESSIVEL[acao]);

    /**
     * Sem fonte, o botão fica desabilitado — mas por `aria-disabled`, não pelo
     * atributo `disabled`.
     *
     * Um botão `disabled` some do teclado e não hospeda tooltip nenhuma no celular:
     * o pai ficaria olhando um ✨ apagado sem NUNCA saber o porquê. Com
     * `aria-disabled` ele continua alcançável, o leitor de tela anuncia "indisponível",
     * e o clique mostra a dica em vez de chamar a IA. Nada de erro depois do clique —
     * é a dica, e ela também está no `title` pra quem usa mouse.
     */
    const podeUsar = temFonte(campo, texto, lerContexto());
    btnPrimario.setAttribute("aria-disabled", String(!podeUsar));
    btnPrimario.classList.toggle("is-inerte", !podeUsar);
    if (podeUsar) btnPrimario.removeAttribute("title");
    else btnPrimario.setAttribute("title", DICA_SEM_FONTE);

    // Encurtar e detalhar só existem quando há texto: sem ele, não são ação nenhuma.
    botoes.forEach((b, acaoDoBotao) => {
      if (acaoDoBotao === "melhorar") return;
      b.hidden = !texto;
    });

    desfazer.hidden = anterior == null;
  }

  function ocupar(ligado, botao) {
    barra.classList.toggle("is-ocupado", ligado);
    controle.setAttribute("aria-busy", String(ligado));
    // Desabilitar de verdade enquanto processa: clique duplo aqui é chamada de IA
    // duplicada, e a segunda resposta sobrescreveria a primeira sem ninguém pedir.
    botoes.forEach((b) => {
      b.disabled = ligado;
    });
    desfazer.disabled = ligado;
    if (botao) {
      const rotulo = botao.querySelector(".campo-ia__rotulo");
      if (rotulo && ligado) {
        botao.dataset.rotulo = rotulo.textContent;
        rotulo.textContent = "Escrevendo…";
      } else if (rotulo && botao.dataset.rotulo) {
        rotulo.textContent = botao.dataset.rotulo;
        delete botao.dataset.rotulo;
      }
    }
  }

  /* ---- A ação ------------------------------------------------------------ */

  async function executar(acaoPedida, botao) {
    if (emCurso) return;
    const texto = controle.value.trim();
    const acao = acaoPedida === "melhorar" && !texto ? "gerar" : acaoPedida;
    const ctx = lerContexto();

    if (!temFonte(campo, texto, ctx)) {
      avisar(DICA_SEM_FONTE, false);
      return;
    }

    emCurso = new AbortController();
    ocupar(true, botao);
    avisar("", false);

    try {
      const r = await pedirTexto({
        campo,
        acao,
        texto,
        contexto: ctx,
        teto,
        signal: emCurso.signal,
      });

      if (emCurso.signal.aborted) return; // o modal fechou enquanto a IA escrevia

      if (!r || r.ok === false) {
        // `sem_contexto` não é falha, é a mesma dica — dita pela função desta vez.
        const semContexto = r && r.motivo === "sem_contexto";
        avisar(semContexto ? DICA_SEM_FONTE : "Não consegui escrever isso agora.", !semContexto);
        return;
      }

      const novo = cortarSemPartirPalavra(r.texto, teto);
      if (!novo) {
        avisar("Não consegui escrever isso agora.", true);
        return;
      }

      // 🔴 O texto do pai só é substituído DEPOIS de guardado.
      anterior = controle.value;
      controle.value = novo;
      pintar();
      avisar("Texto atualizado. Dá pra desfazer aqui do lado.", false);
      devolverFoco();
    } catch (err) {
      if (emCurso && emCurso.signal.aborted) return; // o modal fechou no meio
      /**
       * O texto do pai fica INTACTO: a falha nunca custa o que ele escreveu. E a
       * mensagem entra AQUI, perto do campo — não num toast que some antes de ele
       * terminar de ler a frase que estava escrevendo.
       */
      const previsto = err instanceof ErroDeEscrita;
      if (!previsto) console.error("[Companion] Falha ao melhorar o texto:", err);
      avisar(previsto ? err.message : "Não consegui escrever isso agora.", true);
    } finally {
      ocupar(false, botao);
      emCurso = null;
    }
  }

  /**
   * Digitou: o desfazer some (o texto de antes já não é "de antes" de nada) e a
   * mensagem sai da frente. Só o que o PAI digita passa por aqui — trocar `.value`
   * por código não dispara `input`, então a nossa própria escrita não se auto-apaga.
   */
  function aoDigitar() {
    if (anterior != null || msg.textContent) {
      anterior = null;
      avisar("", false);
    }
    pintar();
  }
  controle.addEventListener("input", aoDigitar);

  pintar();

  return {
    /**
     * Redesenha o botão a partir do estado atual.
     *
     * Existe porque a fonte de contexto de um campo costuma ser OUTRO campo: o botão
     * do título do plano só acende quando o conteúdo tem texto. Quem liga os campos
     * entre si é o formulário (um `input` na `<form>` chamando isto em todos), e não
     * cada campo espionando os vizinhos.
     */
    atualizar: pintar,
    destruir() {
      controle.removeEventListener("input", aoDigitar);
      if (emCurso) emCurso.abort();
      emCurso = null;
    },
  };
}
