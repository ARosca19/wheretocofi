function ensureDialogHost() {
  let host = document.getElementById("adminDialogHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "adminDialogHost";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.display = "none";
  host.style.alignItems = "center";
  host.style.justifyContent = "center";
  host.style.background = "rgba(0,0,0,.35)";
  host.style.zIndex = "9999";
  document.body.appendChild(host);
  return host;
}

function openDialog(innerHtml) {
  const host = ensureDialogHost();
  host.innerHTML = `<div class="admin-dialog">${innerHtml}</div>`;
  host.style.display = "flex";
}

function closeDialog() {
  const host = ensureDialogHost();
  host.style.display = "none";
  host.innerHTML = "";
}

document.addEventListener("click", (e) => {
  const host = document.getElementById("adminDialogHost");
  if (!host || host.style.display === "none") return;
  if (e.target === host) closeDialog();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDialog();
});
