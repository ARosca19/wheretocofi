function smoothNavigate(url, delay = 180) {
  if (!url) return;

  document.body?.classList?.add("page-leaving");
  window.setTimeout(() => {
    window.location.href = url;
  }, delay);
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("cofi_token");
    localStorage.removeItem("cofi_name");
    localStorage.removeItem("cofi_role");
    localStorage.removeItem("cofi_user_id");

    try { renderAuthUI(); } catch (_) {}

    // păstrez semnătura ta de toast (cu redirect) doar dacă o ai implementată așa;
    // altfel îl fac simplu:
    showToast("Sesiunea a expirat. Te rugăm să te reconectezi.", "error", 1700);
    setTimeout(() => smoothNavigate("login.html"), 1700);
    return;
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j.detail) msg = j.detail;
    } catch {}
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function translateReview(reviewId) {
  // reviewId trebuie să fie NUMĂR (id din DB)
  return api(`/reviews/${encodeURIComponent(reviewId)}/translate`, {
    method: "POST",
  });
}
