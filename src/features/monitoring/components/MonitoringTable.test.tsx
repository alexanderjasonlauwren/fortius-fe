// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilingLocation, MonitoringRow } from "../types";

vi.mock("@/lib/lexicon", () => ({ outletLabel: () => "pangkalan", outletLabelTitle: () => "Pangkalan" }));
vi.mock("@/features/rbac/components/CanAccess", () => ({ CanAccess: () => null }));

import { MonitoringTable } from "./MonitoringTable";

afterEach(cleanup);

/**
 * The client reads the closing distance on every surat jalan (24 Nov), not
 * only on the ones closed past the geofence.
 */
const row = (kode: string, lokasi?: FilingLocation): MonitoringRow => ({
  id: kode, kode, suratJalan: [{ id: `${kode}-sj`, kode }], outletId: "o", outlet: `Pangkalan ${kode}`,
  alamat: "", driverId: "d", driver: "Ishak", jamRencana: "", urutan: 1, target: 50, realisasi: 50,
  pencapaianPersen: 100, status: "Selesai", coord: { lat: 0, lng: 0 }, lokasi, version: 1,
});

function renderRows(rows: MonitoringRow[]) {
  render(
    <MemoryRouter>
      <MonitoringTable data={rows} isLoading={false} onStart={vi.fn()} onComplete={vi.fn()} onHold={vi.fn()} onPrint={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("closing distance on the surat jalan table", () => {
  it("shows the distance on a stop closed inside the geofence too", () => {
    renderRows([row("A", { verdict: "sesuai", jarakMeter: 42, radiusMeter: 500 })]);
    const label = screen.getByText("Ditutup 42 m dari pangkalan");
    expect(label.closest("[title]")?.getAttribute("title")).toBe("Di dalam radius 500 m titik pangkalan");
    expect(label.closest("[title]")?.className).not.toContain("text-rust-ink");
  });

  it("keeps a stop closed past the geofence loud", () => {
    renderRows([row("B", { verdict: "jauh", jarakMeter: 1_900, radiusMeter: 500 })]);
    const label = screen.getByText("Ditutup 1.9 km dari pangkalan");
    expect(label.closest("[title]")?.className).toContain("text-rust-ink");
  });

  it("gives the distance and the GPS error on a fix too coarse to judge", () => {
    renderRows([row("C", { verdict: "kasar", jarakMeter: 900, akurasiMeter: 2_000, radiusMeter: 500 })]);
    expect(screen.getByText(/Ditutup 900 m dari pangkalan/)).toBeTruthy();
    expect(screen.getByText("akurasi GPS ±2 km")).toBeTruthy();
  });

  it("says so when a closed stop has no position, and says nothing for an open one", () => {
    renderRows([
      row("D", { verdict: "tanpa-lokasi", radiusMeter: 500 }),
      // Closed from the office: nothing filed a position at all.
      row("E"),
      { ...row("F"), status: "Tertunda" },
      { ...row("G"), status: "Proses" },
      { ...row("H"), status: "Antrian" },
    ]);
    expect(screen.getAllByText("Lokasi penutupan tidak terekam")).toHaveLength(3);
    expect(screen.queryByText(/Ditutup/)).toBeNull();
  });
});
