// reviews.js – pagina globală de reviews

document.addEventListener("DOMContentLoaded", () => {
  console.log("reviews.js DOMContentLoaded");

  const listEl   = document.getElementById("reviewsList");
  const statusEl = document.getElementById("reviewsStatus");
  const searchEl = document.getElementById("reviewsSearch");

  if (!listEl || !statusEl) {
    console.warn("Missing #reviewsList or #reviewsStatus in HTML");
    return;
  }

  let allReviews = [];

  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));
  }

  // ===== LISTA DE REVIEWS (mijloc) =====
  function renderList(items, fromSearch = false) {
  listEl.innerHTML = "";

  if (!items.length) {
    statusEl.textContent = fromSearch
      ? "No reviews match your search."
      : "No reviews yet. Be the first one to write one ☕";
    return;
  }

  statusEl.textContent = "";

  items.forEach((r) => {
    const card = document.createElement("article");
    card.className = "review-card";

    const userName =
      r.user_name || r.username || r.user || r.author || "Coffee lover";

    const cafeName = r.cafe_name || r.cafe || "";
    const rating = Number(r.rating) || 0;

    const comment = (r.comment || "").trim();
    const commentRo = (r.comment_ro || "").trim();
    const commentEn = (r.comment_en || "").trim();

    const lang = (r.lang || "").trim().toLowerCase();
    const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
    const purchased = (r.purchased_items || "").trim();

    const filledStars = "★".repeat(Math.min(rating, 5));
    const emptyStars = "☆".repeat(Math.max(0, 5 - rating));
    const starsHtml = filledStars + emptyStars;

    const ratingText = `${rating}/5`;

    const chips = purchased
      ? purchased.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    const purchasedHtml = chips.length
      ? `<div class="review-purchased">
          <b>Products:</b>
          <div class="chips">
            ${chips.map(x => `<span class="chiplet">${escapeHtml(x)}</span>`).join("")}
          </div>
        </div>`
      : "";

    const originalHtml = comment
      ? `<p class="review-comment"><b>Review:</b> ${escapeHtml(comment)}</p>`
      : "";

    // reguli UI
    const canShowRo = !!commentRo && lang !== "ro";
    const canShowEn = !!commentEn && lang !== "en";

    const roBtnHtml = canShowRo
      ? `<button class="chip btn-translate-ro" type="button"
            data-review-id="${r.id}"
            aria-expanded="false">
          Show Romanian translation
        </button>`
      : "";

    const enBtnHtml = canShowEn
      ? `<button class="chip btn-translate-en" type="button"
            data-review-id="${r.id}"
            aria-expanded="false">
          Show English translation
        </button>`
      : "";

    const roBoxHtml = `
      <div class="review-translation review-translation-ro"
           data-review-id="${r.id}"
           style="display:none;">
        <p class="review-comment ro"><b>RO:</b> ${escapeHtml(commentRo)}</p>
      </div>
    `;

    const enBoxHtml = `
      <div class="review-translation review-translation-en"
           data-review-id="${r.id}"
           style="display:none;">
        <p class="review-comment en"><b>EN:</b> ${escapeHtml(commentEn)}</p>
      </div>
    `;

    card.innerHTML = `
      <header class="review-card-header">
        <div>
          <div class="review-user">${escapeHtml(userName)}</div>
          <div class="review-meta">
            ${cafeName ? escapeHtml(cafeName) : ""}${cafeName && created ? " · " : ""}${created}
          </div>
        </div>
        <div class="review-rating">
          <span class="stars">${starsHtml}</span>
          <span class="rating-badge">${ratingText}</span>
        </div>
      </header>

      ${purchasedHtml}
      ${originalHtml}

      <div class="review-actions">
        ${roBtnHtml}
        ${enBtnHtml}
      </div>

      ${roBoxHtml}
      ${enBoxHtml}
    `;

    listEl.appendChild(card);
  });
}

  // ===== BAYESIAN RANKING (doar pentru sortare) =====
  function calculateBayesianScore(avg, count, globalAvg, m = 5) {
    return ((count / (count + m)) * avg) + ((m / (count + m)) * globalAvg);
  }

  // ===== SIDEBAR: TOP ORDERED DRINKS =====
