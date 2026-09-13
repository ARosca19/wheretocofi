// --- localStorage helpers ---
const saveToken = (t) => localStorage.setItem("cofi_token", t);
const getToken = () => localStorage.getItem("cofi_token");

const saveName = (n) => localStorage.setItem("cofi_name", n);
const getName = () => localStorage.getItem("cofi_name") || "user";

const saveRole = (r) => localStorage.setItem("cofi_role", r || "user");
const getRole = () => localStorage.getItem("cofi_role") || "user";

const saveUserId = (id) =>
  localStorage.setItem("cofi_user_id", id ? String(id) : "");
const getUserId = () => localStorage.getItem("cofi_user_id") || "";

const FAV_KEY_BASE = "cofi_favs";

function getFavStorageKey() {
  const uid = getUserId();
  return uid ? `${FAV_KEY_BASE}_u${uid}` : `${FAV_KEY_BASE}_guest`;
}

function loadFavs() {
  try {
    const key = getFavStorageKey();
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);

    // migrare vechea cheie globală
    const legacy = localStorage.getItem(FAV_KEY_BASE);
    if (legacy) {
      const list = JSON.parse(legacy);
      localStorage.setItem(key, JSON.stringify(list));
      return list;
    }
    return [];
  } catch {
    return [];
  }
}

function saveFavs(list) {
  const key = getFavStorageKey();
  localStorage.setItem(key, JSON.stringify(list));
}
