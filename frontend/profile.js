document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("profileStatus");
  const topGrid = document.getElementById("profileTopGrid");
  const headerCard = document.getElementById("profileHeaderCard");
  const statsGrid = document.getElementById("profileStatsGrid");
  const insightsGrid = document.getElementById("profileInsightsGrid");

  const reviewsPanel = document.getElementById("profileReviewsPanel");

  const fullNameEl = document.getElementById("profileFullName");
  const emailEl = document.getElementById("profileEmail");
  const roleEl = document.getElementById("profileRole");

  const identityBadgeEl = document.getElementById("profileIdentityBadge");
  const identityTextEl = document.getElementById("profileIdentityText");

  const statReviewsEl = document.getElementById("statReviews");
  const statCafesEl = document.getElementById("statCafes");
  const statAvgEl = document.getElementById("statAvg");
  const statVerifiedEl = document.getElementById("statVerified");
  const statFavoritesEl = document.getElementById("statFavorites");

  const positiveEl = document.getElementById("profilePositive");
  const neutralEl = document.getElementById("profileNeutral");
  const negativeEl = document.getElementById("profileNegative");

  const barPositiveEl = document.getElementById("profileBarPositive");
  const barNeutralEl = document.getElementById("profileBarNeutral");
  const barNegativeEl = document.getElementById("profileBarNegative");
  const sentimentLabelEl = document.getElementById("profileSentimentLabel");
  const pieChartEl = document.getElementById("profilePieChart");
  const pieCenterEl = document.getElementById("profilePieCenter");

  const drinksListEl = document.getElementById("profileDrinksList");
  const favPreviewEl = document.getElementById("profileFavPreview");

  const reviewsStatusEl = document.getElementById("profileReviewsStatus");
  const reviewsListEl = document.getElementById("profileReviewsList");
  const searchEl = document.getElementById("profileSearch");
  const sortEl = document.getElementById("profileSort");

  const profilePhotosListEl = document.getElementById("profilePhotosList");
  const profilePhotosStatusEl = document.getElementById("profilePhotosStatus");
  const profilePhotosCountEl = document.getElementById("profilePhotosCount");

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

  function stars(rating) {
    const full = "★".repeat(Math.max(0, rating || 0));
    const empty = "☆".repeat(Math.max(0, 5 - (rating || 0)));
    return `${full}${empty}`;
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("ro-RO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
function getApiBaseForProfilePhotos() {
  return location.origin.replace(/\/$/, "");
}

function profilePhotoUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return getApiBaseForProfilePhotos() + path;
}

function openProfileFullPhotoViewer(imgUrl, caption, cafeName) {
  let viewer = document.getElementById("fullPhotoViewer");

  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "fullPhotoViewer";
    viewer.className = "full-photo-viewer";
    viewer.hidden = true;

    viewer.innerHTML = `
      <div class="full-photo-backdrop" data-full-photo-close></div>

      <div class="full-photo-card">
        <button type="button" class="full-photo-close" data-full-photo-close>×</button>
        <img id="fullPhotoImg" src="" alt="Full café photo" />
        <div class="full-photo-info">
          <p id="fullPhotoCaption"></p>
          <small id="fullPhotoUser"></small>
        </div>
      </div>
    `;

    document.body.appendChild(viewer);

    viewer.querySelectorAll("[data-full-photo-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewer.hidden = true;
      });
    });
  }

  const img = document.getElementById("fullPhotoImg");
  const captionEl = document.getElementById("fullPhotoCaption");
  const userEl = document.getElementById("fullPhotoUser");

  if (img) img.src = imgUrl || "";
  if (captionEl) captionEl.textContent = caption || "";
  if (userEl) userEl.textContent = cafeName ? `Added for ${cafeName}` : "";

  viewer.hidden = false;
}

