/**
 * mapa-api.js — Camada de dados do Mapa de Compreensão da Aula.
 *
 * Concentra TUDO que envolve buscar e sanear as sessões de atenção, pra a seção
 * (`sections/mapa.js`) cuidar só de desenhar. São duas fontes que se completam,
 * exatamente como no Resumo Semanal e na Dica:
 *
 *   1) Endpoint do servidor local — `GET {servidor}/api/mapa-aula?criancaId=…`
 *      → `{ emAndamento, sessao, historico[] }`. É a ÚNICA fonte da sessão que
 *      está acontecendo agora (ela vive em RAM no servidor e só vira linha no
 *      banco quando termina). É o que faz o modo ao vivo existir.
 *   2) Tabela `sessoes_atencao` (Supabase, RLS) — o histórico persistido. Pinta
 *      instantâneo e continua valendo com o robô desligado.
 *
 * Por que as duas, se o endpoint já devolve histórico? Porque ele devolve
 * `historico: []` justamente quando há sessão ao vivo (ver a rota no repo do
 * robô). Sem a tabela, as aulas anteriores sumiriam da tela exatamente durante a
 * demonstração ao vivo — o pior momento possível.
 *
 * ⚠️ Vocabulário (regra inegociável, a mesma da trilha de aprendizado): `sinal`
 * (`travada`/`confusa`) e `resultado` (`travou`) são dados INTERNOS e NUNCA vão
 * pra tela. O que se mostra é o `rotulo`, que o servidor já manda pronto em
 * linguagem de apoio. Aqui eles são preservados só pra escolher a cor do
 * marcador — nunca pra renderizar.
 *
 * 🩺 Reforma de confiabilidade do Mapa (ago/2026). O motor do robô tinha seis
 * defeitos que faziam o mapa AFIRMAR o que os dados não sustentavam ("travou em
 * frações" 44 min depois de frações sair da mesa). Todos corrigidos no servidor,
 * e o efeito aqui é uma regra nova, de uma linha só:
 *
 *     este arquivo NÃO CALCULA NENHUM DERIVADO. Ele sanea o que o servidor manda.
 *
 * O `pontoDeAtrito` tinha uma cópia da regra aqui, como fallback pra tabela. Ela
 * FOI DELETADA: o critério do servidor inverteu (a câmera saiu da frente e foi
 * pro fim, e só entra se corroborada por outra fonte no mesmo assunto) e passou a
 * depender de `confianca` e `superado` — dois campos que exigem agrupar tópico
 * com a mesma chave de conceito da trilha de aprendizado do robô. Replicar isso
 * no front seria recriar a normalização inteira; replicar pela metade seria
 * reintroduzir, calada, exatamente a leitura errada que a reforma removeu.
 *
 * Onde não há derivado (a tabela lida via RLS), a saída é `derivadosDisponiveis:
 * false` e a tela mostra a linha do tempo SEM cabeçalho conclusivo. Um ponto de
 * atrito com a regra velha é pior que nenhum.
 *
 * 🚫 E nada aqui é cacheado, de propósito: `pontoDeAtrito`, `assuntoMaisDificil`
 * e `qualidade` são RECALCULADOS pelo servidor a cada leitura — é assim que uma
 * aula gravada antes da reforma para de repetir a leitura errada de ontem. O
 * mesmo id de sessão pode devolver derivados diferentes depois de uma mudança no
 * robô. Cachear `momentos` seria seguro; cachear derivado, não. Se um dia entrar
 * cache nesta camada, ele tem que parar nos `momentos`.
 */

/** Quantas sessões anteriores buscar (o endpoint aceita até 50; 10 é o default). */
const LIMITE_HISTORICO = 10;

/**
 * Teto de espera pelo servidor local — o MESMO de `servidor.js` e `rosto-api.js`.
 *
 * 🔴 Estas duas chamadas eram as únicas do painel sem teto, e o Mapa é a seção que
 * mais sofre com isso: o primeiro `carregarMapa()` BLOQUEIA o render (a seção só
 * devolve o nó depois dele), então enquanto o `fetch` não resolve o pai olha o
 * spinner "Carregando…" e mais nada. Com o robô desligado em casa a conexão é
 * recusada na hora e ninguém percebe — mas basta o pai abrir o painel no 4G, ou
 * numa rede com portal cativo, pra o `127.0.0.1` (ou o IP que ele tenha
 * configurado) ficar pendurado até o navegador desistir sozinho. E o histórico do
 * banco, que já bastava pra pintar a tela inteira, ficava esperando junto.
 */