function normalizeDrinkName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function canonicalDrinkName(s) {
  const t = normalizeDrinkName(s);
  if (!t) return "";

  // EXCLUDERI clare – produse care conțin cuvântul, dar nu sunt cafele
  const excluded = [
    "espresso martini",
    "martini",
    "cocktail",
    "mojito",
    "aperol",
    "spritz",
    "brownie",
    "croissant",
    "toast",
    "sandwich",
    "cake",
    "cheesecake",
    "cookie",
    "muffin"
  ];

  if (excluded.some(x => t.includes(x))) return "";

  // MAPARE băuturi de cafea
  if (t.includes("flat white")) return "flat white";
  if (t.includes("cappuccino")) return "cappuccino";
  if (t.includes("americano")) return "americano";
  if (t.includes("cortado")) return "cortado";
  if (t.includes("macchiato")) return "macchiato";
  if (t.includes("mocha")) return "mocha";
  if (t.includes("latte")) return "latte";
  if (t.includes("espresso")) return "espresso";
  if (t.includes("frappe")) return "frappe";
  if (t.includes("cold brew")) return "cold brew";
  if (t.includes("filter coffee")) return "filter coffee";
  if (t.includes("hot chocolate")) return "hot chocolate";
  if (t === "tea" || t.includes(" tea")) return "tea";

  // orice altceva nu intră în top drinks
  return "";
}

