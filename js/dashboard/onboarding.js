/**
 * onboarding.js — Boas-vindas + pareamento por código (Companion, single-child).
 *
 * Disparado pelo main.js quando o pai loga e ainda NÃO tem criança vinculada
 * (`getCrianca()` devolve null). Assume a tela inteira (overlay full-screen) e,
 * ao parear com sucesso, chama `onPareado()` (o main recarrega o painel).
 *
 * Dois modos, decididos pela flag `localStorage[FLAG_VISTO]`:
 *   - 1ª vez (flag ausente): jornada de 3 telas — duas de apresentação com
 *     motion + a terceira de pareamento.
 *   - Já viu antes / despareou depois (flag presente): vai DIRETO pra tela de
 *     pareamento (sem repetir a apresentação). Combinado com o Nicolas.
 *
 * ⭐ A flag agora é gravada ao CHEGAR no pareamento (avançando ou pulando), e
 * não só ao parear com sucesso. Quem fecha a aba no gate porque foi buscar o
 * código no robô voltava e assistia a apresentação inteira de novo — a
 * apresentação já cumpriu o papel dela no primeiro passe.
 *
 * Pareamento: o código (6 chars, sem ambíguos) é validado e o vínculo é setado
 * SÓ pelo servidor (service_role) — o site nunca escreve `responsavel_id`:
 *   POST {servidorUrl}/api/pareamento/vincular  { codigo, responsavelId }
 *   → 200 {ok, jaPareado, criancaId, nome} · 404 inválido · 409 de outro pai
 *     · 400 faltando · 503 indisponível
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE FLUXO FAZ DE PROPÓSITO (e por quê)
 *
 * • **É um portão, e portão precisa de saída.** Sem criança vinculada o painel
 *   não monta, então a badge da conta (que tem o "Sair") nem existe. Um pai que
 *   não consegue parear ficaria preso numa tela sem nenhuma porta. Daí o rodapé
 *   com "Sair da conta" em todas as telas.
 *
 * • **A ajuda mora no passo, não num link pra fora.** "Onde encontro o código?"
 *   abre ali mesmo, com os dois caminhos reais (tela do robô e pedir falando).
 *   Mandar o pai pra outra página no meio de um formulário de 6 caixinhas é
 *   perder metade deles.
 *
 * • **O painel avisa ANTES de o pai digitar** que não está enxergando a Cogni na
 *   rede. Descobrir isso depois de digitar seis caracteres e apertar "Conectar"
 *   é a diferença entre "ah, o robô está desligado" e "este site não funciona".
 *   A sondagem nunca bloqueia o envio: ela só acrescenta um recado.
 *
 * • **Slide fora de vista é slide INERTE.** Um carrossel com as três telas no
 *   DOM deixa o Tab passear pelos campos da tela seguinte, invisíveis. Aqui só a
 *   tela ativa é focável, e o foco fica preso ao overlay.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { el } from "./sections/_shared.js";
import { ICON } from "./icons.js";
import { marcarTourPendente } from "./tour.js";

/** Chave que marca que a apresentação completa já foi vista neste navegador. */
const FLAG_VISTO = "cognify-onboarding-visto";

/** Alfabeto do código (igual ao servidor): sem 0/O/1/I pra não confundir. */
const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;

/** Teto da sondagem do servidor local. Curto: é um indicador, não uma etapa. */
const TIMEOUT_SONDA_MS = 3500;

/** Normaliza um caractere digitado: caixa alta e só aceita do alfabeto válido. */
function normalizarChar(ch) {
  const c = String(ch || "").toUpperCase();
  return ALFABETO_CODIGO.includes(c) ? c : "";
}

/**
 * Inicia o fluxo de onboarding/pareamento.
 * @param {object} cfg
 * @param {object} cfg.user — usuário logado (responsável)
 * @param {string} cfg.nomeResponsavel — primeiro nome (saudação)
 * @param {string} cfg.servidorUrl — base do servidor local da Cogni
 * @param {Function} cfg.onPareado — callback chamado após parear com sucesso
 */
