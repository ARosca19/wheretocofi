// auth.js – logică pentru paginile de login și signup.
// Folosește helper-ele globale din app.js: api, saveToken, saveName, saveRole, saveUserId.

document.addEventListener("DOMContentLoaded", () => {
  // ================== LOGIN PAGE ==================
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const emailEl = document.getElementById("login_email");
    const passEl = document.getElementById("login_password");
    const msgEl = document.getElementById("login_msg");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (msgEl) {
        msgEl.textContent = "";
        msgEl.style.color = "#3c2f2f";
      }

      const email = emailEl.value.trim();
      const password = passEl.value;

      if (!email || !password) {
        if (msgEl) {
          msgEl.textContent = "Fill in email and password.";
          msgEl.style.color = "#b00020";
        }
        return;
      }

      try {
        const data = await api("/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        console.log("[LOGIN] api success:", data);

        const token =
          data.access_token ||
          data.token ||
          data.accessToken ||
          data.access_token_value;

        if (!token) {
          throw new Error("Login response without token.");
        }
        saveToken(token);

        const user = data.user || data;
        if (user) {
          if (user.prenume) saveName(user.prenume);
          else if (user.name) saveName(user.name);
          else if (user.nume) saveName(user.nume);

          if (user.role) saveRole(user.role);
          if (user.id) saveUserId(user.id);
        }

        if (msgEl) {
          msgEl.textContent = "Login succeeded, redirecting to main page...";
          msgEl.style.color = "green";
        }

        setTimeout(() => {
          const target = window.location.origin + "/frame1.html";
          console.log("[LOGIN] redirecting to", target);
          window.location.href = target;
        }, 600);
      } catch (err) {
        console.error("[LOGIN] api error:", err);
        if (msgEl) {
          msgEl.textContent =
            "Error: " + (err.message || "can't log in");
          msgEl.style.color = "#b00020";
        }
      }
    });
  }

  // ================== SIGNUP PAGE ==================
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    const prenumeEl = document.getElementById("su_prenume");
    const numeEl = document.getElementById("su_nume");
    const emailEl = document.getElementById("su_email");
    const passEl = document.getElementById("su_password");
    const msgEl = document.getElementById("signup_msg");

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (msgEl) {
        msgEl.textContent = "";
        msgEl.style.color = "#3c2f2f";
      }

      const prenume = prenumeEl.value.trim();
      const nume = numeEl.value.trim();
      const email = emailEl.value.trim();
      const password = passEl.value;

      if (!prenume || !nume || !email || !password) {
        if (msgEl) {
          msgEl.textContent = "Fill in all the fields.";
          msgEl.style.color = "#b00020";
        }
        return;
      }

      console.log("[SIGNUP] submit", { prenume, nume, email });

      try {
        const data = await api("/signup", {
          method: "POST",
          body: JSON.stringify({ prenume, nume, email, password }),
        });
        console.log("[SIGNUP] api success:", data);

        if (msgEl) {
          msgEl.textContent = "Account created, redirecting to login...";
          msgEl.style.color = "green";
        }

        
          const target = window.location.origin + "/login.html";
          console.log("[SIGNUP] redirecting to", target);
          window.location.href = target;
        
      } catch (err) {
        console.error("[SIGNUP] api error:", err);
        if (msgEl) {
          msgEl.textContent =
            "Error: " + (err.message || "could not create account");
          msgEl.style.color = "#b00020";
        }
      }
    });
  }
});
