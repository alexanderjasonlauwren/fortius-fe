import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The store is local, so refetching is cheap and keeps every page in
      // step after a write elsewhere in the console.
      staleTime: 5_000,
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
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
