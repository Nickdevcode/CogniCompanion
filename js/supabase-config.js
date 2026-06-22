/**
 * supabase-config.js — Inicialização do cliente Supabase + helpers de auth.
 *
 * IMPORTANTE — sobre a "anon key":
 *   Este é um site 100% estático. A chave abaixo é a chave PÚBLICA (anon/public)
 *   do Supabase: ela é projetada para ficar exposta no front-end e NÃO é um
 *   segredo. A segurança real vem do RLS (Row Level Security) configurado no
 *   banco e do próprio Supabase Auth. A chave secreta (service_role) NUNCA deve
 *   aparecer aqui. Doc: https://supabase.com/docs/guides/api/api-keys
 *
 * Carregamento (definido nos HTMLs, nesta ordem):
 *   1) CDN do @supabase/supabase-js (expõe window.supabase)
 *   2) este arquivo (cria window.cognifyAuth)
 *   3) toast.js, session.js, auth.js
 *
 * Expõe `window.cognifyAuth` com o client e helpers reutilizados pelos demais
 * scripts, pra centralizar a lógica de sessão num lugar só.
 */

(function () {
  "use strict";

  // ⬇️ PREENCHER com os valores do seu projeto (Supabase → Project Settings → API).
  //    A URL tem o formato https://xxxxxxxx.supabase.co
  //    A anon key é o "Project API key" do tipo `anon` `public` (um JWT longo).
  const SUPABASE_URL = "https://jntegbvnhbhcqrfgkvay.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudGVnYnZuaGJoY3FyZmdrdmF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjAzNjIsImV4cCI6MjA5NzYzNjM2Mn0.jx5cA1SMFscnOoLPZ99c3yIuXZKpIFyyhReYW5DuHv8";

  const isConfigured =
    SUPABASE_URL.indexOf("http") === 0 &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY.indexOf("COLE_AQUI") === -1;

  // Sem o SDK da CDN não há o que inicializar (ex.: CDN bloqueada/offline).
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "[Cognify] SDK do Supabase não carregou. Verifique a tag <script> da CDN."
    );
  }

  // Avisa de forma clara enquanto as credenciais não foram coladas, em vez de
  // estourar um erro críptico na primeira chamada de login.
  if (!isConfigured) {
    console.warn(
      "[Cognify] Supabase ainda não configurado: preencha SUPABASE_URL e " +
        "SUPABASE_ANON_KEY em js/supabase-config.js."
    );
  }

  const client =
    isConfigured && window.supabase
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            // Mantém o usuário logado entre reloads/abas e renova o token sozinho.
            persistSession: true,
            autoRefreshToken: true,
            // Lê tokens devolvidos na URL pelo OAuth (login com Google).
            detectSessionInUrl: true,
          },
        })
      : null;

  /**
   * Extrai um nome de exibição amigável (só o primeiro nome) a partir dos
   * metadados do usuário; cai pro trecho antes do "@" do e-mail se não houver
   * nome cadastrado (ex.: contas antigas ou alguns provedores OAuth).
   * @param {object|null} user — objeto `user` do Supabase
   * @returns {string}
   */
  function firstName(value) {
    if (value && typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed.split(/\s+/)[0];
    }
    return "";
  }

  // Nome a partir dos metadados da sessão (síncrono). Usado como fallback
  // imediato enquanto o nome "oficial" da tabela responsaveis ainda não chegou.
  function getDisplayName(user) {
    if (!user) return "";
    const meta = user.user_metadata || {};
    const fromMeta = firstName(
      meta.full_name || meta.name || meta.user_name || meta.preferred_username
    );
    if (fromMeta) return fromMeta;
    if (user.email) return user.email.split("@")[0];
    return "Conta";
  }

  /**
   * Nome "oficial" do usuário (assíncrono): lê o `nome` da tabela `responsaveis`
   * (a fonte única do projeto — espelha `auth.users`, populada pelo trigger do
   * banco a partir do `full_name` enviado no cadastro). Guarda o nome do PRIMEIRO
   * cadastro e não é sobrescrito quando uma conta Google é linkada depois (o
   * trigger usa `on conflict do nothing`). Se a linha não existir/responder, cai
   * para o nome dos metadados da sessão.
   * @param {object|null} user
   * @returns {Promise<string>}
   */
  async function getProfileName(user) {
    if (!user) return "";
    if (client) {
      try {
        const { data, error } = await client
          .from("responsaveis")
          .select("nome")
          .eq("id", user.id)
          .maybeSingle();
        if (!error && data) {
          const fromProfile = firstName(data.nome);
          if (fromProfile) return fromProfile;
        }
      } catch (e) {
        /* rede/RLS indisponível: usa o fallback abaixo */
      }
    }
    return getDisplayName(user);
  }

  /**
   * Retorna o usuário logado atual (ou null). Usa getSession() porque é
   * síncrono com o cache local — rápido o bastante pra renderizar o header.
   * @returns {Promise<object|null>}
   */
  async function getUser() {
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      return (data && data.session && data.session.user) || null;
    } catch (e) {
      console.error("[Cognify] Erro ao obter sessão:", e);
      return null;
    }
  }

  /**
   * Decide se um erro do `getUser()` significa que a SESSÃO É INVÁLIDA de fato
   * (token revogado, usuário deletado no servidor) e não apenas uma falha
   * transitória de rede. Só o primeiro caso deve deslogar o usuário.
   *
   * A SDK do Supabase classifica:
   *   - `AuthApiError`  → o servidor respondeu rejeitando o token (status 401/403,
   *     códigos como `user_not_found`, `session_not_found`, `bad_jwt`). Sessão morta.
   *   - `AuthRetryableFetchError` → falha de fetch/offline/503 (GoTrue indisponível).
   *     Transitório: NÃO deslogar, ou o usuário cai fora a cada piscada de wi-fi.
   * (Doc: https://supabase.com/docs/guides/auth/debugging/error-codes)
   *
   * Checamos por `name`/`status` em vez de `instanceof` porque a SDK chega via
   * bundle UMD e as classes de erro não são expostas em `window` de forma estável.
   * @param {any} error — o `error` retornado por `client.auth.getUser()`
   * @returns {boolean} true se a sessão deve ser encerrada
   */
  function isSessionInvalid(error) {
    if (!error) return false;
    const name = error.name || "";
    const status = Number(error.status) || 0;
    // Erro de rede/serviço indisponível → transitório, mantém a sessão.
    if (name === "AuthRetryableFetchError") return false;
    // Rejeição explícita do servidor de auth → sessão inválida.
    if (status === 401 || status === 403) return true;
    if (name === "AuthApiError" || name === "AuthSessionMissingError") return true;
    // Desconhecido (ex.: sem `status`): trata como transitório por segurança,
    // pra nunca expulsar o usuário com base num erro que não soubemos ler.
    return false;
  }

  /**
   * Valida a sessão CONTRA O SERVIDOR. Diferente de `getUser()` acima (que lê só
   * o cache local e por isso continua "logado" mesmo após a conta ser excluída no
   * Supabase), este chama `client.auth.getUser()` da SDK, que faz uma requisição
   * de rede e valida o JWT no servidor de auth.
   *
   * - Sucesso → devolve o usuário autêntico.
   * - Sessão inválida (conta deletada/token revogado) → limpa o token morto do
   *   cache com `signOut()` e devolve `null`. É o sinal para deslogar a UI.
   * - Falha transitória de rede → devolve o usuário do cache (se houver), pra não
   *   deslogar à toa quando a internet oscila; a próxima revalidação tenta de novo.
   *
   * @returns {Promise<object|null>} o usuário validado, ou null se a sessão morreu.
   */
  async function validateUser() {
    if (!client) return null;
    try {
      const { data, error } = await client.auth.getUser();
      if (error) {
        if (isSessionInvalid(error)) {
          // Token morto no cache: remove pra parar de "parecer logado".
          try {
            await client.auth.signOut();
          } catch (e) {
            /* mesmo se o signOut falhar, devolvemos null: a UI desloga */
          }
          return null;
        }
        // Erro transitório (offline/503): preserva o estado atual do cache.
        return await getUser();
      }
      return (data && data.user) || null;
    } catch (e) {
      // Exceção inesperada: não desloga por isso; mantém o que o cache souber.
      console.debug("[Cognify] validateUser: erro não-fatal, mantendo sessão.", e);
      return await getUser();
    }
  }

  /** Encerra a sessão atual. @returns {Promise<{error: any}>} */
  async function signOut() {
    if (!client) return { error: new Error("Supabase não configurado") };
    return client.auth.signOut();
  }

  window.cognifyAuth = {
    client: client,
    isConfigured: isConfigured,
    getClient: function () {
      return client;
    },
    getUser: getUser,
    validateUser: validateUser,
    signOut: signOut,
    getDisplayName: getDisplayName,
    getProfileName: getProfileName,
  };
})();
