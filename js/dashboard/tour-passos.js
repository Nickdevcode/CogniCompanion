/**
 * tour-passos.js — O roteiro do tutorial guiado (só conteúdo).
 *
 * Separado do motor (`tour.js`) de propósito: mexer no texto de uma parada é a
 * coisa mais frequente que se faz num tutorial, e não deveria significar abrir o
 * arquivo que calcula geometria e prende foco.
 *
 * REGRAS DE ESCRITA (as mesmas do resto do painel):
 *   • Sem travessão em texto de interface.
 *   • Maiúscula onde a frase ABRE a linha.
 *   • Nada de gênero pra criança (o perfil não guarda um): "a criança", o nome,
 *     ou a construção sem artigo.
 *   • Cada parada responde "o que EU faço aqui?", não "o que esta tela é".
 *
 * ÂNCORAS: os seletores apontam pra `data-tour="…"` postos nas seções. Só
 * ancoramos em elemento que existe SEMPRE (barra de ferramentas, palco, ações do
 * cabeçalho), nunca em card de dado: um pai recém-pareado tem zero conversa e
 * zero plano, e o tutorial dele não pode ser uma sequência de buracos vazios.
 * Ainda assim, alvo que não aparece não trava nada (o motor centraliza o balão).
 */

/**
 * Monta o roteiro. Recebe os nomes pra o texto falar da família de verdade em
 * vez de "a criança" genérica.
 *
 * @param {object} cfg
 * @param {string} [cfg.nomeCrianca] — primeiro nome da criança pareada
 * @returns {Array<object>} passos no formato que o `tour.js` consome
 */
export function montarPassos({ nomeCrianca } = {}) {
  // Sem nome no perfil, "a criança" mantém as frases corretas nos dois casos.
  const nome = (nomeCrianca || "").trim() || "a criança";

  return [
    {
      id: "boas-vindas",
      rota: "inicio",
      titulo: "Deixa eu te mostrar o painel",
      texto: [
        "São 9 paradas rápidas, uma por tela. Eu troco de seção sozinho: você só lê e vai clicando em “Próximo”.",
        "Dá pra sair a qualquer momento e voltar depois em Configurações.",
      ],
    },
    {
      id: "navegacao",
      rota: "inicio",
      alvo: '[data-tour="nav"]',
      alvoMobile: '[data-tour="tabbar"]',
      posicao: "right",
      raio: 14,
      titulo: "Por aqui você anda pelo painel",
      texto: [
        "São seis telas: Início, Conversas, Aprendizado, Mesa de Estudos, Rosto da Cogni e Configurações.",
        `Logo acima fica o card ${nome === "a criança" ? "da criança pareada" : "de " + nome}: é o perfil que este painel está lendo do robô.`,
      ],
      // No celular a mesma navegação mora na barra de baixo, e a frase acima
      // menciona um card que só existe na sidebar. Trocamos as duas coisas.
      textoMobile: [
        "São seis telas, todas na barra de baixo, sempre à mão.",
        "O menu de cima (as três linhas) abre a lista inteira com o perfil da criança e a sua conta.",
      ],
    },
    {
      id: "inicio",
      rota: "inicio",
      alvo: '[data-tour="ini-grid"]',
      posicao: "top",
      raio: 20,
      titulo: "O dia, em um olhar",
      texto: [
        "Esta é a tela que responde “como foi hoje?”: a última conversa, o plano da vez, os números da semana e o bilhete que a Cogni escreve pra você.",
        "Se ainda estiver vazio, é só porque o robô não conversou nenhuma vez. Enche sozinho.",
      ],
    },
    {
      id: "conversas",
      rota: "conversas",
      alvo: '[data-tour="cv-toolbar"]',
      posicao: "bottom",
      raio: 18,
      titulo: "Tudo que foi perguntado, na íntegra",
      texto: [
        `O Diário guarda cada pergunta ${nome === "a criança" ? "da criança" : "de " + nome} e cada resposta da Cogni, do jeito que aconteceu.`,
        "Busque por palavra, filtre por matéria, ou ligue “Tópicos sensíveis” pra ver só as conversas que a Cogni marcou como delicadas.",
      ],
    },
    {
      id: "aprendizado",
      rota: "aprendizado",
      alvo: '[data-tour="ap-materias"]',
      posicao: "bottom",
      raio: 18,
      titulo: "Onde o tempo foi parar",
      texto: [
        "Quanto tempo em cada matéria, os tópicos explorados e a trilha do que já ficou firme e do que ainda está sendo praticado.",
        "A trilha quem escreve é o robô, conversando. Você não precisa preencher nada aqui.",
      ],
    },
    {
      id: "mesa",
      rota: "mesa",
      alvo: '[data-tour="mesa-acoes"]',
      posicao: "bottom",
      raio: 24,
      titulo: "Aqui você dá o rumo",
      texto: [
        "A Mesa é o único lugar em que você manda no que a Cogni vai puxar. Aponte a câmera pro caderno ou pra prova em “Criar com a Cogni” e ela monta o plano; “Escrever eu mesmo” é o caminho na mão.",
        "Os planos entram numa fila que você arrasta. O primeiro é por onde ela começa.",
      ],
    },
    {
      id: "rosto",
      rota: "rosto",
      alvo: '[data-tour="rosto-palco"]',
      posicao: "bottom",
      raio: 22,
      titulo: "Esta tela é da criança",
      texto: [
        `Passe o aparelho: ${nome === "a criança" ? "a criança" : nome} escolhe os olhos da Cogni e o rosto muda no robô na hora.`,
        "É a única parte do painel feita pra ela mexer, e não pra você.",
      ],
    },
    {
      id: "config",
      rota: "config",
      alvo: '[data-tour="cfg-perfil"]',
      posicao: "bottom",
      raio: 20,
      titulo: "O que você ajusta aqui, a Cogni leva pra conversa",
      texto: [
        "Idade e série já bastam pra ela parar de perguntar o básico. Mais abaixo ficam o tema do painel, a sua conta e o vínculo com o robô (com o código de pareamento, caso precise dele de novo).",
      ],
    },
    {
      id: "fim",
      rota: "inicio",
      titulo: "É isso. Bom proveito!",
      texto: [
        "Ficou dúvida em algum número ou selo? Procure o “?” do lado dele: quase tudo no painel tem uma explicação de uma linha.",
        "Pra rever este tutorial: Configurações, lá embaixo, em “Rever o tutorial”.",
      ],
    },
  ];
}
