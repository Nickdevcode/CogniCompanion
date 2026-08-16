/**
 * _lib/melhorar.mjs — O que a IA lê quando o pai clica no ✨ dentro de um campo.
 *
 * Separado da chamada (`openai.mjs`) pelo mesmo motivo que `prompt.mjs`: aqui muda
 * o que queremos que ela escreva (produto), lá muda como se fala com a API (infra).
 *
 * A diferença pro `prompt.mjs` é o tamanho do trabalho. Lá a IA LÊ um material e
 * PROPÕE um plano inteiro, que o pai revisa tarefa por tarefa antes de salvar. Aqui
 * ela reescreve **uma frase** e o resultado cai direto no campo, embaixo do cursor
 * dele. Isso muda três coisas:
 *
 * 1. **O fato é dele.** A regra anti-invenção do projeto vale em grau máximo: página,
 *    data, capítulo, número de questão e nome de professor que ele não escreveu não
 *    podem aparecer. Um "entregar terça" inventado vira card com prazo errado, e
 *    prazo errado vira a Cogni cobrando a criança no dia errado.
 * 2. **A saída é texto puro.** Sem JSON, sem schema, sem markdown — o destino é um
 *    `<input>`. Quem descasca o que o modelo insiste em embrulhar é `sanear.mjs`.
 * 3. **Não dá pra gerar do nada.** Título vazio, sem nada em volta, não tem de onde
 *    sair — e a IA inventaria. Isso não é erro depois do clique: é `temFonte()`,
 *    checado antes de gastar rede (e a tela desabilita o botão pela mesma regra).
 */

import { MATERIAS, LIM } from "./prompt.mjs";

/** Teto do que aceitamos como texto de entrada. Acima disso é outra coisa. */
export const MAX_ENTRADA = 4_000;

/** Quantos cards do quadro entram no contexto (os outros só repetiriam o assunto). */
const MAX_CARDS = 8;

/**
 * Os quatro campos, e o que cada um É.
 *
 * `teto` sai de `LIM` — os mesmos números do contrato do banco e do `maxlength` da
 * tela. Deixar um literal aqui seria criar um terceiro lugar pra divergir.
 */
export const CAMPOS = {
  "plano.titulo": {
    teto: LIM.titulo,
    rotulo: "o TÍTULO do plano de estudos",
    comoE:
      "Um nome curto e reconhecível, que o pai bate o olho e sabe qual plano é " +
      '("Frações pra prova de sexta", "Semana da tabuada"). Sem ponto final.',
    acoes: ["gerar", "melhorar"],
  },
  "plano.conteudo": {
    teto: LIM.conteudo,
    rotulo: "o CONTEÚDO/objetivo do plano de estudos",
    comoE:
      "1 a 3 frases dizendo o que a criança precisa aprender ou treinar. Este texto " +
      "vai pro que a Cogni sabe sobre o plano: escreva pra ela SEGUIR, não pra " +
      "impressionar. Não vire lista de tarefas — as tarefas são os cards do quadro.",
    acoes: ["gerar", "melhorar", "encurtar", "detalhar"],
  },
  "tarefa.titulo": {
    teto: LIM.tarefaTitulo,
    rotulo: "o TÍTULO de uma tarefa do quadro",
    comoE:
      'Curto e reconhecível PRA CRIANÇA ("Exercícios de fração", "Ler o capítulo 3"). ' +
      "É o que aparece escrito no card. Sem ponto final.",
    acoes: ["gerar", "melhorar"],
  },
  "tarefa.detalhe": {
    teto: LIM.detalhe,
    rotulo: "o DETALHE de uma tarefa do quadro",
    comoE:
      "O que a criança precisa FAZER, com o enunciado resumido — não só onde está " +
      '("Somar frações de denominadores diferentes; ex.: 2/3 + 1/4. Páginas 42 e 43"). ' +
      "A Cogni usa este texto pra ajudar a fazer a lição: sem o enunciado ela só sabe " +
      "que a lição existe; com ele, sabe ensinar a resolver.",
    acoes: ["gerar", "melhorar", "encurtar", "detalhar"],
  },
};

