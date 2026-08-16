/**
 * _lib/auth.mjs — As travas que protegem a chave da OpenAI.
 *
 * Este é um endpoint PÚBLICO que gasta dinheiro. Sem o que está aqui, quem descobrir
 * a URL torra a conta. As três travas são, em ordem:
 *
 * 2. o JWT do pai é validado **no servidor** (nunca confiar num id vindo no corpo);
 * 3. ele tem que ter criança pareada — e quem confere é a RLS, não a gente;
 * 4. cota de 20 gerações por dia por criança, sem infra nova.
 *
 * (A trava 1 é "só POST" e vive no handler; a 5 é o tamanho, em `itens.mjs`; a 6 é
 * "erro da OpenAI nunca vaza", no `catch` do handler.)
 */

import { buscar, ErroHttp } from "./http.mjs";

/** Cota diária de geração por criança. Rate limit sem KV e sem tabela nova. */
const MAX_POR_DIA = 20;

/**
 * As origens que contam pra cota.
 *
 * 🔴 Até a rodada 2 isto era `origem=eq.foto`, e era o erro silencioso mais provável
 * da mudança: PDF, áudio e vídeo ficariam **fora da conta** e o teto de 20/dia
 * existiria só no papel. Todo valor novo de `planos_estudo.origem` que nasça de IA
 * precisa entrar aqui — foi o caso de `pedido` (16/ago/2026), o plano que a mãe pede
 * por escrito sem mandar material. Ele é a chamada mais barata de todas e por isso a
 * mais fácil de repetir sem perceber: fora daqui, o teto não existiria pra ela.
 *
 * ⭐ `link` (rodada 3) entra pelo mesmo motivo E por um a mais: é a única origem que
 * também gasta a NOSSA saída de rede (`/api/ler-link` busca a URL). Fora desta lista, o
 * teto diário não valeria justamente pra fonte que uma conta válida usaria pra virar
 * scraper.
 */
const ORIGENS_DE_IA = ["foto", "arquivo", "audio", "video", "pedido", "link"];

/**
 * Trava 2 — valida o token do pai contra o Supabase.
 *
 * Nunca confiar num user id vindo no corpo: ele é escrito por quem chama.
 *
 * @param {string} token
 * @param {{SUPABASE_URL:string, SUPABASE_ANON_KEY:string}} env
 * @returns {Promise<string>} o `auth.uid()`
 */
export async function validarSessao(token, env) {
  if (!token) {
    throw new ErroHttp(401, "Entre na sua conta pra criar um plano com a Cogni.");
  }

  let uid;
  try {
    const r = await buscar(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) throw new ErroHttp(401, "Sua sessão expirou. Entre de novo.");
    uid = (await r.json())?.id;
  } catch (err) {
    if (err instanceof ErroHttp) throw err;
    console.error("[api] Falha ao validar a sessão:", err);
    throw new ErroHttp(502, "Não consegui confirmar seu login agora.");
  }

  if (!uid) throw new ErroHttp(401, "Sua sessão expirou. Entre de novo.");
  return uid;
}

/**
 * Trava 3 — confirma que existe criança pareada.
 *
 * A consulta usa o token DELE, então é a RLS que faz o trabalho: um responsável não
 * consegue ler a criança de outra família nem que queira.
 *
 * @returns {Promise<{id:string, nome:string, idade:number|null, serie:string|null}>}
 */
export async function criancaPareada(token, uid, env) {
  let crianca;
  try {
    const r = await buscar(
      `${env.SUPABASE_URL}/rest/v1/criancas?responsavel_id=eq.${encodeURIComponent(uid)}` +
        `&select=id,nome,idade,serie&limit=1`,
      { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } }
    );
    crianca = (await r.json())?.[0];
  } catch (err) {
    console.error("[api] Falha ao ler a criança:", err);
    throw new ErroHttp(502, "Não consegui carregar o perfil agora.");
  }

  if (!crianca) {
    throw new ErroHttp(
      403,
      "Pareie o robô com o perfil da criança antes de criar um plano."
    );
  }
  return crianca;
}

/**
 * Trava 4 — cota do dia.
 *
 * ⚠️ Ela conta planos SALVOS, não gerações: um pai que gera e descarta não incrementa
 * nada. Isso é uma limitação conhecida e aceita — protege o banco de encher, não a
 * fatura de um retry em laço. A superfície é uma família logada e pareada, então o
 * risco real é acidente, não ataque. Contar gerações exigiria KV ou tabela nova, que
 * é justamente a infra que a feature decidiu não ter.
 *
 * Falha de rede aqui é **fail-open** de propósito: as travas que protegem de verdade
 * (2 e 3) já passaram, e derrubar a feature porque a CONTAGEM não respondeu seria
 * trocar um problema pequeno por um grande.
 */
export async function dentroDaCota(token, criancaId, env) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const r = await buscar(
      `${env.SUPABASE_URL}/rest/v1/planos_estudo?crianca_id=eq.${encodeURIComponent(criancaId)}` +
        `&origem=in.(${ORIGENS_DE_IA.join(",")})` +
        `&criado_em=gte.${encodeURIComponent(desde)}&select=id`,
      { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } }
    );
    const linhas = await r.json();
    if (Array.isArray(linhas) && linhas.length >= MAX_POR_DIA) {
      throw new ErroHttp(
        429,
        `Você já criou ${MAX_POR_DIA} planos com a Cogni hoje; tente de novo amanhã.`
      );
    }
  } catch (err) {
    if (err instanceof ErroHttp) throw err;
    console.warn("[api] Não consegui contar a cota (seguindo):", err);
  }
}