function renderProfilePhotos(photos = []) {
  if (!profilePhotosListEl) return;

  profilePhotosListEl.innerHTML = "";

  if (profilePhotosCountEl) {
    profilePhotosCountEl.textContent = photos.length;
  }

  if (!photos.length) {
    if (profilePhotosStatusEl) {
      profilePhotosStatusEl.textContent = "You have not uploaded café photos yet.";
    }
    return;
  }

  if (profilePhotosStatusEl) {
    profilePhotosStatusEl.textContent = "";
  }

  const latestPhotos = photos.slice(0, 4);

  latestPhotos.forEach((photo) => {
    const imgUrl = profilePhotoUrl(photo.image_url);
    const card = document.createElement("button");

    card.type = "button";
    card.className = "profile-photo-mini-card";
    card.dataset.photoFull = imgUrl;
    card.dataset.photoCaption = photo.caption || "";
    card.dataset.photoCafe = photo.cafe_name || "Coffee spot";

    card.innerHTML = `
      <img src="${imgUrl}" alt="Photo added for ${escapeHtml(photo.cafe_name || "coffee spot")}" loading="lazy" />

      <button 
        type="button" 
        class="profile-photo-delete-btn" 
        data-profile-photo-delete="${photo.id}"
        aria-label="Delete this photo">
        Delete
      </button>

      <span class="profile-photo-mini-overlay">
        <b>${escapeHtml(photo.cafe_name || "Coffee spot")}</b>
        <small>${photo.caption ? escapeHtml(photo.caption) : "See full picture"}</small>
      </span>
    `;

    profilePhotosListEl.appendChild(card);
  });

  if (photos.length > 4) {
    const more = document.createElement("div");
    more.className = "profile-photo-more";
    more.textContent = `+${photos.length - 4} more`;
    profilePhotosListEl.appendChild(more);
  }
}

