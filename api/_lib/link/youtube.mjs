/**
 * _lib/link/youtube.mjs — A videoaula do YouTube vira texto.
 *
 * Decisão do Nicolas (16/ago/2026): **best-effort grátis**. Sem chave nova, sem API
 * paga, sem dependência npm — só o `fetch` que já existe no runtime. Em troca, a
 * leitura pode degradar, e quando degrada **a tela diz** (é o `grau` que sai daqui).
 *
 * O caminho é a **InnerTube**, o mesmo endpoint que o app do YouTube usa:
 *
 *   POST https://www.youtube.com/youtubei/v1/player   { context:{client}, videoId }
 *     → videoDetails (título, canal, duração, descrição, keywords)
 *     → captions.playerCaptionsTracklistRenderer.captionTracks[] (com `baseUrl`)
 *   GET  <baseUrl>&fmt=json3                          → { events:[{segs:[{utf8}]}] }
 *
 * 🔴 **`clientName: "WEB"` NÃO devolve legenda.** Ele responde `UNPLAYABLE` com
 * `captionTracks` VAZIO — mas continua devolvendo `videoDetails` normalmente, então a
 * falha é silenciosa: a conclusão errada ("esse vídeo não tem legenda") é indistinguível
 * da certa. `ANDROID` e `IOS` devolvem os dois. Medido em 16/ago/2026 com 6 videoaulas
 * brasileiras; quase todo tutorial de 2024-2025 na internet usa `WEB`.
 *
 * Medição real (deste PC): ~700 caracteres de legenda por minuto de aula. Uma aula de
 * 49 minutos deu 18 k caracteres — cabe folgado nos 30 k de um item de texto.
 */

import {
  LinkRuim,
  MAX_TEXTO,
  UA,
  buscarDireto,
  TIMEOUT_LINK_MS,
} from "./rede.mjs";

/**
 * A ordem é a escada de degradação. `ANDROID` primeiro porque é o que devolve legenda
 * com mais consistência; `IOS` entra quando o primeiro volta sem `captionTracks`.
 */
const CLIENTES = [
  { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "pt", gl: "BR" },
  { clientName: "IOS", clientVersion: "20.10.4", hl: "pt", gl: "BR" },
];

/** Descrição do vídeo, quando não há legenda. Mais que isso vira lista de links do canal. */
const MAX_DESCRICAO = 1_200;

/** Hosts de onde aceitamos baixar legenda. O `baseUrl` vem de resposta remota — não é nosso. */
const HOSTS_DE_LEGENDA = /(^|\.)(youtube\.com|googlevideo\.com|youtube-nocookie\.com)$/i;

/* ==========================================================================
   A URL
   ========================================================================== */

const HOSTS_YT = ["youtube.com", "youtu.be", "youtube-nocookie.com", "music.youtube.com"];

/** O host é do YouTube? (já sem `www.`/`m.`) */
function hostDoYoutube(u) {
  const host = u.hostname.replace(/^(www|m)\./i, "").toLowerCase();
  return HOSTS_YT.includes(host) ? host : null;
}

/** @returns {boolean} o link é do YouTube (mesmo que não seja de um vídeo)? */
export function ehDoYoutube(url) {
  try {
    return !!hostDoYoutube(new URL(url));
  } catch {
    return false;
  }
}

/**
 * URL do YouTube → id de 11 caracteres, ou `null`.
 *
 * Todos estes viram o MESMO id (verificados): `youtu.be/ID`, `/shorts/ID`, `/embed/ID`,
 * `/live/ID`, `m.youtube.com`, `?t=30`, `&feature=share`, `&list=…`.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function idDoYoutube(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const host = hostDoYoutube(u);
  if (!host) return null;

  const valido = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null);

  if (host === "youtu.be") return valido(u.pathname.slice(1).split("/")[0]);
  if (u.pathname === "/watch") return valido(u.searchParams.get("v"));

  const m = /^\/(?:embed|shorts|v|live)\/([^/?#]+)/.exec(u.pathname);
  return m ? valido(m[1]) : null;
}

/**
 * O link é do YouTube mas não é um vídeo — o que dizer ao pai.
 *
 * Cada uma dessas mensagens existe porque a saída é diferente: de playlist ele abre um
 * vídeo, de canal ele escolhe a aula, de busca ele nem colou o que queria. "Link
 * inválido" deixaria os três parados no mesmo lugar.
 *
 * @param {string} url
 * @returns {string|null} null se for um vídeo (ou nem for YouTube)
 */
