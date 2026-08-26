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
 * dentro do BANCO, por uma função `SECURITY DEFINER` — o site continua sem
 * escrever `responsavel_id` com as próprias mãos:
 *   mock.parearPorCodigo(codigo)  →  rpc('vincular_por_codigo', { p_codigo })
 *   → {ok, jaPareado, criancaId, nome, idade, serie} · {ok:false, motivo}
 *
 * `idade`/`serie` vêm só pra a tela de sucesso desambiguar homônimos — há dois
 * "Marcos" entre os perfis do robô, com códigos diferentes. Como as duas são
 * nullable (e vazias é o caso COMUM nos perfis reais), a tela fecha a linha com
 * o próprio código digitado, que sempre existe e sempre distingue.
 *
 * ⛔ 26/ago/2026 — POR QUE ISTO DEIXOU DE PASSAR PELO ROBÔ
 * Era `POST {servidorUrl}/api/pareamento/vincular`, e quebrou na apresentação do
 * TCC: a partir do Chrome 141/142, um site de origem pública (a Vercel) não
 * alcança mais `127.0.0.1` nem a rede local sem permissão explícita — o request
 * pendura e nunca chega. O endpoint do robô, por baixo disso, só rodava duas
 * queries no Supabase; ele era um proxy de um banco que o site já alcança. O
 * caminho novo funciona do celular do pai, em qualquer lugar, e ainda tira o
 * `responsavelId` do corpo do request (agora vem do `auth.uid()` do token).
 * O detalhe todo está em `servidor.js` e em `supabase-data.js`.
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
 * • **O painel lista as Cognis que se anunciaram, ANTES de o pai digitar.** Isso
 *   já foi uma "sonda de rede" que dava um fetch num IP fixo e chamava aquilo de
 *   procurar — ela respondia "não estou enxergando a Cogni" mesmo com o robô
 *   ligado ao lado, porque um site em HTTPS não varre rede nenhuma (sem mDNS,
 *   sem UDP, sem broadcast; e cada tentativa esbarraria no mesmo bloqueio que
 *   derrubou o pareamento). Agora quem se anuncia é o robô, publicando um
 *   heartbeat no Supabase, e a lista é leitura disso. Um indicador que mente com
 *   convicção é pior que indicador nenhum.
 *
 * • **A descoberta NUNCA pareia sozinha.** Ela lista candidatos; clicar em
 *   "Parear" só escolhe com quem o pai vai falar e leva o foco pro código. Regra
 *   do Nicolas, textual: não tirar o controle dos pais. O que autentica o
 *   vínculo continua sendo o código de 6 caracteres — a lista só encurta o
 *   caminho e prova que o robô está de pé.
 *
 * • **Slide fora de vista é slide INERTE.** Um carrossel com as três telas no
 *   DOM deixa o Tab passear pelos campos da tela seguinte, invisíveis. Aqui só a
 *   tela ativa é focável, e o foco fica preso ao overlay.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { el } from "./sections/_shared.js";
import { ICON } from "./icons.js";
import { marcarTourPendente } from "./tour.js";
// Rótulos de idade/série: os mesmos do resto do painel, pra o portão não
// inventar um segundo jeito de escrever "3º ano".
import { idadeLabel, serieLabel } from "./format.js";

/** Chave que marca que a apresentação completa já foi vista neste navegador. */
const FLAG_VISTO = "cognify-onboarding-visto";

/** Alfabeto do código (igual ao servidor): sem 0/O/1/I pra não confundir. */
const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;

/**
 * De quanto em quanto tempo a lista de robôs é relida enquanto o pai está no
 * portão. Curto o bastante pra o robô que acabou de ser ligado aparecer sem
 * ninguém apertar nada, longo o bastante pra não virar polling agressivo num
 * banco que o pai ainda nem usou.
 */
const INTERVALO_DESCOBERTA_MS = 15000;

/** Normaliza um caractere digitado: caixa alta e só aceita do alfabeto válido. */
function normalizarChar(ch) {
  const c = String(ch || "").toUpperCase();
  return ALFABETO_CODIGO.includes(c) ? c : "";
}

/**
 * Inicia o fluxo de onboarding/pareamento.
 * @param {object} cfg
 * @param {string} cfg.nomeResponsavel — primeiro nome (saudação)
 * @param {object} cfg.mock — camada de dados (parear, listar robôs). O portão
 *   nunca fala com o banco por conta própria: assim ele funciona igual no modo
 *   real e no de demonstração, sem saber qual dos dois está no ar.
 * @param {Function} cfg.onPareado — callback chamado após parear com sucesso
 */
