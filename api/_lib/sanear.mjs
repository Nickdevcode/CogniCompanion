/**
 * _lib/sanear.mjs — A resposta da IA vira algo que o front consome sem checar nada.
 *
 * Schema estrito reduz o erro do modelo, não o elimina — e o caminho de fallback
 * (`json_object`) não valida absolutamente nada. Matéria fora das 14 vira "outros",
 * confiança sai grampeada em 0..1, prazo que não é `YYYY-MM-DD` vira null, textos são
 * cortados nos limites do contrato.
 *
 * ⚠️ Desde a rodada 2 este arquivo também é **controle de segurança**, não só
 * arrumação: o material agora pode ter vindo de um arquivo que um estranho mandou no
 * grupo da escola. O enum de matéria, a regex de data e os cortes de tamanho são o
 * backstop de verdade contra um documento que tenta mandar no modelo — o
 * enquadramento do prompt é a primeira linha, esta é a última.
 */

import { MATERIAS, LIM, MAX_TAREFAS } from "./prompt.mjs";

/** Corta uma string no limite, sem deixar espaço solto na ponta. */
function cortar(valor, max) {
  if (typeof valor !== "string") return "";
  const t = valor.trim();
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

/**
 * Corta no limite **sem partir palavra** — o corte que o campo de texto precisa.
 *
 * O `cortar()` acima fatia no caractere e pronto, e pra uma proposta de plano isso
 * basta: o pai revisa tudo antes de salvar. Aqui não: o texto vai **direto pro
 * campo, embaixo do cursor dele**, e "Somar frações de denominadores difere" é uma
 * frase mutilada que ele vê como defeito do site, não como corte.
 *
 * Só volta até o espaço anterior quando isso não come o texto todo (uma palavra
 * única maior que o teto ainda tem que caber cortada, senão o campo ficaria vazio).
 *
 * @param {string} valor
 * @param {number} max
 * @returns {string}
 */
export function cortarSemPartirPalavra(valor, max) {
  if (typeof valor !== "string") return "";
  const t = valor.trim();
  if (t.length <= max) return t;

  const bruto = t.slice(0, max);
  const ultimoEspaco = bruto.lastIndexOf(" ");
  // Metade do teto é o piso: abaixo disso, voltar até o espaço jogaria fora mais
  // texto do que o corte já jogou.
  const cortado = ultimoEspaco > max / 2 ? bruto.slice(0, ultimoEspaco) : bruto;
  // Pontuação solta na ponta ("de fração," / "prova de") é resto de corte, não estilo.
  return cortado.replace(/[\s,;:.\-–—]+$/, "").trimEnd();
}

/** As pontas que contam como "embrulho" quando aparecem nas DUAS extremidades. */
const ABRE_EMBRULHO = "\"'“‘«*_";
const FECHA_EMBRULHO = "\"'”’»*_";

/**
 * Descasca o embrulho que modelo pequeno adora pôr em volta de uma resposta de
 * texto puro: markdown, aspas, "Aqui está:" e afins.
 *
 * Vale a pena ser chato aqui porque o destino é um `<input>`: uma aspa sobrando
 * vira uma aspa salva no banco, e um `**` vira dois asteriscos que a Cogni lê em voz
 * alta pra criança.
 *
 * @param {string} valor
 * @returns {string}
 */
export function descascarTexto(valor) {
  if (typeof valor !== "string") return "";
  let t = valor.trim();

  // Bloco de código inteiro (```…```), que aparece quando o modelo "formata" a saída.
  const bloco = /^```[a-z]*\n?([\s\S]*?)\n?```$/i.exec(t);
  if (bloco) t = bloco[1].trim();

  // Prefixo de apresentação. Só no COMEÇO e só com dois-pontos: um texto que
  // legitimamente comece com "Resposta: 42" não é o caso aqui, mas "Aqui está:" é.
  t = t.replace(
    /^(aqui (está|vai)( o (texto|título))?|texto( melhorado| sugerido)?|título( sugerido)?|sugestão|resultado)\s*:\s*/i,
    ""
  );

  /**
   * Aspas/asteriscos em volta do texto INTEIRO — nunca os do meio, que podem ser
   * dele ("questões do tipo 'quantos terços cabem'"). Quatro voltas porque o embrulho
   * vem em camadas: `**"texto"**` são duas de cada lado, e o modelo às vezes soma
   * negrito + itálico + aspas.
   */
  for (let i = 0; i < 4 && t.length > 1; i += 1) {
    const abre = ABRE_EMBRULHO.includes(t[0]);
    const fecha = FECHA_EMBRULHO.includes(t[t.length - 1]);
    if (!abre || !fecha) break;
    t = t.slice(1, -1).trim();
  }

  // Marcador de lista/título que sobrou na frente ("- ", "1. ", "## ").
  t = t.replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, "");

  /**
   * Espaço em branco vira UM espaço, sempre — inclusive quebra de linha.
   *
   * Os quatro campos são de uma frase: três são `<input>` (que engole `\n` em
   * silêncio, com o navegador decidindo como) e o `conteudo` é um resumo de 1-2
   * frases. Uma lista em bullets chegando aqui viraria um parágrafo grudado; melhor
   * um parágrafo honesto que um `\n` fantasma que só aparece no banco.
   */
  return t.replace(/\s+/g, " ").trim();
}

