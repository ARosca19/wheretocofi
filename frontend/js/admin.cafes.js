// ===========ADMIN : CREATE NEW CAFE==================
async function adminCreateCafeDialog() {
  openDialog(`
    <h3 style="margin:0 0 8px">Create cafe</h3>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label>Nume cafenea
          <input id="cc_name" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
        </label>
        <label>Zonă / Oraș
          <input id="cc_area" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
        </label>
      </div>

      <label>Tag-uri (ex: specialty, minimal)
        <input id="cc_tags" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
      </label>

      <label>About
        <textarea id="cc_about" class="cafe-textarea" style="min-height:70px;"></textarea>
      </label>

      <label>Location
        <textarea id="cc_location" class="cafe-textarea" style="min-height:60px;"></textarea>
      </label>

      <label>Hours
        <input id="cc_hours" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
      </label>

      <label>Menu & prices
        <textarea id="cc_menu" class="cafe-textarea" style="min-height:70px;"></textarea>
      </label>

      <label>Products used
        <textarea id="cc_products" class="cafe-textarea" style="min-height:70px;"></textarea>
      </label>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button id="cc_cancel" class="chip">Cancel</button>
      <button id="cc_save" class="chip">Create</button>
    </div>
    <p id="cc_msg" style="margin-top:8px;font-weight:600"></p>
  `);

  document.getElementById("cc_cancel").onclick = closeDialog;
  document.getElementById("cc_save").onclick = async () => {
    const name = document.getElementById("cc_name").value.trim();
    const area = document.getElementById("cc_area").value.trim();
    const tags = document.getElementById("cc_tags").value.trim();
    const about = document.getElementById("cc_about").value.trim();
    const location = document.getElementById("cc_location").value.trim();
    const hours = document.getElementById("cc_hours").value.trim();
    const menu = document.getElementById("cc_menu").value.trim();
    const products = document.getElementById("cc_products").value.trim();
    const msg = document.getElementById("cc_msg");

    msg.textContent = "";
    msg.style.color = "#3c2f2f";

    if (!name || !area) {
      msg.textContent = "Completeaza cel putin numele si zona";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api("/admin/cafes", {
        method: "POST",
        body: JSON.stringify({ name, area, tags, about, location, hours, menu, products }),
      });
      msg.textContent = "Cafenea creata.";
      msg.style.color = "green";
      setTimeout(closeDialog, 700);
    } catch (e) {
      msg.textContent = "Eroare: " + e.message;
      msg.style.color = "#b00020";
    }
  };
}

