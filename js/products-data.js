/**
 * products-data.js — Catálogo dos materiais (produtos) da Cogni.
 *
 * Fonte de dados ÚNICA da página de detalhe (produto.html) e dos cards de
 * materiais da home. Em vez de duplicar uma página por produto, mantemos só
 * estes dados; a página monta o produto certo a partir do ?id= da URL.
 *
 * Cada item:
 *  - id     : identificador na URL (produto.html?id=microfone) — kebab-case
 *  - name   : nome exibido (título grande)
 *  - price  : preço já formatado em reais
 *  - image  : caminho da foto (assets/images/…)
 *  - alt    : texto alternativo da foto (acessibilidade)
 *  - desc   : descrição do produto (texto exato do Figma)
 *
 * Exposto em window.COGNI_PRODUCTS (script clássico, sem bundler — o projeto
 * é HTML/CSS/JS puro).
 */
(function () {
  "use strict";

  window.COGNI_PRODUCTS = [
    {
      id: "fonte",
      name: "Fonte 5V 5A",
      price: "R$ 30,00",
      image: "assets/images/produto-fonte.png",
      alt: "Fonte de alimentação chaveada de 5 volts e 5 amperes",
      desc: "Uma fonte 5V 5A é um dispositivo que converte energia elétrica (geralmente da tomada) para uma saída de 5 volts com capacidade de até 5 amperes de corrente.",
    },
    {
      id: "esp32",
      name: "ESP32 DevKit V1",
      price: "R$ 35,00",
      image: "assets/images/produto-esp32.png",
      alt: "Placa microcontroladora ESP32 DevKit V1",
      desc: "O cérebro do robô. É a peça que recebe o que você fala, conversa com o servidor pela internet e devolve a voz da Cogni pro alto-falante.",
    },
    {
      id: "microfone",
      name: "Microfone",
      price: "R$ 40,00",
      image: "assets/images/produto-microfone.png",
      alt: "Módulo de microfone MEMS para captação de voz",
      desc: "O ouvido da Cogni. Capta a sua voz com qualidade alta e bem limpa, do jeitinho que a IA precisa pra entender direitinho o que você falou.",
    },
    {
      id: "alto-falante",
      name: "Alto-falante",
      price: "R$ 45,00",
      image: "assets/images/produto-altofalante.png",
      alt: "Par de alto-falantes 4 ohms 3 watts com cone de papel",
      desc: "A voz da Cogni. É por aqui que ela responde, conversa e dá risada com você, com um som encorpado graças ao cone de papel.",
    },
    {
      id: "modulo-max",
      name: "Módulo MAX",
      price: "R$ 30,00",
      image: "assets/images/produto-modulo-max.png",
      alt: "Módulo amplificador de áudio MAX",
      desc: "O tradutor do som. Pega o áudio que vem do cérebro do robô e prepara ele pra sair com força e clareza no alto-falante.",
    },
    {
      id: "camera",
      name: "Módulo ESP32-CAM",
      price: "R$ 45,00",
      image: "assets/images/produto-camera.png",
      alt: "Módulo de câmera ESP32-CAM",
      desc: "Os olhos da Cogni. É a câmera que permite ela enxergar o caderno, o desenho ou qualquer coisa que você quiser mostrar.",
    },
    {
      id: "display-tft",
      name: "Display TFT 3.5",
      price: "R$ 90,00",
      image: "assets/images/produto-display-tft.png",
      alt: "Display TFT LCD de 3,5 polegadas",
      // O texto original do Figma usa aspas tipográficas em "rostinho".
      desc: "O “rostinho” da Cogni. É a telinha principal, onde aparecem expressões, menus e o que está rolando na conversa.",
    },
    {
      id: "display-oled",
      name: "Display OLED",
      price: "R$ 50,00",
      image: "assets/images/produto-display-oled.png",
      alt: "Display OLED azul para ícones e avisos",
      desc: "A telinha extra. Mostra ícones, o “olhinho” da Cogni e avisos rápidos enquanto ela tá ativa.",
    },
    {
      id: "protoboard",
      name: "Protoboard",
      price: "R$ 14,99",
      image: "assets/images/produto-protoboard.png",
      alt: "Protoboard de 830 pontos para montagem sem solda",
      desc: "A base de montagem do robô. É onde todas as peças se encaixam e se conectam, sem precisar de solda nenhuma.",
    },
  ];
})();
