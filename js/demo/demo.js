/**
 * demo.js — Modo demonstração do painel (login fake + painel cheio, sem rede).
 *
 * PARA QUE EXISTE
 *   Existe uma situação em que o Cogni precisa ser avaliado sem o Cogni: uma
 *   aula em que o professor abre a URL da Vercel pra julgar o SITE — design,
 *   navegação, telas — sem robô pra parear, sem conta no Supabase Auth e sem
 *   estar na LAN de casa. No fluxo real, esse visitante não passa do login; e se
 *   passasse, veria seis telas vazias. O modo demo é a resposta a isso.
 *
 * COMO LIGA
 *   Não há tela nova. É o MESMO formulário de login: se o par digitado bater com
 *   as credenciais fixas abaixo, `js/auth.js` chama `ligar()` daqui e navega pro
 *   painel; qualquer outro par segue o caminho real de sempre, intocado.
 *
 * O QUE MUDA QUANDO ESTÁ LIGADO (os três — e só os três — pontos de enxerto)
 *   1. Aqui: `window.cognifyAuth` vira um stub que devolve um responsável fixo e
 *      cujo `getClient()` é `null`. Isso sozinho já apaga o Supabase inteiro —
 *      auth, select, RLS e Realtime —, porque tudo no painel passa por ele.
 *   2. `mock-data.js`: `USAR_SUPABASE` nasce `false`, então a camada de dados
 *      serve o mock em memória que já existia (o mesmo que enche as telas na
 *      demonstração offline), e as escritas viram cópias em memória.
 *   3. `servidor.js`: `SERVIDOR_URL` nasce vazio, que é como o site já diz "o
 *      robô está fora de alcance" — mata a ponte HTTP local (Dica, Resumo, rosto
 *      ao vivo, ping de planos) sem inventar um caminho novo.
 *
 *   O resto do painel não sabe que o modo existe, e é de propósito: nenhum
 *   `if (demo)` espalhado por dentro das telas.
 *
 * ISOLAMENTO
 *   O estado mora em `sessionStorage` (morre com a aba) e some no logout. Um
 *   responsável real logado nunca cai aqui: o curto-circuito só acontece no
 *   formulário de login, e só pra este par de credenciais.
 *
 * CARREGAMENTO
 *   Script clássico, logo DEPOIS de `supabase-config.js` (que cria o
 *   `window.cognifyAuth` real) e ANTES de `session.js` / `dashboard/main.js`
 *   (que já o consomem). Está nas 7 páginas pra o header ficar coerente também
 *   no site público.
 */