export function iniciarOnboarding({ user, nomeResponsavel, servidorUrl, onPareado }) {
  const jaViu = lerFlagVisto();

  // Overlay raiz que cobre o painel inteiro.
  const overlay = el("div", {
    class: "ob-overlay",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Boas-vindas ao Cogni Companion" },
  });

  // Trilho de slides (uma faixa horizontal; navegação por translateX).
  const track = el("div", { class: "ob-track" });
  const viewport = el("div", { class: "ob-viewport", children: [track] });

  // As telas de apresentação só entram na 1ª vez.
  const telas = [];
  if (!jaViu) {
    telas.push(telaBoasVindas(nomeResponsavel));
    telas.push(telaComoFunciona());
  }
  const pareamento = telaPareamento({ user, servidorUrl });
  telas.push(pareamento.node);

  telas.forEach((t) => track.appendChild(t));

  const total = telas.length;
  const temApresentacao = total > 1;

  /* ---- Cromo: progresso, bolinhas, pular, rodapé ------------------------ */

  // Rótulo "Passo 2 de 3". Saber quantas telas faltam é o que separa "deixa eu
  // ver o que é isso" de "quanto tempo isso vai tomar?".
  const progressoLabel = el("span", { class: "ob-progresso__txt" });
  const progressoBarra = el("span", { class: "ob-progresso__barra" });
  const progresso = temApresentacao
    ? el("div", {
        class: "ob-progresso",
        children: [
          el("div", { class: "ob-progresso__trilho", children: [progressoBarra] }),
          progressoLabel,
        ],
      })
    : null;

  const dots = telas.map((_, i) =>
    el("span", { class: "ob-dot" + (i === 0 ? " is-active" : "") })
  );
  const dotsWrap = temApresentacao
    ? el("div", { class: "ob-dots", attrs: { "aria-hidden": "true" }, children: dots })
    : null;

  // Anúncio de troca de tela pro leitor de tela (o overlay não é recriado).
  const anuncio = el("p", {
    class: "sr-only",
    attrs: { role: "status", "aria-live": "polite" },
  });

  /* ---- Navegação -------------------------------------------------------- */

  let idx = 0;

  /** Aplica `inert` (com plano B manual) numa tela fora de vista. */
  function definirInerte(node, inerte) {
    if ("inert" in HTMLElement.prototype) {
      node.inert = inerte;
      return;
    }
    // Plano B pra navegador sem `inert`: tira do Tab e da árvore acessível.
    node.setAttribute("aria-hidden", inerte ? "true" : "false");
    node.querySelectorAll("a, button, input, select, textarea, [tabindex]").forEach((f) => {
      if (inerte) {
        if (!f.hasAttribute("data-ob-tabindex")) {
          f.setAttribute("data-ob-tabindex", f.getAttribute("tabindex") || "");
        }
        f.setAttribute("tabindex", "-1");
      } else {
        const antigo = f.getAttribute("data-ob-tabindex");
        if (antigo) f.setAttribute("tabindex", antigo);
        else f.removeAttribute("tabindex");
        f.removeAttribute("data-ob-tabindex");
      }
    });
  }

  function ir(novo) {
    idx = Math.max(0, Math.min(total - 1, novo));
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));

    telas.forEach((t, i) => definirInerte(t, i !== idx));

    if (progresso) {
      progressoLabel.textContent = `Passo ${idx + 1} de ${total}`;
      progressoBarra.style.transform = `scaleX(${(idx + 1) / total})`;
    }
    if (skip) skip.hidden = idx === total - 1;

    // Foca a tela ativa (acessibilidade) sem rolar a página. O atraso acompanha
    // a transição do trilho: focar no meio dela faz o navegador "puxar" o slide.
    const ativa = telas[idx];
    window.setTimeout(() => {
      if (ativa !== telas[idx]) return;
      if (ativa === pareamento.node) {
        pareamento.focar();
        return;
      }
      const alvo = ativa.querySelector("button:not([disabled]), input, [tabindex]");
      if (alvo) alvo.focus({ preventScroll: true });
    }, 380);

    // Chegou no pareamento: a apresentação cumpriu o papel dela.
    if (telas[idx] === pareamento.node) {
      gravarFlagVisto();
      pareamento.aoEntrar();
    }

    const titulo = ativa.querySelector(".ob-title");
    anuncio.textContent =
      (total > 1 ? `Passo ${idx + 1} de ${total}. ` : "") +
      (titulo ? titulo.textContent : "");
  }

  // Liga os botões "avançar"/"voltar" das telas de apresentação.
  track.querySelectorAll("[data-ob-next]").forEach((btn) => {
    btn.addEventListener("click", () => ir(idx + 1));
  });
  track.querySelectorAll("[data-ob-back]").forEach((btn) => {
    btn.addEventListener("click", () => ir(idx - 1));
  });

  // Botão "pular apresentação" (vai direto ao pareamento) — só na 1ª vez.
  let skip = null;
  if (temApresentacao) {
    skip = el("button", {
      class: "ob-skip",
      attrs: { type: "button" },
      text: "Pular apresentação",
    });
    skip.addEventListener("click", () => ir(total - 1));
  }

  /* ---- Rodapé: a saída do portão ---------------------------------------- */

  const sair = el("button", {
    class: "ob-sair",
    attrs: { type: "button" },
    children: [
      el("span", { class: "ob-sair__ico", svg: ICON_SAIR }),
      el("span", { text: "Sair da conta" }),
    ],
  });
  sair.addEventListener("click", async () => {
    sair.disabled = true;
    try {
      if (window.cognifyAuth) await window.cognifyAuth.signOut();
    } catch (e) {
      console.error("[Companion] Falha ao sair da conta:", e);
    }
    window.location.replace("login.html");
  });

  const rodape = el("div", {
    class: "ob-rodape",
    children: [
      el("p", {
        class: "ob-rodape__txt",
        text: "O painel só abre depois de ligado a um perfil do robô.",
      }),
      sair,
    ],
  });

  /* ---- Conclusão -------------------------------------------------------- */

  pareamento.aoConcluir(() => {
    gravarFlagVisto();
    // O pareamento termina em reload; o tutorial guiado não sobreviveria a ele.
    // A marca faz o boot seguinte abrir o tour já com a criança na tela.
    marcarTourPendente();
    if (typeof onPareado === "function") onPareado();
  });

  /* ---- Montagem --------------------------------------------------------- */

  const inner = el("div", { class: "ob-inner" });
  const topo = el("div", { class: "ob-topo" });
  if (progresso) topo.appendChild(progresso);
  if (skip) topo.appendChild(skip);
  if (progresso || skip) inner.appendChild(topo);
  inner.appendChild(viewport);
  if (dotsWrap) inner.appendChild(dotsWrap);
  inner.appendChild(rodape);
  inner.appendChild(anuncio);
  overlay.appendChild(inner);

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  /* ---- Teclado ---------------------------------------------------------- */

  overlay.addEventListener("keydown", (e) => {
    // Esc não fecha: é um portão, não um diálogo opcional.
    if (e.key === "Escape") {
      e.preventDefault();
      return;
    }
    // Setas só navegam a apresentação; dentro do código elas andam entre as
    // caixinhas (o handler de lá para a propagação).
    if (e.key === "ArrowRight" && idx < total - 1) ir(idx + 1);
    else if (e.key === "ArrowLeft" && idx > 0) ir(idx - 1);
  });

  // Foco preso no overlay: atrás dele o painel não montou, e sair com Tab
  // levaria a lugar nenhum (ou pro histórico do navegador).
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focaveis = Array.from(
      overlay.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((n) => n.offsetParent !== null && !n.closest("[inert]"));
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  });

  // Anima a entrada do overlay (2 frames pra a transição pegar).
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => overlay.classList.add("is-open"))
  );

  // Posiciona na primeira tela e foca.
  ir(0);
}