const TIMEOUT_MS = 4000;

/**
 * Rótulos que o servidor produz hoje (`ROTULO_SINAL` e os literais de prática em
 * `modules/atencao.js` do repo do robô), mapeados pra a frase que o pai lê.
 *
 * A tabela faz DUAS coisas, e as duas são de tradução, nunca de invenção:
 *
 * 1. **Acento.** O repo do robô é escrito sem acentuação (convenção de lá) e o pai
 *    não pode ler "ficou em duvida" no painel. A frase é idêntica, palavra por
 *    palavra.
 *
 * 2. **Gênero (ago/2026).** Dois rótulos do robô vinham no feminino — "estava
 *    embalada" e "resolveu sozinha" —, e `criancas` não tem campo de gênero: pra
 *    metade das crianças o Mapa descrevia a aula na flexão errada, linha por linha,
 *    numa tela feita justamente pra o pai reconhecer a filha (ou o filho) ali.
 *    Trocar por "embalado(a)" seria o parêntese que o painel acabou de tirar do
 *    onboarding. A saída é a mesma do resto do Companion: frase que não precisa de
 *    flexão. "estava no embalo" e "resolveu sem ajuda" dizem exatamente o mesmo —
 *    e a segunda até diz melhor, porque nomeia o fato ("sem ajuda") em vez de um
 *    adjetivo sobre a criança.
 *
 * ⚠️ A divergência de texto mora AQUI de propósito: o `rotulo` cru continua sendo o
 * do servidor (é o que está gravado no jsonb e o que o robô entende). Quem lê o
 * banco por fora vê o rótulo original; quem lê a TELA vê a versão neutra.
 *
 * Rótulo que não estiver aqui passa como veio — não adivinhamos texto que não
 * conhecemos.
 */
const ROTULOS_ACENTUADOS = {
  "precisou de mais ajuda": "precisou de mais ajuda",
  "ficou em duvida": "ficou em dúvida",
  "estava embalada": "estava no embalo",
  "estava embalado": "estava no embalo",
  "resolveu sozinha": "resolveu sem ajuda",
  "resolveu sozinho": "resolveu sem ajuda",
  "tropecou no exercicio": "tropeçou no exercício",
  // Os dois rótulos do marco de compreensão (ago/2026) já nascem acentuados no
  // servidor — entram aqui só como rede: se um deles chegar sem acento (robô
  // antigo, sessão gravada antes), o pai continua não lendo "mao" no painel.
  // Rótulo que já vem acentuado não casa com estas chaves e passa intacto.
  "pediu uma mao": "pediu uma mão",
  "pediu uma mao aqui": "pediu uma mão aqui",
  "explicou com as proprias palavras": "explicou com as próprias palavras",
};

/**
 * Vocabulário interno que jamais pode aparecer na tela. É a rede de segurança
 * para dado antigo no jsonb — a defesa principal é comparar o `rotulo` com o
 * `sinal`/`resultado` do próprio momento (ver `rotuloParaTela`).
 */
const VOCABULARIO_INTERNO = new Set([
  "travada",
  "confusa",
  "engajada",
  "travou",
  "aprendeu",
]);

/** Rótulo neutro por tipo, usado só quando o do servidor não serve (raro). */
const ROTULO_NEUTRO = {
  afeto: "um momento da aula",
  pratica: "um exercício",
  compreensao: "um momento da conversa",
};

/**
 * Os três tipos de momento, em ordem de CONFIANÇA na fonte — e a ordem importa
 * duas vezes: ela é o critério de desempate do ponto de atrito e é o que a
 * timeline traduz em forma.
 *
 *   `pratica`     exercício que o servidor propôs e conferiu → FATO
 *   `afeto`       leitura da câmera (MediaPipe, evidência forte) → IMPRESSÃO
 *   `compreensao` como a criança se saiu no turno, lido da conversa → LEITURA
 *
 * `compreensao` é de ago/2026 e é o motivo de o mapa ter deixado de viver vazio:
 * os outros dois exigem condição rara (webcam enquadrada, ciclo de exercício),
 * e uma aula inteira de explicação e dúvida produzia ZERO momentos.
 */
