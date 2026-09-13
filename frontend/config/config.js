const isLocalFrontend =
  ["127.0.0.1", "localhost"].includes(location.hostname) &&
  ["5500", "5501"].includes(location.port);

let API_BASE = window.COFI_API_BASE || (
  location.protocol === "file:" || isLocalFrontend
    ? "http://127.0.0.1:8000"
    : location.origin
);

const API = API_BASE;