/* ==========================================================================
   Telas de apresentação
   ========================================================================== */

/** Tela 1 — boas-vindas com o robô e a saudação ao responsável. */
function telaBoasVindas(nome) {
  const saud = nome ? `Olá, ${nome}!` : "Olá!";
  const tela = el("article", { class: "ob-screen ob-screen--hero" });

  const robo = el("div", {
    class: "ob-hero__art",
    children: [
      el("span", { class: "ob-hero__glow", attrs: { "aria-hidden": "true" } }),
      el("img", {
        class: "ob-hero__robot ob-float",
        attrs: {
          src: "assets/images/cogni-fullbody.png",
          alt: "",
          "aria-hidden": "true",
        },
      }),
    ],
  });

  const texto = el("div", {
    class: "ob-screen__body",
    children: [
      el("span", { class: "ob-eyebrow", text: saud }),
      el("h1", {
        class: "ob-title",
        // "Bem-vindo(a)" com o "(a)" pendurado é a saudação que avisa que o site não
        // sabe com quem está falando. "Boas-vindas" resolve sem parêntese — e é o que
        // o `aria-label` desta mesma tela já dizia.
        text: "Boas-vindas ao Cogni Companion",
      }),
      el("p", {
        class: "ob-lead",
        text:
          // Sem "jornada" (não diz nada) e sem "seu filho" (o painel serve pras duas
          // metades das famílias): a frase agora lista o que existe de verdade aqui.
          "Aqui você acompanha de pertinho o que a Cogni ensinou hoje: as conversas, o que ficou fácil, o que travou e os planos que ela vai seguir.",
      }),
      el("button", {
        class: "dash-btn dash-btn--primary ob-cta",
        attrs: { type: "button", "data-ob-next": "" },
        children: [
          el("span", { text: "Vamos começar" }),
          el("span", { class: "ob-cta__ico", svg: CHEVRON }),
        ],
      }),
      // Expectativa de tempo logo abaixo do botão: é o que responde "isso vai
      // me tomar a tarde?" antes de a pessoa decidir clicar.
      el("p", { class: "ob-nota", text: "Leva menos de um minuto." }),
    ],
  });

  tela.append(robo, texto);
  return tela;
}

