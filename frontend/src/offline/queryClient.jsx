/**
 * TanStack Query — cache persistant offline-first pour requêtes futures.
 * Les écrans critiques utilisent loadLocalFirst ; ce client couvre les nouvelles requêtes.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { idbGet, idbPut, STORES } from "@/offline/db";
import { initOfflineFoundation } from "@/offline/store";

const QUERY_CACHE_KEY = "react_query_cache";

const asyncStorage = {
  async getItem(key) {
    try {
      await initOfflineFoundation();
      const row = await idbGet(STORES.meta, key);
      return row?.value ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await initOfflineFoundation();
      await idbPut(STORES.meta, { key, value, savedAt: new Date().toISOString() });
    } catch {
      /* quota */
    }
  },
  async removeItem(key) {
    try {
      await initOfflineFoundation();
      await idbPut(STORES.meta, { key, value: null, savedAt: new Date().toISOString() });
    } catch {
      /* ignore */
    }
  },
};

const persister = createAsyncStoragePersister({
  storage: asyncStorage,
  key: QUERY_CACHE_KEY,
});

export const offlineQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: (failureCount, error) => {
        if (error?.message?.includes("fetch") || error?.message?.includes("network")) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: "offlineFirst",
      retry: 0,
    },
  },
});

export function OfflineQueryProvider({ children }) {
  return (
    <PersistQueryClientProvider
      client={offlineQueryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === "success",
        },
      }}
    >
      <QueryClientProvider client={offlineQueryClient}>{children}</QueryClientProvider>
    </PersistQueryClientProvider>
  );
}
