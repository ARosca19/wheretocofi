// mycafecitos.js

async function initFavoritesPage() {
  const favListEl = document.getElementById("favCards");
  const emptyMsgEl = document.getElementById("favEmpty");

  if (!favListEl || !emptyMsgEl) return;

  const token = getToken?.();
  const uid = getUserId?.();

  // dacă nu e logat, mesaj + redirect la login
  if (!token || !uid) {
    emptyMsgEl.textContent =
      "You need to be logged in to see your saved coffee spots.";
    emptyMsgEl.style.display = "block";
    favListEl.innerHTML = "";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1600);
    return;
  }

  try {
    // 1) luăm favoritele direct din backend (tabela cafecitos)
    const favs = await api("/cafecitos");

    if (!Array.isArray(favs) || favs.length === 0) {
      emptyMsgEl.textContent =
        "You don't have any saved coffee spots yet. Go to the main page and tap the ♥ on your favourites.";
      emptyMsgEl.style.display = "block";
      favListEl.innerHTML = "";
      return;
    }

    emptyMsgEl.style.display = "none";

    // 2) desenăm cardurile (structură similară cu home)
    const html = favs
      .map((c) => {
        const slug = c.slug;
        const title = c.name || slug;
        const city = (c.city || "").trim();
const area = (c.area || "").trim();
const tags = (c.tags || "").trim();

function normalizePlace(value = "") {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // scoate diacritice
    .replace(/\s+/g, " ");
}

const cityNorm = normalizePlace(city);
const areaNorm = normalizePlace(area);

const samePlace =
  city &&
  area &&
  (
    cityNorm === areaNorm ||
    (cityNorm === "bucharest" && areaNorm === "bucuresti") ||
    (cityNorm === "bucuresti" && areaNorm === "bucharest")
  );

const metaParts = [];

if (city) metaParts.push(city);
if (area && !samePlace) metaParts.push(area);
if (tags) metaParts.push(tags);

const metaText = metaParts.join(" · ") || "Saved coffee spot";

        // ai folosit deja ?id=slug în alte locuri, păstrez același pattern
        return `
          <a 
            class="card fav-card" 
            data-slug="${slug}" 
            href="cafe.html?id=${encodeURIComponent(slug)}"
          >
            <div class="title">${title}</div>
            <div class="row">
              <div class="meta">${metaText}</div>
              <div class="more">More info <span class="arrow">›</span></div>
            </div>
          </a>
        `;
      })
      .join("");

    favListEl.innerHTML = html;
  } catch (e) {
    console.error("Error loading /cafecitos:", e);
    emptyMsgEl.textContent =
      "Could not load your saved coffee spots. Please try again later.";
    emptyMsgEl.style.display = "block";
    favListEl.innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // topbar & auth
  renderAuthUI();

  try {
    await fetchMeIfLogged();
  } catch (e) {
    console.error("fetchMeIfLogged error on MyCafecitos:", e);
  }

  renderAuthUI();

  // listă de favourite din backend
  await initFavoritesPage();
});
