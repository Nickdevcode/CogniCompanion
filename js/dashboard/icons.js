/**
 * icons.js — Biblioteca central de ícones SVG do painel.
 *
 * Todos os ícones são markup ESTÁTICO (sem dado de usuário), no estilo do
 * projeto: traço (stroke) com currentColor, viewBox 24×24. Centralizar aqui
 * evita duplicação e mantém o conjunto coerente entre as seções.
 *
 * Uso: passe a string como `svg:` no helper `el()` (ou em innerHTML de markup
 * controlado). Nunca concatene com conteúdo dinâmico.
 */

const stroke = (paths, w = "1.9") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const fill = (paths) =>
  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths}</svg>`;

/** Conjunto nomeado de ícones reutilizáveis. */
export const ICON = {
  // Navegação / genéricos
  home: stroke('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>'),
  chat: stroke('<path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3 21l1.8-5.8A8.5 8.5 0 1 1 21 11.5Z"/>'),
  book: stroke('<path d="M3 5.5A2.5 2.5 0 0 1 5.5 4H11v15.5H5.5A2.5 2.5 0 0 0 3 22Z"/><path d="M21 5.5A2.5 2.5 0 0 0 18.5 4H13v15.5h5.5A2.5 2.5 0 0 1 21 22Z"/>'),
  calendar: stroke('<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  gear: stroke('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', "1.7"),

  // Pessoas / robô
  user: stroke('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  robot: stroke('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="3.5" r="1.3" fill="currentColor" stroke="none"/><path d="M2 13v3M22 13v3"/><circle cx="9" cy="14" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.3" fill="currentColor" stroke="none"/>'),

  // Conteúdo / ações
  clock: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
  chart: stroke('<path d="M4 19V5M4 19h16"/><path d="m7 14 3.5-4 3 2.5L18 7"/>'),
  bulb: stroke('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.7c.5.4.8 1 .8 1.6v.7h6v-.7c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"/>'),
  search: stroke('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  filter: stroke('<path d="M3 5h18l-7 8v6l-4-2v-4Z"/>'),
  shield: stroke('<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9 4-0.7 7-4.6 7-9V6Z"/>'),
  shieldCheck: stroke('<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9 4-0.7 7-4.6 7-9V6Z"/><path d="m9 11.5 2 2 4-4"/>'),
  wifi: stroke('<path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'),
  plus: stroke('<path d="M12 5v14M5 12h14"/>', "2.2"),
  edit: stroke('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: stroke('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
  check: stroke('<path d="M20 6 9 17l-5-5"/>', "2.2"),
  heart: stroke('<path d="M12 20.5 4.2 12.7a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z"/>'),
  alert: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>'),
  bell: stroke('<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>'),
  refresh: stroke('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/>'),
  // Seta pra cima: acompanha o selo "subiu de nível" na Trilha. Traço mais
  // grosso porque ela é renderizada bem pequena (10px) dentro da pílula.
  arrowUp: stroke('<path d="M12 19V5M6 11l6-6 6 6"/>', "2.4"),
  // Broto: usado na Trilha de aprendizado pro que a criança ainda está
  // praticando. Escolhido de propósito no lugar de alerta/aviso — é crescimento
  // em curso, não problema (ver o cuidado de tom no plano técnico).
  sprout: stroke('<path d="M12 21v-8"/><path d="M12 13C12 9.7 9.3 7 6 7c0 3.3 2.7 6 6 6Z"/><path d="M12 13c0-3 2.2-5.5 5-5.5 0 3-2.2 5.5-5 5.5Z"/>'),
  // Mapa da aula: uma linha do tempo com dois marcos em alturas diferentes — é
  // literalmente o desenho da seção (eixo do tempo + momentos que importam).
  timeline: stroke('<path d="M3 18h18"/><path d="M7.5 18V9.5"/><circle cx="7.5" cy="6.8" r="2.4"/><path d="M16 18v-4.2"/><circle cx="16" cy="11.4" r="2"/>'),
  // Microfone: a segunda porta de entrada do perfil (o pai fala com o robô e a
  // instrução cai no campo). Aparece pequeno, ao lado de texto de apoio.
  mic: stroke(
    '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3.5M9 21.5h6"/>',
    "1.7"
  ),
  // Editor de rosto: a própria tela do robô (moldura + dois olhos), que é
  // literalmente o que a seção deixa a criança desenhar.
  face: stroke('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><rect x="6.5" y="9.5" width="4.5" height="5" rx="2" fill="currentColor" stroke="none"/><rect x="13" y="9.5" width="4.5" height="5" rx="2" fill="currentColor" stroke="none"/>'),

  /* --- Mesa de Estudos (ago/2026) --- */
  // Quadro de colunas: o desenho da própria seção (as três colunas do Kanban).
  columns: stroke('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M9 4.5v15M15 4.5v15"/>'),
  // Câmera: o botão "Da foto". A foto é o atalho que evita o pai digitar o plano
  // inteiro — é a porta de entrada principal da tela, não um extra.
  camera: stroke('<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z"/><circle cx="12" cy="12.5" r="3.4"/>'),
  // Imagem/galeria: o botão "Escolher foto" (a que já está no celular).
  image: stroke('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 4.5-4.5 3 3L15.5 11l4.5 4.5"/>'),
  /* --- Rodada 2 (ago/2026): o material deixou de ser só foto --- */
  // Documento com o canto dobrado: o botão "Escolher arquivo" e o selo dos planos
  // que nasceram de PDF, Word, slides ou planilha.
  file: stroke('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
  // Câmera de vídeo: o selo do plano que nasceu de um vídeo da lousa. Desenho de
  // câmera, e não um "play" — play sugere que dá pra assistir, e o vídeo não é
  // guardado em lugar nenhum.
  video: stroke('<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="m15.5 10.8 4.6-2.6a.6.6 0 0 1 .9.5v6.6a.6.6 0 0 1-.9.5l-4.6-2.6Z"/>'),
  // Quadrado: parar a gravação. O par universal do círculo de gravar.
  stop: stroke('<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>'),
  /* --- Rodada 3 (ago/2026): o material pode ser um link --- */
  // Dois elos de corrente: o desenho universal de "link". Não é um globo (que diria
  // "internet", e o material não é a internet — é aquele endereço) nem um "play" (que
  // valeria só pro YouTube, e metade dos links é página).
  link: stroke('<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2"/>'),
  // Faísca: marca o card que a COGNI moveu sozinha. Ícone, não o emoji ✨ — a
  // regra do projeto é ícone na UI, e um emoji herda a fonte do sistema (muda de
  // desenho e de cor entre Windows/Android e ignora o tema).
  sparkle: stroke('<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z"/><path d="M18.5 3.5v3M20 5h-3"/>', "1.7"),
  // Menu "⋯" do card: o caminho equivalente a TODO movimento que o arraste faz.
  // Ele não é um extra de conveniência — é o que garante que o quadro inteiro é
  // operável sem arrastar (mouse, teclado e leitor de tela).
  dots: stroke('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
  // Desfazer: devolve pra coluna anterior o card que a Cogni moveu.
  undo: stroke('<path d="M4 9h10a5 5 0 0 1 0 10h-4"/><path d="M8 5 4 9l4 4"/>'),
  arrowLeft: stroke('<path d="M19 12H5M11 6l-6 6 6 6"/>', "2.1"),
  arrowRight: stroke('<path d="M5 12h14M13 6l6 6-6 6"/>', "2.1"),
  // A "pegada" do arraste — a convenção que o olho já conhece de listas
  // reordenáveis. Aparece na dica da fila de planos, onde o gesto precisa ser
  // ANUNCIADO: uma faixa de chips não parece arrastável por si só.
  grip: stroke(
    '<circle cx="9" cy="6" r="1.35" fill="currentColor"/>' +
      '<circle cx="15" cy="6" r="1.35" fill="currentColor"/>' +
      '<circle cx="9" cy="12" r="1.35" fill="currentColor"/>' +
      '<circle cx="15" cy="12" r="1.35" fill="currentColor"/>' +
      '<circle cx="9" cy="18" r="1.35" fill="currentColor"/>' +
      '<circle cx="15" cy="18" r="1.35" fill="currentColor"/>'
  ),
};

/* --------------------------------------------------------------------------
   Ícones por matéria (conversas.materia / planos.foco)
   Cada matéria tem um ícone próprio; usados em Início, Conversas e Aprendizado.
   -------------------------------------------------------------------------- */
const MATERIA_ICONS = {
  portugues: stroke('<path d="M4 19.5V6a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 1.5Z"/><path d="M9 8h6M9 12h6"/>'),
  matematica: stroke('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h2M14 12h2M8 16h2M14 16h2"/>'),
  // Erlenmeyer: continua sendo o guarda-chuva "Ciências" do fundamental — as três
  // matérias do médio abaixo ganham cada uma o SEU símbolo, senão a separação que
  // o servidor passou a fazer não chegaria aos olhos do pai.
  ciencias: stroke('<path d="M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.5L14 9V3"/>'),
  // Átomo: núcleo + duas órbitas cruzadas.
  fisica: stroke('<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(30 12 12)"/>', "1.7"),
  // Molécula: três átomos ligados (e não outro frasco, que se confundiria com
  // o erlenmeyer de Ciências a 15px).
  quimica: stroke('<circle cx="6" cy="17.5" r="2.8"/><circle cx="17.5" cy="16" r="2.6"/><circle cx="12" cy="6" r="2.8"/><path d="m8.2 15.5 2.4-6.9M13.9 8.1l2.6 5.6"/>', "1.7"),
  // Dupla hélice do DNA.
  biologia: stroke('<path d="M7 3c0 4.5 10 5.5 10 9s-10 4.5-10 9"/><path d="M17 3c0 4.5-10 5.5-10 9s10 4.5 10 9"/><path d="M8.6 7h6.8M8.6 17h6.8M7.6 10h8.8"/>', "1.7"),
  // Balão de pensamento (não de fala): o ícone `chat` já é a conversa.
  filosofia: stroke('<path d="M6.5 16a4 4 0 0 1-.8-7.9A4.5 4.5 0 0 1 14 6.2 3.8 3.8 0 0 1 18 12a3.8 3.8 0 0 1-3.5 4Z"/><circle cx="7.5" cy="19" r="1.4"/><circle cx="4" cy="21.2" r="0.9"/>', "1.7"),
  // Pessoas conectadas: a matéria é sobre o laço entre elas, não sobre uma delas.
  sociologia: stroke('<circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="17" r="2.6"/><circle cx="19" cy="17" r="2.6"/><path d="M10.4 7.3 6.6 14.6M13.6 7.3l3.8 7.3M7.6 17h8.8"/>', "1.7"),
  // Paleta de tinta.
  artes: stroke('<path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.8-1.2-3 0-.9.8-1.7 1.9-1.7H17a4 4 0 0 0 4-4c0-4.1-4-7.5-9-7.5Z"/><circle cx="8" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="7" cy="13.5" r="1.1" fill="currentColor" stroke="none"/>', "1.7"),
  educacao_fisica: stroke('<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>'),
  historia: stroke('<path d="M4 8h16M5 8 12 4l7 4M6 8v9M10 8v9M14 8v9M18 8v9M4 21h16"/>'),
  geografia: stroke('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9Z"/>'),
  idiomas: stroke('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9M12 3c-2.5 2.5-4 6-4 9s1.5 6.5 4 9"/>'),
  outros: stroke('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 17h.01"/>'),
};

/** @returns {string} ícone SVG da matéria (fallback: "outros"). */
export function materiaIcon(materia) {
  return MATERIA_ICONS[materia] || MATERIA_ICONS.outros;
}

/* --------------------------------------------------------------------------
   Ícones por origem do material (planos_estudo.origem)
   Usados no selo do card do plano, na bandeja da captura e na revisão. Mesmo
   padrão de `materiaIcon`: um lugar só, pra as três telas não divergirem.
   -------------------------------------------------------------------------- */
const ORIGEM_ICONS = {
  foto: ICON.camera,
  arquivo: ICON.file,
  audio: ICON.mic,
  video: ICON.video,
  // O plano pedido por escrito: balão de conversa, porque foi o pai FALANDO com a
  // Cogni — não tem arquivo nenhum por trás dele.
  pedido: ICON.chat,
  // Videoaula ou página que o responsável colou (rodada 3).
  link: ICON.link,
};

/** @returns {string|null} ícone da origem, ou null se o plano foi digitado. */
export function origemIcon(origem) {
  return ORIGEM_ICONS[origem] || null;
}

/** Chevron pequeno pra direita (links "ver mais"). */
export function chevronRight() {
  return stroke('<path d="m9 6 6 6-6 6"/>', "2.2");
}

/** Chevron pequeno pra baixo. */
export function chevronDown() {
  return stroke('<path d="m6 9 6 6 6-6"/>', "2.2");
}
