/**
 * supabase-data.js — Implementação REAL da camada de dados do painel.
 *
 * Espelha 1:1 a API do mock-data.js (mesmas funções, mesmas assinaturas e o
 * MESMO shape de retorno, em snake_case), mas lê/escreve no Supabase via
 * `window.cognifyAuth.getClient()`. Trocar o mock por isto NÃO exige mudar
 * nenhuma seção do painel — é essa a razão de manter os contratos idênticos.
 *
 * Regras do contrato (docs/COMPANION-PLANO-TECNICO.md):
 *   - Single-child: o pai enxerga UMA criança (a pareada por código). A query
 *     filtra por `responsavel_id = auth.uid()` e a RLS garante o isolamento.
 *   - `conversas` é READ-ONLY pelo site (a RLS bloqueia escrita; quem grava é o
 *     servidor). Aqui só há SELECT.
 *   - `planos_estudo`: CRUD direto (anon key + RLS). `responsavel_id` é NOT NULL
 *     no banco → sempre enviar o `auth.uid()` ao criar.
 *   - O pareamento (setar `responsavel_id`) NUNCA acontece aqui: é só pelo
 *     endpoint do servidor (service_role). Ver onboarding.js.
 *
 * Erros: as funções de leitura lançam em falha real de query (o router do painel
 * já trata exibindo a tela de erro). `getCrianca` devolve `null` quando não há
 * criança pareada — é um estado válido (dispara o onboarding), não um erro.
 */

/** Cliente Supabase compartilhado (criado em js/supabase-config.js). */
function client() {
  const c = window.cognifyAuth && window.cognifyAuth.getClient();
  if (!c) {
    throw new Error(
      "Supabase não está configurado (window.cognifyAuth.getClient() vazio)."
    );
  }
  return c;
}

/** Usuário logado (responsável). Lança se não houver sessão — o painel é privado. */
async function currentUser() {
  const user = window.cognifyAuth && (await window.cognifyAuth.getUser());
  if (!user) throw new Error("Sem sessão ativa.");
  return user;
}

/**
 * Linha do responsável logado (tabela `responsaveis`). A RLS garante que só
 * volta a própria linha. Cai num objeto mínimo (id/nome dos metadados) se a
 * linha ainda não existir — não deve acontecer (o trigger cria no signup), mas
 * evita quebrar a tela de Configurações.
 * @returns {Promise<object>}
 */
export async function getResponsavel() {
  const user = await currentUser();
  const { data, error } = await client()
    .from("responsaveis")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  // Fallback defensivo: monta a partir da sessão.
  return {
    id: user.id,
    nome:
      (window.cognifyAuth && window.cognifyAuth.getDisplayName(user)) ||
      (user.email ? user.email.split("@")[0] : "Responsável"),
    email: user.email || "",
    criado_em: user.created_at || null,
  };
}

/**
 * Cache curto da criança pareada.
 *
 * Toda leitura daqui precisa do id da criança, e cada seção dispara várias de
 * uma vez (o Início chama conversas + planos + dica + resumo). Sem cache, cada
 * uma refazia o mesmo SELECT em `criancas`: 8 requisições onde 5 bastam.
 *
 * O TTL é curto DE PROPÓSITO. O perfil muda por fora do site — o robô grava
 * memórias e a trilha de aprendizado (`progresso`) a cada conversa —, então uma
 * tela aberta depois tem que enxergar o dado novo. Aqui o cache só coalesce as
 * chamadas de um mesmo render.
 */
const TTL_CRIANCA_MS = 10000;

/** @type {{promessa: Promise<object|null>, gravadaEm: number}|null} */
let criancaCache = null;

/** Descarta o cache (após escrever no perfil, pra reler o estado real). */
function invalidarCacheCrianca() {
  criancaCache = null;
}

