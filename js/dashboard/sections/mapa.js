/**
 * mapa.js — Seção "Mapa da aula" (Mapa de Compreensão da Aula).
 *
 * A pergunta que esta tela responde não é "a criança estudou?", nem "por quanto
 * tempo?" — isso o Diário e o Aprendizado já contam. Aqui a pergunta é:
 *
 *     "em que minuto ela parou de entender, e sobre o quê?"
 *
 * O servidor cruza, durante a conversa, o assunto de cada turno com os sinais que
 * a câmera leu e os vereditos dos exercícios; o site só desenha o resultado. Nada
 * é correlacionado aqui — cada momento já chega com o tópico que estava valendo
 * naquele segundo.
 *
 * O que a tela mostra, em ordem de importância pro pai:
 *   1. O resumo em texto (IA), que é o que ele lê primeiro;
 *   2. O assunto que mais pediu ajuda + o minuto em que isso começou (destaque);
 *   3. A linha do tempo da aula;
 *   4. A mesma linha em lista de texto (não dá pra depender de cor e posição);
 *   5. O histórico das aulas anteriores.
 *
 * ⚠️ Regras de tom, inegociáveis (as mesmas da Trilha de aprendizado):
 *   - `sinal`/`resultado` (`travada`, `travou`) são internos e NUNCA aparecem: o
 *     que vai pra tela é o `rotulo`, já pronto e saneado em `mapa-api.js`.
 *   - Isto NÃO é placar. Sem % de acerto, sem nota, sem comparação. Os
 *     `contadores` que o servidor manda existem, e de propósito não viram números
 *     na tela: "4 acertos × 2 tropeços" é boletim com outro nome. O que interessa
 *     é ONDE ajudar, e isso a linha do tempo já diz.
 *   - Aula sem nenhum momento marcado é uma aula boa — "correu tranquila" —, não
 *     uma tela vazia com cara de erro.
 *   - O texto sugere o que fazer junto; nunca aponta defeito.
 *
 * 🩺 O que a reforma de ago/2026 mudou AQUI. O motor do robô parou de afirmar o
 * que os dados não sustentavam, e a consequência pra esta tela é uma só: ela
 * conclui MENOS, e cada estado precisa parecer intencional em vez de incompleto.
 *
 *   1. **"Aula tranquila" deixou de ser exceção.** O `pontoDeAtrito` agora vem
 *      `null` com muito mais frequência (as aulas que antes ganhavam um ponto
 *      apoiado só numa careta não ganham mais nenhum). É o caso COMUM, e ele tem
 *      três variantes de texto conforme o que a linha do tempo mostra logo
 *      abaixo — inclusive uma pra quando há marcadores de apoio na faixa, onde
 *      dizer "nenhum momento de atrito" seria a tela se contradizendo em dois
 *      centímetros.
 *   2. **Sem derivado, sem cabeçalho.** O histórico lido direto da tabela não
 *      traz `pontoDeAtrito` nem `assuntoMaisDificil`, e desde ago/2026 o site não
 *      os recalcula. Nesses cartões a tela mostra a linha do tempo e CALA.
 *   3. **A vitória virou peça de UI.** `superado` (ela emperrou e destravou
 *      sozinha, na mesma aula) é a melhor notícia que esta tela tem pra dar, e
 *      ganhou tratamento próprio pra não ficar igual a um atrito pendente.
 */

import { el, sectionRoot, pageHead } from "./_shared.js";
import { ICON, materiaIcon } from "../icons.js";
import {
  buildTimeline,
  reposicionarMarcadores,
  descreverMomento,
  ondeDoMomento,
} from "../mapa-timeline.js";
import { carregarMapa, carregarResumoDaAula } from "../mapa-api.js";
import {
  formatDuracao,
  formatTempoNaAula,
  formatHora,
  formatDiaRelativo,
  materiaLabel,
  primeiroNome,
  capitalizar,
} from "../format.js";

/**
 * Ritmo do modo ao vivo. Com aula acontecendo, 10s é o que faz a linha "se
 * desenhar" na tela sem parecer travada. Sem aula, seguimos olhando de longe (o
 * pai pode ter aberto o painel um minuto antes de a criança sentar com o robô) —
 * e com o servidor fora do ar espaçamos mais, porque aí não há o que esperar.
 */
const POLL_AO_VIVO_MS = 10000;
const POLL_ESPERA_MS = 30000;
const POLL_SEM_SERVIDOR_MS = 60000;

/* --------------------------------------------------------------------------
   Peças de UI
   -------------------------------------------------------------------------- */

/**
 * Selo "acontecendo agora" (pulsa). Só existe quando há aula em andamento.
 * @param {boolean} [compacto] — versão curta pro cartão do histórico, onde o selo
 *   inteiro repetiria pela terceira vez a mesma informação e roubaria a linha.
 */
function seloAoVivo(compacto = false) {
  return el("span", {
    class: "mp-live" + (compacto ? " mp-live--mini" : ""),
    children: [
      el("span", { class: "mp-live__pulse", attrs: { "aria-hidden": "true" } }),
      el("span", { text: compacto ? "Ao vivo" : "Acontecendo agora" }),
    ],
  });
}

