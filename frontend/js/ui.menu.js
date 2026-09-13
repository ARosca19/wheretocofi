// ================== MENU (⋮) BEHAVIOUR ==================
if (menuToggle && mnav) {
  const closeMenu = () => {
    mnav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !mnav.classList.contains("is-open");
    if (open) {
      mnav.classList.add("is-open");
      menuToggle.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });

  document.addEventListener("click", (e) => {
    if (!mnav.contains(e.target) && !menuToggle.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
}

// ================== ADMIN DROPDOWN (desktop) ==================
if (btnAdminPanel && adminPanelMenu) {
  const closeAdminPanel = () => {
    adminPanelMenu.classList.remove("is-open");
    btnAdminPanel.setAttribute("aria-expanded", "false");
  };

  btnAdminPanel.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = !adminPanelMenu.classList.contains("is-open");
    if (open) {
      adminPanelMenu.classList.add("is-open");
      btnAdminPanel.setAttribute("aria-expanded", "true");
    } else {
      closeAdminPanel();
    }
  });

  adminPanelMenu.addEventListener("click", (e) => {
    const item = e.target.closest(".admin-panel-item");
    if (!item) return;
    e.preventDefault();
    const action = item.dataset.action;

    if (action === "admin-create") return adminCreateUserDialog();
    if (action === "admin-edit") return adminEditUserDialog();
    if (action === "admin-delete") return adminDeleteUserDialog();

    if (action === "admin-create-cafe") return adminCreateCafeDialog();
    if (action === "admin-edit-cafe") return adminEditCafeDialog();
    if (action === "admin-delete-cafe") return adminDeleteCafeDialog();
  });

  document.addEventListener("click", (e) => {
    if (!adminPanelMenu.contains(e.target) && e.target !== btnAdminPanel) {
      closeAdminPanel();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAdminPanel();
  });
}

// ================== NAV BUTOANE TOPBAR ==================
btnSignup?.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "signup.html";
});

btnLogin?.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "login.html";
});

btnLogout?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("cofi_token");
  localStorage.removeItem("cofi_name");
  localStorage.removeItem("cofi_role");
  localStorage.removeItem("cofi_user_id");
  localStorage.removeItem("cofi_last_recs");
  renderAuthUI();
  window.location.href = "index.html";
});

btnMyCafecitos?.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "mycafecitos.html";
});

// meniu ⋮ actions
mnav?.addEventListener("click", (e) => {
  const t = e.target.closest(".mitem");
  if (!t) return;
  e.preventDefault();
  const action = t.dataset.action;

  if (action === "login") return (window.location.href = "login.html");
  if (action === "signup") return (window.location.href = "signup.html");

  if (action === "logout") {
    localStorage.removeItem("cofi_token");
    localStorage.removeItem("cofi_name");
    localStorage.removeItem("cofi_role");
    localStorage.removeItem("cofi_user_id");
    localStorage.removeItem("cofi_last_recs");
    renderAuthUI();
    window.location.href = "index.html";
    return;
  }

  if (action === "mycafecitos") return (window.location.href = "mycafecitos.html");
  if (action === "profile") return (window.location.href = "profile.html");

  if (action === "admin-create") return adminCreateUserDialog();
  if (action === "admin-edit") return adminEditUserDialog();
  if (action === "admin-delete") return adminDeleteUserDialog();

  if (action === "admin-create-cafe") return adminCreateCafeDialog();
  if (action === "admin-edit-cafe") return adminEditCafeDialog();
  if (action === "admin-delete-cafe") return adminDeleteCafeDialog();

  if (action === "reviews") return (window.location.href = "reviews.html");
  if (action === "about") return (window.location.href = "about.html");
  if (action === "contact") return (window.location.href = "contact.html");
});

// re-randare la resize
window.addEventListener("resize", renderAuthUI);