function displayDrinkName(s) {
  const t = canonicalDrinkName(s);
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function renderTopDrinks(reviews, { limit = 3 } = {}) {
  const list = document.getElementById("topDrinksList");
  const note = document.getElementById("topdrinksNote");
  const info = document.getElementById("topdrinksInfo");
  if (!list) return;

  const counts = new Map();

  (reviews || []).forEach((r) => {
    const purchased = (r.purchased_items || "").trim();
    if (!purchased) return;

    purchased
      .split(",")
      .map(x => canonicalDrinkName(x))
      .filter(Boolean)
      .forEach((it) => counts.set(it, (counts.get(it) || 0) + 1));
  });

  const ranked = Array.from(counts.entries())
    .map(([key, cnt]) => ({ key, name: displayDrinkName(key), count: cnt }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);

  list.innerHTML = "";
  if (info) info.textContent = `Top ${limit}`;

  if (!ranked.length) {
    if (note) note.hidden = false;
    return;
  }
  if (note) note.hidden = true;

  ranked.forEach((d, idx) => {
    const li = document.createElement("li");
    li.className = "topcafe-item";
    li.setAttribute("data-rank", String(idx + 1));
    li.innerHTML = `
      <div class="topcafe-name">
        <span>${escapeHtml(d.name)}</span>
        <span class="topcafe-badge">${d.count}x</span>
      </div>
      <div class="topcafe-meta">
        <span>Ordered in reviews</span>
      </div>
    `;
    list.appendChild(li);
  });
}
  // ===== SIDEBAR: TOP RATED CAFES (dreapta) =====
  function renderTopCafes(reviews, { limit = 3, minReviews = 2, m = 5 } = {}) {
    const list = document.getElementById("topCafesList");
    const note = document.getElementById("topcafesNote");
    const info = document.getElementById("topcafesInfo");
    if (!list) return;

    const allRatings = (reviews || [])
      .map(r => Number(r.rating))
      .filter(n => Number.isFinite(n));

    const globalAvg = allRatings.length
      ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
      : 0;

    const byCafe = new Map();

    (reviews || []).forEach((r) => {
      const cafeName = (r.cafe_name || r.cafe || "").trim();
      if (!cafeName) return;

      const rating = Number(r.rating);
      if (!Number.isFinite(rating)) return;

      const obj = byCafe.get(cafeName) || { cafeName, total: 0, count: 0 };
      obj.total += rating;
      obj.count += 1;
      byCafe.set(cafeName, obj);
    });

    const ranked = Array.from(byCafe.values())
      .map((c) => {
        const avg = c.count ? c.total / c.count : 0;
        const score = calculateBayesianScore(avg, c.count, globalAvg, m); // intern
        return { ...c, avg, score };
      })
      .filter(c => c.count >= minReviews)
      .sort((a, b) => b.score - a.score) // sortăm după score, DAR nu îl afișăm
      .slice(0, limit);

    list.innerHTML = "";
    if (info) info.textContent = `Top ${limit}`;

    if (!ranked.length) {
      if (note) note.hidden = false;
      return;
    }
    if (note) note.hidden = true;

    ranked.forEach((c, idx) => {
      const li = document.createElement("li");
      li.className = "topcafe-item";
        li.setAttribute("data-rank", String(idx + 1)); // ✅ asta lipsea
      // UI curat: doar media + count (fără score)
      li.innerHTML = `
        <div class="topcafe-name">
          <span>${escapeHtml(c.cafeName)}</span>
          <span class="topcafe-badge">${c.avg.toFixed(1)}★</span>
        </div>
        <div class="topcafe-meta">
          <span>${c.count} review${c.count === 1 ? "" : "s"}</span>
        </div>
      `;

      list.appendChild(li);
    });
  }

  async function loadReviews() {
    statusEl.textContent = "Loading reviews.";

    try {
      const data = await api(`/reviews`, { method: "GET" });
      const reviews = Array.isArray(data) ? data : (data.items || []);
      allReviews = reviews;

      renderList(allReviews, false);
      renderTopCafes(allReviews, { limit: 3, minReviews: 2, m: 5 });
      renderTopDrinks(allReviews, { limit: 3 });
    } catch (err) {
      console.error("Error loading reviews:", err);
      statusEl.textContent =
        "We couldn't load the reviews right now. Please try again later ☕";
    }
  }

// ===== MOBILE TOGGLES (Top Rated + Top Drinks) =====
  const topRatedAside = document.getElementById("topRatedAside");
  const topRatedBtn   = document.getElementById("btnTopRatedMobile");

  const topDrinksAside = document.getElementById("topDrinksAside");
  const topDrinksBtn   = document.getElementById("btnTopDrinksMobile");

  function openAside(asideEl, btnEl){
    if (!asideEl || !btnEl) return;
    asideEl.classList.add("is-open");
    asideEl.setAttribute("aria-hidden", "false");
    btnEl.setAttribute("aria-expanded", "true");
  }

  function closeAside(asideEl, btnEl){
    if (!asideEl || !btnEl) return;
    asideEl.classList.remove("is-open");
    asideEl.setAttribute("aria-hidden", "true");
    btnEl.setAttribute("aria-expanded", "false");
  }

  function closeAll(){
    closeAside(topRatedAside, topRatedBtn);
    closeAside(topDrinksAside, topDrinksBtn);
  }

  function toggleAside(asideEl, btnEl, otherAsideEl, otherBtnEl){
    if (!asideEl || !btnEl) return;

    const isOpen = asideEl.classList.contains("is-open");

    // ✅ anti-suprapunere: închide celălalt înainte să deschizi ăsta
    closeAside(otherAsideEl, otherBtnEl);

    if (isOpen) closeAside(asideEl, btnEl);
    else openAside(asideEl, btnEl);
  }

  // click pe 🏆
  if (topRatedBtn && topRatedAside){
    topRatedBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAside(topRatedAside, topRatedBtn, topDrinksAside, topDrinksBtn);
    });
  }

  // click pe ☕
  if (topDrinksBtn && topDrinksAside){
    topDrinksBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAside(topDrinksAside, topDrinksBtn, topRatedAside, topRatedBtn);
    });
  }

  // click oriunde în afara cardurilor = close
  document.addEventListener("pointerdown", (e) => {
    const t = e.target;

    const ratedOpen  = topRatedAside?.classList.contains("is-open");
    const drinksOpen = topDrinksAside?.classList.contains("is-open");

    if (!ratedOpen && !drinksOpen) return;

    const clickedRatedCard  = topRatedAside?.querySelector(".topcard")?.contains(t);
    const clickedDrinksCard = topDrinksAside?.querySelector(".topcard")?.contains(t);

    const clickedRatedBtn  = topRatedBtn?.contains(t);
    const clickedDrinksBtn = topDrinksBtn?.contains(t);

    if (clickedRatedCard || clickedDrinksCard || clickedRatedBtn || clickedDrinksBtn) return;

    closeAll();
  }, true);

  // ESC = close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