/** Título da sessão: "Hoje, 16:00" / "Ontem, 20:30" / "24 de maio, 16:20". */
function tituloDaSessao(sessao, now) {
  if (!sessao || !sessao.inicioEm) return "Aula sem data";
  const dia = formatDiaRelativo(sessao.inicioEm, now);
  return `${dia}, ${formatHora(sessao.inicioEm)}`;
}

/**
 * O tempo que vai no cabeçalho da aula, e são três números diferentes conforme o
 * que a tela pode afirmar:
 *
 *   1. **Ao vivo → o vão, com segundos** (`6min05`). Tem que ser o MESMO número
 *      que a régua da linha do tempo mostra na ponta: ver "6 min" em cima de
 *      "5min40" embaixo faria a tela parecer imprecisa justo enquanto ela está
 *      sendo observada de perto.
 *   2. **`tempoEfetivoMs` (ago/2026) → o vão SEM os silêncios longos**, e ele vem
 *      nomeado ("6 min de estudo"). O nome não é enfeite: este número é MENOR que
 *      o fim da régua, e sem a palavra "estudo" o cabeçalho pareceria contradizer
 *      a linha do tempo logo abaixo. Ele existe porque o painel chegou a anunciar
 *      "aula de 47 minutos" para uma aula de 6, só porque a webcam ficou ligada.
 *   3. **Sessão antiga → o vão arredondado**, como sempre foi. `tempoEfetivoMs`
 *      é `null` em tudo que foi gravado antes da reforma.
 */
function tempoDaSessao(sessao) {
  if (sessao.emAndamento) return formatTempoNaAula(sessao.duracaoMs);
  if (sessao.tempoEfetivoMs != null) {
    return `${formatDuracao(sessao.tempoEfetivoMs)} de estudo`;
  }
  return formatDuracao(sessao.duracaoMs);
}

/**
 * Linha de contexto: duração + trocas de conversa. Nada de contagem de acertos.
 */
function metaDaSessao(sessao) {
  const partes = [tempoDaSessao(sessao)];
  if (sessao.turnos > 0) {
    partes.push(
      `${sessao.turnos} ${sessao.turnos === 1 ? "troca de conversa" : "trocas de conversa"}`
    );
  }
  return partes.join(" · ");
}

/**
 * Matéria de cada tópico, pra colorir os chips. Sai dos próprios momentos (que já
 * vêm cruzados pelo servidor) — o site não adivinha a que matéria um assunto
 * pertence.
 * @returns {Map<string,string>} topico -> materia
 */
function materiaPorTopico(sessao) {
  const mapa = new Map();
  for (const m of sessao.momentos) {
    if (m.topico && m.materia && !mapa.has(m.topico)) mapa.set(m.topico, m.materia);
  }
  return mapa;
}

/** Chips dos assuntos da aula (tópicos; matérias quando não houve tópico fino). */
function chipsDeAssunto(sessao) {
  const porTopico = materiaPorTopico(sessao);
  const itens = sessao.topicos.length
    ? sessao.topicos.map((t) => ({ nome: t, materia: porTopico.get(t) || null }))
    : sessao.materias.map((m) => ({ nome: materiaLabel(m), materia: m }));

  if (!itens.length) return null;

  return el("div", {
    class: "mp-assuntos",
    children: itens.map((item) =>
      el("span", {
        class: "mp-assunto",
        attrs: { "data-materia": item.materia || "outros" },
        children: [
          el("span", {
            class: "mp-assunto__ico",
            svg: materiaIcon(item.materia),
            attrs: { "aria-hidden": "true" },
          }),
          el("span", { text: capitalizar(item.nome) }),
        ],
      })
    ),
  });
}

/**
 * O destaque da tela — e ele responde DUAS perguntas que não são a mesma:
 *
 *   `assuntoMaisDificil` → O QUE REVER. Soma todo o atrito da aula por tópico
 *      (com peso por confiança da fonte, conta feita no servidor). É o que merece
 *      os cinco minutos do pai amanhã.
 *   `pontoDeAtrito` → QUANDO FOI. Ancora a linha do tempo, mas é o PRIMEIRO sinal
 *      da sessão, e o primeiro nem sempre é o que mais importou: uma travada
 *      isolada às 2min em frações pesa menos que quatro tropeços em mmc.
 *
 * Quando os dois apontam pro mesmo assunto (o caso comum), a segunda linha vira
 * só a hora — repetir o tópico dois parágrafos seguidos soaria a formulário.
 * Quando apontam pra assuntos diferentes, cada linha diz de qual está falando: um
 * bloco com dois referentes e um "esse ponto" solto confunde mais do que informa.
 *
 * ⚠️ Esta função só é chamada com os derivados EM MÃO — quem decide isso é
 * `cabecalhoDaAula`. Ela nunca vê uma sessão lida direto da tabela, e é por isso
 * que pode afirmar: tudo que ela escreve saiu de um cálculo do servidor.
 *
 * As frases são construídas SEM pronome e SEM o nome da criança de propósito — o
 * perfil não guarda gênero, e colar um nome numa frase que flexiona produziria
 * concordância errada na cara do pai. (Desde ago/2026 os próprios rótulos que
 * vinham no feminino já chegam neutros aqui: quem os troca é o
 * `ROTULOS_ACENTUADOS` do `mapa-api.js`, e o porquê está escrito lá.)
 */
