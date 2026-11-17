import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "./components/ui/toast";
import { OldDateConfirmHost } from "./components/common/OldDateConfirmHost";
import { TooltipProvider } from "./components/ui/tooltip";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Thirty seconds, not five: every request now crosses the network to a
      // rate-limited API (300 a minute per person), and at five seconds a
      // person moving between pages refetched the same lists over and over
      // (Round 1 G15). Writes still refresh at once -- useDeskMutation
      // invalidates what is mounted -- so this only spaces out re-reads of
      // data nobody changed.
      staleTime: 30_000,
      retry: 0,
      refetchOnWindowFocus: true,
    },
  },
});

// Apply the saved theme before first paint so the page never flashes light.
const savedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle(
  "dark",
  savedTheme === "dark" || (!savedTheme && prefersDark),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/* One provider, so moving between adjacent row actions shows the
            next description at once instead of waiting out the delay again. */}
        <TooltipProvider delayDuration={250} skipDelayDuration={300}>
          <App />
          <OldDateConfirmHost />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