const TIPOS_MOMENTO = new Set(["afeto", "pratica", "compreensao"]);

/**
 * Tom do momento — o que define a COR do marcador. Não é nota nem valência moral:
 * "apoio" é onde o pai pode ajudar, "bom" é onde ela deslanchou.
 */
const TOM_POR_SINAL = { travada: "apoio", confusa: "duvida", engajada: "bom" };
const TOM_POR_RESULTADO = { travou: "apoio", aprendeu: "bom" };

/**
 * @typedef {object} Momento
 * @property {number} emMs — offset desde o início da sessão (não é timestamp)
 * @property {'afeto'|'pratica'|'compreensao'} tipo
 * @property {string} rotulo — texto PRONTO pra tela (linguagem de apoio)
 * @property {'apoio'|'duvida'|'bom'|'neutro'} tom — só pra cor do marcador
 * @property {string|null} materia
 * @property {string|null} topico — o assunto que estava valendo naquele segundo;
 *   `null` quando a janela de 4 min venceu (esperado, não é dado faltando)
 * @property {string|null} confianca — 'media' ou 'baixa' nos momentos de câmera
 * @property {boolean} superado — venceu este atrito depois, na mesma aula
 * @property {number} repeticoes — leituras iguais fundidas neste momento (>= 1)
 * @property {string|null} sinal — INTERNO: nunca renderizar
 * @property {string|null} resultado — INTERNO: nunca renderizar
 */

/**
 * @typedef {object} AssuntoDificil
 * @property {string} topico — o assunto a rever (ou a matéria, se não houve tópico)
 * @property {string|null} materia
 * @property {number} ocorrencias — quantos momentos de atrito caíram nele
 * @property {string|null} confianca — da melhor fonte que sustenta este assunto
 */

/**
 * @typedef {object} Sessao
 * @property {string} chave — identidade estável da aula (ver `chaveDaSessao`)
 * @property {string|null} inicioEm — ISO de quando a aula começou
 * @property {number} duracaoMs — o vão do início ao fim (é o eixo da linha do tempo)
 * @property {number|null} tempoEfetivoMs — o mesmo vão sem os silêncios longos;
 *   `null` em aula gravada antes de ago/2026
 * @property {number} turnos — trocas de conversa
 * @property {string[]} materias
 * @property {string[]} topicos
 * @property {Momento[]} momentos — ordenados por `emMs`
 * @property {Momento|null} pontoDeAtrito — QUANDO foi (ancora a linha do tempo)
 * @property {AssuntoDificil|null} assuntoMaisDificil — O QUE REVER (ou null)
 * @property {{confianca: string}|null} qualidade — calibra o TOM da tela
 * @property {boolean} derivadosDisponiveis — a fonte desta sessão calcula os três
 *   derivados acima? `true` no endpoint, `false` na tabela lida via RLS. A
 *   diferença é o que separa duas telas MUITO distintas: com `true`, um
 *   `pontoDeAtrito` nulo quer dizer "o servidor olhou e não achou atrito" (boa
 *   notícia, e desde ago/2026 é o caso comum). Com `false`, quer dizer apenas
 *   "não perguntamos" — e aí a tela não conclui nada.
 * @property {boolean} emAndamento — true só na sessão ao vivo
 */

/** Número finito e não-negativo, ou 0. O jsonb é livre: nada pode virar NaN. */
function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Igual a `numero`, mas preserva a AUSÊNCIA como `null` em vez de achatá-la em 0.
 *
 * Existe por causa do `tempoEfetivoMs`: uma aula gravada antes de o campo existir
 * chega sem ele, e "não sei" precisa continuar diferente de "zero". A primeira cai
 * no `duracaoMs`; a segunda escreveria "0 min" no cabeçalho da aula.
 */
