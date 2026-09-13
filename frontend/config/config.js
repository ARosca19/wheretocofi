let API_BASE;

if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  API_BASE = "http://127.0.0.1:8000";

} else {
  
  API_BASE = "http://127.0.0.1:8000";
}

const API = API_BASE;
