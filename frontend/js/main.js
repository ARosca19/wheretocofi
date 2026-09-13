
document.addEventListener("DOMContentLoaded", async () => {
  document.body?.classList?.add("page-ready");

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) return;

    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.origin !== window.location.origin) return;
    if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) return;

    e.preventDefault();
    if (typeof smoothNavigate === "function") {
      smoothNavigate(nextUrl.href);
    } else {
      window.location.href = nextUrl.href;
    }
  });

  if (typeof fetchMeIfLogged === "function") await fetchMeIfLogged();
if (typeof syncFavsFromServer === "function") await syncFavsFromServer();
if (typeof initFavoritesUI === "function") initFavoritesUI();
if (typeof renderAuthUI === "function") renderAuthUI();


  document.body?.classList?.remove("js-loading");
});
