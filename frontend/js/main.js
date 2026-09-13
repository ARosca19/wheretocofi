
document.addEventListener("DOMContentLoaded", async () => {
  if (typeof fetchMeIfLogged === "function") await fetchMeIfLogged();
if (typeof syncFavsFromServer === "function") await syncFavsFromServer();
if (typeof initFavoritesUI === "function") initFavoritesUI();
if (typeof renderAuthUI === "function") renderAuthUI();


  document.body?.classList?.remove("js-loading");
});
