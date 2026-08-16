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

/** Número dentro da faixa, ou `null` se não for número. */
function grampear(valor, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

const MOTIVO_PADRAO =
  "Não consegui ler esse material. Tente de novo com a folha inteira no quadro e boa luz.";

/**
 * @param {object} cru — o JSON que a IA devolveu
 * @param {string|null} [aviso] — recado do pipeline (ex.: o PDF ficou de fora)
 * @returns {object} a resposta 200 final
 */
export function sanear(cru, aviso = null) {
  if (!cru || cru.legivel === false) {
    return { legivel: false, motivo: cortar(cru?.motivo, 240) || MOTIVO_PADRAO };
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
    return {
      legivel: false,
      motivo: "Consegui ver o material, mas não achei nenhuma tarefa escrita nele.",
    };
  }

  return {
    legivel: true,
    titulo: cortar(cru.titulo, LIM.titulo) || "Atividades da escola",
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
