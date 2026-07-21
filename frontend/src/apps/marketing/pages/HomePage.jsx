import { useEffect } from "react";
import LandingPage from "@/LandingPage";

/** Accueil vitrine SaaS — réutilise LandingPage existante. */
export default function HomePage({ apiBaseUrl, initialSection = null }) {
  useEffect(() => {
    if (!initialSection) return;
    const timer = window.setTimeout(() => {
      document.getElementById(initialSection)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [initialSection]);

  return <LandingPage apiBaseUrl={apiBaseUrl} />;
}
