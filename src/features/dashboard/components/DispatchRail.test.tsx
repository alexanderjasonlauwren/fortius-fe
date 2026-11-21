// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { DispatchLane, DispatchRail as RailData, StopStage } from "../types";
import { DispatchRail } from "./DispatchRail";

function lane(driver: string, stage: StopStage): DispatchLane {
  return {
    driverId: driver, driver, plat: "H 1", armada: "-", kapasitas: 100, muatan: 40, status: "Standby",
    stops: [{ id: `${driver}-1`, kode: "SJ", outlet: "Pangkalan A", kecamatan: "-", startMinute: 0,
      endMinute: 45, target: 40, realisasi: 0, stage }],
  };
}

function rail(lanes: DispatchLane[]): RailData {
  return { dayStart: 0, dayEnd: 60, nowMinute: 0, lanes, idleDrivers: [], hasSchedule: false };
}

function draw(data: RailData) {
  render(<MemoryRouter><DispatchRail data={data} /></MemoryRouter>);
}

afterEach(cleanup);

describe("the dispatch board on a large day", () => {
  it("draws six trucks, the failed one first, and counts the rest", () => {
    draw(rail([
      ...Array.from({ length: 40 }, (_, i) => lane(`Selesai ${i}`, "Selesai")),
      ...Array.from({ length: 11 }, (_, i) => lane(`Jalan ${i}`, "Proses")),
      lane("Ishak", "Tertunda"),
    ]));
    const drivers = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/drivers/"));
    expect(drivers).toHaveLength(6);
    expect(drivers[0].textContent).toBe("Ishak");
    expect(screen.getByText("+46 armada lain")).toBeTruthy();
    expect(screen.getByText(/6 berjalan/)).toBeTruthy();
    expect(screen.getByText(/40 selesai/)).toBeTruthy();
  });

  it("draws every truck on request, and folds them again", () => {
    draw(rail(Array.from({ length: 10 }, (_, i) => lane(`Sopir ${i}`, "Proses"))));
    fireEvent.click(screen.getByRole("button", { name: "Tampilkan semua (10)" }));
    expect(screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/drivers/"))).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Tampilkan 6 saja" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Tampilkan 6 saja" }));
    expect(screen.getByText("+4 armada lain")).toBeTruthy();
  });

  it("shows a normal day as it is, with no summary row", () => {
    draw(rail([lane("Ishak", "Proses"), lane("Ary", "Antrian")]));
    expect(screen.queryByRole("button", { name: /Tampilkan/ })).toBeNull();
  });
});

describe("the dispatch board for a role that can't open Monitoring or Sopir", () => {
  // Round 3 R3-14: finance's Beranda linked every stop to Monitoring and every
  // driver to their page, and both answered "di luar akses Anda".
  it("draws the stops and drivers without links, and still shows a stop's detail", () => {
    render(
      <MemoryRouter>
        <DispatchRail data={rail([lane("Ishak", "Proses")])} canMonitor={false} canOpenDrivers={false} />
      </MemoryRouter>,
    );
    const hrefs = screen.queryAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.filter((h) => h === "/monitoring" || h?.startsWith("/drivers/"))).toEqual([]);
    expect(screen.getByText("Ishak")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "SJ ke Pangkalan A, Proses" }));
    expect(screen.getByText("Muatan")).toBeTruthy();
  });

  it("links both for a role that can open them", () => {
    draw(rail([lane("Ishak", "Proses")]));
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/monitoring");
    expect(hrefs).toContain("/drivers/Ishak");
  });
});
