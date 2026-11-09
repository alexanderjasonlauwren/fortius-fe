// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuotaSummary } from "../types";

const state = vi.hoisted(() => ({ summary: null as unknown }));
vi.mock("@/lib/scope", () => ({ scopeKey: () => ["tenant", "branch"] }));
vi.mock("../lib/period", () => ({ currentJakartaMonth: () => "2026-11" }));
vi.mock("../api/saApi", () => ({ getQuotaSummary: async () => state.summary }));
import { QuotaSummaryPanel } from "./QuotaSummaryPanel";

afterEach(cleanup);

const summary: QuotaSummary = {
  periodMonth: "2026-11",
  today: "2026-11-09",
  todayQty: 560,
  days: [
    { date: "2026-11-08", qty: 0 },
    { date: "2026-11-09", qty: 560 },
    { date: "2026-11-10", qty: 360 },
    { date: "2026-11-11", qty: 0 },
  ],
  allocationQty: 20450,
  deliveredQty: 560,
  remainingQty: 19890,
  outletCount: 25,
  kinds: [],
};

async function renderPanel() {
  state.summary = summary;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuotaSummaryPanel /></QueryClientProvider>);
  return screen.findByText(/Kuota bulanan/);
}

describe("branch quota strip", () => {
  // SIM3LON already held 360 for tomorrow and the card showed "·", so a
  // planner looking for tomorrow's allocation found nothing.
  it("shows a date SIM3LON has already scheduled, marked as scheduled", async () => {
    await renderPanel();

    const tomorrow = screen.getByLabelText(/10 November 2026/);
    expect(tomorrow.getAttribute("aria-label")).toMatch(/360 .* terjadwal/);
    expect(tomorrow.textContent).toContain("360");
    expect(tomorrow.querySelector("[data-kind]")?.getAttribute("data-kind")).toBe("scheduled");
    expect(screen.getByText(/untuk 1 tanggal mendatang/).textContent).toContain("360");
  });

  it("keeps a future date with nothing scheduled empty", async () => {
    await renderPanel();

    const later = screen.getByLabelText(/11 November 2026/);
    expect(later.getAttribute("aria-label")).toContain("belum ada jadwal");
    expect(later.textContent).toContain("·");
    expect(later.querySelector("[data-kind]")?.getAttribute("data-kind")).toBe("open");
  });

  // Scheduled cylinders are still in the depot; counting them would shrink
  // Sisa for a delivery that has not happened.
  it("does not count scheduled dates as distributed", async () => {
    await renderPanel();

    const today = screen.getByLabelText(/9 November 2026/);
    expect(today.querySelector("[data-kind]")?.getAttribute("data-kind")).toBe("distributed");
    expect(screen.getByText("Tersalurkan").parentElement?.textContent).toContain("560");
    expect(screen.getByText("Sisa alokasi").parentElement?.textContent).toContain("19.890");
  });
});
