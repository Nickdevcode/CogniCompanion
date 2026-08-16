/**
 * _lib/http.mjs — Saída HTTP e `fetch` com teto de tempo.
 *
 * A pasta `_lib` começa com `_` de propósito: a Vercel **ignora** arquivos e
 * diretórios prefixados com `_` dentro de `api/`, então nada aqui vira rota pública.
 * Sem isso, cada helper viraria um endpoint que responde 500 e consumiria uma das
 * funções do plano Hobby.
 */

/** Teto de espera do Supabase (auth + REST). Rápido ou nada. */
export const TIMEOUT_SUPABASE_MS = 8_000;

/** Teto de espera da visão. `detail: high` em 4 páginas é lento. */
export const TIMEOUT_IA_MS = 45_000;

/** Teto da transcrição. Áudio de 10 min leva bem mais que uma chamada de chat. */
export const TIMEOUT_TRANSCRICAO_MS = 90_000;

/**
 * Erro que já sabe virar resposta HTTP.
 *
 * A mensagem é escrita PRO PAI e vai crua pro cliente — então nunca ponha detalhe de
 * infraestrutura aqui. O que vem da OpenAI ou do Postgres fica no `console.error`.
 */
export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** Resposta JSON curta. Toda saída da função passa por aqui. */
export function responder(res, status, corpo) {
  res.status(status).json(corpo);
}

/**
 * `fetch` com teto de tempo. Sem isto, um Supabase lento seguraria a função até o
 * limite da plataforma e o pai ficaria olhando um spinner sem fim.
 */
export async function buscar(url, opcoes = {}, ms = TIMEOUT_SUPABASE_MS) {
  return fetch(url, { ...opcoes, signal: AbortSignal.timeout(ms) });
}
