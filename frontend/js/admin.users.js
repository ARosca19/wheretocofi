// ===== Admin: Create user =====
async function adminCreateUserDialog() {
  openDialog(`
    <h3 style="margin:0 0 8px">Create user</h3>
    <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr">
      <label>Prenume <input id="cu_prenume" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px"></label>
      <label>Nume <input id="cu_nume" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px"></label>
      <label style="grid-column:1/3">Email <input id="cu_email" type="email" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px"></label>
      <label style="grid-column:1/3">Parola <input id="cu_pass" type="password" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px"></label>
      <label>Rol
        <select id="cu_role" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </label>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button id="cu_cancel" class="chip">Cancel</button>
      <button id="cu_save" class="chip">Create</button>
    </div>
    <p id="cu_msg" style="margin-top:8px;font-weight:600"></p>
  `);

  document.getElementById("cu_cancel").onclick = closeDialog;
  document.getElementById("cu_save").onclick = async () => {
    const prenume = document.getElementById("cu_prenume").value.trim();
    const nume = document.getElementById("cu_nume").value.trim();
    const email = document.getElementById("cu_email").value.trim();
    const password = document.getElementById("cu_pass").value;
    const role = document.getElementById("cu_role").value;
    const msg = document.getElementById("cu_msg");
    msg.textContent = "";
    msg.style.color = "#3c2f2f";

    if (!prenume || !nume || !email || !password) {
      msg.textContent = "Completează toate câmpurile.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify({ prenume, nume, email, password, role }),
      });
      msg.textContent = "User creat.";
      msg.style.color = "green";
      setTimeout(closeDialog, 600);
    } catch (e) {
      msg.textContent = "Eroare: " + e.message;
      msg.style.color = "#b00020";
    }
  };
}

// ===== Admin: Delete user =====
async function adminDeleteUserDialog() {
  let users = [];
  try {
    users = await api("/admin/users");
  } catch (e) {
    alert("Nu pot încărca lista de useri: " + e.message);
    return;
  }

  const options = users
    .map(
      (u) =>
        `<option value="${u.id}">${u.id} — ${u.prenume} ${u.nume} (${u.mail}) [${u.role}]</option>`
    )
    .join("");

  openDialog(`
    <h3 style="margin:0 0 8px">Delete user</h3>
    <label>Alege user
      <select id="du_select" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">${options}</select>
    </label>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button id="du_cancel" class="chip">Cancel</button>
      <button id="du_delete" class="chip">Delete</button>
    </div>
    <p id="du_msg" style="margin-top:8px;font-weight:600"></p>
  `);

  document.getElementById("du_cancel").onclick = closeDialog;
  document.getElementById("du_delete").onclick = async () => {
    const id = document.getElementById("du_select").value;
    const msg = document.getElementById("du_msg");
    msg.textContent = "";
    msg.style.color = "#3c2f2f";

    if (!id) {
      msg.textContent = "Selectează un user.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api(`/admin/users/${id}`, { method: "DELETE" });
      msg.textContent = "User șters.";
      msg.style.color = "green";
      setTimeout(closeDialog, 600);
    } catch (e) {
      msg.textContent = "Eroare: " + e.message;
      msg.style.color = "#b00020";
    }
  };
}

// ===== Admin: Edit user (parolă + rol) =====
async function adminEditUserDialog() {
  let users = [];
  try {
    users = await api("/admin/users");
  } catch (e) {
    alert("Nu pot încărca lista de useri: " + e.message);
    return;
  }

  const options = users
    .map(
      (u) =>
        `<option value="${u.id}">${u.id} — ${u.prenume} ${u.nume} (${u.mail}) [${u.role}]</option>`
    )
    .join("");

  openDialog(`
    <h3 style="margin:0 0 8px">Edit user</h3>
    <label>Alege user
      <select id="eu_select" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">${options}</select>
    </label>
    <label style="margin-top:10px;">New password
      <input id="eu_pass" type="password" placeholder="Lasă gol dacă nu schimbi" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
    </label>
    <label style="margin-top:10px;">Role
      <select id="eu_role" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
        <option value="">(no change)</option>
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
    </label>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button id="eu_cancel" class="chip">Cancel</button>
      <button id="eu_save" class="chip">Save</button>
    </div>
    <p id="eu_msg" style="margin-top:8px;font-weight:600"></p>
  `);

  document.getElementById("eu_cancel").onclick = closeDialog;
  document.getElementById("eu_save").onclick = async () => {
    const id = document.getElementById("eu_select").value;
    const pass = document.getElementById("eu_pass").value;
    const role = document.getElementById("eu_role").value;
    const msg = document.getElementById("eu_msg");

    msg.textContent = "";
    msg.style.color = "#3c2f2f";

    if (!pass && !role) {
      msg.textContent = "Nu ai modificat nimic (parolă sau rol).";
      msg.style.color = "#b00020";
      return;
    }

    if (pass && pass.length < 6) {
      msg.textContent = "Parola trebuie să aibă minim 6 caractere.";
      msg.style.color = "#b00020";
      return;
    }

    const body = {};
    if (pass) body.password = pass;
    if (role) body.role = role;

    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      msg.textContent = "User actualizat.";
      msg.style.color = "green";
      setTimeout(closeDialog, 700);
    } catch (e) {
      msg.textContent = "Eroare: " + e.message;
      msg.style.color = "#b00020";
    }
  };
}
