const searchInput = document.getElementById("search");
const cards = Array.from(document.querySelectorAll("#cards .card"));

if (searchInput && cards.length) {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    cards.forEach((card) => {
      const hay = (
        (card.dataset.name || "") +
        " " +
        (card.dataset.area || "") +
        " " +
        (card.dataset.tags || "")
      ).toLowerCase();
      card.style.display = hay.includes(q) ? "" : "none";
    });
  });
}
