document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("contactTranslateBtn");
  const elements = Array.from(document.querySelectorAll("[data-contact-translate]"));

  if (!btn || !elements.length) return;

  const API_BASE = location.origin;

  const originalTexts = elements.map((el) => el.textContent.trim());
  let isRomanian = false;

  function setButton(text, disabled = false) {
    btn.textContent = text;
    btn.disabled = disabled;
  }

  function restoreOriginal() {
    elements.forEach((el, index) => {
      el.textContent = originalTexts[index];
    });

    setButton("Translate to Romanian");
    isRomanian = false;
  }

  async function translateToRomanian() {
    try {
      setButton("Translating...", true);

      const response = await fetch(`${API_BASE}/translate/static`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          texts: originalTexts,
          target: "ro"
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const translations = data.translations || [];

      elements.forEach((el, index) => {
        el.textContent = translations[index] || originalTexts[index];
      });

      setButton("Show English");
      isRomanian = true;
    } catch (err) {
      console.error("Contact translation error:", err);
      setButton("Translation failed");
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", async () => {
    if (isRomanian) {
      restoreOriginal();
    } else {
      await translateToRomanian();
    }
  });
});