function destaqueDoAtrito(sessao) {
  const momento = sessao.pontoDeAtrito;
  const assunto = sessao.assuntoMaisDificil;
  if (!momento && !assunto) return faixaTranquila(sessao);

  const ondeMomento = ondeDoMomento(momento);
  // O assunto a rever manda; sem ele, quem nomeia o alvo é o ponto de atrito.
  const alvo = (assunto && assunto.topico) || ondeMomento;
  const ponderar = leituraPonderada(sessao);

  const linhas = [];

  if (assunto) {
    // "Parece que" não é modéstia: numa aula sustentada só pela câmera, ou num
    // assunto que só a câmera apontou, afirmar seria o defeito que a reforma
    // acabou de tirar do servidor. A frase pondera exatamente onde o dado pondera.
    linhas.push(
      el("p", {
        class: "mp-atrito__frase",
        children: ponderar
          ? [
              el("span", { text: "Parece que o que mais pediu ajuda foi " }),
              el("strong", { class: "mp-atrito__topico", text: assunto.topico }),
              el("span", { text: "." }),
            ]
          : [
              el("span", { text: "O que mais pediu ajuda nesta aula: " }),
              el("strong", { class: "mp-atrito__topico", text: assunto.topico }),
              el("span", { text: "." }),
            ],
      })
    );
  }

  // Os dois derivados podem apontar pra assuntos DIFERENTES, e quando apontam o
  // bloco tem dois referentes na mesma caixa. Daí a ordem das linhas abaixo ser
  // por referente e não por importância: primeiro tudo que fala do MOMENTO
  // (quando foi, e se destravou), depois tudo que fala do ASSUNTO (se voltou).
  // Misturado, "esse ponto" mudaria de dono no meio do parágrafo.
  const mesmoAssunto = !!(
    assunto &&
    ondeMomento &&
    ondeMomento.toLowerCase() === assunto.topico.toLowerCase()
  );

  if (momento) {
    const quando = formatTempoNaAula(momento.emMs);
    let texto;
    if (!assunto) {
      texto = ondeMomento
        ? `Aos ${quando}, em ${ondeMomento}: ${momento.rotulo}.`
        : `Aos ${quando}: ${momento.rotulo}.`;
    } else if (mesmoAssunto) {
      // Mesmo assunto nas duas leituras: esta linha só situa no tempo.
      texto = `A primeira vez foi aos ${quando}: ${momento.rotulo}.`;
    } else {
      texto = ondeMomento
        ? `O primeiro tropeço veio antes, aos ${quando}, em ${ondeMomento}: ${momento.rotulo}.`
        : `O primeiro tropeço veio aos ${quando}: ${momento.rotulo}.`;
    }
    linhas.push(el("p", { class: "mp-atrito__ancora", text: texto }));
  }

  // A vitória tem linha própria, com ícone e cor próprios. Enfiada no fim do
  // parágrafo de cima, a única boa notícia de um bloco que fala de dificuldade
  // simplesmente não seria lida — e ela é, de longe, o que o pai mais quer ler.
  if (momento && momento.superado) {
    linhas.push(
      el("p", {
        class: "mp-atrito__vitoria",
        children: [
          el("span", {
            class: "mp-atrito__vitoria-ico",
            svg: ICON.sprout,
            attrs: { "aria-hidden": "true" },
          }),
          el("span", {
            text: mesmoAssunto
              ? "E esse ponto acabou destravando ainda nesta aula."
              : "E esse primeiro tropeço acabou destravando ainda nesta aula.",
          }),
        ],
      })
    );
  }

  // `ocorrencias` vira texto, nunca número: "voltou algumas vezes" diz o que o
  // pai precisa saber; "3 ocorrências" é placar com outro nome. E o `peso` do
  // payload não chega aqui — ele é ranking interno do servidor.
  if (assunto && assunto.ocorrencias >= 2) {
    linhas.push(
      el("p", {
        class: "mp-atrito__ancora",
        text: `Esse assunto voltou algumas vezes ao longo da conversa.`,
      })
    );
  }

  const sugestao = sugestaoDeRetomada(alvo, ponderar);

  return el("div", {
    class: "mp-atrito",
    children: [
      el("span", { class: "mp-atrito__ico", svg: ICON.heart, attrs: { "aria-hidden": "true" } }),
      el("div", {
        class: "mp-atrito__body",
        children: [
          el("span", {
            class: "mp-atrito__label",
            text: assunto ? "O que vale rever" : "O momento que mais importa",
          }),
          ...linhas,
          el("p", { class: "mp-atrito__acao", text: sugestao }),
        ],
      }),
    ],
  });
}