/** O que cada ação pede, em uma linha. */
const ACOES = {
  gerar:
    "ESCREVA o texto do zero, a partir do contexto abaixo. Use só o que está ali — " +
    "se o contexto não disser, não diga.",
  melhorar:
    "REESCREVA o texto do responsável pra ficar claro, direto e bem escrito. Mesma " +
    "informação, mesmo tamanho aproximado: corrija a redação, não o conteúdo.",
  encurtar:
    "ENCURTE o texto pra mais ou menos metade, mantendo TODA informação concreta " +
    "(número, página, prazo, assunto). Corte palavra, nunca fato.",
  detalhar:
    "DEIXE o texto mais completo e explícito, desdobrando o que ele JÁ diz — o que " +
    "fazer, com que assunto, em que ordem. Continue sem acrescentar fato novo: " +
    "detalhar é explicar o que está lá, não inventar o que falta.",
};

export const ACOES_VALIDAS = Object.keys(ACOES);

/** Corta e limpa um pedaço de contexto (ele vem do cliente, como todo o resto). */
function limpar(valor, max) {
  if (typeof valor !== "string") return "";
  return valor.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * O contexto que chegou do cliente, saneado.
 *
 * Ele é dado do navegador do pai — não é hostil por natureza, mas é escrito por
 * quem chama, e um `cards` com 4 000 itens seria um jeito barato de inflar a nossa
 * conta de tokens com uma sessão válida.
 *
 * @param {object} bruto
 * @returns {{tituloDoPlano:string, conteudoDoPlano:string, foco:string,
 *   tituloDaTarefa:string, materia:string, cards:string[], idade:number|null,
 *   serie:string}}
 */
export function normalizarContexto(bruto) {
  const c = bruto && typeof bruto === "object" ? bruto : {};
  const idade = Number(c.idade);
  return {
    tituloDoPlano: limpar(c.tituloDoPlano, LIM.titulo),
    conteudoDoPlano: limpar(c.conteudoDoPlano, LIM.conteudo),
    // Allowlist das 14 canônicas: matéria fora da lista não vira contexto nenhum.
    foco: MATERIAS.includes(c.foco) ? c.foco : "",
    tituloDaTarefa: limpar(c.tituloDaTarefa, LIM.tarefaTitulo),
    materia: MATERIAS.includes(c.materia) ? c.materia : "",
    cards: Array.isArray(c.cards)
      ? c.cards
          .slice(0, MAX_CARDS)
          .map((t) => limpar(t, LIM.tarefaTitulo))
          .filter(Boolean)
      : [],
    idade: Number.isFinite(idade) && idade > 0 && idade < 25 ? Math.round(idade) : null,
    serie: limpar(c.serie, 40),
  };
}

/**
 * Tem de onde tirar o texto?
 *
 * 🔴 A regra mais importante desta feature, e a única que existe **nas duas pontas**
 * (aqui e em `js/dashboard/campo-ia.js`, que desabilita o botão). A daqui é a que
 * vale — a da tela existe pra o pai saber ANTES de clicar, não pra ele descobrir
 * depois num erro.
 *
 * `foco`, `idade` e `serie` NÃO contam como fonte de propósito: `foco` é um `<select>`
 * que sempre tem valor, então se ele contasse o botão nunca ficaria desabilitado — e
 * um título gerado só de "matemática" é exatamente a invenção que queremos evitar.
 *
 * @param {string} campo
 * @param {string} texto — o que o pai já escreveu no campo
 * @param {object} contexto — já normalizado
 * @returns {boolean}
 */
export function temFonte(campo, texto, contexto) {
  if (texto && texto.trim()) return true;
  const c = contexto || {};
  if (campo === "plano.titulo") return !!c.conteudoDoPlano;
  if (campo === "plano.conteudo") return !!c.tituloDoPlano;
  if (campo === "tarefa.titulo") {
    return !!(c.tituloDoPlano || c.conteudoDoPlano || c.cards.length);
  }
  // O detalhe é de UM card: sem o título da tarefa, o que sairia seria um detalhe
  // do plano inteiro colado num card qualquer.
  if (campo === "tarefa.detalhe") return !!c.tituloDaTarefa;
  return false;
}

/**
 * O bloco de contexto, na ORDEM em que a IA deve confiar nele.
 *
 * A ordem não é enfeite: o que o pai digitou manda no que o plano diz, que manda no
 * foco. Um título de tarefa contradizendo o card que o pai acabou de escrever é pior
 * que um título genérico.
 */
function blocoDeContexto(campo, c) {
  const linhas = [];
  const push = (rotulo, valor) => {
    if (valor) linhas.push(`${rotulo}: ${valor}`);
  };

  if (campo.startsWith("tarefa.")) {
    push("Título desta tarefa", c.tituloDaTarefa);
    push("Matéria desta tarefa", c.materia);
  }
  push("Título do plano", c.tituloDoPlano);
  push("Conteúdo do plano", c.conteudoDoPlano);
  push("Matéria do plano", c.foco);
  if (campo === "tarefa.titulo" && c.cards.length) {
    push("Outras tarefas que já estão no quadro", c.cards.join(" · "));
  }
  return linhas.join("\n");
}

/**
 * As duas mensagens da chamada.
 *
 * @param {{campo:string, acao:string, texto:string, contexto:object}} cfg
 * @returns {{sistema:string, usuario:string}}
 */
export function promptDeTexto({ campo, acao, texto, contexto }) {
  const def = CAMPOS[campo];
  const c = contexto;

  /**
   * Idade e série existem por um motivo só: este texto vira prompt de uma tutora de
   * criança, não briefing corporativo. Sem eles o modelo escreve "desenvolver
   * competências de raciocínio lógico-matemático" — que é irrepreensível e inútil.
   */
  const sobreACrianca = [
    c.idade ? `${c.idade} anos` : "",
    c.serie ? `cursando ${c.serie}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const sistema = `Você ajuda um pai ou uma mãe a ESCREVER um campo do plano de estudos que a
Cogni — a robô tutora — vai seguir com a criança${sobreACrianca ? ` (${sobreACrianca})` : ""}.

VOCÊ ESTÁ ESCREVENDO: ${def.rotulo}.
COMO ELE TEM QUE SER: ${def.comoE}

A REGRA QUE VALE MAIS QUE QUALQUER OUTRA: o FATO é dele, a REDAÇÃO é sua. Nunca
acrescente informação que não esteja no que ele escreveu ou no contexto — nada de
número de página, data de entrega, capítulo, número de questão, quantidade de
exercícios, nome de professor ou matéria que ele não tenha dito. Se ele escreveu
"páginas 42 e 43", o texto sai com as páginas 42 e 43 e mais nada. Um prazo inventado
aqui vira a Cogni cobrando a criança no dia errado.

O QUE FAZER AGORA: ${ACOES[acao]}

Como responder:
• devolva SÓ o texto final, e nada mais — sem aspas em volta, sem markdown, sem
  "Aqui está", sem explicar o que você mudou;
• no máximo ${def.teto} caracteres, e é pra caber de verdade: prefira sobrar;
• uma coisa só, em linha corrida (nada de lista, tópico ou quebra de linha);
• português do Brasil, palavras simples, tom de quem conhece a criança;
• se não houver o que reescrever de forma honesta, devolva o texto do responsável
  sem mudar nada.`;

  const bloco = blocoDeContexto(campo, c);
  const usuario = texto
    ? `TEXTO DO RESPONSÁVEL (é este que você ${
        acao === "gerar" ? "usa como base" : "reescreve"
      }):\n${texto}${bloco ? `\n\nCONTEXTO (só pra entender do que se trata):\n${bloco}` : ""}`
    : `O campo está vazio. Escreva a partir deste contexto:\n${bloco}`;

  return { sistema, usuario };
}