// ===========Admin EDIT CAFE===============
async function adminEditCafeDialog() {
  let cafes = [];
  try {
    cafes = await api("/admin/cafes");
  } catch (e) {
    alert("Nu pot incarca lista de cafenele: " + e.message);
    return;
  }
  if (!cafes.length) {
    alert("Nu exista cafenele in baza de date inca");
    return;
  }

  const options = cafes
    .map((c) => `<option value ="${c.id}">${c.id} - ${c.name || c.title || "Cafe"} (${c.area || ""})</option>`)
    .join("");

  openDialog(`
    <h3 style="margin:0 0 8px">Edit cafe</h3>
    <label>Alege o cafenea
      <select id="ec_select" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">${options}</select>
    </label>

    <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label>Nume cafenea
          <input id="ec_name" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
        </label>
        <label>Slug (URL identifier)
          <input id="ec_slug" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
        </label>
        <label>Zonă / Oraș
          <input id="ec_area" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
        </label>
      </div>

      <label>Tag-uri
        <input id="ec_tags" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
      </label>

      <label>About
        <textarea id="ec_about" class="cafe-textarea" style="min-height:70px;"></textarea>
      </label>

      <label>Location
        <textarea id="ec_location" class="cafe-textarea" style="min-height:60px;"></textarea>
      </label>

      <label>Hours
        <input id="ec_hours" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">
      </label>

      <label>Menu & prices
        <textarea id="ec_menu" class="cafe-textarea" style="min-height:70px;"></textarea>
      </label>

      <label>Products used
        <textarea id="ec_products" class="cafe-textarea" style="min-height:70px;"></textarea>
      </label>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button id="ec_cancel" class="chip">Cancel</button>
      <button id="ec_save" class="chip">Save</button>
    </div>
    <p id="ec_msg" style="margin-top:8px;font-weight:600"></p>
  `);

  const select = document.getElementById("ec_select");
  const nameIn = document.getElementById("ec_name");
  const areaIn = document.getElementById("ec_area");
  const tagsIn = document.getElementById("ec_tags");
  const aboutIn = document.getElementById("ec_about");
  const locIn = document.getElementById("ec_location");
  const hoursIn = document.getElementById("ec_hours");
  const menuIn = document.getElementById("ec_menu");
  const prodIn = document.getElementById("ec_products");
  const msg = document.getElementById("ec_msg");
  const slugIn = document.getElementById("ec_slug");

  function fillFromCafe(cafe) {
    if (!cafe) return;
    nameIn.value = cafe.name || cafe.title || "";
    areaIn.value = cafe.area || "";
    tagsIn.value = cafe.tags || "";
    slugIn.value = cafe.slug || "";

    aboutIn.value = cafe.about_text || "";
    locIn.value = cafe.address || "";
    hoursIn.value = cafe.hours_text || "";
    menuIn.value = cafe.menu_text || "";
    prodIn.value = cafe.products_text || "";
  }

  fillFromCafe(cafes[0]);

  select.onchange = () => {
    const cafe = cafes.find((c) => String(c.id) === select.value);
    fillFromCafe(cafe);
  };

  document.getElementById("ec_cancel").onclick = closeDialog;
  document.getElementById("ec_save").onclick = async () => {
    const id = select.value;
    msg.textContent = "";
    msg.style.color = "#3c2f2f";

    if (!id) {
      msg.textContent = "Selecteaza o cafenea";
      msg.style.color = "#b00020";
      return;
    }

    const body = {
      slug: slugIn.value.trim(),
      name: nameIn.value.trim(),
      area: areaIn.value.trim(),
      tags: tagsIn.value.trim(),
      about: aboutIn.value.trim(),
      location: locIn.value.trim(),
      hours: hoursIn.value.trim(),
      menu: menuIn.value.trim(),
      products: prodIn.value.trim(),
    };

    try {
      await api(`/admin/cafes/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      msg.textContent = "Cafenea actualizata";
      msg.style.color = "green";
      setTimeout(closeDialog, 700);
    } catch (e) {
      msg.textContent = "Eroare: " + e.message;
      msg.style.color = "#b00020";
    }
  };
}

// =======================ADMIN DELETE CAFE===================
async function adminDeleteCafeDialog() {
  let cafes = [];
  try {
    cafes = await api("/admin/cafes");
  } catch (e) {
    alert("Nu exista cafenele in baza de date inca");
    return;
  }

  const options = cafes
    .map((c) => `<option value="${c.id}">${c.id}-${c.name || c.title || "Cafe"}(${c.area || ""})</option>`)
    .join("");

  openDialog(`
    <h3 style="margin: 0 0 8px">Delete cafe</h3>
    <label>Alege o cafenea
      <select id="dc_select" style="width:100%;padding:8px;border:1px solid #d6b08b;border-radius:10px">${options}</select>
    </label>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button id="dc_cancel" class="chip">Cancel</button>
      <button id="dc_delete" class="chip">Delete</button>
    </div>
    <p id="dc_msg" style="margin-top:8px;font-weight:600"></p>
  `);

  document.getElementById("dc_cancel").onclick = closeDialog;
  document.getElementById("dc_delete").onclick = async () => {
    const id = document.getElementById("dc_select").value;
    const msg = document.getElementById("dc_msg");
    msg.textContent = "";
    msg.style.color = "#3c2f2f";

    if (!id) {
      msg.textContent = "Selecteaza o cafenea";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api(`/admin/cafes/${id}`, { method: "DELETE" });
      msg.textContent = "Cafenea stearsa";
      msg.style.color = "green";
      setTimeout(closeDialog, 700);
    } catch (e) {
      msg.textContent = "Eroare: " + e.message;
      msg.style.color = "#b00020";
    }
  };
}