/**
 * A tela deve PONDERAR em vez de afirmar?
 *
 * Duas origens, e basta uma: o assunto a rever apoiado só numa fonte fraca
 * (`assuntoMaisDificil.confianca === 'baixa'`), ou a aula inteira sustentada só
 * pela câmera (`qualidade.confianca === 'baixa'`). Nos dois casos o dado existe e
 * merece ser mostrado — o que não cabe é a certeza.
 *
 * ⚠️ Ausência de `confianca` NÃO é motivo pra ponderar: sessão antiga chega sem o
 * campo, e transformar "não sei o nível" em "parece que" encheria o histórico
 * inteiro de dúvida que ninguém expressou.
 */
function leituraPonderada(sessao) {
  const doAssunto = sessao.assuntoMaisDificil && sessao.assuntoMaisDificil.confianca;
  const daSessao = sessao.qualidade && sessao.qualidade.confianca;
  return doAssunto === "baixa" || daSessao === "baixa";
}

/** O convite do fim do bloco: firme quando o dado é firme, leve quando não é. */
function sugestaoDeRetomada(alvo, ponderar) {
  if (!alvo) return "Vale puxar esse assunto de novo com calma numa próxima conversa.";
  return ponderar
    ? `Se der, vale puxar ${alvo} numa conversa hoje: cinco minutinhos já ajudam.`
    : `Um bom assunto pra retomarem juntos hoje: cinco minutinhos sobre ${alvo} já ajudam bastante.`;
}

/**
 * Qual bloco vai em cima da linha do tempo — ou NENHUM. É aqui que a tela decide
 * o que ela tem direito de afirmar, e a ordem das três perguntas importa.
 *
 * @param {import('../mapa-api.js').Sessao} sessao
 * @returns {HTMLElement|null} null = a aula aparece sem cabeçalho conclusivo
 */
function cabecalhoDaAula(sessao) {
  // 1. Aula sem momento nenhum: não houve atrito, ponto. É a única conclusão que
  //    a tela pode tirar SEM os derivados, porque ela não depende de critério
  //    nenhum — depende de a lista estar vazia.
  if (!sessao.momentos.length) return faixaTranquila(sessao);

  // 2. 🔴 Há momentos, mas ninguém calculou os derivados (histórico lido direto
  //    de `sessoes_atencao` via RLS — o contorno da dívida nº 3). Aqui o site
  //    fica QUIETO: `pontoDeAtrito` está nulo porque não foi perguntado, não
  //    porque não houve atrito. Antes de ago/2026 o site recalculava o campo com
  //    a regra velha; agora ele diverge do servidor (a câmera saiu da frente da
  //    fila e só entra se corroborada), e um cabeçalho errado é pior que
  //    cabeçalho nenhum. A linha do tempo abaixo continua inteira e verdadeira —
  //    ela mostra os momentos, que é o dado bruto, sem interpretar.
  if (!sessao.derivadosDisponiveis) return null;

  // 3. Derivados na mão: ou há o que rever, ou a aula correu bem.
  if (sessao.pontoDeAtrito || sessao.assuntoMaisDificil) return destaqueDoAtrito(sessao);
  return faixaTranquila(sessao);
}

/**
 * Aula sem nada a rever. Desde ago/2026 este é o caso COMUM, não a exceção: o
 * servidor parou de eleger ponto de atrito apoiado só numa careta, e as sessões
 * que antes vinham com um ponto duvidoso agora vêm limpas. Por isso ele precisa
 * parecer intencional e positivo — nunca uma tela que faltou carregar.
 *
 * São três textos, e a escolha não é cosmética: é o que impede a tela de se
 * contradizer com a linha do tempo desenhada logo abaixo.
 *
 *   `superado`   ela emperrou e destravou sozinha, na mesma aula. É a MELHOR
 *                notícia que esta tela tem pra dar, e vem primeiro.
 *   `houveApoio` há marcadores âmbar na faixa, mas nada se firmou como ponto a
 *                rever (leitura de câmera sem corroboração, tipicamente). Dizer
 *                "nenhum momento de atrito" aqui seria negar o que o pai está
 *                vendo dois centímetros abaixo.
 *   limpa        nem isso: a aula não teve um minuto de aperto.
 */
