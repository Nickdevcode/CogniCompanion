/**
 * game-trailer.js — Player do trailer de Psybot (jogo.html, seção Vídeos).
 *
 * O card do vídeo é um link para o próprio .mp4, então sem JavaScript (ou num
 * navegador sem <dialog>) o clique abre o vídeo direto. Com JavaScript, o clique
 * abre o <dialog id="trailer-dialog"> e começa a tocar:
 *
 * - Esc fecha (nativo do <dialog>), o botão × fecha e o clique fora do quadro fecha;
 * - ao fechar, o vídeo PAUSA — senão o som continuaria atrás da página;
 * - a página atrás não rola enquanto o trailer está aberto;
 * - o foco volta para o card, para quem navega por teclado não se perder;
 * - em tela de celular, o vídeo já entra em tela cheia (as legendas do trailer
 *   precisam de tamanho para serem lidas).
 *
 * O play sai do clique do usuário, então o navegador deixa tocar com som. Se
 * mesmo assim ele recusar (economia de dados, política do sistema), os controles
 * do player continuam ali e um toque resolve.
 */
(function () {
  "use strict";

  var trigger = document.querySelector("[data-trailer-open]");
  var dialog = document.getElementById("trailer-dialog");
  if (!trigger || !dialog || typeof dialog.showModal !== "function") return;

  var video = dialog.querySelector("video");
  var closeButton = dialog.querySelector("[data-trailer-close]");
  if (!video) return;

  // Num celular em pé, o quadro fica com uns 200 px de altura e as legendas do
  // trailer pequenas demais para ler. Lá, o trailer já abre em tela cheia — e
  // deitado, onde o navegador deixa travar a orientação.
  var smallScreen = window.matchMedia("(max-width: 640px)");

  function enterFullscreen() {
    try {
      if (video.requestFullscreen) {
        var request = video.requestFullscreen();
        if (request && typeof request.then === "function") {
          request
            .then(function () {
              if (screen.orientation && screen.orientation.lock) {
                return screen.orientation.lock("landscape");
              }
            })
            .catch(function () {
              /* sem tela cheia ou sem trava: o player do diálogo continua valendo */
            });
        }
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen(); // iOS: só o próprio <video> entra em tela cheia
      }
    } catch (error) {
      /* idem: tela cheia é um bônus, não uma condição para assistir */
    }
  }

  // Saiu da tela cheia: devolve a orientação ao celular.
  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
      try {
        screen.orientation.unlock();
      } catch (error) {
        /* navegador sem trava de orientação */
      }
    }
  });

  function open(event) {
    event.preventDefault();
    if (dialog.open) return;

    dialog.showModal();
    document.documentElement.classList.add("is-trailer-open");

    // Quem já assistiu até o fim e abre de novo quer ver de novo, não a tela final.
    if (video.ended) video.currentTime = 0;

    var playing = video.play();
    if (playing && typeof playing.catch === "function") {
      playing.catch(function () {
        /* reprodução automática recusada: os controles nativos continuam visíveis */
      });
    }

    // Ainda dentro do clique: tela cheia só é concedida a partir de um gesto.
    if (smallScreen.matches) enterFullscreen();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  // Um lugar só para tudo que acontece ao fechar — o Esc nativo também passa aqui.
  dialog.addEventListener("close", function () {
    video.pause();
    document.documentElement.classList.remove("is-trailer-open");
    trigger.focus();
  });

  // O <dialog> cobre a tela inteira; clique que cai nele, e não no quadro, foi no fundo.
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) close();
  });

  if (closeButton) closeButton.addEventListener("click", close);
  trigger.addEventListener("click", open);
})();
