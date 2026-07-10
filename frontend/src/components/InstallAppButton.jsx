import { useEffect, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";

function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallAppButton({ className = "" }) {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    function onBeforeInstall(event) {
      event.preventDefault();
      setPromptEvent(event);
    }
    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
  }

  if (installed) return null;

  if (promptEvent) {
    return (
      <button
        type="button"
        onClick={installApp}
        className={`flex h-10 items-center gap-2 rounded-md border border-white/20 bg-black/10 px-3 text-xs font-bold text-white hover:bg-black/20 ${className}`}
        title="Installer l'application sur cet appareil"
      >
        <DashboardIcon name="Chrome" size={15} />
        <span className="hidden sm:inline">Installer</span>
      </button>
    );
  }

  if (isAppleDevice()) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowIosHint((value) => !value)}
          className={`flex h-10 items-center gap-2 rounded-md border border-white/20 bg-black/10 px-3 text-xs font-bold text-white hover:bg-black/20 ${className}`}
          title="Installer sur iPhone ou iPad"
        >
          <DashboardIcon name="Chrome" size={15} />
          <span className="hidden sm:inline">Installer</span>
        </button>
        {showIosHint && (
          <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-semibold text-slate-700 shadow-xl">
            Sur Safari : touchez <strong>Partager</strong>, puis <strong>Sur l'écran d'accueil</strong>.
          </div>
        )}
      </div>
    );
  }

  return null;
}