function faixaTranquila(sessao) {
  const assunto = sessao.topicos[0] || (sessao.materias[0] ? materiaLabel(sessao.materias[0]) : null);
  const vencido = sessao.momentos.find((m) => m.superado);
  const houveApoio = sessao.momentos.some((m) => m.tom === "apoio" || m.tom === "duvida");

  let ico = ICON.check;
  let titulo = "A aula correu tranquila";
  let texto = assunto
    ? `Nenhum momento de atrito nesta conversa sobre ${assunto}: a Cogni não precisou mudar de estratégia em nenhum minuto.`
    : "Nenhum momento de atrito nesta conversa: a Cogni não precisou mudar de estratégia em nenhum minuto.";

  if (vencido) {
    // Sem pronome e sem o nome da criança, como todo o resto da tela: o perfil
    // não guarda gênero, e "destravou sozinha" erraria a flexão pra metade das
    // crianças. "Esse ponto destravou" diz o mesmo e não flexiona.
    const onde = ondeDoMomento(vencido);
    ico = ICON.sprout;
    titulo = "Emperrou e destravou na mesma aula";
    texto = onde
      ? `Teve um minuto de mais apoio em ${onde}, e logo depois a conversa seguiu sem precisar de ajuda. Não ficou nada pendente pra hoje.`
      : "Teve um minuto de mais apoio, e logo depois a conversa seguiu sem precisar de ajuda. Não ficou nada pendente pra hoje.";
  } else if (houveApoio) {
    titulo = "Nada que peça uma revisão hoje";
    texto =
      "Teve minutos em que a Cogni deu mais apoio, marcados na linha do tempo abaixo, " +
      "mas nenhum assunto ficou pendente pra retomar.";
  }

  return el("div", {
    class: "mp-tranquila" + (vencido ? " mp-tranquila--vitoria" : ""),
    children: [
      el("span", { class: "mp-tranquila__ico", svg: ico, attrs: { "aria-hidden": "true" } }),
      el("div", {
        class: "mp-tranquila__body",
        children: [
          el("p", { class: "mp-tranquila__titulo", text: titulo }),
          el("p", { class: "mp-tranquila__texto", text: texto }),
        ],
      }),
    ],
  });
}

/**
 * A linha do tempo em texto — a alternativa acessível ao desenho, e também o que
 * o pai lê no celular sem mirar num marcador de 14px.
 *
 * As duas ressalvas de ago/2026 (o traço e o halo da faixa) viram PALAVRA aqui,
 * porque é esta lista que carrega a informação quando cor, forma e posição não
 * chegam. Nenhuma delas usa o vocabulário do motor.
 *
 * ⚠️ Momento sem `topico` NÃO ganha texto no lugar. Desde ago/2026 o assunto de um
 * momento vence em 4 min e o servidor devolve `null` de propósito; preencher com
 * a matéria da sessão, ou pior, com `topicos[0]`, é exatamente o defeito nº 1 que
 * a reforma consertou ("travou em frações" 44 min depois de frações sair da mesa).
 * A linha fica sem o complemento, e é o certo: o que ela afirma continua sendo só
 * o que o servidor afirmou.
 *
 * @param {import('../mapa-api.js').Sessao} sessao
 */
function listaDeMomentos(sessao) {
  if (!sessao.momentos.length) return null;

  const lista = el("ol", {
    class: "mp-momentos",
    children: sessao.momentos.map((m, i) => {
      const onde = ondeDoMomento(m);
      return el("li", {
        class: "mp-momento",
        attrs: {
          "data-tom": m.tom,
          "data-tipo": m.tipo,
          "data-indice": String(i),
          ...(m.confianca === "baixa" ? { "data-confianca": "baixa" } : {}),
          ...(m.superado ? { "data-superado": "true" } : {}),
          tabindex: "-1", // recebe foco só por programa (clique num marcador)
        },
        children: [
          el("span", { class: "mp-momento__when", text: formatTempoNaAula(m.emMs) }),
          el("span", { class: "mp-momento__dot", attrs: { "aria-hidden": "true" } }),
          el("div", {
            class: "mp-momento__body",
            children: [
              el("span", { class: "mp-momento__what", text: capitalizar(m.rotulo) }),
              onde ? el("span", { class: "mp-momento__where", text: onde }) : null,
              m.superado
                ? el("span", { class: "mp-momento__selo", text: "Destravou depois" })
                : null,
              m.confianca === "baixa"
                ? el("span", {
                    class: "mp-momento__ressalva",
                    text: "Só a câmera percebeu",
                  })
                : null,
            ],
          }),
        ],
      });
    }),
  });

  return el("div", {
    class: "mp-momentos-bloco",
    children: [
      el("h3", { class: "mp-subtitulo", text: "Momento a momento" }),
      lista,
    ],
  });
}

/**
 * Card da aula em destaque. Devolve também os ganchos que o modo ao vivo usa pra
 * atualizar sem repintar (ver `atualizarProgresso`).
 * @returns {{ node: HTMLElement, timeline: HTMLElement|null, meta: HTMLElement }}
 */
