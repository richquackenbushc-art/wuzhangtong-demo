import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    navigator.serviceWorker.register(new URL("sw.js", baseUrl).toString(), { scope: baseUrl.pathname }).catch(() => undefined);
  });
}
