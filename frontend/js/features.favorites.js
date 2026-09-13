// =========================
// Build slug → cafe map (dacă ai nevoie pe alte pagini)
// =========================
async function loadCafesMap() {
  try {
    const cafes = await api("/cafenele");
    const map = new Map();
    cafes.forEach((c) => {
      if (c.slug) map.set(c.slug, c);
    });
    return map;
  } catch (e) {
    console.error("Error loading cafes:", e);
    return new Map();
  }
}

async function fetchMeIfLogged() {
  const token = getToken();
  if (!token) return;

  try {
    const me = await api("/me");
    if (me?.prenume) saveName(me.prenume);
    if (me?.role) saveRole(me.role);
    if (me?.id) saveUserId(me.id);
  } catch (e) {
    console.error("fetchMeIfLogged /me error:", e);
  }
}

async function syncFavsFromServer() {
  const token = getToken();
  const uid = getUserId();
  if (!token || !uid) return;

  try {
    const favsFromApi = await api("/cafecitos");
    const list = (favsFromApi || []).map((c) => ({ slug: c.slug, name: c.name }));
    saveFavs(list);
  } catch (e) {
    console.error("Cannot sync favorites from server:", e);
  }
}

// ================== MY CAFECITOS (fav hearts) ==================
function initFavoritesUI() {
  const cards = document.querySelectorAll(".card[data-slug]");
  if (!cards.length) return;

  const logged = !!getToken();
  const uid = getUserId();
  const rawFavs = logged && uid ? loadFavs() : [];
  const favs = Array.isArray(rawFavs) ? rawFavs : [];

  cards.forEach((card) => {
    const slug = card.dataset.slug;
    const btn = card.querySelector(".fav-btn");
    const heart = btn?.querySelector(".heart");
    if (!slug || !btn || !heart) return;

    const cardTitle =
      card.querySelector(".title")?.textContent.trim() ||
      card.dataset.name ||
      "";

    const isFav = favs.some((f) => (typeof f === "string" ? f === slug : f.slug === slug));
    btn.classList.toggle("is-fav", isFav);
    heart.textContent = isFav ? "♥" : "♡";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const hasToken = !!getToken();
      const userId = getUserId();

      if (!hasToken || !userId) {
        showToast("You need to be logged in to save cofi spots to My Cafecitos ☕", "info", 1600);
        setTimeout(() => (window.location.href = "login.html"), 1600);
        return;
      }

      let newState = null;
      try {
        const resp = await api("/cafecitos/toggle", {
          method: "POST",
          body: JSON.stringify({ slug }),
        });
        newState = !!resp.is_favorite;
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
        showToast("Could not update favorite. Please try again.", "error", 2200);
        return;
      }

      let current = loadFavs();
      if (!Array.isArray(current)) current = [];

      const idx = current.findIndex((f) => (typeof f === "string" ? f === slug : f.slug === slug));

      if (newState) {
        if (idx === -1) current.push({ slug, name: cardTitle });
      } else {
        if (idx !== -1) current.splice(idx, 1);
      }

      saveFavs(current);
      btn.classList.toggle("is-fav", newState);
      heart.textContent = newState ? "♥" : "♡";
    });
  });
}