export function iniciarOnboarding({ nomeResponsavel, mock, onPareado }) {
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
  const pareamento = telaPareamento({ mock });
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
function telaPareamento({ mock }) {
  const tela = el("article", { class: "ob-screen ob-screen--pair" });
  let concluirCb = null;
  let timerDescoberta = null;

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
      // Até 26/ago/2026 esta nota dizia que o pareamento exigia estar na mesma
      // rede do robô — e era verdade, porque o site falava com ele direto. Não é
      // mais: o vínculo acontece no banco, então dá pra conectar do celular, do
      // trabalho, de onde for. Só o CÓDIGO precisa vir do robô.
      text:
        "Você pode conectar de qualquer lugar — não precisa estar na mesma rede " +
        "do robô. O que precisa vir dele é só o código.",
    })
  );

  /* ---- Sonda: a Cogni está ao alcance? ---------------------------------- */

  const sondaTxt = el("span", { class: "ob-sonda__txt", text: "Procurando a Cogni…" });
  const sondaPonto = el("span", { class: "ob-sonda__ponto", attrs: { "aria-hidden": "true" } });
  const sondaBtn = el("button", {
    class: "ob-sonda__acao",
    attrs: { type: "button", hidden: "hidden" },
    text: "Procurar de novo",
  });
  const sonda = el("p", {
    class: "ob-sonda",
    attrs: { "data-estado": "procurando", role: "status", "aria-live": "polite" },
    children: [sondaPonto, sondaTxt, sondaBtn],
  });
  sondaBtn.addEventListener("click", () => descobrir());

  /** Onde os cartões dos robôs encontrados são pintados (vazio = nada achado). */
  const listaRobos = el("ul", {
    class: "ob-robos",
    attrs: { "aria-label": "Cognis encontradas" },
  });

  /**
   * Lê os robôs que se anunciaram e monta a lista de candidatos.
   *
   * Isto NÃO varre a rede — e é justamente por isso que funciona. Quem se
   * anuncia é o robô, publicando um heartbeat no Supabase enquanto está de pé e
   * com a janela de pareamento aberta; aqui a gente só lê essa mesa. Um site em
   * HTTPS não tem como fazer descoberta de rede (sem mDNS, sem UDP, sem
   * broadcast), e a versão anterior disto fingia que tinha: dava um fetch num IP
   * fixo e chamava de "procurar".
   *
   * Falha nunca vira erro de tela: tabela ausente, RLS ou rede caída são todos o
   * mesmo recado — "não achei nenhuma agora" —, e nenhum deles impede o pai de
   * digitar o código, que é o caminho que sempre funciona.
   */
  async function descobrir() {
    sonda.setAttribute("data-estado", "procurando");
    sondaTxt.textContent = "Procurando a Cogni…";
    sondaBtn.hidden = true;

    let robos = [];
    try {
      robos = (await mock.getRobosDisponiveis()) || [];
    } catch (e) {
      // A camada de dados já engole o previsível; se algo escapou, o portão
      // segue de pé com a lista vazia.
      console.debug("[Companion] Descoberta falhou:", e);
    }

    listaRobos.replaceChildren(...robos.map(cardRobo));

    if (robos.length) {
      sonda.setAttribute("data-estado", "ok");
      sondaTxt.textContent =
        robos.length === 1
          ? "Achei uma Cogni pronta pra conectar."
          : `Achei ${robos.length} Cognis prontas pra conectar.`;
      sondaBtn.hidden = true;
      return;
    }

    sonda.setAttribute("data-estado", "off");
    // A frase diz o que FAZER, e não só o que falhou: a janela de pareamento é
    // aberta pelo robô, então "peça o código pra ela" é literalmente a ação que
    // faz a Cogni aparecer aqui.
    sondaTxt.textContent =
      "Nenhuma Cogni se anunciou ainda. Peça o código pra ela — é isso que a faz aparecer aqui. Ou digite direto, se já tiver o código.";
    sondaBtn.hidden = false;
  }

  /**
   * Um candidato da lista.
   *
   * Mostra o apelido da máquina e há quanto tempo ela foi vista — e mais nada.
   * **Nome de criança não aparece aqui de propósito**: esta lista é legível por
   * qualquer responsável logado enquanto a janela está aberta, e dado de menor
   * não pode viajar por aí. O botão "Parear" **não pareia**: ele escolhe o robô
   * e joga o foco no código, que é quem prova que o pai está mesmo naquela casa.
   */
  function cardRobo(robo) {
    const btn = el("button", {
      class: "dash-btn dash-btn--ghost ob-robo__btn",
      attrs: { type: "button" },
      text: "Parear",
    });
    btn.addEventListener("click", () => {
      limparErro();
      feedback.textContent = `Digite o código que aparece em ${robo.apelido}.`;
      feedback.classList.add("is-ok");
      inputs[0].focus();
    });

    return el("li", {
      class: "ob-robo",
      children: [
        el("span", { class: "ob-robo__ico", svg: ICON.robot, attrs: { "aria-hidden": "true" } }),
        el("span", {
          class: "ob-robo__txt",
          children: [
            el("span", { class: "ob-robo__nome", text: robo.apelido || "Cogni" }),
            el("span", { class: "ob-robo__visto", text: vistaHa(robo.visto_em) }),
          ],
        }),
        btn,
      ],
    });
  }

  tela.append(header, form, ajuda, sonda, listaRobos);

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
      const dados = await mock.parearPorCodigo(codigo);

      if (dados && dados.ok) {
        pararDescoberta(); // pareou: a lista não tem mais o que fazer
        mostrarSucesso(dados, codigo);
        // Pequena pausa pra a comemoração aparecer antes de recarregar.
        window.setTimeout(() => {
          if (typeof concluirCb === "function") concluirCb();
        }, 1400);
        return;
      }

      // Falhas são RESULTADO, não exceção: código errado é o caso mais comum
      // desta tela, e a camada de dados já devolve o motivo no vocabulário que
      // vira frase em PT-BR num lugar só.
      mostrarErro(mock.mensagemDeErroDePareamento(dados && dados.motivo));
      enviando = false;
      setLoading(false);
      boxes.classList.add("is-error");
      inputs.forEach((i) => (i.value = ""));
      inputs[0].focus();
    } catch (err) {
      // Sobrou aqui: o Supabase caiu, o token morreu, o navegador está offline.
      // Nada disso é culpa do código digitado, e a frase evita mandar o pai
      // conferir seis caracteres que provavelmente estão certos.
      console.error("[Companion] Pareamento falhou:", err);
      mostrarErro("Não consegui conectar agora. Confira sua internet e tente de novo.");
      enviando = false;
      setLoading(false);
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
  function mostrarSucesso(dados, codigoUsado) {
    const quem = ((dados && dados.nome) || "").trim();
    // Desambiguação de HOMÔNIMOS — e eles existem de verdade: há dois "Marcos"
    // entre os perfis do robô, com códigos diferentes. Sem isto, parear o errado
    // é invisível na tela e só aparece depois, como uma trilha de aprendizado
    // que "está errada" — o que parece defeito do produto, não código trocado.
    //
    // Idade e série vêm primeiro porque são o que o pai reconhece; mas elas são
    // NULLABLE e, nos perfis reais, estar vazias é o caso COMUM (a maioria não
    // completou o onboarding do robô). Por isso o código fecha a linha: ele é a
    // única coisa que distingue os dois com certeza, e o pai acabou de digitá-lo.
    const marcas = [
      idadeLabel(dados && dados.idade),
      serieLabel(dados && dados.serie),
      codigoUsado ? `código ${codigoUsado}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const sucesso = el("div", {
      class: "ob-sucesso",
      attrs: { role: "status", "aria-live": "assertive" },
      children: [
        el("span", { class: "ob-sucesso__selo", svg: ICON.check, attrs: { "aria-hidden": "true" } }),
        el("h2", {
          class: "ob-title ob-title--sm",
          text: dados && dados.jaPareado ? "Vocês já estavam conectados!" : "Conectado!",
        }),
        el("p", {
          class: "ob-lead",
          text: quem
            ? `Este painel agora acompanha ${quem}. Abrindo…`
            : "Este painel agora acompanha o perfil do robô. Abrindo…",
        }),
        marcas ? el("p", { class: "ob-sucesso__marcas", text: marcas }) : null,
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

  /** Encerra o ciclo da descoberta (pareou, ou a tela saiu de cena). */
  function pararDescoberta() {
    if (timerDescoberta) {
      clearInterval(timerDescoberta);
      timerDescoberta = null;
    }
  }

  return {
    node: tela,
    focar: () => inputs[0] && inputs[0].focus({ preventScroll: true }),
    /**
     * Chamado quando esta tela vira a ativa. Procura na hora e continua
     * procurando: o caso real é o pai chegar aqui e SÓ ENTÃO ir ligar o robô —
     * uma busca única deixaria a tela dizendo "não achei" pelo resto da visita,
     * que é exatamente o defeito da sonda antiga.
     */
    aoEntrar: () => {
      if (timerDescoberta) return;
      descobrir();
      timerDescoberta = window.setInterval(descobrir, INTERVALO_DESCOBERTA_MS);
    },
    aoConcluir: (cb) => {
      concluirCb = cb;
    },
  };
}

/**
 * "vista agora" / "vista há 2 min" — o quanto o robô é recente.
 *
 * A policy do banco só entrega robôs vistos há menos de 2 minutos, então
 * qualquer número maior que isso é ANOMALIA, não informação: relógio do robô
 * fora de hora, fuso mal gravado, ou o modo de demonstração (cuja data é fixa).
 * Nesses casos a frase vira vaga em vez de exibir um número absurdo — a foto do
 * primeiro teste desta tela mostrava "vista há 131094 min", que não ajuda
 * ninguém a decidir se aquele robô é o da sala.
 *
 * Diferença negativa (relógio do servidor adiantado) cai no mesmo lugar de
 * "acabou de ser vista", que é a leitura correta.
 *
 * @param {string} iso
 * @returns {string}
 */
function vistaHa(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "vista agora";
  const seg = Math.round((Date.now() - t) / 1000);
  if (seg < 45) return "vista agora";
  if (seg > 300) return "vista há pouco";
  return `vista há ${Math.round(seg / 60)} min`;
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
