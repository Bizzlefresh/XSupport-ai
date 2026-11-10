"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    refetchOnWindowFocus: false,
    // Client errors (404, 403, 422) will not fix themselves; retry only network and server failures.
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
  } } }));
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider><ToastProvider><AuthProvider>{children}</AuthProvider></ToastProvider></ThemeProvider>
    </QueryClientProvider>
  );
}
