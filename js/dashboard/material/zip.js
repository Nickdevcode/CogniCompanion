/**
 * zip.js — Leitor de ZIP nativo, por fatia.
 *
 * Existe porque `.docx`, `.pptx` e `.xlsx` são ZIP de XML, e extrair o texto deles no
 * navegador é o que evita subir o arquivo: um `.docx` de 8 MB com fotos vira 30 KB de
 * texto. Sem biblioteca — `DecompressionStream` é nativo em todos os navegadores
 * desde maio/2023 (Baseline).
 *
 * Duas regras estruturais, e as duas são o que separa isto de um leitor que "funciona
 * no meu arquivo de teste":
 *
 * 1. **Lê o CENTRAL DIRECTORY, nunca varre local headers em sequência.** Arquivo
 *    gerado por streaming grava zero nos tamanhos do local header e só preenche a
 *    verdade no central directory (é pra isso que serve o bit 3, o data descriptor).
 *    Varrer em sequência funciona com o que o Word gera e quebra com o que um site de
 *    conversão gera.
 *
 * 2. **Fatia, não carrega.** `file.slice()` devolve um Blob preguiçoso: nada sai do
 *    disco até o `arrayBuffer()`. Um `.pptx` de 40 MB custa ~2 MB de pico porque só
 *    `slideN.xml` é descomprimido e `ppt/media/*` — que é o peso todo — nunca é
 *    tocado. Com `file.arrayBuffer()` seriam 40 MB antes de começar.
 */

const ASSIN_EOCD = 0x06054b50;
const ASSIN_EOCD64_LOCATOR = 0x07064b50;
const ASSIN_CENTRAL = 0x02014b50;
const ASSIN_LOCAL = 0x04034b50;

const METODO_STORED = 0;
const METODO_DEFLATE = 8;

/** Comentário do ZIP tem no máximo 65535 bytes; o EOCD fixo tem 22. */
const JANELA_EOCD = 22 + 0xffff;

/**
 * XML descomprimido acima disso não vira DOM: o `DOMParser` gasta ~10× o tamanho do
 * texto em memória, e um `document.xml` de 30 MB derruba a aba do celular. O tamanho
 * descomprimido vem do central directory, então dá pra recusar ANTES de gastar.
 */
export const MAX_DESCOMPRIMIDO = 20 * 1024 * 1024;

/** Erro com mensagem já escrita pro pai. */
export class ErroDeZip extends Error {}

/**
 * @typedef {object} EntradaZip
 * @property {string} nome
 * @property {number} metodo
 * @property {number} tamanhoComprimido
 * @property {number} tamanhoDescomprimido
 * @property {number} offsetLocal
 */

/**
 * Acha o End Of Central Directory.
 *
 * Varre de TRÁS PRA FRENTE e valida o comprimento do comentário: a assinatura de 4
 * bytes aparece por acaso dentro de dados comprimidos com frequência incômoda, e
 * pegar a primeira ocorrência (ou varrer pra frente) escolhe a errada.
 *
 * @param {Blob} file
 * @returns {Promise<{totalEntradas:number, tamanhoCD:number, offsetCD:number}>}
 */
async function acharEOCD(file) {
  const janela = Math.min(file.size, JANELA_EOCD);
  const buf = await file.slice(file.size - janela).arrayBuffer();
  const view = new DataView(buf);

  for (let i = buf.byteLength - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) !== ASSIN_EOCD) continue;
    const tamanhoComentario = view.getUint16(i + 20, true);
    // O EOCD é o último registro do arquivo: o comentário tem que ir até o fim.
    if (i + 22 + tamanhoComentario !== buf.byteLength) continue;

    const totalEntradas = view.getUint16(i + 10, true);
    const tamanhoCD = view.getUint32(i + 12, true);
    const offsetCD = view.getUint32(i + 16, true);

    /**
     * ZIP64: os campos de 16/32 bits saturam e a verdade fica num registro separado,
     * localizado pelo locator logo antes do EOCD. Um material de escola nunca chega
     * lá (precisaria de 65 mil entradas ou 4 GB). Detectar e recusar é honesto;
     * implementar pela metade produziria offsets errados e lixo descomprimido.
     */
    const saturou =
      totalEntradas === 0xffff || tamanhoCD === 0xffffffff || offsetCD === 0xffffffff;
    const temLocator =
      i >= 20 && view.getUint32(i - 20, true) === ASSIN_EOCD64_LOCATOR;
    if (saturou || temLocator) {
      throw new ErroDeZip(
        "Esse arquivo usa um formato de compactação que eu não leio. Salve como PDF e mande de novo."
      );
    }

    return { totalEntradas, tamanhoCD, offsetCD };
  }

  throw new ErroDeZip("Esse arquivo parece estar corrompido — não consegui abrir.");
}

/**
 * Lê o central directory inteiro e devolve as entradas por nome.
 *
 * @param {Blob} file
 * @returns {Promise<Map<string, EntradaZip>>}
 */