/** Tela 2 — o que dá pra fazer (4 recursos com entrada escalonada). */
function telaComoFunciona() {
  const tela = el("article", { class: "ob-screen ob-screen--features" });

  const itens = [
    {
      ico: ICON.chat,
      titulo: "Acompanhe as conversas",
      desc: "Cada pergunta e cada resposta, dia a dia.",
    },
    {
      ico: ICON.chart,
      titulo: "Veja o aprendizado",
      desc: "Tempo por matéria, tópicos explorados e a evolução da semana.",
    },
    {
      ico: ICON.calendar,
      titulo: "Crie planos de estudo",
      desc: "Oriente os estudos com planos que a Cogni segue nas conversas.",
    },
    {
      ico: ICON.robot,
      titulo: "Conecte ao robô",
      desc: "Um código de 6 caracteres liga este painel ao perfil que está no robô.",
    },
  ];

  const lista = el("div", {
    class: "ob-features",
    children: itens.map((it, i) =>
      el("div", {
        class: "ob-feature",
        attrs: { style: `--i:${i}` },
        children: [
          el("span", { class: "ob-feature__ico", svg: it.ico }),
          el("div", {
            class: "ob-feature__txt",
            children: [
              el("h3", { class: "ob-feature__title", text: it.titulo }),
              el("p", { class: "ob-feature__desc", text: it.desc }),
            ],
          }),
        ],
      })
    ),
  });

  const body = el("div", {
    class: "ob-screen__body",
    children: [
      el("h2", { class: "ob-title ob-title--sm", text: "O que você pode fazer aqui" }),
      lista,
      el("div", {
        class: "ob-nav",
        children: [
          el("button", {
            class: "dash-btn dash-btn--ghost",
            attrs: { type: "button", "data-ob-back": "" },
            text: "Voltar",
          }),
          el("button", {
            class: "dash-btn dash-btn--primary ob-cta",
            attrs: { type: "button", "data-ob-next": "" },
            children: [
              el("span", { text: "Conectar agora" }),
              el("span", { class: "ob-cta__ico", svg: CHEVRON }),
            ],
          }),
        ],
      }),
    ],
  });

  tela.appendChild(body);
  return tela;
}

/* ==========================================================================
   Tela de pareamento (a última — ou a única, se já viu a apresentação)
   ========================================================================== */

/**
 * Monta a tela de pareamento por código.
 * @returns {{ node:HTMLElement, focar:Function, aoEntrar:Function, aoConcluir:Function }}
 */
