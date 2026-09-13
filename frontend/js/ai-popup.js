document.addEventListener("DOMContentLoaded", () => {
  const btnAI = document.getElementById("btnAI");
  const popup = document.getElementById("aiPopup");
  const closeBtn = document.getElementById("aiPopupClose");
  const backdrop = document.getElementById("aiPopupBackdrop");
  const form = document.getElementById("aiChatForm");
  const input = document.getElementById("aiChatInput");
  const messages = document.getElementById("aiChatMessages");

  if (!btnAI || !popup || !form || !input || !messages) return;

  btnAI.addEventListener("click", () => {
    popup.hidden = false;
    setTimeout(() => input.focus(), 80);
  });

  closeBtn?.addEventListener("click", closePopup);
  backdrop?.addEventListener("click", closePopup);

  function closePopup() {
    popup.hidden = true;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    addMessage(question, "user");
    input.value = "";

    const loading = addMessage("Thinking...", "bot");

    try {
      const data = await api("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question })
      });

      loading.textContent = data.answer || "I could not find an answer.";
    } catch (err) {
      console.error(err);
      loading.textContent = err.message || "AI Assistant failed to answer.";
    }
  });

  function addMessage(text, type) {
    const div = document.createElement("div");
    div.className = `ai-message ai-message-${type}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }
});