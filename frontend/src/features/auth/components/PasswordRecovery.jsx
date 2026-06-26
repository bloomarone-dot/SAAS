import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { formatApiError } from "@/utils/network";

const logoImage = "/logo.jpeg";

async function postJson(apiBaseUrl, path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatApiError(data?.detail ?? data?.message ?? data?.error, "Récupération du mot de passe impossible."));
  }
  return data;
}

function Shell({ title, subtitle, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Logo" className="mx-auto mb-5 h-16 w-16 rounded-xl object-cover shadow-sm ring-1 ring-emerald-100" />
          <h2 className="mb-2 text-3xl font-black text-[#003f2f]">{title}</h2>
          <p className="text-sm leading-relaxed text-slate-500">{subtitle}</p>
        </div>
        {children}
        <div className="mt-8 text-center text-xs text-slate-400">© 2026 Bloomarone. Tous droits réservés.</div>
      </div>
    </main>
  );
}

const inputClass =
  "h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition-all focus:border-[#078d50] focus:ring-4 focus:ring-emerald-50";
const primaryBtn =
  "h-12 w-full rounded-lg bg-[#078d50] text-sm font-black text-white shadow-sm transition-all hover:bg-[#046b3c] disabled:cursor-not-allowed disabled:opacity-70";

export function PasswordRecovery({ apiBaseUrl, mode = "forgot", token = "", onBackToLogin }) {
  const isReset = mode === "reset";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submitForgot(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await postJson(apiBaseUrl, "/api/v1/auth/forgot-password", { login: login.trim() });
      setDone(data.message || "Si le compte existe, un lien de réinitialisation a été envoyé par email.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("La confirmation ne correspond pas au mot de passe.");
      return;
    }
    setBusy(true);
    try {
      await postJson(apiBaseUrl, "/api/v1/auth/reset-password", { token, password });
      setDone("Mot de passe réinitialisé. Vous pouvez maintenant vous connecter.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (isReset && !token) {
    return (
      <Shell title="Lien invalide" subtitle="Le lien de réinitialisation est incomplet ou expiré.">
        <button type="button" onClick={onBackToLogin} className={primaryBtn}>Retour à la connexion</button>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title={isReset ? "Mot de passe mis à jour" : "Demande envoyée"} subtitle={done}>
        <button type="button" onClick={onBackToLogin} className={primaryBtn}>Aller à la connexion</button>
      </Shell>
    );
  }

  return (
    <Shell
      title={isReset ? "Nouveau mot de passe" : "Mot de passe oublié"}
      subtitle={isReset ? "Choisissez un nouveau mot de passe pour votre compte." : "Saisissez votre identifiant ; un lien de réinitialisation vous sera envoyé par email."}
    >
      <form onSubmit={isReset ? submitReset : submitForgot} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {isReset ? (
          <>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-slate-700">Nouveau mot de passe <span className="text-red-500">*</span></span>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} show={showPassword} onToggle={() => setShowPassword((value) => !value)} required minLength={10} placeholder="Au moins 10 caractères" autoFocus />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-slate-700">Confirmer le mot de passe <span className="text-red-500">*</span></span>
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} show={showConfirm} onToggle={() => setShowConfirm((value) => !value)} required placeholder="Confirmer" />
            </label>
            <p className="text-xs text-slate-400">Minuscule, majuscule, chiffre et symbole requis.</p>
          </>
        ) : (
          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-700">Email ou identifiant <span className="text-red-500">*</span></span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} required placeholder="Email, nom utilisateur ou téléphone" className={inputClass} autoFocus />
          </label>
        )}

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Veuillez patienter..." : isReset ? "Réinitialiser" : "Envoyer le lien"}
        </button>
        <button type="button" onClick={onBackToLogin} className="w-full text-center text-xs font-bold text-slate-500 hover:text-[#078d50]">
          Retour à la connexion
        </button>
      </form>
    </Shell>
  );
}

function PasswordInput({ show, onToggle, ...props }) {
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} className={`${inputClass} pr-12`} {...props} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-[#078d50]"
      >
        <DashboardIcon name={show ? "EyeOff" : "Eye"} size={18} />
      </button>
    </div>
  );
}
