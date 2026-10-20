import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createAdminApi, type AdminApi } from "./create";
import { queryRetry } from "./commandFlow";

const AdminApiContext = createContext<AdminApi | null>(null);

export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (!api) throw new Error("AdminApi is missing.");
  return api;
}

export function useAdminPage(pageId: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin-page", pageId],
    queryFn: () => api.page(pageId),
  });
}

export function AdminProviders({ children }: { children: ReactNode }) {
  // C-18: no 7 s of retries before "Your role cannot…" (only errors that can pass are retried, twice), and no
  // reload of every screen on window focus; live screens poll on their own timer.
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: queryRetry, refetchOnWindowFocus: false } } }));
  const [api] = useState(() =>
    createAdminApi({
      PROD: import.meta.env.PROD,
      VITE_DATA: import.meta.env.VITE_DATA,
      VITE_ADMIN_API: import.meta.env.VITE_ADMIN_API,
    }),
  );

  return (
    <QueryClientProvider client={client}>
      <AdminApiContext.Provider value={api}>{children}</AdminApiContext.Provider>
    </QueryClientProvider>
  );
}
