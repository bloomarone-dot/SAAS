import { useState } from "react";
import { DashboardIcon } from "@/components/dashboard/icons";

export function LoginPanel({ value, onChange, onSubmit, isLoading, message }) {
  const [remember, setRemember] = useState(false);

  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 lg:flex">
        <img
          src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&q=85"
          alt="Restaurant"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />
        <div className="relative mt-auto max-w-2xl p-16 text-white">
          <p className="mb-4 text-sm font-black uppercase tracking-normal text-[#ffb4a8]">
            Restaurant SaaS
          </p>
          <h1 className="text-6xl font-black leading-tight">
            Pilotez vos restaurants depuis un seul espace.
          </h1>
          <div className="mt-10 flex gap-4">
            <button className="rounded-full bg-[#f04438] px-7 py-4 text-sm font-black text-white shadow-lg shadow-red-950/20 transition-all hover:bg-[#d92d20]">
              Tableau de bord
            </button>
            <button className="rounded-full border border-white/30 px-7 py-4 text-sm font-black text-white">
              Contact
            </button>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white/70 p-8 backdrop-blur-xl lg:p-16">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-5xl font-black text-slate-900">Connexion</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              Bienvenue dans votre tableau de bord Restaurant SaaS.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <input
              name="login"
              value={value.login}
              onChange={onChange}
              autoComplete="username"
              required
              placeholder="Adresse email ou nom utilisateur"
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

              <button type="button" className="font-medium text-[#f04438] hover:underline">
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

          {message && (
            <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {message}
            </p>
          )}

          <div className="mt-10 flex items-center justify-center gap-4">
            {[
              ["Facebook", "text-[#1877f2]"],
              ["Chrome", "text-[#ea4335]"],
              ["Twitter", "text-[#1da1f2]"],
            ].map(([icon, color]) => (
              <button
                key={icon}
                type="button"
                className={`flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition-all hover:scale-105 ${color}`}
              >
                <DashboardIcon name={icon} size={18} />
              </button>
            ))}
          </div>

          <div className="mt-12 text-center text-xs text-slate-400">
            © 2026 Plateforme Restaurant SaaS
          </div>
        </div>
      </section>
    </main>
  );
}
