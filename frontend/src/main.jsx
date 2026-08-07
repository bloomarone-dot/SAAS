import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { resolveApiBaseUrl, isApiReachable } from "@/config/api";
import { markEffectiveOffline } from "@/utils/network";
import App from "./App";
import "./styles.css";

async function bootstrap() {
  if ("serviceWorker" in navigator) {
    registerSW({ immediate: true });
  }

  try {
    await resolveApiBaseUrl();
    if (!isApiReachable()) {
      markEffectiveOffline("boot");
    }
  } catch {
    markEffectiveOffline("boot");
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