export function motivoDeUrlSemVideo(url) {
  if (!ehDoYoutube(url) || idDoYoutube(url)) return null;

  const u = new URL(url);
  if (u.pathname === "/playlist" || (u.searchParams.get("list") && !u.searchParams.get("v"))) {
    return "Esse link é de uma playlist inteira. Abra o vídeo que interessa e copie o link dele.";
  }
  if (/^\/(@|c\/|channel\/|user\/)/.test(u.pathname)) {
    return "Esse link é de um canal inteiro. Abra a aula que interessa e copie o link dela.";
  }
  if (u.pathname === "/results") {
    return "Esse link é de uma busca no YouTube. Abra o vídeo que interessa e copie o link dele.";
  }
  return "Não achei o vídeo nesse link do YouTube. Abra o vídeo e use o botão de compartilhar pra copiar o endereço.";
}

/* ==========================================================================
   InnerTube
   ========================================================================== */

async function player(videoId, cliente) {
  const resp = await buscarDireto(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: cliente }, videoId }),
    },
    TIMEOUT_LINK_MS
  );
  if (!resp.ok) throw new Error(`innertube ${resp.status}`);
  return resp.json();
}

/**
 * Qual legenda usar.
 *
 * Prioridade: `pt` do próprio canal → `pt` automática → a legenda do IDIOMA ORIGINAL do
 * vídeo → o que houver. A legenda manual ganha da automática sempre que existe, porque
 * ela tem pontuação, nome próprio escrito certo e número por extenso onde importa.
 *
 * 🔴 "A primeira manual da lista" seria um bug silencioso: a InnerTube devolve as tracks
 * **em ordem alfabética do nome traduzido pro `hl` que a gente pediu**. Num vídeo da
 * Khan Academy com 9 legendas, a primeira manual é *Alemão* — e o plano sairia de uma
 * aula lida em alemão sem ninguém notar. Quem aponta a legenda do idioma falado é
 * `defaultTranslationSourceTrackIndices` (medido em 16/ago/2026: índice 5 = `en`).
 */
function escolherTrack(renderer) {
  const tracks = renderer?.captionTracks || [];
  if (!tracks.length) return null;

  const ehPt = (t) => /^pt/i.test(t.languageCode || "");
  const manual = (t) => t.kind !== "asr";
  const original = tracks[renderer?.defaultTranslationSourceTrackIndices?.[0] ?? -1];

  return (
    tracks.find((t) => ehPt(t) && manual(t)) ||
    tracks.find(ehPt) ||
    original ||
    tracks.find(manual) ||
    tracks[0] ||
    null
  );
}

/**
 * json3 → texto corrido.
 *
 * A legenda rolante repete a linha anterior inteira no evento seguinte (é assim que ela
 * "sobe" na tela). Sem o descarte, uma aula de 12 minutos vira 20 k caracteres de eco —
 * paga-se o dobro de token pra dizer a mesma coisa duas vezes.
 */