function cardDaSessao({ sessao, now, entradaAPartirDe }) {
  const meta = el("p", { class: "mp-sessao__meta", text: metaDaSessao(sessao) });

  const cabecalho = el("div", {
    class: "mp-sessao__head",
    children: [
      el("div", {
        class: "mp-sessao__heading",
        children: [
          el("h2", { class: "mp-sessao__titulo", text: tituloDaSessao(sessao, now) }),
          meta,
        ],
      }),
      sessao.emAndamento ? seloAoVivo() : null,
    ],
  });

  // Clicar num marcador leva o olho pro item correspondente da lista — é o que
  // dá sentido ao marcador no celular, onde não existe hover.
  let listaBloco = null;
  const timeline = buildTimeline({
    sessao,
    entradaAPartirDe,
    onSelecionar: (indice) => {
      if (!listaBloco) return;
      listaBloco.querySelectorAll(".mp-momento").forEach((li) => {
        li.classList.toggle("is-destacado", li.getAttribute("data-indice") === String(indice));
      });
      const alvo = listaBloco.querySelector(`.mp-momento[data-indice="${indice}"]`);
      if (alvo) {
        alvo.scrollIntoView({ behavior: "smooth", block: "nearest" });
        alvo.focus({ preventScroll: true });
      }
    },
  });
  listaBloco = listaDeMomentos(sessao);

  const node = el("article", {
    class: "dash-card mp-sessao" + (sessao.emAndamento ? " is-live" : ""),
    children: [
      cabecalho,
      el("div", {
        class: "mp-sessao__body",
        children: [
          chipsDeAssunto(sessao),
          cabecalhoDaAula(sessao),
          timeline,
          listaBloco,
        ],
      }),
    ],
  });

  return { node, timeline, meta };
}

/**
 * Resumo curto de uma aula pro cartão do histórico (sem placar, sem sinal cru).
 *
 * 🔴 O caso sem derivados é o que mais importa aqui, e era o mais perigoso: com o
 * `pontoDeAtrito` sempre nulo na leitura via tabela, o `return "correu tranquila"`
 * de antes transformaria TODAS as aulas do histórico numa boa notícia inventada —
 * e é justamente durante a aula ao vivo (quando o endpoint devolve `historico: []`)
 * que o pai olha esses cartões. Sem os derivados, o cartão diz o que ele sabe: o
 * assunto da aula.
 */
function resumoDoItem(sessao) {
  if (!sessao.derivadosDisponiveis) {
    if (sessao.topicos.length) return sessao.topicos[0];
    if (sessao.materias.length) return materiaLabel(sessao.materias[0]);
    return "aula registrada";
  }
  if (sessao.pontoDeAtrito) {
    const onde = ondeDoMomento(sessao.pontoDeAtrito);
    return onde ? `${sessao.pontoDeAtrito.rotulo} · ${onde}` : sessao.pontoDeAtrito.rotulo;
  }
  if (sessao.momentos.some((m) => m.superado)) return "emperrou e destravou";
  if (!sessao.momentos.length) return "correu tranquila";
  // Houve marcadores de apoio, mas nenhum virou ponto a rever. "Correu tranquila"
  // aqui contradiria a faixa que o pai vê ao abrir o cartão.
  return "sem pontos pendentes";
}

/**
 * A cor do cartão do histórico. `neutro` quando não há derivado: cinza é a
 * ausência de veredito, e é honesto — verde diria "correu bem", que é uma
 * conclusão que ninguém tirou.
 */
function tomDoItem(sessao) {
  if (!sessao.derivadosDisponiveis) return "neutro";
  if (sessao.pontoDeAtrito) return sessao.pontoDeAtrito.tom;
  return "bom";
}

/**
 * Histórico: todas as aulas registradas, com a exibida em destaque marcada.
 * Some quando só existe uma aula (não há o que comparar).
 * @param {object} cfg
 * @param {import('../mapa-api.js').Sessao[]} cfg.sessoes
 * @param {string|null} cfg.chaveSelecionada
 * @param {(chave:string)=>void} cfg.onEscolher
 */
function blocoHistorico({ sessoes, chaveSelecionada, now, onEscolher }) {
  if (sessoes.length < 2) return null;


  return el("section", {
    class: "mp-bloco",
    children: [
      el("h2", {
        class: "mp-bloco__titulo",
        children: [
          el("span", { class: "mp-bloco__ico", svg: ICON.clock, attrs: { "aria-hidden": "true" } }),
          el("span", { text: "Aulas registradas" }),
        ],
      }),
      el("div", {
        class: "mp-hist",
        children: sessoes.map((s) => {
          const selecionada = s.chave === chaveSelecionada;
          const btn = el("button", {
            class: "mp-hist__item" + (selecionada ? " is-selecionada" : ""),
            attrs: {
              type: "button",
              "aria-pressed": selecionada ? "true" : "false",
              "data-tom": tomDoItem(s),
            },
            children: [
              el("span", {
                class: "mp-hist__quando",
                children: [
                  el("span", { text: tituloDaSessao(s, now) }),
                  s.emAndamento ? seloAoVivo(true) : null,
                ],
              }),
              el("span", { class: "mp-hist__meta", text: metaDaSessao(s) }),
              // O resumo pode ser um tópico da conversa ("dinossauros") ou um
              // rótulo do robô — os dois chegam minúsculos, e aqui abrem a linha.
              el("span", { class: "mp-hist__resumo", text: capitalizar(resumoDoItem(s)) }),
            ],
          });
          btn.addEventListener("click", () => onEscolher(s.chave));
          return btn;
        }),
      }),
    ],
  });
}