function telaPareamento({ user, servidorUrl }) {
  const tela = el("article", { class: "ob-screen ob-screen--pair" });
  let concluirCb = null;
  let sondou = false;

  // Cabeçalho com robô compacto.
  const header = el("div", {
    class: "ob-pair__head",
    children: [
      el("img", {
        class: "ob-pair__robot ob-float",
        attrs: {
          src: "assets/images/cogni-head-light.png",
          alt: "",
          "aria-hidden": "true",
        },
      }),
      el("h2", { class: "ob-title ob-title--sm", text: "Ligue este painel ao robô" }),
      el("p", {
        class: "ob-lead",
        text: "Digite o código de 6 caracteres que aparece no painel da Cogni.",
      }),
    ],
  });

  // Campos do código (6 caixinhas estilo OTP).
  const inputs = [];
  const boxes = el("div", {
    class: "ob-code",
    attrs: { role: "group", "aria-label": "Código de pareamento de 6 caracteres" },
  });
  for (let i = 0; i < TAMANHO_CODIGO; i++) {
    const inp = el("input", {
      class: "ob-code__box",
      attrs: {
        type: "text",
        inputmode: "text",
        autocapitalize: "characters",
        autocomplete: "off",
        spellcheck: "false",
        maxlength: "1",
        "aria-label": `Caractere ${i + 1} de ${TAMANHO_CODIGO}`,
      },
    });
    inputs.push(inp);
    boxes.appendChild(inp);
  }

  // Mensagem de erro/status (aria-live pra leitor de tela anunciar).
  const feedback = el("p", {
    class: "ob-feedback",
    attrs: { role: "status", "aria-live": "polite" },
  });

  const submitBtn = el("button", {
    class: "dash-btn dash-btn--primary ob-cta ob-pair__submit",
    attrs: { type: "submit" },
    children: [el("span", { text: "Conectar" })],
  });

  const form = el("form", {
    class: "ob-pair__form",
    attrs: { novalidate: "true" },
    children: [boxes, feedback, submitBtn],
  });

  /* ---- Ajuda embutida: "onde encontro o código?" ------------------------ */

  const ajuda = el("details", { class: "ob-ajuda" });
  ajuda.appendChild(
    el("summary", {
      class: "ob-ajuda__resumo",
      children: [
        el("span", { class: "ob-ajuda__ico", svg: ICON.bulb }),
        el("span", { text: "Onde encontro o código?" }),
      ],
    })
  );
  const PASSOS_AJUDA = [
    "Ligue o robô e espere o rosto da Cogni aparecer.",
    "No computador em que a Cogni está rodando, abra o painel dela: o código de 6 caracteres fica na tela de perfis.",
    "Sem o computador à mão? Peça pra ela: “Cogni, qual é o código de pareamento?”.",
  ];
  ajuda.appendChild(
    el("ol", {
      class: "ob-ajuda__lista",
      children: PASSOS_AJUDA.map((t) => el("li", { text: t })),
    })
  );
  ajuda.appendChild(
    el("p", {
      class: "ob-ajuda__nota",
      text:
        "Este passo (e só ele) precisa que o painel alcance a Cogni pela rede. " +
        "Use o mesmo computador ou a mesma casa do robô; depois de conectado, o " +
        "painel funciona de qualquer lugar.",
    })
  );

  /* ---- Sonda: a Cogni está ao alcance? ---------------------------------- */

  const sondaTxt = el("span", { class: "ob-sonda__txt", text: "Procurando a Cogni na rede…" });
  const sondaPonto = el("span", { class: "ob-sonda__ponto", attrs: { "aria-hidden": "true" } });
  const sondaBtn = el("button", {
    class: "ob-sonda__acao",
    attrs: { type: "button", hidden: "hidden" },
    text: "Verificar de novo",
  });
  const sonda = el("p", {
    class: "ob-sonda",
    attrs: { "data-estado": "procurando", role: "status", "aria-live": "polite" },
    children: [sondaPonto, sondaTxt, sondaBtn],
  });
  sondaBtn.addEventListener("click", () => sondar());

  /**
   * Descobre se o servidor da Cogni responde, ANTES de o pai digitar.
   *
   * `mode: "no-cors"` de propósito: não queremos ler a resposta, só saber se
   * houve uma. Assim a sonda não depende de o servidor liberar CORS numa rota
   * de saúde que talvez nem exista. Resposta opaca = servidor vivo; rejeição =
   * fora do ar, outra rede, ou bloqueado pelo navegador.
   *
   * O resultado NUNCA bloqueia o formulário: navegadores tratam requisição a
   * rede privada de formas diferentes, e um falso negativo não pode impedir um
   * pareamento que funcionaria.
   */
  async function sondar() {
    sonda.setAttribute("data-estado", "procurando");
    sondaTxt.textContent = "Procurando a Cogni na rede…";
    sondaBtn.hidden = true;
    try {
      await fetch(servidorUrl + "/", {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_SONDA_MS),
      });
      sonda.setAttribute("data-estado", "ok");
      sondaTxt.textContent = "Cogni encontrada. Pode digitar o código.";
      sondaBtn.hidden = true;
    } catch (e) {
      sonda.setAttribute("data-estado", "off");
      sondaTxt.textContent =
        "Não estou enxergando a Cogni. Confira se o robô está ligado e na mesma rede.";
      sondaBtn.hidden = false;
    }
  }

  tela.append(header, form, ajuda, sonda);

  /* ---- Comportamento dos inputs do código (digitar, colar, navegar) ---- */
  function valorCodigo() {
    return inputs.map((i) => i.value).join("");
  }
  function limparErro() {
    feedback.textContent = "";
    feedback.classList.remove("is-error", "is-ok");
    boxes.classList.remove("is-error");
  }

  inputs.forEach((inp, i) => {
    inp.addEventListener("input", () => {
      const c = normalizarChar(inp.value);
      inp.value = c;
      limparErro();
      if (c && i < TAMANHO_CODIGO - 1) inputs[i + 1].focus();
      // Seis preenchidos: envia sozinho. Um código completo na tela e um botão
      // "Conectar" ainda por apertar é um passo a mais sem nenhuma decisão nele.
      if (c && i === TAMANHO_CODIGO - 1 && valorCodigo().length === TAMANHO_CODIGO) {
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
      }
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !inp.value && i > 0) {
        inputs[i - 1].focus();
        inputs[i - 1].value = "";
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && i > 0) {
        inputs[i - 1].focus();
        e.preventDefault();
        // Dentro do código, seta é navegação entre caixinhas — não pode virar
        // "voltar um slide" lá no overlay.
        e.stopPropagation();
      } else if (e.key === "ArrowRight" && i < TAMANHO_CODIGO - 1) {
        inputs[i + 1].focus();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopPropagation();
      }
    });
    // Colar o código inteiro em qualquer caixa distribui pelos campos.
    inp.addEventListener("paste", (e) => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData("text");
      const chars = String(txt || "")
        .toUpperCase()
        .replace(/[\s-]/g, "")
        .split("")
        .filter((ch) => ALFABETO_CODIGO.includes(ch))
        .slice(0, TAMANHO_CODIGO);
      chars.forEach((ch, k) => {
        if (inputs[k]) inputs[k].value = ch;
      });
      limparErro();
      const next = Math.min(chars.length, TAMANHO_CODIGO - 1);
      inputs[next].focus();
      if (valorCodigo().length === TAMANHO_CODIGO) {
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
      }
    });
  });

  /* ---- Submit: chama o servidor ---------------------------------------- */

  let enviando = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return;
    const codigo = valorCodigo();
    if (codigo.length !== TAMANHO_CODIGO) {
      mostrarErro("Digite os 6 caracteres do código.");
      const vazio = inputs.find((i) => !i.value) || inputs[0];
      vazio.focus();
      return;
    }

    enviando = true;
    setLoading(true);
    try {
      const resp = await fetch(`${servidorUrl}/api/pareamento/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, responsavelId: user.id }),
      });

      let dados = {};
      try {
        dados = await resp.json();
      } catch (_) {
        /* resposta sem corpo JSON */
      }

      if (resp.ok && dados.ok) {
        mostrarSucesso(dados.nome, dados.jaPareado);
        // Pequena pausa pra a comemoração aparecer antes de recarregar.
        window.setTimeout(() => {
          if (typeof concluirCb === "function") concluirCb();
        }, 1400);
        return;
      }

      // Erros mapeados pelo servidor (mensagem já vem amigável em PT-BR).
      mostrarErro(dados.erro || erroPorStatus(resp.status));
      enviando = false;
      setLoading(false);
      boxes.classList.add("is-error");
      inputs.forEach((i) => (i.value = ""));
      inputs[0].focus();
    } catch (err) {
      // Falha de rede / servidor fora do ar / CORS.
      console.error("[Companion] Pareamento falhou:", err);
      mostrarErro(
        "Não consegui falar com a Cogni. Confirme que o robô está ligado e tente de novo."
      );
      enviando = false;
      setLoading(false);
      // O erro é de alcance, não de código: reabre a ajuda e refaz a sonda, que
      // é onde está a explicação do que fazer.
      ajuda.open = true;
      sondar();
    }
  });

  function mostrarErro(msg) {
    feedback.textContent = msg;
    feedback.classList.add("is-error");
    feedback.classList.remove("is-ok");
  }

  /**
   * Estado de sucesso: troca a tela inteira por uma comemoração curta.
   *
   * Um `<p>` verde embaixo do formulário não marca a virada. Aqui o pai acabou
   * de cruzar o único portão do produto, e a tela seguinte demora ~1,4s pra
   * chegar (recarregamos o painel) — este é o lugar certo de dizer que deu
   * certo, com o nome de quem ele acabou de conectar.
   */
  function mostrarSucesso(nomeCrianca, jaPareado) {
    const quem = (nomeCrianca || "").trim();
    const sucesso = el("div", {
      class: "ob-sucesso",
      attrs: { role: "status", "aria-live": "assertive" },
      children: [
        el("span", { class: "ob-sucesso__selo", svg: ICON.check, attrs: { "aria-hidden": "true" } }),
        el("h2", {
          class: "ob-title ob-title--sm",
          text: jaPareado ? "Vocês já estavam conectados!" : "Conectado!",
        }),
        el("p", {
          class: "ob-lead",
          text: quem
            ? `Este painel agora acompanha ${quem}. Abrindo…`
            : "Este painel agora acompanha o perfil do robô. Abrindo…",
        }),
      ],
    });
    tela.replaceChildren(sucesso);
    tela.classList.add("is-sucesso");
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.setAttribute("aria-busy", String(on));
    inputs.forEach((i) => (i.disabled = on));
  }

  return {
    node: tela,
    focar: () => inputs[0] && inputs[0].focus({ preventScroll: true }),
    /** Chamado quando esta tela vira a ativa (só sonda uma vez por visita). */
    aoEntrar: () => {
      if (sondou) return;
      sondou = true;
      sondar();
    },
    aoConcluir: (cb) => {
      concluirCb = cb;
    },
  };
}

/* ==========================================================================
   Helpers
   ========================================================================== */

/** Chevron de avanço (fallback se o ICON.arrowRight não existir). */
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** Porta com seta pra fora — o "sair" do rodapé do portão. */
const ICON_SAIR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2"/><path d="M10 12h10M17 8.5l3.5 3.5L17 15.5"/></svg>';

/** Mensagem genérica por status HTTP, caso o servidor não mande o corpo. */
function erroPorStatus(status) {
  if (status === 404) return "Código inválido. Confira os 6 caracteres.";
  if (status === 409) return "Essa criança já está vinculada a outro responsável.";
  if (status === 400) return "Confira o código e tente de novo.";
  if (status === 503) return "Pareamento indisponível no momento. Tente mais tarde.";
  return "Não foi possível parear agora. Tente de novo.";
}

function lerFlagVisto() {
  try {
    return localStorage.getItem(FLAG_VISTO) === "1";
  } catch (e) {
    return false;
  }
}
function gravarFlagVisto() {
  try {
    localStorage.setItem(FLAG_VISTO, "1");
  } catch (e) {
    /* localStorage indisponível: o onboarding aparece de novo, sem quebrar */
  }
}