(function () {
  "use strict";

  /* ====================================================================
     Credenciais fixas
     ==================================================================== */

  /** Único e-mail aceito. Comparado com `trim()` + caixa baixa (e-mail é
   *  case-insensitive de verdade, então normalizar aqui é correto, não folga). */
  const EMAIL_DEMO = "testecogni@gmail.com";

  /**
   * Senhas aceitas — as duas grafias do mesmo segredo.
   *
   * ⚠️ NÃO "conserte" isto pra uma só. Não é relaxamento de segurança: esta
   * credencial é fake e está hardcoded no bundle, não protege nada. Aceitar as
   * duas caixas existe porque o par foi ditado oscilando entre elas, e digitar
   * "Cogni1234" na frente de uma turma não pode dar "senha incorreta".
   */
  const SENHAS_DEMO = ["cogni1234", "Cogni1234"];

  /** Chave do estado. `sessionStorage`: nada do demo sobrevive à aba. */
  const CHAVE = "cognify-demo";

  /**
   * O responsável da demonstração. Espelha de propósito a linha `responsavel`
   * de `js/dashboard/mock-data.js` (mesmo id, mesmo nome) — é a MESMA pessoa
   * fictícia que as Configurações mostram, e um id divergente separaria coisas
   * que a tela apresenta como uma só (ex.: a marca de "já viu o tutorial").
   */
  const ID_RESPONSAVEL = "00000000-0000-0000-0000-000000000001";
  const NOME_RESPONSAVEL = "Marina Carvalho";
  const PRIMEIRO_NOME = "Marina";

  /* ====================================================================
     Estado
     ==================================================================== */

  /** @returns {boolean} o modo demo está ligado nesta aba? */
  function ativo() {
    try {
      return sessionStorage.getItem(CHAVE) === "1";
    } catch (e) {
      // sessionStorage bloqueado (modo privado estrito): sem estado, sem demo.
      return false;
    }
  }

  /** Liga o modo demo. Quem chama é o formulário de login. */
  function ligar() {
    try {
      sessionStorage.setItem(CHAVE, "1");
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Marcas que o painel deixa em `localStorage` — e que, ao contrário do estado
   * acima, sobreviveriam à aba. A do tutorial é por id de usuário, então a da
   * demonstração é sempre a mesma; a de pendente é global, mas só o pareamento
   * a escreve (e pareamento não acontece aqui).
   */
  const MARCAS_PERSISTENTES = [
    "cognify-tour-visto:" + ID_RESPONSAVEL,
    "cognify-tour-pendente",
  ];

  /**
   * Desliga e apaga TODO o rastro. Chamado pelo `signOut()` do stub.
   *
   * Limpa também as marcas de `localStorage`: sem isso, o tutorial guiado abriria
   * só na primeira apresentação e ficaria mudo nas seguintes — e a demonstração
   * precisa começar igual toda vez. Nada aqui toca a preferência de tema, que é
   * do aparelho e não da conta.
   */
  function desligar() {
    try {
      sessionStorage.removeItem(CHAVE);
    } catch (e) {
      /* nada a limpar se o storage não abre */
    }
    try {
      MARCAS_PERSISTENTES.forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {
      /* idem */
    }
  }

  /**
   * O par digitado é o da demonstração?
   * @param {string} email
   * @param {string} senha
   * @returns {boolean}
   */
  function credenciaisConferem(email, senha) {
    const digitado = String(email || "").trim().toLowerCase();
    return digitado === EMAIL_DEMO && SENHAS_DEMO.indexOf(String(senha)) !== -1;
  }

  /* ====================================================================
     O stub de autenticação
     ==================================================================== */

  /**
   * Usuário fabricado no formato que a SDK do Supabase devolve — é o que
   * `session.js` e `dashboard/main.js` esperam receber. Não há token nenhum
   * aqui: nada neste modo faz request autenticado.
   */
  const USUARIO_DEMO = {
    id: ID_RESPONSAVEL,
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL_DEMO,
    user_metadata: { full_name: NOME_RESPONSAVEL },
    app_metadata: { provider: "demo" },
    created_at: "2026-04-02T13:20:00-03:00",
  };

  /**
   * Substitui `window.cognifyAuth` pela versão de demonstração.
   *
   * A assinatura é a mesma do original (`js/supabase-config.js`), com duas
   * diferenças que fazem todo o trabalho:
   *   • `getClient()` devolve `null` — e é isso que desliga o Realtime da Mesa,
   *     a escrita com IA e qualquer `from(...)` da camada de dados. Todos os
   *     consumidores já tratam esse `null` (o caminho existia pra quando o
   *     Supabase não está configurado).
   *   • `validateUser()` não vai à rede: devolve o responsável fixo. É o que
   *     faz o guard do painel abrir a porta sem um único request.
   */
  function instalarStub() {
    window.cognifyAuth = {
      client: null,
      // `true` de propósito: não há nada pra configurar aqui, e `false` faria o
      // site anunciar "autenticação não configurada" numa demo que funciona.
      isConfigured: true,
      getClient: function () {
        return null;
      },
      getUser: async function () {
        return USUARIO_DEMO;
      },
      validateUser: async function () {
        return USUARIO_DEMO;
      },
      signOut: async function () {
        desligar();
        // Volta pro login já sem o estado do demo. `replace` (e não `href`) pra
        // o "voltar" do navegador não reabrir um painel que não tem mais sessão.
        window.location.replace("login.html");
        return { error: null };
      },
      // Os dois devolvem o PRIMEIRO nome, como os originais fazem.
      getDisplayName: function () {
        return PRIMEIRO_NOME;
      },
      getProfileName: async function () {
        return PRIMEIRO_NOME;
      },
    };
  }

  /* ==================================================================== */

  window.cognifyDemo = {
    ativo: ativo,
    ligar: ligar,
    desligar: desligar,
    credenciaisConferem: credenciaisConferem,
  };

  // Ponto de entrada único: se a aba está em demonstração, o stub entra no lugar
  // do auth real ANTES de qualquer consumidor rodar.
  if (ativo()) instalarStub();
})();