/**
 * Card do resumo em texto (IA). Começa em skeleton e nunca vira erro.
 * @returns {{ node: HTMLElement, aplicar: (texto: string|null) => void }}
 */
function cardResumo() {
  const corpo = el("div", {
    class: "mp-resumo__body",
    children: [
      el("span", { class: "mp-resumo__spinner", attrs: { "aria-hidden": "true" } }),
      el("p", { class: "mp-resumo__loading", text: "A Cogni está lendo o mapa da aula…" }),
    ],
  });

  const node = el("article", {
    class: "dash-card mp-resumo",
    children: [
      el("div", {
        class: "dash-card__head",
        children: [
          el("span", { class: "dash-card__head-ico", svg: ICON.bulb }),
          el("span", { class: "dash-card__head-title", text: "O que rolou nesta aula" }),
        ],
      }),
      corpo,
    ],
  });

  /**
   * @param {string|null} texto — null = servidor offline, IA indisponível ou aula
   *   nenhuma. Em todos esses casos a tela segue valendo pelo desenho, então o
   *   card sai de cena em vez de gritar erro.
   */
  function aplicar(texto) {
    if (!texto) {
      node.remove();
      return;
    }
    corpo.replaceChildren(el("p", { class: "mp-resumo__texto", text: texto }));
  }

  return { node, aplicar };
}

/** Estado inicial: ainda não há nenhuma aula registrada. Não é erro. */
function estadoSemAula(nome) {
  return el("div", {
    class: "dash-card mp-vazio",
    children: [
      el("span", { class: "mp-vazio__ico", svg: ICON.timeline, attrs: { "aria-hidden": "true" } }),
      el("h2", { class: "mp-vazio__titulo", text: "O mapa da primeira aula aparece aqui" }),
      el("p", {
        class: "mp-vazio__texto",
        text:
          `Quando ${nome} conversar alguns minutinhos com a Cogni, esta tela mostra a ` +
          "aula minuto a minuto: em que momento cada assunto entrou e onde a Cogni " +
          "precisou explicar de outro jeito.",
      }),
      el("p", {
        class: "mp-vazio__dica",
        text: "Com a câmera ligada, o mapa fica mais rico: é ela que percebe a hora de ajudar.",
      }),
    ],
  });
}

/* --------------------------------------------------------------------------
   Render principal
   -------------------------------------------------------------------------- */