function numeroOuNull(valor) {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Quantas leituras iguais o servidor fundiu num mesmo momento (`repeticoes`).
 * Piso 1: "uma vez" é o normal, e é o que vale pra todo payload que chegue sem o
 * campo (sessão antiga, tabela lida direto).
 */
function repeticoesDoMomento(valor) {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** Os três níveis que o servidor usa em `confianca` (sessão, momento e assunto). */
const NIVEIS_CONFIANCA = new Set(["alta", "media", "baixa"]);

/**
 * Nível de confiança saneado, ou `null` quando não veio (ou veio algo que não
 * conhecemos).
 *
 * ⚠️ `null` aqui significa "sem ressalva", NUNCA "ruim": quem não sabe não pode
 * escurecer o marcador nem amolecer a frase. É a diferença entre uma tela que
 * pondera e uma tela que duvida de tudo.
 */
function nivelDeConfianca(valor) {
  const t = String(valor == null ? "" : valor).trim().toLowerCase();
  return NIVEIS_CONFIANCA.has(t) ? t : null;
}

/** Array de strings não-vazias (materias/topicos vêm de jsonb/text[]). */
function listaDeTextos(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map((v) => String(v || "").trim()).filter(Boolean);
}

/** Texto limpo, ou null (nunca "undefined" na tela). */
function texto(valor) {
  const t = String(valor == null ? "" : valor).trim();
  return t || null;
}

/**
 * Rótulo pronto pra tela: acentua o que conhecemos e barra vocabulário interno.
 *
 * A checagem que importa não é a lista fixa, é a comparação com o próprio dado
 * interno do momento: o servidor monta o rótulo como `ROTULO_SINAL[sinal] || sinal`,
 * então um sinal que ele ainda não saiba nomear (um `dispersa` acrescentado
 * amanhã no robô) chegaria aqui como rótulo e iria direto pra tela do pai. Rótulo
 * igual ao sinal = tradução que não aconteceu → cai no neutro.
 *
 * @param {string} bruto — o `rotulo` como veio do servidor
 * @param {'afeto'|'pratica'} tipo
 * @param {Array<string|null>} internos — `sinal` e `resultado` do mesmo momento
 * @returns {string}
 */
function rotuloParaTela(bruto, tipo, internos = []) {
  const cru = String(bruto || "").trim();
  const chave = cru.toLowerCase();
  if (ROTULOS_ACENTUADOS[chave]) return ROTULOS_ACENTUADOS[chave];

  const repeteInterno = internos.some(
    (v) => v && String(v).trim().toLowerCase() === chave
  );
  if (!cru || repeteInterno || VOCABULARIO_INTERNO.has(chave)) {
    return ROTULO_NEUTRO[tipo] || ROTULO_NEUTRO.afeto;
  }
  return cru;
}

/**
 * Saneia um momento cru do jsonb. Um item malformado não pode derrubar a tela
 * inteira — mesma disciplina do `normalizarItemTrilha` no Aprendizado.
 * @returns {Momento|null} null quando não dá pra usar
 */
function normalizarMomento(item) {
  if (!item || typeof item !== "object") return null;
  // Tipo desconhecido cai em `afeto` (o mais genérico) em vez de sumir: perder um
  // momento em silêncio é pior do que desenhá-lo com a forma errada. Um tipo novo
  // no robô aparece na tela e cobra o ajuste aqui, em vez de esvaziar o mapa.
  const tipo = TIPOS_MOMENTO.has(item.tipo) ? item.tipo : "afeto";
  const sinal = texto(item.sinal);
  const resultado = texto(item.resultado);
  const tom =
    (sinal && TOM_POR_SINAL[sinal]) ||
    (resultado && TOM_POR_RESULTADO[resultado]) ||
    "neutro";

  return {
    emMs: numero(item.emMs),
    tipo,
    rotulo: rotuloParaTela(item.rotulo, tipo, [sinal, resultado]),
    tom,
    materia: texto(item.materia),
    // ⚠️ `null` aqui é ESPERADO, não é dado faltando. Desde ago/2026 o assunto de
    // um momento VENCE em 4 min sem ser mencionado, e passada a janela o servidor
    // se recusa a chutar. NUNCA preencher com `topicos[0]` da sessão: era esse
    // chute que fazia o mapa dizer "travou em frações" 44 min depois de frações
    // sair da mesa (o defeito nº 1 da reforma).
    topico: texto(item.topico),
    // Corroboração (ago/2026), só em `afeto`: 'media' = a câmera bateu com outra
    // fonte no mesmo assunto; 'baixa' = é só impressão dela, ninguém confirmou.
    // Vira DISCRIÇÃO no marcador — a palavra "confiança" nunca chega ao pai.
    confianca: nivelDeConfianca(item.confianca),
    // A melhor notícia da tela: este atrito ela venceu depois, na mesma aula.
    superado: item.superado === true,
    // Intensidade visual, nunca número: "3 caretas" seria placar do humor da
    // criança, que é o oposto do que esta tela é.
    repeticoes: repeticoesDoMomento(item.repeticoes),
    sinal,
    resultado,
  };
}

/**
 * Saneia o `assuntoMaisDificil` que o servidor manda pronto — "o que rever
 * amanhã", enquanto o ponto de atrito responde "quando foi".
 *
 * A regra (somar o atrito por tópico, com peso por confiança da fonte) é do
 * SERVIDOR e não tem cópia aqui: uma travada isolada em frações pesa menos que
 * quatro tropeços espalhados em mmc, e é o servidor que já fez essa conta em
 * cima dos momentos que ele mesmo cruzou.
 *
 * O `peso` vem no payload e é deliberadamente descartado: é número interno de
 * ranking, não tem unidade que signifique nada pro pai e viraria placar na tela.
 *
 * @returns {AssuntoDificil|null} null quando não houve atrito (o que também é
 *   informação) ou quando o item não identifica assunto nenhum.
 */
function normalizarAssuntoDificil(item) {
  if (!item || typeof item !== "object") return null;
  const topico = texto(item.topico);
  const materia = texto(item.materia);
  if (!topico && !materia) return null;
  return {
    topico: topico || materia,
    materia,
    ocorrencias: numero(item.ocorrencias),
    // ago/2026: a confiança da melhor fonte que sustenta ESTE assunto. Em
    // 'baixa' a tela troca "o que mais pediu ajuda foi X" por "parece que foi
    // X": a frase pondera, e o pai não recebe uma certeza que ninguém tem.
    confianca: nivelDeConfianca(item.confianca),
  };
}

/**
 * Qualidade da leitura da sessão inteira (ago/2026). Só o NÍVEL sobrevive à
 * normalização, e isso é uma decisão, não uma economia.
 *
 * Ele existe pra CALIBRAR O TOM da tela: numa aula sustentada só pela câmera, o
 * destaque fala em "parece que" em vez de afirmar. Não vira selo, não vira
 * etiqueta e não aparece escrito em lugar nenhum.
 *
 * `fontes` e `camerasSemApoio` são descartados pelo mesmo motivo do `peso` do
 * assunto difícil: são diagnóstico interno do motor. "1 exercício, 5 conversas,
 * 1 câmera" não ajuda ninguém a ajudar a filha e soa a vigilância, que é
 * exatamente o que esta tela não é.
 *
 * @returns {{confianca: string}|null}
 */
function normalizarQualidade(item) {
  if (!item || typeof item !== "object") return null;
  const confianca = nivelDeConfianca(item.confianca);
  return confianca ? { confianca } : null;
}

/**
 * Identidade da aula, usada pra saber se a sessão exibida continua sendo a mesma
 * entre dois ciclos do modo ao vivo. Normalizamos pelo INSTANTE (e não pela string
 * ISO) porque a mesma aula chega escrita de dois jeitos conforme a fonte: o
 * servidor manda `2026-08-13T15:00:00.000Z`, o Postgres devolve
 * `2026-08-13T12:00:00+00:00`. Comparar texto faria a aula "trocar de identidade"
 * na hora em que ela é gravada — bem no fim da demonstração ao vivo.
 */
function chaveDaSessao(inicioEm) {
  const instante = Date.parse(inicioEm);
  return Number.isFinite(instante) ? String(instante) : String(inicioEm || "");
}

/** Monta a sessão normalizada a partir dos campos já extraídos de cada fonte. */
function montarSessao({
  inicioEm,
  duracaoMs,
  tempoEfetivoMs,
  turnos,
  materias,
  topicos,
  momentos,
  pontoDeAtrito,
  assuntoMaisDificil,
  qualidade,
  derivadosDisponiveis,
  emAndamento,
}) {
  const lista = (Array.isArray(momentos) ? momentos : [])
    .map(normalizarMomento)
    .filter(Boolean)
    .sort((a, b) => a.emMs - b.emMs);

  return {
    chave: chaveDaSessao(inicioEm),
    inicioEm: texto(inicioEm),
    duracaoMs: numero(duracaoMs),
    // Duração SEM os silêncios longos. Quando existe, é o número mais honesto pro
    // cabeçalho: a correção nº 5 da reforma nasceu de uma aula de 6 min que o
    // painel anunciava como "47 minutos" só porque a webcam ficou ligada.
    tempoEfetivoMs: numeroOuNull(tempoEfetivoMs),
    turnos: numero(turnos),
    materias: listaDeTextos(materias),
    topicos: listaDeTextos(topicos),
    momentos: lista,
    // 🔴 NENHUM dos três abaixo tem cópia local (ago/2026). Só passa o que o
    // servidor mandou; sem ele, fica `null` e a tela não conclui nada. O porquê
    // está no cabeçalho do arquivo.
    pontoDeAtrito: normalizarMomento(pontoDeAtrito),
    assuntoMaisDificil: normalizarAssuntoDificil(assuntoMaisDificil),
    qualidade: normalizarQualidade(qualidade),
    derivadosDisponiveis: !!derivadosDisponiveis,
    emAndamento: !!emAndamento,
  };
}

/**
 * Sessão vinda do endpoint (camelCase). É a fonte COMPLETA: o servidor recalcula
 * os três derivados a cada leitura, tanto na sessão ao vivo quanto em cada item
 * do `historico[]` (dívida nº 2, resolvida no robô).
 */
function normalizarDoEndpoint(sessao, emAndamento = false) {
  if (!sessao || typeof sessao !== "object") return null;
  return montarSessao({
    inicioEm: sessao.inicioEm,
    duracaoMs: sessao.duracaoMs,
    tempoEfetivoMs: sessao.tempoEfetivoMs,
    turnos: sessao.turnos,
    materias: sessao.materias,
    topicos: sessao.topicos,
    momentos: sessao.momentos,
    pontoDeAtrito: sessao.pontoDeAtrito,
    assuntoMaisDificil: sessao.assuntoMaisDificil,
    qualidade: sessao.qualidade,
    derivadosDisponiveis: true,
    emAndamento: emAndamento || sessao.emAndamento,
  });
}

/**
 * Linha de `sessoes_atencao` (snake_case, como o Postgres devolve). É a fonte
 * PARCIAL: a coluna guarda os `momentos`, e nenhum dos derivados.
 */
function normalizarDaTabela(linha) {
  if (!linha || typeof linha !== "object") return null;
  const contadores =
    linha.contadores && typeof linha.contadores === "object" ? linha.contadores : {};

  return montarSessao({
    inicioEm: linha.iniciada_em,
    duracaoMs: linha.duracao_ms,
    // O único campo novo que a tabela guarda, e ele pega CARONA no jsonb
    // `contadores` em vez de virar coluna (decisão do robô: evita uma migração no
    // Supabase). Quem lê pelo endpoint recebe `tempoEfetivoMs` no topo do objeto e
    // nem percebe; quem lê a tabela, como aqui, precisa saber que ele mora ali
    // dentro.
    tempoEfetivoMs: contadores.tempoEfetivoMs,
    turnos: linha.turnos,
    materias: linha.materias,
    topicos: linha.topicos,
    momentos: linha.momentos,
    // 🔴 ago/2026: os três ficam `null` e NÃO são recalculados aqui. O critério do
    // ponto de atrito inverteu e passou a depender de corroboração entre fontes;
    // replicá-lo no front divergiria em silêncio do servidor, que é justamente o
    // defeito que a reforma removeu. `derivadosDisponiveis: false` é o que faz a
    // tela mostrar a linha do tempo SEM cabeçalho conclusivo, em vez de concluir
    // errado. Esta mesma aula ganha os derivados assim que vier pelo endpoint.
    pontoDeAtrito: null,
    assuntoMaisDificil: null,
    qualidade: null,
    derivadosDisponiveis: false,
    emAndamento: false, // o que está no banco, por definição, já terminou
  });
}

/**
 * Busca o mapa no endpoint do servidor local. Robô/servidor desligado NÃO é erro:
 * devolve `null` e quem chama cai pro histórico da tabela. Nunca lança.
 * @param {string} servidorUrl
 * @param {string} criancaId
 * @returns {Promise<{emAndamento:boolean, sessao:object|null, historico:object[]}|null>}
 */
async function buscarDoServidor(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return null;
  try {
    const url =
      `${servidorUrl}/api/mapa-aula?criancaId=${encodeURIComponent(criancaId)}` +
      `&limite=${LIMITE_HISTORICO}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    // Servidor off / CORS: silencioso de propósito, a tabela cobre o histórico.
    console.debug("[Companion] Mapa da aula: servidor indisponível.", err);
    return null;
  }
}

/**
 * @typedef {object} MapaCarregado
 * @property {boolean} emAndamento — há uma aula acontecendo agora
 * @property {Sessao[]} sessoes — mais recente primeiro (a ao vivo, quando existe,
 *   é sempre a primeira)
 * @property {boolean} aoVivoDisponivel — o servidor respondeu (dá pra ter ao vivo)
 */

/**
 * Carrega o mapa combinando servidor (ao vivo + histórico fresco) e tabela
 * (histórico estável). É a função que a seção chama — no primeiro render e a cada
 * tick do modo ao vivo.
 *
 * @param {object} cfg
 * @param {string} cfg.servidorUrl — base do servidor local da Cogni
 * @param {object|null} cfg.crianca — a criança pareada (precisa do `id`)
 * @param {object} cfg.mock — camada de dados (lê `sessoes_atencao`)
 * @returns {Promise<MapaCarregado>} nunca rejeita: sem nada em lugar nenhum,
 *   devolve `sessoes: []` (que a tela trata como "ainda não houve aula").
 */
export async function carregarMapa({ servidorUrl, crianca, mock }) {
  const criancaId = crianca && crianca.id;
  if (!criancaId) return { emAndamento: false, sessoes: [], aoVivoDisponivel: false };

  // A leitura da tabela tolera falha (RLS/rede) sem derrubar: o endpoint ainda
  // pode cobrir tudo sozinho.
  const daTabelaP = mock
    ? mock
        .getSessoesAtencao(LIMITE_HISTORICO)
        .then((linhas) => (Array.isArray(linhas) ? linhas.map(normalizarDaTabela).filter(Boolean) : []))
        .catch((err) => {
          console.debug("[Companion] Mapa da aula: leitura da tabela falhou.", err);
          return [];
        })
    : Promise.resolve([]);

  const [doServidor, daTabela] = await Promise.all([
    buscarDoServidor(servidorUrl, criancaId),
    daTabelaP,
  ]);

  const emAndamento = !!(doServidor && doServidor.emAndamento);
  const aoVivo = emAndamento ? normalizarDoEndpoint(doServidor.sessao, true) : null;

  // Histórico: o do servidor é o mais fresco, mas vem VAZIO durante o ao vivo —
  // aí a tabela é quem segura as aulas anteriores.
  const historicoServidor = (doServidor && Array.isArray(doServidor.historico) ? doServidor.historico : [])
    .map((s) => normalizarDoEndpoint(s, false))
    .filter(Boolean);
  const historico = historicoServidor.length ? historicoServidor : daTabela;

  const sessoes = aoVivo ? [aoVivo, ...historico] : historico;

  return { emAndamento, sessoes, aoVivoDisponivel: !!doServidor };
}

/**
 * Resumo em texto da aula (2–3 frases geradas por IA no servidor).
 *
 * Passa pelo mesmo rate limit dos outros endpoints de IA, então a seção chama
 * quando o pai ABRE a tela (e uma vez a mais quando a aula ao vivo termina),
 * nunca a cada render nem a cada tick do poll.
 *
 * 🩺 ago/2026: `texto: null` ficou RARO. O servidor passou a montar a frase em
 * código quando a IA falha (fallback determinístico), então rede caindo e JSON
 * malformado não derrubam mais o card. Sobraram dois casos: nenhuma sessão
 * (`motivo: 'sem_sessao'`) e sessão sem turno algum. O tratamento de null fica
 * como está de propósito — um 429 do rate limit ainda derruba a requisição antes
 * de ela chegar ao fallback, e aí o card precisa saber sair de cena.
 *
 * @param {string} servidorUrl
 * @param {string} criancaId
 * @returns {Promise<string|null>} o texto, ou null quando não há o que resumir
 *   (sem sessão, rate limit ou servidor desligado). Nunca lança — a tela sem o
 *   texto ainda vale sozinha (a linha do tempo é o conteúdo principal).
 */
export async function carregarResumoDaAula(servidorUrl, criancaId) {
  if (!servidorUrl || !criancaId) return null;
  try {
    const url = `${servidorUrl}/api/mapa-aula/resumo?criancaId=${encodeURIComponent(criancaId)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) return null;
    const dados = await resp.json();
    return texto(dados && dados.texto);
  } catch (err) {
    console.debug("[Companion] Resumo da aula: servidor indisponível.", err);
    return null;
  }
}
