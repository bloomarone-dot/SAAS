import { useEffect, useRef, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PERMISSIONS } from "@/config/menu";
import { apiFetch } from "@/config/http";
import { validateLogoFile } from "@/features/restaurants/components/RestaurantProvisionForm";
import { resolveRestaurantAssetUrl } from "@/utils/restaurantTheme";

function canUpdateRestaurantBrand(currentUser) {
  return Boolean(
    currentUser?.is_owner
    || currentUser?.role === "ADMIN"
    || (currentUser?.permissions ?? []).includes(PERMISSIONS.RESTAURANT_SETTINGS_UPDATE),
  );
}

export function RestaurantLogoUploader({
  currentUser,
  logoUrl = "",
  restaurantName = "",
  restaurantSlug = "",
  primaryColor = "#078d50",
  variant = "card",
  onUpdated,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [preview, setPreview] = useState(
    resolveRestaurantAssetUrl(logoUrl, { slug: restaurantSlug }),
  );

  useEffect(() => {
    setPreview(resolveRestaurantAssetUrl(logoUrl, { slug: restaurantSlug }));
  }, [logoUrl, restaurantSlug]);

  if (!canUpdateRestaurantBrand(currentUser)) return null;

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateLogoFile(file);
    if (validationError) {
      setFeedback(validationError);
      event.target.value = "";
      return;
    }

    setBusy(true);
    setFeedback("");
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await apiFetch("/api/v1/restaurants/me/logo", {
        method: "POST",
        body,
        fallback: "Import du logo impossible.",
      });
      const nextLogo = resolveRestaurantAssetUrl(data.logo_url, { slug: data.slug ?? restaurantSlug });
      setPreview(nextLogo);
      onUpdated?.(data);
      setFeedback("Logo enregistré.");
    } catch (error) {
      setFeedback(error.message || "Import du logo impossible.");
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  const initials = (restaurantName || "R").trim().charAt(0).toUpperCase();

  if (variant === "inline") {
    return (
      <div className="space-y-2">
        <LogoPreview avatar={preview} initials={initials} primaryColor={primaryColor} size="sm" />
        <UploadControls
          inputRef={inputRef}
          busy={busy}
          preview={preview}
          onPick={() => inputRef.current?.click()}
          onChange={handleFile}
          label={preview ? "Changer le logo" : "Importer le logo"}
        />
        {feedback && <Feedback message={feedback} />}
      </div>
    );
  }

  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${preview ? "border-slate-200" : "border-amber-200 bg-amber-50/40"}`}>
      <div className="flex flex-wrap items-center gap-4">
        <LogoPreview avatar={preview} initials={initials} primaryColor={primaryColor} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900">
            {preview ? "Logo du restaurant" : "Ajoutez le logo de votre restaurant"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {preview
              ? "Ce logo s’affiche dans votre espace admin, sur la vitrine et dans le menu latéral."
              : "Importez votre logo (PNG, JPG ou WEBP, max 2 Mo) pour personnaliser votre vitrine et votre tableau de bord."}
          </p>
          <div className="mt-3">
            <UploadControls
              inputRef={inputRef}
              busy={busy}
              preview={preview}
              onPick={() => inputRef.current?.click()}
              onChange={handleFile}
              label={preview ? "Changer le logo" : "Importer mon logo"}
            />
          </div>
          {feedback && <Feedback message={feedback} />}
        </div>
      </div>
    </section>
  );
}

function LogoPreview({ avatar, initials, primaryColor, size }) {
  const dimension = size === "sm" ? "h-14 w-14 text-lg" : "h-16 w-16 text-xl";
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-black text-white ${dimension}`}
      style={{ backgroundColor: primaryColor }}
    >
      {avatar ? (
        <img src={avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}

function UploadControls({ inputRef, busy, preview, onPick, onChange, label }) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onChange}
        disabled={busy}
        className="hidden"
      />
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-[#f04438] px-4 py-2 text-xs font-black text-white disabled:opacity-60"
      >
        <DashboardIcon name={preview ? "Pencil" : "Plus"} size={15} />
        {busy ? "Import en cours…" : label}
      </button>
    </>
  );
}

function Feedback({ message }) {
  const isError = /impossible|invalide|trop volumineux/i.test(message);
  return (
    <p className={`mt-2 text-xs font-semibold ${isError ? "text-red-600" : "text-emerald-700"}`}>
      {message}
    </p>
  );
}