/** Número dentro da faixa, ou `null` se não for número. */
function grampear(valor, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Os textos-padrão dependem de ter havido material.
 *
 * Um plano pedido por escrito que dá errado não pode devolver "tente com a folha
 * inteira no quadro e boa luz" — a mãe não fotografou nada, e uma mensagem que não
 * corresponde ao que ela fez é o jeito mais rápido de ensinar alguém a ignorar as
 * nossas mensagens.
 */
const PADROES = {
  material: {
    motivo:
      "Não consegui ler esse material. Tente de novo com a folha inteira no quadro e boa luz.",
    titulo: "Atividades da escola",
    semTarefa: "Consegui ver o material, mas não achei nenhuma tarefa escrita nele.",
  },
  /**
   * ⭐ Rodada 3. O link precisa dos textos dele pelo mesmo motivo que o pedido precisou
   * dos dele: a saída é outra. Quem colou uma videoaula não fotografou folha nenhuma —
   * mandar "tente com boa luz" seria uma resposta ao que ele NÃO fez.
   */
  link: {
    motivo:
      "Não consegui montar um plano com esse conteúdo. Tente uma videoaula ou uma página que expliquem o assunto que ela precisa estudar.",
    titulo: "Plano de estudos",
    semTarefa:
      "Li o conteúdo, mas não consegui virar isso em sessões de estudo. Tente outro link, ou escreva o que você quer que ela treine.",
  },
  pedido: {
    motivo:
      "Não consegui montar um plano com esse pedido. Tente dizer o assunto e o que você quer que ela faça.",
    titulo: "Plano de estudos",
    semTarefa:
      "Não consegui virar esse pedido em tarefas. Tente dizer o assunto e o que você quer que ela faça.",
  },
};

/**
 * @param {object} cru — o JSON que a IA devolveu
 * @param {{aviso?:string|null, temMaterial?:boolean, temLink?:boolean}} [ctx]
 * @returns {object} a resposta 200 final
 */
export function sanear(cru, { aviso = null, temMaterial = true, temLink = false } = {}) {
  // A precedência é a mesma do prompt: a escola manda, depois o link, depois o pedido.
  const padrao = temMaterial ? PADROES.material : temLink ? PADROES.link : PADROES.pedido;

  if (!cru || cru.legivel === false) {
    return { legivel: false, motivo: cortar(cru?.motivo, 240) || padrao.motivo };
  }

  const brutas = Array.isArray(cru.tarefas) ? cru.tarefas : [];
  /**
   * O corte em 20 era silencioso, e com foto de uma folha isso nunca acontecia. Com
   * um PDF de 40 questões acontece no primeiro teste real — e o pai veria 20 tarefas
   * achando que eram todas. `truncado` é o que deixa a tela dizer a verdade.
   */
  const truncado = brutas.length > MAX_TAREFAS;

  const tarefas = brutas
    .slice(0, MAX_TAREFAS)
    .map((t) => ({
      titulo: cortar(t?.titulo, LIM.tarefaTitulo),
      detalhe: cortar(t?.detalhe, LIM.detalhe) || null,
      // Allowlist: qualquer valor fora das 14 canônicas é rebaixado em silêncio.
      materia: MATERIAS.includes(t?.materia) ? t.materia : "outros",
      // Validação puramente sintática, de propósito: uma data impossível
      // ("2026-02-31") é problema do pai revisar, uma string arbitrária é problema
      // nosso — e é essa que o banco recusaria.
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(t?.prazo) ? t.prazo : null,
      estimativa_min: grampear(t?.estimativa_min, 1, 600),
      /**
       * Sem confiança declarada assumimos BAIXA (0.5), não alta: o chip "confira"
       * aparecendo à toa custa um olhar do pai; faltando, custa uma tarefa errada
       * entrando no plano sem ninguém conferir.
       */
      confianca: grampear(t?.confianca, 0, 1) ?? 0.5,
    }))
    .filter((t) => t.titulo);

  // Sem nenhum título legível, o "legível" que a IA declarou não se sustenta.
  if (!tarefas.length) {
    return { legivel: false, motivo: padrao.semTarefa };
  }

  return {
    legivel: true,
    titulo: cortar(cru.titulo, LIM.titulo) || padrao.titulo,
    conteudo: cortar(cru.conteudo, LIM.conteudo),
    // Fallback pra matéria da primeira tarefa (e não "outros"): se a IA classificou
    // as tarefas, ela já disse do que o plano trata.
    foco: MATERIAS.includes(cru.foco) ? cru.foco : tarefas[0].materia,
    duracao_dias: grampear(cru.duracao_dias, 1, 365) ?? 7,
    extraido_texto: cortar(cru.extraido_texto, LIM.extraido),
    tarefas,
    truncado,
    aviso: aviso || null,
  };
}