// CLICK translate / toggle
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-translate-ro, .btn-translate-en");
  if (!btn) return;

  const reviewId = Number(btn.dataset.reviewId);
  if (!reviewId) return;

  const isRo = btn.classList.contains("btn-translate-ro");

  const box = listEl.querySelector(
    `.review-translation-${isRo ? "ro" : "en"}[data-review-id="${reviewId}"]`
  );

  if (!box) return;

  const isOpen = btn.getAttribute("aria-expanded") === "true";

  if (isOpen) {
    box.style.display = "none";
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = isRo
      ? "Show Romanian translation"
      : "Show English translation";
    return;
  }

  // 🔥 CAUTĂ review în memorie
  const review = allReviews.find(r => Number(r.id) === reviewId);

  let text = isRo ? review.comment_ro : review.comment_en;

  // 🚨 dacă NU există → apelăm API
  if (!text) {
    btn.disabled = true;
    btn.textContent = "Translating...";

    try {
      const tr = await translateReview(reviewId);

      text = tr.translated_text_ro;

      // salvăm local
      review.comment_ro = text;

      btn.disabled = false;
    } catch (err) {
      console.error(err);
      btn.textContent = "Error translating";
      return;
    }
  }

  box.innerHTML = `
    <p class="review-comment ${isRo ? "ro" : "en"}">
      <b>${isRo ? "RO" : "EN"}:</b> ${escapeHtml(text)}
    </p>
  `;

  box.style.display = "";
  btn.setAttribute("aria-expanded", "true");
  btn.textContent = "Hide translation";
});


  // SEARCH (include și RO)
if (searchEl) {
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();

    if (!q) {
      renderList(allReviews, false);
      // ❌ NU mai recalculăm top rated aici
      return;
    }

    const filtered = allReviews.filter((r) => {
      const hay = [
        r.cafe_name,
        r.cafe,
        r.comment,
        r.comment_ro,
        r.user_name,
        r.username,
        r.city,
        r.area,
        r.purchased_items
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    renderList(filtered, true);
  });
}


async function loadSentimentAnalytics() {
  const totalEl = document.getElementById("sentimentTotal");
  const posEl = document.getElementById("sentimentPositive");
  const neuEl = document.getElementById("sentimentNeutral");
  const negEl = document.getElementById("sentimentNegative");

  const barPos = document.getElementById("barPositive");
  const barNeu = document.getElementById("barNeutral");
  const barNeg = document.getElementById("barNegative");

  if (!totalEl || !posEl || !neuEl || !negEl || !barPos || !barNeu || !barNeg) return;

  try {
    const data = await api(`/analytics/sentiment`, { method: "GET" });

    totalEl.textContent = `${data.total_reviews} analyzed reviews`;
    posEl.textContent = `${data.positive_percent}%`;
    neuEl.textContent = `${data.neutral_percent}%`;
    negEl.textContent = `${data.negative_percent}%`;

    barPos.style.width = `${data.positive_percent}%`;
    barNeu.style.width = `${data.neutral_percent}%`;
    barNeg.style.width = `${data.negative_percent}%`;
  } catch (err) {
    console.error("Error loading sentiment analytics:", err);
    totalEl.textContent = "Could not load ML analytics";
  }
}
  loadReviews();
  loadSentimentAnalytics();
});