export async function abrirZip(file) {
  const { tamanhoCD, offsetCD } = await acharEOCD(file);
  const buf = await file.slice(offsetCD, offsetCD + tamanhoCD).arrayBuffer();
  const view = new DataView(buf);
  const utf8 = new TextDecoder("utf-8");

  const entradas = new Map();
  let p = 0;

  while (p + 46 <= buf.byteLength) {
    if (view.getUint32(p, true) !== ASSIN_CENTRAL) break;

    const flags = view.getUint16(p + 8, true);
    const metodo = view.getUint16(p + 10, true);
    const tamanhoComprimido = view.getUint32(p + 20, true);
    const tamanhoDescomprimido = view.getUint32(p + 24, true);
    const tamNome = view.getUint16(p + 28, true);
    const tamExtra = view.getUint16(p + 30, true);
    const tamComentario = view.getUint16(p + 32, true);
    const offsetLocal = view.getUint32(p + 42, true);

    // Bit 0 = criptografado. Sem isso, descomprimiríamos ruído e mandaríamos pro
    // modelo — que responderia alguma coisa, que é o pior desfecho possível.
    if (flags & 0x0001) {
      throw new ErroDeZip(
        "Esse arquivo está protegido por senha. Abra, salve uma cópia sem senha e mande de novo."
      );
    }

    const nome = utf8.decode(new Uint8Array(buf, p + 46, tamNome));
    entradas.set(nome, {
      nome,
      metodo,
      tamanhoComprimido,
      tamanhoDescomprimido,
      offsetLocal,
    });

    p += 46 + tamNome + tamExtra + tamComentario;
  }

  if (!entradas.size) {
    throw new ErroDeZip("Esse arquivo parece estar vazio ou corrompido.");
  }
  return entradas;
}

/**
 * Extrai uma entrada.
 *
 * @param {Blob} file
 * @param {EntradaZip} entrada
 * @returns {Promise<Uint8Array>}
 */
export async function lerEntrada(file, entrada) {
  if (entrada.tamanhoDescomprimido > MAX_DESCOMPRIMIDO) {
    throw new ErroDeZip(
      "Esse arquivo é grande demais pra eu ler aqui. Mande só a parte que interessa, ou salve como PDF."
    );
  }
  if (entrada.metodo !== METODO_STORED && entrada.metodo !== METODO_DEFLATE) {
    // Word/Excel/PowerPoint só escrevem 0 ou 8, mas um arquivo que passou por
    // 7-Zip ou WinRAR pode vir em LZMA, bzip2 ou zstd.
    throw new ErroDeZip(
      "Esse arquivo foi compactado de um jeito que eu não leio. Salve como PDF e mande de novo."
    );
  }

  /**
   * 🔴 Reparsear o LOCAL header é obrigatório, e é o erro nº 1 de leitor de ZIP
   * escrito à mão: **o campo de extras do local header tem tamanho DIFERENTE do que
   * está no central directory** (o local costuma carregar timestamps estendidos que o
   * central não repete). Reaproveitar o `tamExtra` do central joga o ponteiro 4-20
   * bytes pra dentro do stream comprimido, e o deflate estoura com "invalid data".
   */
  const cabecalho = await file
    .slice(entrada.offsetLocal, entrada.offsetLocal + 30)
    .arrayBuffer();
  const view = new DataView(cabecalho);
  if (view.getUint32(0, true) !== ASSIN_LOCAL) {
    throw new ErroDeZip("Esse arquivo parece estar corrompido — não consegui abrir.");
  }
  const tamNomeLocal = view.getUint16(26, true);
  const tamExtraLocal = view.getUint16(28, true);
  const inicio = entrada.offsetLocal + 30 + tamNomeLocal + tamExtraLocal;

  const dados = file.slice(inicio, inicio + entrada.tamanhoComprimido);
  if (entrada.metodo === METODO_STORED) {
    return new Uint8Array(await dados.arrayBuffer());
  }

  /**
   * 🔴 `"deflate-raw"`, não `"deflate"`. O segundo espera os 2 bytes de cabeçalho
   * zlib e o checksum Adler-32 no fim; dados de ZIP não têm nenhum dos dois, e a
   * chamada lança "The compressed data was not valid". É o erro nº 2, e o mais comum.
   */
  try {
    const fluxo = dados.stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  } catch (err) {
    console.error("[Companion] Falha ao descomprimir", entrada.nome, err);
    throw new ErroDeZip("Não consegui abrir o conteúdo desse arquivo.");
  }
}

/**
 * Extrai uma entrada como texto UTF-8 (é o que todo XML de OOXML é).
 * @param {Blob} file
 * @param {EntradaZip} entrada
 * @returns {Promise<string>}
 */
export async function lerTexto(file, entrada) {
  const bytes = await lerEntrada(file, entrada);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Parseia XML com o `DOMParser` nativo.
 *
 * Ele **não lança** com XML inválido: devolve um documento contendo `<parsererror>`,
 * e quem não checa isso segue adiante extraindo texto de uma mensagem de erro.
 *
 * Bônus de segurança que vale registrar: `DOMParser` de navegador não resolve
 * entidades externas e limita expansão de entidade, então XXE e "billion laughs" não
 * se aplicam a este caminho — o que importa, porque o arquivo veio do grupo do
 * WhatsApp, não da mão do pai.
 *
 * @param {string} xml
 * @returns {Document}
 */
export function parsearXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new ErroDeZip("O conteúdo desse arquivo está corrompido.");
  }
  return doc;
}
