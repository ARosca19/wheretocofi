function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  return host;
}

function showToast(message, type = "info", duration = 2200) {
  const host = ensureToastHost();

  host.innerHTML = `
    <div class="toast toast-${type}">
      ${message}
    </div>
  `;

  const toastEl = host.querySelector(".toast");

  setTimeout(() => {
    if (!toastEl) return;
    toastEl.style.transition = "opacity .3s ease, transform .3s ease";
    toastEl.style.opacity = "0";
    toastEl.style.transform = "scale(0.9)";
    setTimeout(() => {
      if (host.contains(toastEl)) host.removeChild(toastEl);
    }, 300);
  }, duration);
}
