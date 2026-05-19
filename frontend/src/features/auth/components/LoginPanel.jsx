import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
const loginHeroImage = "/Images/ImageLogin.jpg";

export function LoginPanel({
  value,
  onChange,
  onSubmit,
  onForgotPassword,
  onResetPassword,
  isLoading,
  message,
}) {
  const [remember, setRemember] = useState(false);
  const [mode, setMode] = useState("login");
  const [resetLogin, setResetLogin] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function submitForgotPassword(event) {
    event.preventDefault();
    const token = await onForgotPassword(resetLogin);
    if (token) {
      setResetToken(token);
      setMode("reset");
    }
  }

  async function submitResetPassword(event) {
    event.preventDefault();
    const success = await onResetPassword({
      token: resetToken,
      password: newPassword,
    });
    if (success) {
      setMode("login");
      setResetLogin("");
      setResetToken("");
      setNewPassword("");
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 lg:flex">
        <img
          src={loginHeroImage}
          alt="Restaurant"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />
        <div className="relative mt-auto max-w-2xl p-16 text-white">
          <h1 className="text-6xl font-black leading-tight">
            Pilotez vos restaurants depuis un seul espace.
          </h1>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white/70 p-8 backdrop-blur-xl lg:p-16">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-5xl font-black text-slate-900">
              {mode === "login" ? "Se Connecter" : "Mot de passe"}
            </h2>
            <p className="text-sm leading-relaxed text-slate-500">
              {mode === "login"
                ? "Connectez-vous avec votre email, identifiant ou numéro de téléphone."
                : "Réinitialisez votre accès au tableau de bord."}
            </p>
          </div>

          {mode === "login" && (
            <form onSubmit={onSubmit} className="space-y-6">
              <input
                name="login"
                value={value.login}
                onChange={onChange}
                autoComplete="username"
                required
                placeholder="Email, nom utilisateur ou téléphone"
                className="h-14 w-full rounded-full border border-slate-200 bg-white px-6 shadow-sm outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
              />

              <input
                name="password"
                type="password"
                value={value.password}
                onChange={onChange}
                autoComplete="current-password"
                required
                placeholder="Mot de passe"
                className="h-14 w-full rounded-full border border-slate-200 bg-white px-6 shadow-sm outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
              />

              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-slate-500">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  Se souvenir de moi
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setResetLogin(value.login);
                    setMode("forgot");
                  }}
                  className="font-medium text-[#f04438] hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="h-14 w-full rounded-full bg-[#f04438] font-bold tracking-wide text-white shadow-xl shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "CONNEXION..." : "SE CONNECTER"}
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={submitForgotPassword} className="space-y-6">
              <input
                value={resetLogin}
                onChange={(event) => setResetLogin(event.target.value)}
                required
                placeholder="Email, nom utilisateur ou téléphone"
                className="h-14 w-full rounded-full border border-slate-200 bg-white px-6 shadow-sm outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="h-14 w-full rounded-full bg-[#f04438] font-bold tracking-wide text-white shadow-xl shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "GÉNÉRATION..." : "GÉNÉRER LE CODE"}
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="h-12 w-full rounded-full border border-slate-200 bg-white text-sm font-black text-slate-600 transition-all hover:border-[#f04438] hover:text-[#f04438]"
              >
                Retour à la connexion
              </button>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={submitResetPassword} className="space-y-6">
              <textarea
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                required
                placeholder="Code de réinitialisation"
                className="min-h-24 w-full rounded-3xl border border-slate-200 bg-white px-6 py-4 text-sm shadow-sm outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                placeholder="Nouveau mot de passe"
                className="h-14 w-full rounded-full border border-slate-200 bg-white px-6 shadow-sm outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="h-14 w-full rounded-full bg-[#f04438] font-bold tracking-wide text-white shadow-xl shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "VALIDATION..." : "RÉINITIALISER"}
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="h-12 w-full rounded-full border border-slate-200 bg-white text-sm font-black text-slate-600 transition-all hover:border-[#f04438] hover:text-[#f04438]"
              >
                Retour à la connexion
              </button>
            </form>
          )}

          {message && (
            <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {message}
            </p>
          )}

          <div className="mt-12 text-center text-xs text-slate-400">
            © 2026 Plateforme Restaurant SaaS
          </div>
        </div>
      </section>
    </main>
  );
}
