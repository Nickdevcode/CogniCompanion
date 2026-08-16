/**
 * _lib/openai.mjs — As duas chamadas à OpenAI: transcrever e ler.
 *
 * São duas chamadas com **fallbacks completamente diferentes** — schema recusado de
 * um lado, modelo indisponível do outro — e por isso não têm um `retry()`
 * compartilhado. Cada degradação fica colada na chamada que ela protege; um retry
 * genérico esconderia justamente o que distingue os casos.
 */

import { buscar, TIMEOUT_IA_MS, TIMEOUT_TRANSCRICAO_MS } from "./http.mjs";
import { systemPrompt, mensagemDoUsuario, dicasDeTranscricao, SCHEMA } from "./prompt.mjs";

/**
 * O mesmo modelo que o robô usa (`CHAT_MODEL` em `Cogni/server/config.js`).
 * É um modelo de RACIOCÍNIO: usa `max_completion_tokens` (não `max_tokens`) e não
 * aceita `temperature`.
 */
const MODELO = "gpt-5.4-mini";

/** Só pro caso de o modelo principal recusar a content part de arquivo (PDF). */
const MODELO_FALLBACK_PDF = "gpt-4o-mini";

/**
 * Transcrição. O `gpt-transcribe` (ago/2026) aceita **prompt de contexto, keyword
 * hints e language hints**, que o `gpt-4o-mini-transcribe` não tem — e o áudio típico
 * aqui é professora falando em sala barulhenta, gravado no celular e reenviado pelo
 * WhatsApp. É exatamente o caso em que o modelo melhor ganha, e a diferença de preço
 * (US$ 0,0045 contra 0,003 por minuto) é 1,5 centavo num áudio de 10 minutos.
 */
const MODELO_TRANSCRICAO = "gpt-transcribe";
const MODELO_TRANSCRICAO_FALLBACK = "whisper-1";

/**
 * Teto de saída.
 *
 * Era 3000, e isso era um bug esperando o primeiro PDF: num modelo de raciocínio os
 * tokens de pensamento saem do MESMO orçamento da resposta. 20 tarefas com detalhe
 * mais 4 000 caracteres de `extraido_texto` já consomem ~2 250; o que sobrava pro
 * raciocínio não cobria um PDF de 10 páginas, e o JSON saía cortado no meio — que
 * virava `JSON.parse` lançando e um 502 sem explicação.
 */
const MAX_TOKENS_SAIDA = 9000;

/**
 * Falha que NÃO é erro de servidor: o material chegou, mas não deu pra usar.
 *
 * Vira `200 {legivel:false, motivo}`, igual a foto tremida. A diferença importa: um
 * 502 diz "o site quebrou" e o pai tenta de novo igual; um motivo diz o que fazer
 * diferente.
 */
export class FalhaSuave extends Error {}

/* ==========================================================================
   Transcrição
   ========================================================================== */

/** Extensão que o backend deles usa pra farejar o formato. */
function extensaoDe(mime, nome) {
  const daExtensao = /\.([a-z0-9]{2,5})$/i.exec(nome || "")?.[1]?.toLowerCase();
  if (daExtensao && /^(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|opus)$/.test(daExtensao)) {
    return daExtensao;
  }
  const tabela = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
  };
  return tabela[(mime || "").split(";")[0].trim()] || "webm";
}

/** Data URL → Blob, sem cópia intermediária em string. */
function dataUrlParaBlob(dataUrl, mime) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return new Blob([Buffer.from(base64, "base64")], { type: mime });
}

async function chamarTranscricao(chave, form) {
  const resp = await buscar(
    "https://api.openai.com/v1/audio/transcriptions",
    { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form },
    TIMEOUT_TRANSCRICAO_MS
  );
  const texto = await resp.text();
  if (!resp.ok) {
    const err = new Error(`OpenAI transcrição ${resp.status}: ${texto.slice(0, 500)}`);
    err.status = resp.status;
    err.corpo = texto;
    throw err;
  }
  return JSON.parse(texto)?.text || "";
}

/** O erro é "esse modelo não existe / não tenho acesso"? */
function recusouModelo(err) {
  return (
    (err.status === 400 || err.status === 404 || err.status === 403) &&
    /model|does not exist|not have access/i.test(err.corpo || "")
  );
}

/** O erro é "esse formato de áudio eu não abro"? */
function recusouFormato(err) {
  return (
    err.status === 400 &&
    /format|decode|invalid file|unsupported|could not be/i.test(err.corpo || "")
  );
}

/**
 * Áudio → texto.
 *
 * @param {string} chave
 * @param {{nome:string, mime:string, dados:string}} item
 * @param {object} crianca
 * @returns {Promise<string>}
 */
export async function transcrever(chave, item, crianca) {
  const mime = (item.mime || "audio/webm").split(";")[0].trim();
  const blob = dataUrlParaBlob(item.dados, mime);
  const arquivo = `audio.${extensaoDe(mime, item.nome)}`;
  const dicas = dicasDeTranscricao(crianca);

  const montar = (modelo) => {
    const form = new FormData();
    form.append("file", blob, arquivo);
    form.append("model", modelo);
    form.append("prompt", dicas.prompt);
    if (modelo === MODELO_TRANSCRICAO) {
      // O modelo novo usa `languages` (plural) e aceita palavras-chave do domínio.
      form.append("languages", "pt");
      form.append("keywords", dicas.keywords);
    } else {
      form.append("language", "pt");
    }
    return form;
  };

  try {
    return await chamarTranscricao(chave, montar(MODELO_TRANSCRICAO));
  } catch (err) {
    /**
     * Fallback SÓ quando a conta não tem o modelo. Deliberadamente **não** existe
     * fallback por "transcrição vazia ou ruim": um modelo de transcrição ruim não
     * falha nem devolve vazio — ele transcreve errado. Um fallback que só dispara em
     * erro nunca dispararia justo no caso que importa, e ainda daria a impressão de
     * que existe uma rede que não existe.
     */
    if (recusouModelo(err)) {
      console.warn("[plano-de-material] gpt-transcribe indisponível; usando whisper-1.");
      return chamarTranscricao(chave, montar(MODELO_TRANSCRICAO_FALLBACK));
    }
    if (recusouFormato(err)) {
      console.warn("[plano-de-material] Formato de áudio recusado:", mime);
      throw new FalhaSuave(
        "Não consegui abrir esse áudio. Tente gravar aqui pelo botão de microfone, ou mande em MP3 ou M4A."
      );
    }
    throw err;
  }
}

