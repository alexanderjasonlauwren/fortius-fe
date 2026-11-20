// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuotaSummary } from "../types";

const state = vi.hoisted(() => ({ summary: null as unknown, reference: null as unknown }));
vi.mock("@/lib/scope", () => ({ scopeKey: () => ["tenant", "branch"] }));
vi.mock("../lib/period", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/period")>()),
  currentJakartaMonth: () => "2026-11",
}));
vi.mock("../api/saApi", () => ({
  getQuotaSummary: async () => state.summary,
  getBaseReference: async () => state.reference,
}));
import { QuotaSummaryPanel } from "./QuotaSummaryPanel";

afterEach(cleanup);

const summary: QuotaSummary = {
  periodMonth: "2026-11",
  today: "2026-11-09",
  todayQty: 560,
  days: [
    { date: "2026-11-08", qty: 0, referenceQty: null },
    { date: "2026-11-09", qty: 560, referenceQty: null },
    { date: "2026-11-10", qty: 360, referenceQty: null },
    { date: "2026-11-11", qty: 0, referenceQty: null },
  ],
  allocationQty: 20450,
  deliveredQty: 560,
  remainingQty: 19890,
  outletCount: 25,
  kinds: [],
  referenceQty: null,
  referenceRemainingQty: null,
  todayReferenceQty: null,
};

// The client's November: the PDF targets 11,200 and 6,800 went out by the
// 18th, while SIM3LON allocates 20,450 across 25 pangkalan.
const withReference: QuotaSummary = {
  ...summary,
  today: "2026-11-18",
  todayQty: 360,
  days: [
    { date: "2026-11-17", qty: 360, referenceQty: 360 },
    { date: "2026-11-18", qty: 360, referenceQty: 360 },
    { date: "2026-11-19", qty: 310, referenceQty: 360 },
    { date: "2026-11-20", qty: 0, referenceQty: 560 },
  ],
  deliveredQty: 6800,
  remainingQty: 13650,
  referenceQty: 11200,
  referenceRemainingQty: 4400,
  todayReferenceQty: 360,
};

async function renderPanel(data: QuotaSummary = summary, onUploadReference?: () => void, reference: unknown = null) {
  state.summary = data;
  state.reference = reference;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <QuotaSummaryPanel onUploadReference={onUploadReference} />
    </QueryClientProvider>,
  );
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

describe("branch quota against the Acuan Base SA", () => {
  it("leads with the PDF's target and keeps the SIM3LON allocation beneath", async () => {
    await renderPanel(withReference);

    expect(screen.getByText("Target Acuan SA").parentElement?.textContent).toContain("11.200");
    expect(screen.getByText("Sisa target").parentElement?.textContent).toContain("4.400");
    expect(screen.getByText("Tersalurkan").parentElement?.textContent).toContain("6.800");
    expect(screen.queryByText("Sisa alokasi")).toBeNull();
    const allocation = screen.getByText(/Alokasi SIM3LON/);
    expect(allocation.textContent).toContain("20.450");
    expect(allocation.textContent).toContain("13.650");
  });

  // 19 Nov: SIM3LON scheduled 310 against the PDF's 360, and nothing on the
  // card said so.
  it("flags a scheduled date below its target and draws every date's target", async () => {
    await renderPanel(withReference);

    const nineteenth = screen.getByLabelText(/19 November 2026/);
    expect(nineteenth.getAttribute("aria-label")).toMatch(/310 .* terjadwal, target Acuan SA 360/);
    expect(nineteenth.querySelector('[data-kind="target"]')).not.toBeNull();
    expect(screen.getByText(/Di bawah target Acuan SA/).textContent).toContain("310 dari 360");
    // Unscheduled is open, not short: SIM3LON has not planned the 20th yet.
    expect(screen.getByText(/Di bawah target Acuan SA/).textContent).not.toContain("560");
  });

  it("says the month has no PDF and offers the upload only to whoever may upload", async () => {
    const upload = vi.fn();
    await renderPanel(summary, upload);
    expect(screen.getByText(/belum diunggah/)).toBeTruthy();
    screen.getByRole("button", { name: /Unggah Acuan SA/ }).click();
    expect(upload).toHaveBeenCalled();
    cleanup();

    await renderPanel(summary);
    expect(screen.getByText(/belum diunggah/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Unggah Acuan SA/ })).toBeNull();
  });
});
