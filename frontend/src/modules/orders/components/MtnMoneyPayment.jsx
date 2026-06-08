/**
 * MtnMoneyPayment
 * Composant de paiement MTN Mobile Money pour la caisse.
 * Initie un appel de fonds USSD push et poll le statut toutes les 5 secondes.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, Phone, RefreshCw, XCircle } from "lucide-react";
import { formatApiError } from "@/utils/network";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 24;

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatMsisdn(raw) {
  return raw.replace(/\D/g, "").replace(/^(?:237|\+237|00237)/, "").slice(0, 9);
}

export function MtnMoneyPayment({ apiBaseUrl, order, onSuccess, onClose }) {
  const [msisdn, setMsisdn] = useState("");
  const [step, setStep] = useState("form");
  const [txId, setTxId] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(data?.detail, "Erreur API"));
    return data;
  }

  async function initiate() {
    const cleaned = formatMsisdn(msisdn);
    if (cleaned.length < 8) {
      setError("Numéro MTN invalide (ex: 670 000 000)");
      return;
    }
    setError("");
    setIsSubmitting(true);

    try {
      const result = await apiFetch("/api/v1/payments/mtn/initiate", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          payer_msisdn: cleaned,
        }),
      });

      setTxId(result.transaction_id);
      setStatusData(result);

      if (result.status === "SUCCESS") {
        setStep("success");
        onSuccess?.();
        return;
      }
      if (result.status === "FAILED") {
        setStep("failed");
        setError(result.message || "Paiement refusé");
        return;
      }

      setStep("pending");
      startPolling(result.transaction_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function startPolling(id) {
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      try {
        const result = await apiFetch(`/api/v1/payments/mtn/status/${id}`);
        setStatusData(result);

        if (result.status === "SUCCESS") {
          clearInterval(pollRef.current);
          setStep("success");
          onSuccess?.();
          return;
        }
        if (["FAILED", "CANCELLED", "EXPIRED"].includes(result.status)) {
          clearInterval(pollRef.current);
          setStep("failed");
          setError(
            result.failure_reason ||
              (result.status === "EXPIRED"
                ? "Délai expiré — le client n'a pas confirmé."
                : "Paiement refusé ou annulé.")
          );
          return;
        }
      } catch {
        // ignore network errors
      }

      if (count >= MAX_POLLS) {
        clearInterval(pollRef.current);
        setStep("failed");
        setError("Délai d'attente dépassé. Vérifiez auprès du client.");
      }
    }, POLL_INTERVAL_MS);
  }

  function retry() {
    clearInterval(pollRef.current);
    setStep("form");
    setTxId(null);
    setStatusData(null);
    setError("");
    setPollCount(0);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500">
            <span className="text-lg font-black text-white">M</span>
          </div>
          <div>
            <p className="font-black text-slate-900">MTN Mobile Money</p>
            <p className="text-xs font-semibold text-slate-500">
              Commande {order.order_number} · {money(order.total_amount)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
        >
          <XCircle size={18} />
        </button>
      </div>

      {step === "form" && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-600">
            Entrez le numéro MTN Mobile Money du client. Il recevra une notification USSD
            pour confirmer le paiement de{" "}
            <strong className="text-slate-900">{money(order.total_amount)}</strong>.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
              Numéro MTN du client
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-100">
              <Phone size={16} className="shrink-0 text-slate-400" />
              <input
                type="tel"
                value={msisdn}
                onChange={(e) => setMsisdn(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && initiate()}
                placeholder="6XX XXX XXX"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-300"
                autoFocus
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Format camerounais : 6XX XXX XXX (sans indicatif)
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={initiate}
            disabled={isSubmitting || !msisdn.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 py-3 text-sm font-black text-white shadow-sm hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Envoi en cours…
              </>
            ) : (
              `Envoyer la demande · ${money(order.total_amount)}`
            )}
          </button>
        </div>
      )}

      {step === "pending" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <Loader2 size={28} className="animate-spin text-yellow-500" />
          </div>
          <div>
            <p className="text-base font-black text-slate-900">
              En attente de confirmation
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Une notification USSD a été envoyée au{" "}
              <strong>{formatMsisdn(statusData?.payer_msisdn || msisdn)}</strong>.
              <br />
              Le client doit valider avec son PIN MTN Mobile Money.
            </p>
          </div>

          <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3">
            <p className="text-xs font-semibold text-yellow-700">
              Vérification automatique en cours ({pollCount * 5}s / {MAX_POLLS * 5}s max)
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-yellow-200">
              <div
                className="h-full rounded-full bg-yellow-500 transition-all duration-500"
                style={{ width: `${(pollCount / MAX_POLLS) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                clearInterval(pollRef.current);
                startPolling(txId);
                setPollCount(0);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <RefreshCw size={14} />
              Rafraîchir
            </button>
            <button
              type="button"
              onClick={() => {
                clearInterval(pollRef.current);
                setStep("failed");
                setError("Paiement annulé manuellement.");
              }}
              className="flex-1 rounded-xl border border-red-100 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-black text-emerald-700">Paiement confirmé !</p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {money(order.total_amount)} reçus via MTN Mobile Money.
              <br />
              La commande <strong>{order.order_number}</strong> est maintenant marquée Payée.
            </p>
          </div>
          {statusData?.provider_tx_id && (
            <p className="text-xs text-slate-400">
              Réf. transaction : <span className="font-mono">{statusData.provider_tx_id}</span>
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 transition"
          >
            Fermer
          </button>
        </div>
      )}

      {step === "failed" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle size={28} className="text-red-500" />
          </div>
          <div>
            <p className="text-base font-black text-red-700">Paiement échoué</p>
            <p className="mt-1 text-sm font-medium text-slate-500">{error}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={retry}
              className="flex-1 rounded-xl border border-yellow-200 bg-yellow-50 py-3 text-sm font-black text-yellow-700 hover:bg-yellow-100 transition"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