/* ==========================================================================
   Leitura do material (visão + texto)
   ========================================================================== */

/** O erro é "não aceito content part de arquivo"? */
function recusouArquivo(err) {
  return (
    err.status === 400 &&
    /\bfile\b|file_data|unsupported|not supported/i.test(err.corpo || "")
  );
}

async function disparar(chave, modelo, conteudoUsuario, hoje, crianca, formato) {
  const resp = await buscar(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: systemPrompt(hoje, crianca) },
          { role: "user", content: conteudoUsuario },
        ],
        max_completion_tokens: MAX_TOKENS_SAIDA,
        response_format: formato,
      }),
    },
    TIMEOUT_IA_MS
  );

  const texto = await resp.text();
  if (!resp.ok) {
    const err = new Error(`OpenAI ${resp.status}: ${texto.slice(0, 500)}`);
    err.status = resp.status;
    err.corpo = texto;
    throw err;
  }

  const json = JSON.parse(texto);
  const escolha = json?.choices?.[0];

  /**
   * `finish_reason === "length"` nunca era checado, e o sintoma era enganoso: o JSON
   * vinha cortado, o `JSON.parse` lançava, e o pai recebia "a IA está fora" quando na
   * verdade o material dele era grande demais. Dizer isso é acionável; 502 não é.
   */
  if (escolha?.finish_reason === "length") {
    throw new FalhaSuave(
      "Esse material é longo demais pra eu ler de uma vez. Mande uma parte por vez — uma folha, ou as páginas da lição."
    );
  }

  const bruto = escolha?.message?.content;
  if (!bruto) throw new Error("OpenAI devolveu resposta vazia.");
  return JSON.parse(bruto);
}

/**
 * Uma tentativa completa com um modelo, já com a degradação de `response_format`.
 *
 * Se a API recusar o `json_schema` (modelo ou endpoint que ainda não o suporta),
 * refaz UMA vez com `json_object`. O schema também está descrito no prompt, então a
 * resposta continua utilizável — e o `sanear` valida tudo de novo do outro lado.
 */
async function tentarComModelo(chave, modelo, itens, hoje, crianca) {
  const conteudo = mensagemDoUsuario(itens);
  try {
    return await disparar(chave, modelo, conteudo, hoje, crianca, {
      type: "json_schema",
      json_schema: { name: "plano_do_material", strict: true, schema: SCHEMA },
    });
  } catch (err) {
    const recusouSchema =
      err.status === 400 && /response_format|json_schema/i.test(err.corpo || "");
    if (!recusouSchema) throw err;
    console.warn("[plano-de-material] json_schema recusado; caindo pra json_object.");
    return disparar(chave, modelo, conteudo, hoje, crianca, { type: "json_object" });
  }
}

/**
 * Material → proposta crua (ainda não saneada).
 *
 * O caminho do PDF é o único sem rede de proteção histórica, e é também o que mais
 * depende de uma capacidade recente da API. A escada de degradação existe porque um
 * PDF recusado sem fallback derrubaria metade dos casos de uso da rodada:
 *
 *   1. modelo principal, com o PDF
 *   2. → `gpt-4o-mini`, com o PDF (só se o erro citar `file`)
 *   3. → modelo principal, SEM o PDF, avisando o pai do que ficou de fora
 *   4. → se o PDF era o único material, `legivel:false` com uma saída executável
 *
 * @returns {Promise<{cru:object, aviso:string|null}>}
 */
export async function lerMaterial(chave, { itens, hoje, crianca }) {
  const temPdf = itens.some((i) => i.tipo === "pdf");

  try {
    return { cru: await tentarComModelo(chave, MODELO, itens, hoje, crianca), aviso: null };
  } catch (err) {
    if (!temPdf || err instanceof FalhaSuave || !recusouArquivo(err)) throw err;

    console.warn("[plano-de-material] PDF recusado pelo modelo; tentando o fallback.");
    try {
      return {
        cru: await tentarComModelo(chave, MODELO_FALLBACK_PDF, itens, hoje, crianca),
        aviso: null,
      };
    } catch (err2) {
      if (err2 instanceof FalhaSuave || !recusouArquivo(err2)) throw err2;

      const semPdf = itens.filter((i) => i.tipo !== "pdf");
      if (!semPdf.length) {
        throw new FalhaSuave(
          "Não consegui abrir esse PDF. Tente tirar foto das páginas da lição e mandar as fotos."
        );
      }
      console.warn("[plano-de-material] Seguindo sem o PDF.");
      return {
        cru: await tentarComModelo(chave, MODELO, semPdf, hoje, crianca),
        aviso:
          "Não consegui abrir o PDF, então montei o plano com o resto do material. " +
          "Se a lição está no PDF, tire foto das páginas e mande de novo.",
      };
    }
  }
}
