document.addEventListener("DOMContentLoaded", () => {
  const btnAI = document.getElementById("btnAI");
  const popup = document.getElementById("aiPopup");
  const closeBtn = document.getElementById("aiPopupClose");
  const backdrop = document.getElementById("aiPopupBackdrop");
  const form = document.getElementById("aiChatForm");
  const input = document.getElementById("aiChatInput");
  const messages = document.getElementById("aiChatMessages");
  const submitBtn = form?.querySelector('button[type="submit"]');
  const closeDuration = 260;
  let lastFocusedElement = null;

  if (!btnAI || !popup || !form || !input || !messages) return;

  btnAI.addEventListener("click", () => {
    lastFocusedElement = document.activeElement;
    popup.classList.remove("is-closing", "is-open");
    popup.classList.add("is-opening");
    popup.hidden = false;
    document.body.classList.add("ai-popup-visible");
    void popup.offsetWidth;
    popup.classList.remove("is-opening");
    popup.classList.add("is-open");
    input.focus({ preventScroll: true });
  });

  closeBtn?.addEventListener("click", closePopup);
  backdrop?.addEventListener("click", closePopup);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popup.hidden) closePopup();
  });

  messages.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-ai-question]");
    if (!suggestion) return;
    input.value = suggestion.dataset.aiQuestion || "";
    input.focus();
  });

  function closePopup() {
    if (popup.hidden || popup.classList.contains("is-closing")) return;
    popup.classList.remove("is-open");
    popup.classList.add("is-closing");
    window.setTimeout(() => {
      popup.hidden = true;
      popup.classList.remove("is-closing", "is-open");
      document.body.classList.remove("ai-popup-visible");
      lastFocusedElement?.focus?.({ preventScroll: true });
    }, closeDuration);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    addMessage(question, "user");
    input.value = "";
    input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    const loading = addMessage("Thinking", "bot", true);

    try {
      const data = await api("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question })
      });

      loading.classList.remove("ai-message-loading");
      renderMessageText(loading, data.answer || "I could not find an answer.");
    } catch (err) {
      console.error(err);
      loading.classList.remove("ai-message-loading");
      renderMessageText(loading, err.message || "AI Assistant failed to answer.");
    } finally {
      input.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
      input.focus();
      scrollToLatest();
    }
  });

  function addMessage(text, type, isLoading = false) {
    const div = document.createElement("div");
    div.className = `ai-message ai-message-${type}`;
    if (isLoading) div.classList.add("ai-message-loading");
    renderMessageText(div, text);
    messages.appendChild(div);
    scrollToLatest();
    return div;
  }

  function renderMessageText(element, text) {
    element.replaceChildren();
    const lines = String(text).split("\n");

    lines.forEach((line, lineIndex) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      parts.forEach((part) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const strong = document.createElement("strong");
          strong.textContent = part.slice(2, -2);
          element.appendChild(strong);
        } else {
          element.appendChild(document.createTextNode(part));
        }
      });
      if (lineIndex < lines.length - 1) element.appendChild(document.createElement("br"));
    });
  }

  function scrollToLatest() {
    requestAnimationFrame(() => {
      messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
    });
  }
});