/** O SELECT de verdade — sem cache. */
async function buscarCrianca() {
  const user = await currentUser();
  const { data, error } = await client()
    .from("criancas")
    .select("*")
    .eq("responsavel_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Criança pareada ao responsável logado (single-child). A RLS só devolve a
 * criança vinculada a ele. Resultado compartilhado por até `TTL_CRIANCA_MS`.
 * @returns {Promise<object|null>} a criança, ou `null` se ainda não pareou
 *   (estado que dispara o onboarding de pareamento).
 */
export async function getCrianca() {
  const agora = Date.now();
  if (criancaCache && agora - criancaCache.gravadaEm < TTL_CRIANCA_MS) {
    return criancaCache.promessa;
  }
  const promessa = buscarCrianca();
  criancaCache = { promessa, gravadaEm: agora };
  // Falha não pode ficar grudada no cache (o painel ficaria "quebrado" por 10s
  // depois de uma piscada de rede): a próxima chamada tenta de novo.
  promessa.catch(() => {
    if (criancaCache && criancaCache.promessa === promessa) invalidarCacheCrianca();
  });
  return promessa;
}

/**
 * Conversas da criança pareada (o Diário), mais recentes primeiro. READ-ONLY.
 * Equivale a:
 *   from('conversas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getConversas() {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("conversas")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Planos de estudo da criança pareada.
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getPlanos() {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("planos_estudo")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Histórico das "Dicas da Cogni" da criança pareada (tela Aprendizado), mais
 * recentes primeiro. READ-ONLY: o servidor grava cada dica gerada; o site só lê.
 * Equivale a:
 *   from('dicas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false })
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getDicas() {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("dicas")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Último Resumo Semanal salvo da criança pareada (tabela `resumos_semanais`).
 * READ-ONLY: o servidor grava cada resumo gerado (service_role); o site só lê.
 * Serve de fonte ESTÁVEL pro card de Resumo da Semana — mostra o último bilhete
 * mesmo com o robô offline, enquanto o endpoint /api/resumo-semanal atualiza
 * quando há conversa nova. Equivale a:
 *   from('resumos_semanais').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false }).limit(1)
 * @returns {Promise<object|null>} o resumo mais recente, ou `null` se ainda não
 *   há nenhum (criança nunca conversou / servidor nunca gerou).
 */
export async function getResumoSemanal() {
  const crianca = await getCrianca();
  if (!crianca) return null;
  const { data, error } = await client()
    .from("resumos_semanais")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Dica ATUAL da criança pareada: a linha mais recente da tabela `dicas`. READ-ONLY
 * (o servidor grava cada dica gerada; o site só lê). Serve de fonte ESTÁVEL pro
 * destaque "Dica de agora" — aparece mesmo com o robô offline, enquanto o endpoint
 * /api/dica refresca quando há conversa nova. Equivale a:
 *   from('dicas').select('*').eq('crianca_id', id)
 *     .order('criado_em', { ascending: false }).limit(1)
 * @returns {Promise<object|null>} a dica mais recente, ou `null` se a tabela ainda
 *   está vazia pra essa criança (nenhuma dica jamais gerada → fallback amigável).
 */
export async function getDicaAtual() {
  const crianca = await getCrianca();
  if (!crianca) return null;
  const { data, error } = await client()
    .from("dicas")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Sessões de atenção da criança pareada — o histórico do Mapa de Compreensão da
 * Aula, mais recentes primeiro. READ-ONLY: quem grava é o servidor (service_role),
 * ao encerrar cada aula. Equivale a:
 *   from('sessoes_atencao').select('*').eq('crianca_id', id)
 *     .order('iniciada_em', { ascending: false }).limit(n)
 *
 * Fonte ESTÁVEL do Mapa: as aulas anteriores aparecem mesmo com o robô desligado,
 * e continuam na tela durante uma aula ao vivo (nessa hora o endpoint do servidor
 * devolve `historico: []`, porque prioriza a sessão em RAM).
 *
 * @param {number} [limite=10]
 * @returns {Promise<Array<object>>} (vazio se não há criança pareada)
 */
export async function getSessoesAtencao(limite = 10) {
  const crianca = await getCrianca();
  if (!crianca) return [];
  const { data, error } = await client()
    .from("sessoes_atencao")
    .select("*")
    .eq("crianca_id", crianca.id)
    .order("iniciada_em", { ascending: false })
    .limit(Math.min(Math.max(1, Number(limite) || 10), 50));
  if (error) throw error;
  return data || [];
}

/* ==========================================================================
   Escrita — Planos (CRUD) e perfil da criança. Conversas NÃO entram (RLS).
   ========================================================================== */

/**
 * Cria um plano. Só os 5 campos do contrato + as FKs. `responsavel_id` é NOT
 * NULL no banco → sempre o `auth.uid()`. `crianca_id` vem da criança pareada.
 * @param {object} dados — { titulo, conteudo, foco, duracao_dias, status }
 * @returns {Promise<object>} o plano criado (linha completa)
 */
export async function criarPlano(dados) {
  const user = await currentUser();
  const crianca = await getCrianca();
  if (!crianca) throw new Error("Sem criança pareada para criar o plano.");

  const payload = {
    crianca_id: crianca.id,
    responsavel_id: user.id, // NOT NULL — sempre o dono logado
    titulo: dados.titulo || "Novo plano",
    conteudo: dados.conteudo || "",
    foco: dados.foco || "outros",
    duracao_dias: Number(dados.duracao_dias) || 0,
    status: dados.status || "ativo",
  };
  const { data, error } = await client()
    .from("planos_estudo")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Atualiza um plano existente. A RLS garante que só dá pra editar planos dos
 * próprios filhos. `crianca_id`/`responsavel_id` não são alterados aqui.
 * @param {number} id
 * @param {object} patch — { titulo, conteudo, foco, duracao_dias, status }
 * @returns {Promise<object|null>} o plano atualizado, ou null se nada bateu
 */
export async function atualizarPlano(id, patch) {
  const campos = {};
  for (const k of ["titulo", "conteudo", "foco", "duracao_dias", "status"]) {
    if (k in patch) campos[k] = patch[k];
  }
  if ("duracao_dias" in campos) {
    campos.duracao_dias = Number(campos.duracao_dias) || 0;
  }
  // O servidor do robô desempata planos vigentes por `atualizado_em`. Sem trigger
  // `moddatetime` no banco a coluna ficaria parada, então o site a escreve aqui.
  campos.atualizado_em = new Date().toISOString();
  const { data, error } = await client()
    .from("planos_estudo")
    .update(campos)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Remove um plano. A RLS impede apagar plano de outro responsável.
 * @param {number} id
 * @returns {Promise<boolean>} true se removeu
 */
export async function removerPlano(id) {
  const { error, count } = await client()
    .from("planos_estudo")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * Atualiza o perfil da criança pareada (infos editáveis + prompt_personalizado).
 * NUNCA escreve `responsavel_id` nem `codigo_pareamento` (protegidos: o vínculo
 * é só via servidor). A RLS garante que o pai só edita os próprios filhos.
 * @param {object} patch — campos editáveis de `criancas`
 * @returns {Promise<object>} a criança atualizada
 */
export async function atualizarCrianca(patch) {
  const crianca = await getCrianca();
  if (!crianca) throw new Error("Sem criança pareada para editar.");

  // Allowlist dos campos que o pai pode editar pelo site (contrato).
  const EDITAVEIS = [
    "nome",
    "idade",
    "serie",
    "materia_favorita",
    "materia_dificil",
    "hobbies",
    "como_aprende",
    "estilo_linguagem",
    "prompt_personalizado",
    // Rosto do robô (jsonb). Quem escreve aqui é o editor da CRIANÇA, não o pai —
    // é o mesmo caminho de escrita porque é a mesma linha e a mesma RLS.
    "rosto_robo",
  ];
  const campos = {};
  for (const k of EDITAVEIS) if (k in patch) campos[k] = patch[k];

  const { data, error } = await client()
    .from("criancas")
    .update(campos)
    .eq("id", crianca.id)
    .select()
    .single();
  if (error) throw error;
  // O cache guarda a linha ANTES desta escrita — descarta pra próxima leitura
  // trazer o perfil salvo (e não o de antes de o pai editar).
  invalidarCacheCrianca();
  return data;
}