export async function renderMapa(ctx) {
  const { crianca, servidorUrl, mock, now } = ctx;
  const nome = primeiroNome(crianca && crianca.nome) || "a criança";

  const root = sectionRoot("mapa");
  root.classList.add("dash-mapa");

  const seloTopo = el("div", { class: "mp-topo-selo" });
  const head = pageHead({
    title: "Mapa da aula",
    subtitle:
      `Não é só quanto tempo ${nome} estudou: é em que minuto cada assunto entrou ` +
      "e onde a Cogni precisou dar mais apoio.",
    action: seloTopo,
  });
  root.appendChild(head);

  // Região viva: anuncia o momento NOVO no leitor de tela sem reler o card
  // inteiro a cada 10 segundos. É o equivalente sonoro do marcador que aparece.
  const anuncio = el("p", {
    class: "sr-only",
    attrs: { "aria-live": "polite", "aria-atomic": "true" },
  });

  const resumoHost = el("div", { class: "mp-resumo-host" });
  const sessaoHost = el("div", { class: "mp-sessao-host" });
  const historicoHost = el("div", { class: "mp-hist-host" });
  root.append(anuncio, resumoHost, sessaoHost, historicoHost);

  /* ---- Estado local da seção ------------------------------------------- */

  /** @type {import('../mapa-api.js').Sessao[]} */
  let sessoes = [];
  let emAndamento = false;
  let aoVivoDisponivel = false;
  /** Aula exibida em destaque (`Sessao.chave`). Null = sempre a mais recente. */
  let chaveSelecionada = null;
  /** Ganchos do card em destaque, pra atualizar ao vivo sem repintar. */
  let cardAtual = null;
  /** Retrato do que já está pintado — o que decide repintar ou só reposicionar. */
  let pintado = { chave: null, momentos: 0, sessoes: 0 };
  let timer = null;

  const sessaoExibida = () =>
    sessoes.find((s) => s.chave === chaveSelecionada) || sessoes[0] || null;

  /* ---- Pintura ---------------------------------------------------------- */

  function pintar({ animarNovos = false } = {}) {
    // `replaceChildren(null)` escreveria o texto "null" na tela: sem selo, o
    // argumento tem que simplesmente não existir.
    if (emAndamento) seloTopo.replaceChildren(seloAoVivo());
    else seloTopo.replaceChildren();

    const sessao = sessaoExibida();
    if (!sessao) {
      cardAtual = null;
      pintado = { chave: null, momentos: 0, sessoes: 0 };
      sessaoHost.replaceChildren(estadoSemAula(nome));
      historicoHost.replaceChildren();
      return;
    }

    // Só os momentos que chegaram desde o último render entram animados: piscar a
    // linha inteira a cada tick cansaria a vista sem informar nada.
    const entradaAPartirDe = animarNovos ? pintado.momentos : Infinity;
    cardAtual = cardDaSessao({ sessao, now, entradaAPartirDe });
    sessaoHost.replaceChildren(cardAtual.node);

    const historico = blocoHistorico({
      sessoes,
      chaveSelecionada: sessao.chave,
      now,
      onEscolher: (chave) => {
        chaveSelecionada = chave;
        pintar();
      },
    });
    if (historico) historicoHost.replaceChildren(historico);
    else historicoHost.replaceChildren();

    pintado = {
      chave: sessao.chave,
      momentos: sessao.momentos.length,
      sessoes: sessoes.length,
    };
  }

  /**
   * Modo ao vivo, caso barato: nada de novo aconteceu, só o relógio andou. Move as
   * posições e o texto de duração sem tocar na árvore — o marcador que estava sob
   * o dedo (ou com foco) continua lá.
   */
  function atualizarProgresso(sessao) {
    if (!cardAtual) return;
    cardAtual.meta.textContent = metaDaSessao(sessao);
    reposicionarMarcadores(cardAtual.timeline, sessao.duracaoMs);
  }

  /* ---- Carregamento ----------------------------------------------------- */

  /**
   * Aplica um mapa recém-carregado. Decide sozinho entre repintar (mudou a
   * estrutura da tela) e só mexer nas posições (só o tempo andou).
   * @returns {boolean} true se a aula ao vivo TERMINOU neste ciclo
   */
  function aplicar(mapa) {
    const estavaAoVivo = emAndamento;

    sessoes = mapa.sessoes;
    emAndamento = mapa.emAndamento;
    aoVivoDisponivel = mapa.aoVivoDisponivel;

    // O pai pode ter escolhido uma aula antiga pra olhar: respeitamos a escolha
    // dele, mesmo com aula nova entrando. Só reancoramos se ela sumiu da lista.
    if (chaveSelecionada && !sessoes.some((s) => s.chave === chaveSelecionada)) {
      chaveSelecionada = null;
    }

    const sessao = sessaoExibida();
    const mesmaSessao = !!sessao && sessao.chave === pintado.chave;
    const soAndouORelogio =
      mesmaSessao &&
      sessao.emAndamento &&
      sessao.momentos.length === pintado.momentos &&
      sessoes.length === pintado.sessoes;

    if (soAndouORelogio) {
      atualizarProgresso(sessao);
    } else {
      const momentosNovos = mesmaSessao && sessao.momentos.length > pintado.momentos;
      const ultimo = momentosNovos ? sessao.momentos[sessao.momentos.length - 1] : null;
      pintar({ animarNovos: mesmaSessao });
      if (ultimo) anuncio.textContent = `Novo momento na aula. ${descreverMomento(ultimo)}`;
    }

    return estavaAoVivo && !emAndamento;
  }

  /** Intervalo do próximo tick, conforme o que está acontecendo agora. */
  function proximoIntervalo() {
    if (emAndamento) return POLL_AO_VIVO_MS;
    return aoVivoDisponivel ? POLL_ESPERA_MS : POLL_SEM_SERVIDOR_MS;
  }

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(tick, proximoIntervalo());
  }

  async function tick() {
    // A seção saiu da tela (o router trocou de rota): o timer morre com ela. É o
    // jeito de não vazar poll sem precisar de um hook de destruição no router.
    if (!document.contains(root)) return;

    // Aba em segundo plano não precisa de mapa novo — economiza rede e bateria do
    // celular, que é justamente onde o pai abre isso.
    if (document.hidden) {
      agendar();
      return;
    }

    try {
      const mapa = await carregarMapa({ servidorUrl, crianca, mock });
      if (!document.contains(root)) return;
      const terminou = aplicar(mapa);
      // A aula acabou de fechar: vale UM resumo novo (agora ele fala da aula
      // inteira, não de metade dela). Fora isso, o texto não é regerado no poll —
      // é endpoint de IA, com rate limit.
      if (terminou) buscarResumo();
    } catch (err) {
      console.debug("[Companion] Mapa da aula: ciclo ao vivo falhou.", err);
    }
    agendar();
  }

  let resumoCard = null;
  function buscarResumo() {
    if (!crianca || !crianca.id) return;
    const card = cardResumo();
    resumoCard = card;
    resumoHost.replaceChildren(card.node);
    carregarResumoDaAula(servidorUrl, crianca.id).then((texto) => {
      // Uma resposta antiga não pode sobrescrever um card mais novo.
      if (resumoCard === card && document.contains(root)) card.aplicar(texto);
    });
  }

  /* ---- Primeiro carregamento (bloqueia o render, como as outras seções) -- */

  const mapa = await carregarMapa({ servidorUrl, crianca, mock });
  aplicar(mapa);

  // Só pedimos o texto quando há aula pra resumir — o endpoint passa por rate
  // limit de IA e não faz sentido gastá-lo com "sem_sessao".
  if (sessoes.length) buscarResumo();

  agendar();

  return root;
}