async function deleteMyProfilePhoto(photoId) {
  if (!photoId) return;

  const ok = confirm("Sigur vrei să ștergi poza aceasta din profil?");
  if (!ok) return;

  const token = typeof getToken === "function" ? getToken() : "";

  if (!token) {
    showToast("Trebuie să fii conectat ca să ștergi poza.", "error", 2200);
    return;
  }

  try {
    const res = await fetch(`${getApiBaseForProfilePhotos()}/profile/me/photos/${encodeURIComponent(photoId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok && res.status !== 204) {
      let data = null;

      try {
        data = await res.json();
      } catch (_) {}

      throw new Error(data?.detail || "Nu am putut șterge poza.");
    }

    showToast("Poza a fost ștearsă.", "success", 1800);

    const photos = await api("/profile/me/photos");
    renderProfilePhotos(photos || []);
  } catch (e) {
    console.error("Could not delete profile photo:", e);
    showToast(e.message || "Eroare la ștergerea pozei.", "error", 2400);
  }
}

if (profilePhotosListEl) {
  profilePhotosListEl.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest("[data-profile-photo-delete]");

    if (deleteBtn) {
      event.preventDefault();
      event.stopPropagation();

      deleteMyProfilePhoto(deleteBtn.dataset.profilePhotoDelete);
      return;
    }

    const card = event.target.closest("[data-photo-full]");
    if (!card) return;

    openProfileFullPhotoViewer(
      card.dataset.photoFull,
      card.dataset.photoCaption,
      card.dataset.photoCafe
    );
  });
}

  function renderDrinks(items = []) {
    drinksListEl.innerHTML = "";

    if (!items.length) {
      drinksListEl.innerHTML = `<li class="profile-empty-line">No favorite drinks yet.</li>`;
      return;
    }

    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "profile-mini-item";
      li.innerHTML = `
        <span class="profile-mini-rank">${index + 1}</span>
        <span class="profile-mini-name">${escapeHtml(item.name)}</span>
        <span class="profile-mini-count">${item.count}x</span>
      `;
      drinksListEl.appendChild(li);
    });
  }

  function applyReviewFilters() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const sort = sortEl.value;

    let items = [...allReviews];

    if (q) {
      items = items.filter((r) => {
        return [
          r.cafe_name,
          r.city,
          r.area,
          r.comment,
          r.comment_ro,
          r.purchased_items,
          r.sentiment_label,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
    }

    if (sort === "oldest") {
      items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === "rating_desc") {
      items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === "rating_asc") {
      items.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    } else {
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    renderReviews(items, q);
  }

  function renderReviews(items = [], query = "") {
    reviewsListEl.innerHTML = "";

    if (!items.length) {
      reviewsStatusEl.textContent = query
        ? "No reviews match your search."
        : "You have not added any reviews yet.";
      return;
    }

    reviewsStatusEl.textContent = `${items.length} review${items.length === 1 ? "" : "s"} found.`;

    items.forEach((r) => {
      const article = document.createElement("article");
      article.className = "review-card";

      const sentiment = r.sentiment_label
        ? `<span class="chiplet">${escapeHtml(r.sentiment_label)}</span>`
        : "";

      const translated = r.comment_ro && r.comment_ro !== r.comment
        ? `
          <div class="review-actions">
            <button type="button" class="chip btn-translate profile-translate-toggle">RO version</button>
          </div>
          <p class="review-comment ro" hidden><b>Review (RO):</b> ${escapeHtml(r.comment_ro)}</p>
        `
        : "";

      article.innerHTML = `
        <div class="review-card-header">
          <div>
            <div class="review-user">${escapeHtml(r.cafe_name || "Unknown café")}</div>
            <div class="review-meta">
              ${escapeHtml(r.city || "")}${r.area ? ` · ${escapeHtml(r.area)}` : ""} · ${formatDate(r.created_at)}
            </div>
          </div>

          <div class="review-rating">
            <span class="stars">${stars(r.rating)}</span>
            <span class="rating-badge">${r.rating}/5</span>
          </div>
        </div>

        <div class="review-purchased">
          <b>Products:</b>
          ${(r.purchased_items || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => `<span class="chiplet">${escapeHtml(item)}</span>`)
            .join("")}
          ${sentiment}
        </div>

        ${r.comment ? `<p class="review-comment"><b>Review:</b> ${escapeHtml(r.comment)}</p>` : ""}
        ${translated}
      `;

      const toggleBtn = article.querySelector(".profile-translate-toggle");
      const roBlock = article.querySelector(".review-comment.ro");

      if (toggleBtn && roBlock) {
        toggleBtn.addEventListener("click", () => {
          const isHidden = roBlock.hasAttribute("hidden");
          if (isHidden) {
            roBlock.removeAttribute("hidden");
            toggleBtn.textContent = "Hide RO version";
          } else {
            roBlock.setAttribute("hidden", "");
            toggleBtn.textContent = "RO version";
          }
        });
      }

      reviewsListEl.appendChild(article);
    });
  }

  function renderSentiment(sentiment) {
  const positive = Number(sentiment?.positive_percent || 0);
  const neutral = Number(sentiment?.neutral_percent || 0);
  const negative = Number(sentiment?.negative_percent || 0);

  positiveEl.textContent = `${positive}%`;
  neutralEl.textContent = `${neutral}%`;
  negativeEl.textContent = `${negative}%`;

  if (barPositiveEl) barPositiveEl.style.width = `${positive}%`;
  if (barNeutralEl) barNeutralEl.style.width = `${neutral}%`;
  if (barNegativeEl) barNegativeEl.style.width = `${negative}%`;

  const labelMap = {
    positive: "Mostly positive",
    neutral: "Mostly balanced",
    negative: "Mostly critical",
  };

  const dominant = sentiment?.dominant_label || "neutral";
  sentimentLabelEl.textContent = labelMap[dominant] || "Overview";

  if (pieChartEl) {
    pieChartEl.style.setProperty("--p", positive);
    pieChartEl.style.setProperty("--n", neutral);
    pieChartEl.style.setProperty("--neg", negative);
  }

  if (pieCenterEl) {
    const centerValue =
      dominant === "positive" ? positive :
      dominant === "negative" ? negative :
      neutral;

    pieCenterEl.textContent = `${centerValue}%`;
  }
}

  try {
    const dashboard = await api("/profile/me/dashboard");

    statusEl.hidden = true;
    if (topGrid) topGrid.hidden = false;
    headerCard.hidden = false;
    statsGrid.hidden = false;
    insightsGrid.hidden = false;
    reviewsPanel.hidden = false;

    fullNameEl.textContent = `${dashboard.user.prenume} ${dashboard.user.nume}`;
    emailEl.textContent = dashboard.user.mail;
    roleEl.textContent = dashboard.user.role;

    identityBadgeEl.textContent = dashboard.identity.badge;
    identityTextEl.textContent = dashboard.identity.subtitle;

    statReviewsEl.textContent = dashboard.stats.total_reviews;
    statCafesEl.textContent = dashboard.stats.cafes_visited;
    statAvgEl.textContent = dashboard.stats.avg_rating;
    statVerifiedEl.textContent = dashboard.stats.verified_visits;
    statFavoritesEl.textContent = dashboard.stats.favorites_count;

    renderSentiment(dashboard.sentiment);
    renderDrinks(dashboard.favorite_drinks || []);
    allReviews = dashboard.reviews || [];
    applyReviewFilters();
    
    try {
      const photos = await api("/profile/me/photos");
      renderProfilePhotos(photos || []);
    } catch (photoErr) {
      console.error("Could not load profile photos:", photoErr);

      if (profilePhotosStatusEl) {
        profilePhotosStatusEl.textContent = "Could not load your uploaded photos.";
      }

      if (profilePhotosCountEl) {
        profilePhotosCountEl.textContent = "0";
      }
    }

    searchEl.addEventListener("input", applyReviewFilters);
    sortEl.addEventListener("change", applyReviewFilters);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Could not load your profile. Please log in again.";
  }
});
