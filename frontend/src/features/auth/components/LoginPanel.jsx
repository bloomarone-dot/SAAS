import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const loginHeroImage = "/Images/ImageLogin.jpg";
const logoImage = "/logo.jpeg";
const noPasswordManagerAttrs = {
  autoComplete: "new-password",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
};

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
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="relative hidden overflow-hidden bg-[#003f2f] lg:flex">
        <img
          src={loginHeroImage}
          alt="Restaurant"
          className="absolute inset-0 h-full w-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#002b21] via-[#003f2f]/45 to-transparent" />
        <div className="relative flex h-full w-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img
              src={logoImage}
              alt="Logo Le Bon Coin"
              className="h-12 w-12 rounded-lg object-cover shadow-sm ring-1 ring-white/30"
            />
            <div>
              <p className="text-2xl font-black leading-tight">Le Bon Coin</p>
              <p className="text-sm font-semibold text-white/75">
                Gestion de restaurant
              </p>
            </div>
          </div>
          <div className="max-w-xl">
            <p className="mb-4 w-fit rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-normal text-emerald-100">
              Espace sécurisé
            </p>
            <h1 className="text-5xl font-black leading-tight">
              Pilotez vos restaurants depuis un seul espace.
            </h1>
            <p className="mt-5 text-base font-medium leading-7 text-white/75">
              Connectez-vous pour gérer les commandes, la caisse, le stock,
              l’équipe et les rapports.
            </p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white p-6 lg:p-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <img
              src={logoImage}
              alt="Logo Le Bon Coin"
              className="mx-auto mb-5 h-16 w-16 rounded-xl object-cover shadow-sm ring-1 ring-emerald-100 lg:hidden"
            />
            <h2 className="mb-3 text-4xl font-black text-[#003f2f]">
              {mode === "login" ? "Le Bon Coin" : "Mot de passe oublié"}
            </h2>
            <p className="text-sm leading-relaxed text-slate-500">
              {mode === "login"
                ? "Connectez-vous à votre espace de gestion restaurant."
                : "Saisissez votre identifiant pour réinitialiser votre accès."}
            </p>
          </div>

          {mode === "login" && (
            <form
              onSubmit={onSubmit}
              autoComplete="off"
              data-lpignore="true"
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <label className="block">
                <span className="mb-2 block text-xs font-black text-slate-700">
                  Adresse e-mail ou identifiant{" "}
                  <span className="text-red-500">*</span>
                </span>
                <input
                  name="login"
                  value={value.login}
                  onChange={onChange}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  placeholder="Email, nom utilisateur ou téléphone"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition-all focus:border-[#078d50] focus:ring-4 focus:ring-emerald-50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black text-slate-700">
                  Mot de passe <span className="text-red-500">*</span>
                </span>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={value.password}
                    onChange={onChange}
                    {...noPasswordManagerAttrs}
                    required
                    placeholder="Mot de passe"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-sm font-semibold outline-none transition-all focus:border-[#078d50] focus:ring-4 focus:ring-emerald-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-emerald-50"
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    title={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setResetLogin(value.login);
                    setMode("forgot");
                  }}
                  className="font-bold text-[#078d50] hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="h-12 w-full rounded-lg bg-[#078d50] text-sm font-black text-white shadow-sm transition-all hover:bg-[#046b3c] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Connexion..." : "Se connecter"}
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <form
              onSubmit={submitForgotPassword}
              autoComplete="off"
              data-lpignore="true"
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <input
                value={resetLogin}
                onChange={(event) => setResetLogin(event.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder="Email, nom utilisateur ou téléphone"
                className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition-all focus:border-[#078d50] focus:ring-4 focus:ring-emerald-50"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="h-12 w-full rounded-lg bg-[#078d50] text-sm font-black text-white shadow-sm transition-all hover:bg-[#046b3c] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Envoi..." : "Envoyer le lien"}
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="h-12 w-full rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-600 transition-all hover:border-[#078d50] hover:text-[#078d50]"
              >
                Retour à la connexion
              </button>
            </form>
          )}

          {mode === "reset" && (
            <form
              onSubmit={submitResetPassword}
              autoComplete="off"
              data-lpignore="true"
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <textarea
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                required
                placeholder="Code de réinitialisation"
                className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition-all focus:border-[#078d50] focus:ring-4 focus:ring-emerald-50"
              />
              <div className="relative">
                <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                {...noPasswordManagerAttrs}
                required
                  minLength={8}
                  placeholder="Nouveau mot de passe"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-sm font-semibold outline-none transition-all focus:border-[#078d50] focus:ring-4 focus:ring-emerald-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-emerald-50"
                  aria-label={
                    showNewPassword
                      ? "Masquer le nouveau mot de passe"
                      : "Afficher le nouveau mot de passe"
                  }
                  title={
                    showNewPassword
                      ? "Masquer le nouveau mot de passe"
                      : "Afficher le nouveau mot de passe"
                  }
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="h-12 w-full rounded-lg bg-[#078d50] text-sm font-black text-white shadow-sm transition-all hover:bg-[#046b3c] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Validation..." : "Réinitialiser"}
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="h-12 w-full rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-600 transition-all hover:border-[#078d50] hover:text-[#078d50]"
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

          <div className="mt-8 text-center text-xs text-slate-400">
            © 2026 Le Bon Coin. Tous droits réservés.
          </div>
        </div>
      </section>
    </main>
  );
}
