import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/config/http";

/**
 * Hook de lecture de ressource API: centralise les etats loading/error/data/empty
 * et expose un refetch. Remplace le triptyque (useState data + useState loading +
 * useEffect fetch) duplique dans chaque composant.
 *
 *   const { data, isLoading, error, isEmpty, refetch } = useApiQuery("/api/v1/orders");
 *
 * `deps` declenche un rechargement quand l'une des valeurs change (ex. filtres).
 * `enabled=false` differe l'appel (ex. en attente d'un identifiant).
 */
export function useApiQuery(path, { deps = [], enabled = true, initialData = null, fallback } = {}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refetch = useCallback(
    async ({ silent = false } = {}) => {
      if (!enabled || !path) return undefined;
      if (!silent) setIsLoading(true);
      try {
        const result = await apiFetch(path, { fallback });
        if (mounted.current) {
          setData(result);
          setError(null);
        }
        return result;
      } catch (err) {
        if (mounted.current && !silent) setError(err.message);
        throw err;
      } finally {
        if (mounted.current && !silent) setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, enabled, fallback, ...deps],
  );

  useEffect(() => {
    if (enabled) refetch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  const isEmpty = !isLoading && !error && (data == null || (Array.isArray(data) && data.length === 0));

  return { data, setData, error, isLoading, isEmpty, refetch };
}

/**
 * Hook de mutation API (POST/PATCH/DELETE): gere l'etat `isPending` et l'erreur.
 *
 *   const { mutate, isPending } = useApiMutation();
 *   await mutate(`/api/v1/orders/${id}/status`, { method: "PATCH", body: { status } });
 */
export function useApiMutation({ fallback } = {}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (path, options = {}) => {
      setIsPending(true);
      setError(null);
      try {
        return await apiFetch(path, { fallback, ...options });
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [fallback],
  );

  return { mutate, isPending, error };
}
