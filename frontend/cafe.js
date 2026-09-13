// cafe.js – logică pentru pagina unei cafenele

document.addEventListener("DOMContentLoaded", () => {
  console.log("cafe.js INIT (guest reviews + receipt validation)");

  window.addEventListener("beforeunload", () => {
    console.log("⚠️ PAGINA SE ÎNCHIDE / REÎNCARCĂ");
  });

  // === 0. luăm slug-ul din URL (cafe.html?id=...) ===
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("id");
  console.log("CAFE SLUG =", slug);

  function userIsLogged() {
    // getToken e definit global (storage.js / app logic)
    return typeof getToken === "function" && !!getToken();
  }

  // --- referințe la elementele din pagină ---
  const titleEl = document.getElementById("cafeTitle");
  const subtitleEl = document.getElementById("cafeSubtitle");
  const aboutEl = document.getElementById("cafeAbout");
  const locationEl = document.getElementById("cafeLocation");
  const hoursEl = document.getElementById("cafeHours");
  const menuEl = document.getElementById("cafeMenu");
  const productsEl = document.getElementById("cafeProducts");

  const navButtons = document.querySelectorAll(".cafe-nav-btn");
  const sections = document.querySelectorAll(".cafe-section");
  const starBtns = document.querySelectorAll(".star-btn");
  const textarea = document.getElementById("reviewText");
  const submitBtn = document.getElementById("reviewSubmit");

  // --- recomandări UI ---
  const recsSection = document.getElementById("cafeRecommendations");
  const recsSubtitle = document.getElementById("recsSubtitle");
  const recsList = document.getElementById("recsList");

  // --- Guest fields (only for NOT logged) ---
  const guestBox = document.getElementById("guestBox");
  const guestFirstNameEl = document.getElementById("guestFirstName");
  const guestLastNameEl = document.getElementById("guestLastName");

  // show guest fields only if NOT logged
  if (guestBox) guestBox.hidden = userIsLogged();
  
  // --- Receipt fields (always required) ---
  const receiptNoEl = document.getElementById("receiptNo");
  const receiptItemsEl = document.getElementById("receiptItems");
  const receiptHintEl = document.getElementById("receiptHint");

  function setReceiptHint(msg, type) {
    if (!receiptHintEl) return;
    receiptHintEl.textContent = msg || "";
    receiptHintEl.className = "hint" + (type ? " " + type : "");
  }


  // LIVE CHECK bon (debounce)
  let receiptCheckTimer = null;
  let lastReceiptAvailability = null; // true/false/null

  async function checkReceiptLive() {
    if (!receiptNoEl) return;
    const number = receiptNoEl.value.trim();

    lastReceiptAvailability = null;
    setReceiptHint("", "");

    if (number.length < 2) return;

    try {
      const res = await api(
        `/cafenele/${encodeURIComponent(slug)}/receipts/check?number=${encodeURIComponent(number)}`,
        { method: "GET" }
      );

      if (res && res.available === true) {
        lastReceiptAvailability = true;
        setReceiptHint("Bon disponibil pentru validarea unui singur review.", "ok");
      } else {
        lastReceiptAvailability = false;
        setReceiptHint(
          "This receipt has already been used for review validation. You have reached the maximum number of reviews. Please contact the address listed in the Contact section for any further requests.",
          "error"
        );
      }
    } catch (e) {
      // dacă pică check-ul, nu blocăm userul; backend va decide la submit
      lastReceiptAvailability = null;
    }
  }

  if (receiptNoEl) {
    receiptNoEl.addEventListener("input", () => {
      clearTimeout(receiptCheckTimer);
      receiptCheckTimer = setTimeout(checkReceiptLive, 350);
    });
  }

  console.log("starBtns =", starBtns, "textarea =", textarea, "submitBtn =", submitBtn);

  let currentRating = 0;
  let cafeName = "Coffee spot";

  // === Photos modal: guest vede pozele, doar user logat poate încărca ===
  const cafePhotosBtn = document.getElementById("cafePhotosBtn");
  const photosModal = document.getElementById("cafePhotosModal");
  const photoGrid = document.getElementById("photoGrid");
  const photoUploadForm = document.getElementById("photoUploadForm");
  const photoFileEl = document.getElementById("photoFile");
  const photoCaptionEl = document.getElementById("photoCaption");
  const photoUploadHint = document.getElementById("photoUploadHint");
  const photoGuestNote = document.getElementById("photoGuestNote");
  const photoModalSubtitle = document.getElementById("photoModalSubtitle");

  function getApiBaseForPhotos() {
    return location.origin.replace(/\/$/, "");
  }

  function photoPublicUrl(path) {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return getApiBaseForPhotos() + path;
  }

  function userIsAdminForPhotos() {
    const role =
      typeof getRole === "function"
        ? getRole()
        : localStorage.getItem("wheretocofi_role");

    return role === "admin";
  }

  function setPhotoHint(message, type) {
    if (!photoUploadHint) return;
    photoUploadHint.textContent = message || "";
    photoUploadHint.className = "hint" + (type ? " " + type : "");
  }

  function renderPhotos(photos) {
  if (!photoGrid) return;

  photoGrid.innerHTML = "";

  if (!Array.isArray(photos) || photos.length === 0) {
    photoGrid.innerHTML = `<p class="photo-empty">No photos yet. Be the first coffee lover and add one 📷</p>`;
    return;
  }

  const isAdmin = userIsAdminForPhotos();

  photos.forEach((item) => {
    const card = document.createElement("article");
    card.className = "photo-card";
    card.dataset.photoId = item.id;

    const imgUrl = photoPublicUrl(item.image_url);
    const caption = item.caption || "";
    const userName = item.user_name || "WhereToCofi user";

    card.innerHTML = `
      <div class="photo-img-wrap">
        <img src="${imgUrl}" alt="Photo uploaded for ${cafeName}" loading="lazy" />

        <button 
          type="button" 
          class="photo-full-btn" 
          data-photo-full="${imgUrl}"
          data-photo-caption="${caption}"
          data-photo-user="${userName}">
          See full picture
        </button>

        ${
          isAdmin
            ? `<button type="button" class="photo-delete-btn" data-photo-delete="${item.id}" title="Delete photo">
                Delete
              </button>`
            : ""
        }
      </div>

      <div class="photo-card-body">
        ${caption ? `<p>${caption}</p>` : ""}
        <small>Uploaded by ${userName}</small>
      </div>
    `;

    photoGrid.appendChild(card);
  });
}

function openFullPhotoViewer(imgUrl, caption, userName) {
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
  if (userEl) userEl.textContent = userName ? `Uploaded by ${userName}` : "";

  viewer.hidden = false;
}

  async function deleteCafePhoto(photoId) {
    if (!photoId) return;

    if (!userIsAdminForPhotos()) {
      showToast("Only admin can delete photos.", "error", 2200);
      return;
    }

    const ok = confirm("Sigur vrei să ștergi poza aceasta?");
    if (!ok) return;

    const token = typeof getToken === "function" ? getToken() : "";

    if (!token) {
      showToast("Trebuie să fii conectat ca admin.", "error", 2200);
      return;
    }

    const url = `${getApiBaseForPhotos()}/admin/cafe-photos/${encodeURIComponent(photoId)}`;

    try {
      const res = await fetch(url, {
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
      loadCafePhotos();
    } catch (e) {
      console.error("Photo delete failed:", e);
      showToast(e.message || "Eroare la ștergerea pozei.", "error", 2400);
    }
  }

  if (photoGrid) {
    photoGrid.addEventListener("click", (event) => {
      const deleteBtn = event.target.closest("[data-photo-delete]");
      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        deleteCafePhoto(deleteBtn.dataset.photoDelete);
        return;
      }

      const fullBtn = event.target.closest("[data-photo-full]");
      if (fullBtn) {
        event.preventDefault();
        event.stopPropagation();

        openFullPhotoViewer(
          fullBtn.dataset.photoFull,
          fullBtn.dataset.photoCaption,
          fullBtn.dataset.photoUser
        );
      }
    });
  }

  async function loadCafePhotos() {
    if (!slug || !photoGrid) return;

    photoGrid.innerHTML = `<p class="photo-empty">Loading photos...</p>`;

    try {
      const photos = await api(`/cafenele/${encodeURIComponent(slug)}/photos`);
      renderPhotos(photos);
    } catch (e) {
      console.error("Could not load cafe photos:", e);
      photoGrid.innerHTML = `<p class="photo-empty">Could not load photos right now.</p>`;
    }
  }

  function openPhotosModal() {
    if (!photosModal) return;

    const logged = userIsLogged();

    photosModal.hidden = false;
    photosModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("photo-modal-open");

    if (photoUploadForm) photoUploadForm.hidden = !logged;
    if (photoGuestNote) photoGuestNote.hidden = logged;

    if (photoModalSubtitle) {
      photoModalSubtitle.textContent = `${cafeName} · photos uploaded by users`;
    }

    setPhotoHint("", "");
    loadCafePhotos();
  }

  function closePhotosModal() {
    if (!photosModal) return;

    photosModal.hidden = true;
    photosModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("photo-modal-open");
    setPhotoHint("", "");

    if (photoFileEl) photoFileEl.value = "";
    if (photoCaptionEl) photoCaptionEl.value = "";
  }

  if (cafePhotosBtn) {
    cafePhotosBtn.addEventListener("click", openPhotosModal);
  }

  if (photosModal) {
    photosModal.querySelectorAll("[data-photo-close]").forEach((btn) => {
      btn.addEventListener("click", closePhotosModal);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !photosModal.hidden) {
        closePhotosModal();
      }
    });
  }

  if (photoUploadForm) {
    photoUploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!userIsLogged()) {
        showToast("Log in to upload café photos.", "error", 2200);
        return;
      }

      const file = photoFileEl && photoFileEl.files ? photoFileEl.files[0] : null;

      if (!file) {
        setPhotoHint("Choose an image first.", "error");
        return;
      }

      if (!file.type.startsWith("image/")) {
        setPhotoHint("You can upload only image files.", "error");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setPhotoHint("Image is too large. Maximum size is 5 MB.", "error");
        return;
      }

      const formData = new FormData();
      formData.append("photo", file);
      formData.append("caption", photoCaptionEl ? photoCaptionEl.value.trim() : "");

      const token = typeof getToken === "function" ? getToken() : "";
      const url = `${getApiBaseForPhotos()}/cafenele/${encodeURIComponent(slug)}/photos`;

      setPhotoHint("Uploading...", "ok");

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        let data = null;

        try {
          data = await res.json();
        } catch (_) {}

        if (!res.ok) {
          throw new Error(data?.detail || "Could not upload photo.");
        }

        if (photoFileEl) photoFileEl.value = "";
        if (photoCaptionEl) photoCaptionEl.value = "";

        setPhotoHint("Photo uploaded successfully.", "ok");
        showToast("Photo uploaded successfully 📷", "success", 1800);
        loadCafePhotos();
      } catch (e) {
        console.error("Photo upload failed:", e);
        setPhotoHint(e.message || "Could not upload photo.", "error");
      }
    });
  }

  function renderRecommendations(fromCafeName, recs) {
    if (!recsSection || !recsList) return;
    if (!userIsLogged()) return; // doar user logat vede rec-urile
    if (!Array.isArray(recs) || recs.length === 0) return;

    if (recsSubtitle) {
      recsSubtitle.textContent = `Users who gave 5★ to ${fromCafeName} also loved:`;
    }

    recsList.innerHTML = "";

    recs.forEach((r) => {
      const s = r.slug || r.id || "";
      const name = r.name || r.title || "Coffee spot";
      const area = r.area || "";
      const tags = r.tags || "";
      const reason = r.reason || r.expl || "";

      const a = document.createElement("a");
      a.className = "card rec-card";
      a.href = s ? `cafe.html?id=${encodeURIComponent(s)}` : "#";

      a.innerHTML = `
        <div class="title">${name}</div>
        <div class="row">
          <div class="meta">${area ? area + " · " : ""}${tags}</div>
          <div class="more">More info <span class="arrow">›</span></div>
        </div>
        ${reason ? `<p class="rec-reason">${reason}</p>` : ""}
      `;

      recsList.appendChild(a);
    });

    recsSection.hidden = false;
  }

  // === 1. încărcăm detaliile cafenelei ===
  (async () => {
    try {
      const cafe = await api(`/cafenele/${encodeURIComponent(slug)}`);
      console.log("CAFE DATA =", cafe);

      cafeName = cafe.name || cafeName;

      if (titleEl) titleEl.textContent = cafeName;
      if (subtitleEl) subtitleEl.textContent = `${cafe.area || ""} · ${cafe.tags || ""}`.trim();

      if (aboutEl) aboutEl.textContent = cafe.about_text || "";
      if (locationEl) locationEl.textContent = cafe.address || "";
      if (hoursEl) hoursEl.textContent = cafe.hours_text || "";
      if (menuEl) menuEl.textContent = cafe.menu_text || "";
      if (productsEl) productsEl.textContent = cafe.products_text || "";
    } catch (err) {
      console.error("Error loading cafe:", err);
    }
  })();

  // === 2. mini-nav (About / Location / Menu / Products / Review) ===
  navButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();

      const targetId = btn.dataset.target;
      if (!targetId) return;

      const sec = document.getElementById(targetId);
      if (!sec) return;

      sec.scrollIntoView({ behavior: "smooth", block: "start" });

      navButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      sections.forEach((s) => s.classList.remove("is-highlight"));
      sec.classList.add("is-highlight");

      setTimeout(() => sec.classList.remove("is-highlight"), 1200);
    });
  });

  // === 3. selectarea rating-ului (stele) ===
  starBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentRating = Number(btn.dataset.star) || 0;
      console.log("SELECTED RATING =", currentRating);

      starBtns.forEach((b) => {
        const val = Number(b.dataset.star) || 0;
        b.classList.toggle("is-active", val <= currentRating);
      });

      if (submitBtn) {
        submitBtn.disabled = currentRating === 0;
        submitBtn.textContent = currentRating
          ? `Submit review (${currentRating}★)`
          : "Submit review ☕";
      }
    });
  });

  // === 4. trimiterea review-ului ===
  if (submitBtn) {
    submitBtn.addEventListener("click", async (event) => {
      event.preventDefault();

      console.log("SUBMIT CLICKED, currentRating =", currentRating);

      if (!currentRating) {
        alert("Te rog alege un număr de stele înainte să trimiți review-ul.");
        return;
      }

      const isLogged = userIsLogged();

      // guest name required if not logged
      const guest_first_name =
        !isLogged && guestFirstNameEl ? guestFirstNameEl.value.trim() : "";
      const guest_last_name =
        !isLogged && guestLastNameEl ? guestLastNameEl.value.trim() : "";

      if (!isLogged) {
        if (!guest_first_name) {
          showToast("Completează prenumele (guest).", "error", 2000);
          guestFirstNameEl && guestFirstNameEl.focus();
          return;
        }
        if (!guest_last_name) {
          showToast("Completează numele (guest).", "error", 2000);
          guestLastNameEl && guestLastNameEl.focus();
          return;
        }
      }

      // receipt required always
      const receipt_number = receiptNoEl ? receiptNoEl.value.trim() : "";
      const purchased_items = receiptItemsEl ? receiptItemsEl.value.trim() : "";

      setReceiptHint("", "");

      if (!receipt_number || receipt_number.length < 2) {
        setReceiptHint("Completează numărul bonului fiscal.", "error");
        receiptNoEl && receiptNoEl.focus();
        return;
      }
      if (!purchased_items) {
        setReceiptHint("Completează produsele achiziționate.", "error");
        receiptItemsEl && receiptItemsEl.focus();
        return;
      }

      // if live check already says used, block early
      if (lastReceiptAvailability === false) {
        showToast("Bon deja folosit. Te rugăm folosește un bon diferit.", "error", 2300);
        return;
      }

      const comment = textarea ? textarea.value.trim() : "";
      const givenRating = currentRating;

      const body = {
        rating: givenRating,
        comment,
        receipt_number,
        purchased_items,
      };

      if (!isLogged) {
        body.guest_first_name = guest_first_name;
        body.guest_last_name = guest_last_name;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      try {
        const data = await api(`/cafenele/${encodeURIComponent(slug)}/reviews`, {
          method: "POST",
          body: JSON.stringify(body),
        });

        console.log("REVIEW RESPONSE =", data);

        const recs = data && Array.isArray(data.recommendations)
          ? data.recommendations
          : [];

        // reset UI
        if (textarea) textarea.value = "";
        if (receiptNoEl) receiptNoEl.value = "";
        if (receiptItemsEl) receiptItemsEl.value = "";
        if (guestFirstNameEl) guestFirstNameEl.value = "";
        if (guestLastNameEl) guestLastNameEl.value = "";
        setReceiptHint("", "");

        currentRating = 0;
        starBtns.forEach((b) => b.classList.remove("is-active"));

        submitBtn.textContent = "Thank you for your review! ☕";
        submitBtn.disabled = false;

        // recomandări doar user logat
        if (givenRating === 5 && recs.length > 0 && userIsLogged()) {
          const payload = {
            fromCafeSlug: slug,
            fromCafeName: cafeName,
            createdAt: Date.now(),
            items: recs,
          };
          localStorage.setItem("cofi_last_recs", JSON.stringify(payload));
          renderRecommendations(cafeName, recs);
        }
      } catch (err) {
        console.error("REVIEW ERROR =", err);

        const msg = String(err.message || "");

        if (msg.toLowerCase().includes("acest bon a mai fost introdus")) {
          setReceiptHint(msg, "error");
          showToast("Bon deja folosit pentru validarea review-urilor.", "error", 2500);
        } else {
          showToast("Nu am putut trimite review-ul: " + msg, "error", 2500);
          alert("Nu am putut trimite review-ul. " + msg);
        }

        submitBtn.disabled = false;
        submitBtn.textContent = "Submit review ☕";
      }
    });
  } else {
    console.warn("NU GĂSESC #reviewSubmit în DOM");
  }

  // === 5. reafișăm rec-urile salvate pentru cafeneaua curentă (doar user logat) ===
  try {
    const raw = localStorage.getItem("cofi_last_recs");
    if (raw && userIsLogged()) {
      const payload = JSON.parse(raw);
      if (payload && payload.fromCafeSlug === slug && Array.isArray(payload.items)) {
        renderRecommendations(payload.fromCafeName || cafeName, payload.items);
      }
    }
  } catch (e) {
    console.warn("Cannot restore saved recommendations:", e);
  }
});
