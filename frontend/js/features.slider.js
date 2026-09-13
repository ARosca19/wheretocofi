(function () {
  const slider = document.getElementById("heroSlider");
  if (!slider) return;

  const slides = Array.from(slider.querySelectorAll(".slide"));
  const dotsWrap = document.getElementById("heroDots");
  if (!slides.length || !dotsWrap) return;

  let index = 0;
  let autoId = null;
  let hover = false;

  // dots
  slides.forEach((_, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Slide ${i + 1}`);
    b.addEventListener("click", () => go(i, true));
    li.appendChild(b);
    dotsWrap.appendChild(li);
  });
  const dots = Array.from(dotsWrap.querySelectorAll("button"));

  function go(i, user = false) {
    slides[index].classList.remove("is-active");
    index = (i + slides.length) % slides.length;
    slides[index].classList.add("is-active");
    dots.forEach((d, di) =>
      d.setAttribute("aria-current", di === index ? "true" : "false")
    );
    if (user) restart();
  }

  const prev = slider.querySelector(".prev");
  const next = slider.querySelector(".next");
  prev?.addEventListener("click", () => go(index - 1, true));
  next?.addEventListener("click", () => go(index + 1, true));

  function start() {
    autoId = setInterval(() => !hover && go(index + 1), 4000);
  }
  function stop() {
    if (autoId) clearInterval(autoId);
    autoId = null;
  }
  function restart() {
    stop();
    start();
  }

  slider.addEventListener("mouseenter", () => (hover = true));
  slider.addEventListener("mouseleave", () => (hover = false));

  slider.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(index - 1, true);
    if (e.key === "ArrowRight") go(index + 1, true);
  });
  slider.tabIndex = 0;

  let x0 = null;
  slider.addEventListener("pointerdown", (e) => (x0 = e.clientX));
  slider.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1), true);
    x0 = null;
  });

  go(0);
  start();
})();
