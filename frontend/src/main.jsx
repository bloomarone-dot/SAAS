import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { resolveApiBaseUrl, isApiReachable } from "@/config/api";
import { markEffectiveOffline } from "@/utils/network";
import { OfflineQueryProvider } from "@/offline/queryClient";
import { startSyncEngine } from "@/offline/syncEngine";
import App from "./App";
import "./styles.css";

// Shell React immédiat — jamais attendre le réseau pour afficher l'UI.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OfflineQueryProvider>
      <App />
    </OfflineQueryProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  registerSW({ immediate: true });
}

function probeNetworkInBackground() {
  resolveApiBaseUrl()
    .then(() => {
      if (!isApiReachable()) markEffectiveOffline("boot");
    })
    .catch(() => markEffectiveOffline("boot"));
}

probeNetworkInBackground();
startSyncEngine();
