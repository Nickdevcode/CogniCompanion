/**
 * auth.js — Telas de Login e Cadastro (lógica real, via Supabase Auth).
 *
 *  - Botão do olho: alterna mostrar/ocultar a senha (igual ao original).
 *  - Cadastro:  supabase.auth.signUp (e-mail/senha) + nome em user_metadata.
 *  - Login:     supabase.auth.signInWithPassword (e-mail/senha).
 *  - Google:    supabase.auth.signInWithOAuth({ provider: "google" }).
 *
 * Em caso de sucesso, redireciona para index.html (a confirmação de e-mail
 * está desativada no projeto, então o login é imediato após o cadastro).
 *
 * Depende de window.cognifyAuth (js/supabase-config.js) e, opcionalmente, de
 * window.cognifyToast (js/toast.js) para mensagens.
 */

(function () {
  "use strict";

  const REDIRECT_AFTER_AUTH = "index.html"; // destino após LOGIN bem-sucedido
  // Modo demonstração: vai DIRETO pro painel. É o que o visitante veio ver, e
  // passar pela home só adiciona um clique entre ele e as telas avaliadas.
  const REDIRECT_DEMO = "dashboard.html";
  const REDIRECT_AFTER_SIGNUP = "login.html"; // após CADASTRO: manda logar
  const MIN_PASSWORD = 6; // padrão do Supabase

  /* ====================================================================
     Mostrar / ocultar senha (comportamento original, preservado)
     ==================================================================== */
  function setupPasswordToggles() {
    document.querySelectorAll("[data-toggle-pass]").forEach(function (btn) {
      const inputId = btn.getAttribute("data-toggle-pass");
      const input = document.getElementById(inputId);
      if (!input) return;

      btn.addEventListener("click", function () {
        const willReveal = input.type === "password";
        input.type = willReveal ? "text" : "password";
        btn.classList.toggle("is-revealed", willReveal);
        btn.setAttribute("aria-pressed", String(willReveal));
        btn.setAttribute(
          "aria-label",
          willReveal ? "Ocultar senha" : "Mostrar senha"
        );
        input.focus();
      });
    });
  }

  /* ====================================================================
     Helpers de UI (feedback inline + estado de loading do botão)
     ==================================================================== */

  // Garante um elemento de feedback acessível (aria-live) logo após o título
  // do formulário, reutilizando-o entre chamadas.
  function getFeedbackEl(form) {
    let el = form.querySelector("[data-auth-feedback]");
    if (!el) {
      el = document.createElement("p");
      el.setAttribute("data-auth-feedback", "");
      el.className = "auth__feedback";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.hidden = true;
      const line = form.querySelector(".auth__title-line");
      if (line && line.parentNode) {
        line.parentNode.insertBefore(el, line.nextSibling);
      } else {
        form.insertBefore(el, form.firstChild);
      }
    }
    return el;
  }

  function setFeedback(form, message, type) {
    const el = getFeedbackEl(form);
    el.textContent = message || "";
    el.classList.remove("auth__feedback--error", "auth__feedback--success");
    if (type) el.classList.add("auth__feedback--" + type);
    el.hidden = !message;
  }

  function clearFieldErrors(form) {
    form
      .querySelectorAll(".auth__input--error")
      .forEach(function (i) {
        i.classList.remove("auth__input--error");
        i.removeAttribute("aria-invalid");
      });
  }

  function markFieldError(input) {
    if (!input) return;
    input.classList.add("auth__input--error");
    input.setAttribute("aria-invalid", "true");
  }

  // Ativa/desativa o estado de carregando do form (spinner no botão + bloqueio).
  function setLoading(form, isLoading) {
    const submit = form.querySelector(".auth__submit");
    const google = form.querySelector(".auth__google");
    [submit, google].forEach(function (btn) {
      if (!btn) return;
      btn.disabled = isLoading;
      btn.classList.toggle("is-loading", isLoading);
      btn.setAttribute("aria-busy", String(isLoading));
    });
  }

  function isValidEmail(email) {
    // Validação pragmática (o servidor é a fonte da verdade de fato).
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function notifyError(form, message) {
    setFeedback(form, message, "error");
    if (window.cognifyToast) {
      window.cognifyToast.show(message, { type: "error" });
    }
  }

  // Traduz as mensagens de erro do Supabase (em inglês) para PT-BR amigável.
  function translateAuthError(error) {
    const raw = ((error && error.message) || "").toLowerCase();
    if (raw.indexOf("invalid login credentials") !== -1) {
      return "E-mail ou senha incorretos.";
    }
    if (raw.indexOf("email not confirmed") !== -1) {
      return "Confirme seu e-mail antes de entrar.";
    }
    if (
      raw.indexOf("user already registered") !== -1 ||
      raw.indexOf("already been registered") !== -1
    ) {
      return "Este e-mail já está cadastrado. Tente fazer login.";
    }
    if (raw.indexOf("password should be at least") !== -1) {
      return "A senha precisa ter pelo menos " + MIN_PASSWORD + " caracteres.";
    }
    if (raw.indexOf("unable to validate email") !== -1) {
      return "E-mail inválido. Verifique e tente de novo.";
    }
    if (raw.indexOf("for security purposes") !== -1 || raw.indexOf("rate") !== -1) {
      return "Muitas tentativas. Aguarde alguns segundos e tente de novo.";
    }
    if (
      raw.indexOf("failed to fetch") !== -1 ||
      raw.indexOf("network") !== -1
    ) {
      return "Falha de conexão. Verifique sua internet e tente de novo.";
    }
    return (error && error.message) || "Não foi possível concluir. Tente de novo.";
  }

  // Guarda comum: confirma que o Supabase está pronto antes de tentar autenticar.
  function ensureReady(form) {
    if (!window.cognifyAuth || !window.cognifyAuth.getClient()) {
      notifyError(
        form,
        "Autenticação ainda não configurada. Tente novamente em instantes."
      );
      return null;
    }
    return window.cognifyAuth.getClient();
  }

  function redirect() {
    window.location.href = REDIRECT_AFTER_AUTH;
  }

  /* ====================================================================
     Cadastro
     ==================================================================== */
  function handleSignup(form) {
    const nameInput = document.getElementById("cad-nome");
    const emailInput = document.getElementById("cad-email");
    const passInput = document.getElementById("cad-senha");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrors(form);
      setFeedback(form, "");

      const name = (nameInput.value || "").trim();
      const email = (emailInput.value || "").trim();
      const password = passInput.value || "";

      // Validação client-side (feedback imediato; o servidor revalida).
      if (!name) {
        markFieldError(nameInput);
        nameInput.focus();
        return notifyError(form, "Digite seu nome.");
      }
      if (!isValidEmail(email)) {
        markFieldError(emailInput);
        emailInput.focus();
        return notifyError(form, "Digite um e-mail válido.");
      }
      if (password.length < MIN_PASSWORD) {
        markFieldError(passInput);
        passInput.focus();
        return notifyError(
          form,
          "A senha precisa ter pelo menos " + MIN_PASSWORD + " caracteres."
        );
      }

      const client = ensureReady(form);
      if (!client) return;

      setLoading(form, true);
      try {
        const { data, error } = await client.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name } },
        });

        if (error) {
          notifyError(form, translateAuthError(error));
          return;
        }

        // Com a confirmação de e-mail desativada, o signUp já devolve uma sessão
        // ativa. Mas o fluxo desejado para cadastro por e-mail/senha é mandar a
        // pessoa para a tela de LOGIN (e não entrar direto). Por isso encerramos
        // essa sessão automática antes de redirecionar.
        if (data && data.session) {
          try {
            await client.auth.signOut();
          } catch (e) {
            /* se falhar o signOut, seguimos mesmo assim para o login */
          }
          // A mensagem é exibida na tela de login (sobrevive ao redirect).
          try {
            sessionStorage.setItem(
              "cognify-flash",
              JSON.stringify({
                type: "success",
                message: "Conta criada com sucesso! Faça login para entrar.",
              })
            );
          } catch (e) {}
          window.location.href = REDIRECT_AFTER_SIGNUP;
        } else {
          // Salvaguarda: se a confirmação de e-mail estiver ligada no painel.
          setFeedback(
            form,
            "Conta criada! Verifique seu e-mail para confirmar o acesso.",
            "success"
          );
        }
      } catch (err) {
        notifyError(form, translateAuthError(err));
      } finally {
        setLoading(form, false);
      }
    });
  }

  /* ====================================================================
     Login
     ==================================================================== */
  function handleLogin(form) {
    const emailInput = document.getElementById("login-email");
    const passInput = document.getElementById("login-senha");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrors(form);
      setFeedback(form, "");

      const email = (emailInput.value || "").trim();
      const password = passInput.value || "";

      if (!isValidEmail(email)) {
        markFieldError(emailInput);
        emailInput.focus();
        return notifyError(form, "Digite um e-mail válido.");
      }
      if (!password) {
        markFieldError(passInput);
        passInput.focus();
        return notifyError(form, "Digite sua senha.");
      }

      // ---- Modo demonstração ----------------------------------------
      // ANTES do Supabase, de propósito: este par de credenciais não existe no
      // Auth, então deixá-lo seguir o fluxo real só renderia "e-mail ou senha
      // incorretos" depois de um request. Qualquer OUTRO par cai fora deste if
      // e segue exatamente o caminho de sempre. Ver js/demo/demo.js.
      if (window.cognifyDemo && window.cognifyDemo.credenciaisConferem(email, password)) {
        setLoading(form, true);
        // Garante que nenhuma sessão real fique por baixo da demonstração.
        // `scope: "local"` limpa só o storage do navegador — não vai à rede.
        try {
          const real = window.cognifyAuth && window.cognifyAuth.getClient();
          if (real) await real.auth.signOut({ scope: "local" });
        } catch (e) {
          /* sem sessão real pra limpar: seguimos pra demonstração */
        }
        if (window.cognifyDemo.ligar()) {
          window.location.href = REDIRECT_DEMO;
          return;
        }
        // sessionStorage bloqueado (navegação privada estrita): sem onde guardar
        // o estado, o painel abriria deslogado. Melhor dizer do que fingir.
        setLoading(form, false);
        return notifyError(
          form,
          "Seu navegador está bloqueando o armazenamento local, e a demonstração precisa dele."
        );
      }

      const client = ensureReady(form);
      if (!client) return;

      setLoading(form, true);
      try {
        const { error } = await client.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (error) {
          // Erro de credencial: marca os dois campos (não revela qual está errado).
          markFieldError(emailInput);
          markFieldError(passInput);
          notifyError(form, translateAuthError(error));
          return;
        }
        redirect();
      } catch (err) {
        notifyError(form, translateAuthError(err));
      } finally {
        setLoading(form, false);
      }
    });
  }

  /* ====================================================================
     Login com Google (OAuth) — vale para as duas telas
     ==================================================================== */
  function setupGoogle(form) {
    const btn = form.querySelector(".auth__google");
    if (!btn) return;

    btn.addEventListener("click", async function () {
      const client = ensureReady(form);
      if (!client) return;

      setLoading(form, true);
      try {
        // Volta para a Home depois do consentimento. Esta URL precisa estar na
        // allowlist de Redirect URLs do Supabase (e a origin nas JS origins do Google).
        const redirectTo =
          window.location.origin + window.location.pathname.replace(/[^/]*$/, "") +
          REDIRECT_AFTER_AUTH;

        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: redirectTo },
        });
        // Em fluxo normal o navegador já redirecionou; só tratamos erro.
        if (error) {
          notifyError(form, translateAuthError(error));
          setLoading(form, false);
        }
      } catch (err) {
        notifyError(form, translateAuthError(err));
        setLoading(form, false);
      }
    });
  }

  // Exibe (uma única vez) uma mensagem deixada por outra tela via sessionStorage
  // — ex.: o aviso "Conta criada, faça login" após o cadastro.
  function consumeFlash(form) {
    let flash;
    try {
      const raw = sessionStorage.getItem("cognify-flash");
      if (!raw) return;
      sessionStorage.removeItem("cognify-flash");
      flash = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!flash || !flash.message) return;
    if (form) setFeedback(form, flash.message, flash.type || "success");
    if (window.cognifyToast) {
      window.cognifyToast.show(flash.message, { type: flash.type || "success" });
    }
  }

  /* ==================================================================== */
  function init() {
    setupPasswordToggles();

    document.querySelectorAll(".auth__form").forEach(function (form) {
      const isSignup = !!form.querySelector("#cad-email");
      const isLogin = !!form.querySelector("#login-email");

      if (isSignup) handleSignup(form);
      else if (isLogin) {
        handleLogin(form);
        consumeFlash(form); // mostra o aviso vindo do cadastro, se houver
      }

      // Botão do Google existe nas duas telas.
      if (isSignup || isLogin) setupGoogle(form);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