function textoDoJson3(json) {
  const partes = [];
  for (const ev of json?.events || []) {
    if (!ev.segs) continue;
    const linha = ev.segs
      .map((s) => s.utf8 || "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!linha || linha === partes[partes.length - 1]) continue;
    partes.push(linha);
  }
  return partes.join(" ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Baixa uma track de legenda.
 *
 * 🔴 Corpo VAZIO com status 200 é o sintoma do **PoToken** (o `baseUrl` costuma vir com
 * `exp=xpe`): desde 2025 alguns vídeos só entregam a legenda pra quem prova ser um
 * player de verdade. Tratamos como "não tem legenda" e caímos pros metadados — virar
 * 502 aqui seria transformar uma degradação prevista numa tela de erro.
 *
 * 🔴 E `tlang` (a tradução automática) é MUITO mais restrito que o download cru: medido
 * em 16/ago/2026, deste PC e no mesmo segundo, a mesma track devolveu **200 crua e 429
 * com `tlang=pt`** ("Sorry… unusual traffic"). Por isso a tradução é uma tentativa, não
 * um degrau confiável — quando ela falha, a legenda no idioma original vale mais que
 * nada (o modelo lê inglês e espanhol sem dificuldade, e a tela diz qual idioma era).
 */
async function baixarLegenda(track, traduzirPara) {
  let alvo;
  try {
    alvo = new URL(track.baseUrl);
  } catch {
    return "";
  }
  // O `baseUrl` veio de resposta remota. Host fora do YouTube = não é legenda nossa.
  if (alvo.protocol !== "https:" || !HOSTS_DE_LEGENDA.test(alvo.hostname)) return "";

  alvo.searchParams.set("fmt", "json3");
  if (traduzirPara) alvo.searchParams.set("tlang", traduzirPara);

  const resp = await buscarDireto(alvo, {}, TIMEOUT_LINK_MS);
  if (!resp.ok) return "";

  const bruto = await resp.text();
  if (!bruto.trim()) return "";
  try {
    return textoDoJson3(JSON.parse(bruto));
  } catch {
    return "";
  }
}

/**
 * Último degrau antes de desistir: o oembed é leve, não pede chave e responde de
 * qualquer IP — inclusive quando a InnerTube resolve não falar com um IP de datacenter.
 * Ele não dá conteúdo nenhum, só título e canal; é o que sustenta um card honesto.
 */
async function viaOembed(videoId) {
  const url =
    "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  try {
    const resp = await buscarDireto(url, {}, 8_000);
    if (!resp.ok) return null;
    const j = await resp.json();
    return { titulo: j?.title || "", canal: j?.author_name || "" };
  } catch {
    return null;
  }
}

/* ==========================================================================
   Leitura
   ========================================================================== */

/** "12min52", "49min26", "48s" — o mesmo formato da bandeja no cliente. */
export function formatarDuracao(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  if (!s) return "";
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  return resto ? `${min}min${String(resto).padStart(2, "0")}` : `${min}min`;
}

/**
 * O texto que a IA vai ler.
 *
 * O cabeçalho não é enfeite: sem ele o modelo recebe 10 mil caracteres de fala solta e
 * não sabe se aquilo é uma aula, um podcast ou a transcrição de um áudio de WhatsApp. E
 * a linha da legenda é o que sustenta a regra de confiança — legenda automática erra
 * número, nome e data exatamente como transcrição de áudio erra.
 */
function montarTexto(video) {
  const cabecalho = [`VIDEOAULA DO YOUTUBE: ${video.titulo || "sem título"}`];
  const meta = [
    video.canal ? `Canal: ${video.canal}` : "",
    video.duracao_s ? `Duração: ${formatarDuracao(video.duracao_s)}` : "",
  ].filter(Boolean);
  if (meta.length) cabecalho.push(meta.join(" · "));

  if (video.grau === "transcricao") {
    cabecalho.push(
      video.legendaAutomatica
        ? "Legenda AUTOMÁTICA (gerada por máquina): números, nomes e datas podem estar errados."
        : "Legenda publicada pelo próprio canal."
    );
    // Aula em outro idioma acontece (Khan Academy, canal de matemática em inglês). O
    // conteúdo vale; o que não pode é o plano sair na língua do vídeo.
    if (video.idiomaLegenda && !/^pt/i.test(video.idiomaLegenda)) {
      cabecalho.push(
        `A legenda está em "${video.idiomaLegenda}", não em português: entenda o conteúdo ` +
          "e escreva o plano inteiro em português do Brasil."
      );
    }
    if (video.cortada) {
      cabecalho.push("A aula é longa: o texto abaixo é o começo dela.");
    }
    cabecalho.push("", "O que a aula fala:", video.transcricao);
  } else {
    cabecalho.push(
      "SEM LEGENDA disponível: não consegui ouvir a aula. O que vem abaixo é só a " +
        "descrição publicada pelo canal, use como pista do assunto, não como conteúdo."
    );
    if (video.descricao) cabecalho.push("", video.descricao);
    if (video.palavrasChave?.length) {
      cabecalho.push("", `Palavras-chave do vídeo: ${video.palavrasChave.join(", ")}`);
    }
  }

  return cabecalho.join("\n").slice(0, MAX_TEXTO);
}

/**
 * Vídeo do YouTube → material pronto.
 *
 * @param {string} videoId
 * @returns {Promise<{titulo:string, canal:string, duracao_s:number|null, miniatura:string,
 *   texto:string, grau:"transcricao"|"metadados", idiomaLegenda:string|null,
 *   legendaAutomatica:boolean, cortado:boolean}>}
 * @throws {LinkRuim}
 */
export async function lerVideo(videoId) {
  let detalhes = null;
  let legendas = null;

  /**
   * 🔴 A InnerTube RECUSOU o vídeo — e a recusa é AMBÍGUA, que é exatamente o que a
   * versão anterior deste arquivo não considerava.
   *
   * `LOGIN_REQUIRED` tem DOIS significados que chegam idênticos:
   *   a) o vídeo é privado / restrito por idade  → é do vídeo, e a culpa é do link;
   *   b) **quem perguntou foi um IP de datacenter** → é NOSSO, e o vídeo está ótimo.
   *
   * (b) é o caso normal em produção: a função roda em `iad1` (AWS us-east-1), e o
   * YouTube devolve `LOGIN_REQUIRED` no próprio `/player` pra faixa de nuvem. Ou seja:
   * o pai colava uma videoaula pública e recebia *"pode estar privado, ter sido
   * removido, ou pedir login"* — uma frase que só descreve o caso (a). Ele conferia o
   * link, que estava certo, e colava de novo.
   *
   * Pior: o `throw` daqui escapava de `lerVideo()` inteira, então **o degrau do oembed
   * logo abaixo nunca rodava** — justamente o degrau escrito pra este cenário ("responde
   * de qualquer IP, inclusive quando a InnerTube não fala com datacenter").
   *
   * Agora a recusa só ANOTA, e quem decide é o oembed: se ele devolve título e canal, o
   * vídeo é público e o problema era nosso (card honesto, sem legenda). Se ele também
   * recusa, aí sim o vídeo é o problema, e a mensagem (a) volta a ser verdade.
   */
  let recusado = false;

  for (const cliente of CLIENTES) {
    try {
      const j = await player(videoId, cliente);
      const status = j?.playabilityStatus?.status;
      if (status === "ERROR" || status === "LOGIN_REQUIRED") {
        recusado = true;
        // `ERROR` é do VÍDEO (não existe): nenhum outro cliente vai discordar, e insistir
        // só gasta tempo. `LOGIN_REQUIRED` pode ser só deste cliente, então o próximo
        // ainda vale a tentativa.
        if (status === "ERROR") break;
        continue;
      }
      detalhes = detalhes || j?.videoDetails || null;
      const renderer = j?.captions?.playerCaptionsTracklistRenderer;
      if (renderer?.captionTracks?.length) {
        legendas = renderer;
        break;
      }
    } catch (err) {
      if (err instanceof LinkRuim) throw err;
      console.warn("[ler-link] InnerTube falhou:", err?.message || err);
    }
  }

  const base = {
    videoId,
    miniatura: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    idiomaLegenda: null,
    legendaAutomatica: false,
    transcricao: "",
    descricao: "",
    palavrasChave: [],
    cortada: false,
  };

  /* Sem detalhes: o oembed ainda salva o card (título + canal), e o plano sai genérico. */
  if (!detalhes) {
    const o = await viaOembed(videoId);
    if (!o) {
      // As duas frases dizem coisas diferentes, e agora cada uma só sai quando é
      // verdade: houve recusa E o oembed confirmou que não dá pra ver o vídeo de fora.
      throw new LinkRuim(
        recusado
          ? "Não consegui abrir esse vídeo. Ele pode estar privado, ter sido removido, ou pedir login."
          : "Não consegui abrir esse vídeo agora. Confira o link, ou copie o assunto da aula e cole no seu pedido."
      );
    }
    const video = {
      ...base,
      titulo: o.titulo,
      canal: o.canal,
      duracao_s: null,
      grau: "metadados",
    };
    return { ...video, texto: montarTexto(video), cortado: false };
  }

  const track = escolherTrack(legendas);
  let transcricao = "";
  let traduzida = false;
  if (track) {
    const ehPt = /^pt/i.test(track.languageCode || "");
    if (!ehPt) {
      transcricao = await baixarLegenda(track, "pt");
      traduzida = !!transcricao;
    }
    // Sem tradução (o `tlang` é rate-limitado com força), a legenda no idioma original
    // é melhor que nada — e o cabeçalho do texto avisa o modelo em que língua ela veio.
    if (!transcricao) transcricao = await baixarLegenda(track, null);
  }

  const cortada = transcricao.length > MAX_TEXTO;
  const video = {
    ...base,
    titulo: detalhes.title || "",
    canal: detalhes.author || "",
    duracao_s: Number(detalhes.lengthSeconds) || null,
    descricao: (detalhes.shortDescription || "").slice(0, MAX_DESCRICAO),
    palavrasChave: (detalhes.keywords || []).slice(0, 12),
    transcricao: cortada ? transcricao.slice(0, MAX_TEXTO) : transcricao,
    // Traduzida = o texto está em português mesmo que a track fosse de outro idioma.
    idiomaLegenda: traduzida ? "pt" : track?.languageCode || null,
    legendaAutomatica: track ? track.kind === "asr" : false,
    cortada,
    grau: transcricao ? "transcricao" : "metadados",
  };

  return { ...video, texto: montarTexto(video), cortado: cortada };
}
