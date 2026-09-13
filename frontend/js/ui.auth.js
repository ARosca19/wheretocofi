// ================== AUTH & UI refs ==================
const helloUser = document.getElementById("helloUser");
const btnMyCafecitos = document.getElementById("btnMyCafecitos");
const btnLogout = document.getElementById("btnLogout");
const btnAI = document.getElementById("btnAI");
const btnLogin = document.getElementById("btnLogin");
const btnSignup = document.getElementById("btnSignup");
const btnProfile = document.getElementById("btnProfile");

const btnAdminPanel = document.getElementById("btnAdminPanel");
const adminPanelMenu = document.getElementById("adminPanelMenu");

const desktopNav = document.getElementById("desktopNav");
const menuToggle = document.getElementById("menuToggle");
const mnav = document.getElementById("mnav");


// --- meniuri mobile (⋮) ---
const buildGuestMenu = () => `
  <a href="#" class="mitem" data-action="login">Log In</a>
  <a href="#" class="mitem" data-action="signup">Sign Up</a>
  <hr>
  <a href="reviews.html" class="mitem" data-action="reviews">Reviews</a>
  <a href="about.html"   class="mitem" data-action="about">About</a>
  <a href="contact.html" class="mitem" data-action="contact">Contact</a>
`;

const buildAuthMenu = (isAdmin) => `
  <a href="#" class="mitem" data-action="mycafecitos">My Cafecitos</a>
  <a href="#" class="mitem" data-action="profile">My Profile</a>
  <a href="#" class="mitem" data-action="logout">Log Out</a>
  ${
    isAdmin
      ? `
    <hr>
    <a href="#" class="mitem" data-action="admin-create">Create users</a>
    <a href="#" class="mitem" data-action="admin-edit">Edit users</a>
    <a href="#" class="mitem" data-action="admin-delete">Delete users</a>

    <a href="#" class="mitem" data-action="admin-create-cafe">Create cafes</a>
    <a href="#" class="mitem" data-action="admin-edit-cafe">Edit cafes</a>
    <a href="#" class="mitem" data-action="admin-delete-cafe">Delete cafes</a>
  `
      : ""
  }
  <hr>
  <a href="reviews.html" class="mitem" data-action="reviews">Reviews</a>
  <a href="about.html"   class="mitem" data-action="about">About</a>
  <a href="contact.html" class="mitem" data-action="contact">Contact</a>
`;


// --- randare UI în funcție de login / viewport ---
function renderAuthUI() {
  const logged = !!getToken();
  const role = getRole();
  const isAdmin = role === "admin";
  const isMobile = window.matchMedia("(max-width: 820px)").matches;

  // AI Coffee Assistant este disponibil pentru toți pe desktop
  if (btnAI) {
    btnAI.style.display = isMobile ? "none" : "inline-flex";
  }

  if (helloUser) {
    helloUser.textContent = logged ? `Hello, ${getName()}!` : "";
  }

  if (logged) {
    btnMyCafecitos && (btnMyCafecitos.style.display = "inline-block");
    btnProfile && (btnProfile.style.display = "inline-block");
    btnLogout && (btnLogout.style.display = isMobile ? "none" : "inline-block");
    btnLogin && (btnLogin.style.display = "none");
    btnSignup && (btnSignup.style.display = "none");

    if (btnAdminPanel) {
      btnAdminPanel.style.display = isAdmin && !isMobile ? "inline-block" : "none";
    }
  } else {
    btnMyCafecitos && (btnMyCafecitos.style.display = "none");
    btnProfile && (btnProfile.style.display = "none");
    btnLogout && (btnLogout.style.display = "none");
    btnLogin && (btnLogin.style.display = "inline-block");
    btnSignup && (btnSignup.style.display = "inline-block");

    if (btnAdminPanel) {
      btnAdminPanel.style.display = "none";
    }
  }

  // topbar right vs ⋮
  if (isMobile) {
    menuToggle && (menuToggle.style.display = "flex");
    desktopNav && (desktopNav.style.display = "none");
  } else {
    menuToggle && (menuToggle.style.display = "none");
    desktopNav && (desktopNav.style.display = "flex");
  }

  // conținut meniu ⋮
  if (mnav) {
    mnav.innerHTML = logged ? buildAuthMenu(isAdmin) : buildGuestMenu();
    mnav.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
  }
}