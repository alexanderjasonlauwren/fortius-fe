// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverRun, RunStop } from "@/features/sopir/types";

/**
 * What a driver who is not used to apps will get wrong at the gate, and what
 * the screen must do about it: refuse to file a count nobody made, keep the
 * empties honest, warn -- never block -- on a far-off position, and file one
 * drop per tap however many times the button is pressed.
 */

const api = vi.hoisted(() => ({
  getMyRun: vi.fn(),
  departStop: vi.fn(),
  arriveStop: vi.fn(),
  completeStop: vi.fn(),
  holdStop: vi.fn(),
  checkLocation: vi.fn(),
}));
vi.mock("@/features/sopir/api/sopirApi", () => api);
vi.mock("@/lib/scope", () => ({ scopeKey: () => ["tenant", "branch"] }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/sopir/hooks/useOutbox", () => ({
  useOutbox: () => ({ pending: [], refused: [], waitingStops: new Set(), sendNow: vi.fn(), discard: vi.fn() }),
}));
vi.mock("@/features/sopir/hooks/useGpsStream", () => ({
  useGpsStream: () => ({ wanted: false, active: false, toggle: vi.fn() }),
}));
const perms = vi.hoisted(() => ({ granted: new Set<string>(["distribution.create.delivery_proofs"]) }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ user: { driverId: "drv" }, hasPermission: (p: string) => perms.granted.has(p) }),
}));

import { SopirPage } from "./SopirPage";

function stop(overrides: Partial<RunStop> = {}): RunStop {
  return {
    id: "stop-1",
    kode: "SJ-SLT-20261114-0001",
    urutan: 1,
    rit: 1,
    outletId: "outlet-1",
    outlet: "SRI HARTINI ARIWATI",
    alamat: "Jl. Tirtoyoso",
    kecamatan: "Tingkir",
    telepon: "",
    penanggungJawab: "Sri Hartini",
    lat: -7.33,
    lng: 110.51,
    jamRencana: "",
    lines: [
      { productId: "lpg3", nama: "LPG 3 Kg Subsidi", satuan: "tabung", returnable: true, target: 20, realisasi: 0 },
    ],
    target: 20,
    realisasi: 0,
    status: "Proses",
    tibaPada: "2026-11-14T06:00:00Z",
    filings: [],
    ...overrides,
  };
}

function runWith(stops: RunStop[]): DriverRun {
  return {
    rekamLokasi: false,
    driver: { id: "drv", nama: "Agus Prasetyo", plat: "K 8530 HS", armada: "Truk", kapasitas: 560, status: "Bertugas" },
    peran: "Sopir",
    tanggal: "2026-11-14",
    radiusMeter: 150,
    stops,
    totals: { singgah: stops.length, selesai: 0, tertunda: 0, sisa: stops.length, muatan: 20, terkirim: 0, kosong: 0, isiKembali: 0, kapasitas: 560 },
    stopBerikutId: stops[0]?.id ?? null,
  };
}

beforeEach(() => {
  perms.granted = new Set(["distribution.create.delivery_proofs"]);
  for (const fn of Object.values(api)) fn.mockReset();
  api.getMyRun.mockResolvedValue(runWith([stop()]));
  api.checkLocation.mockResolvedValue({ verdict: "sesuai", jarakMeter: 20 });
  api.completeStop.mockResolvedValue({ kode: "SJ-SLT-20261114-0001", realisasi: 20 });
  api.holdStop.mockResolvedValue({ kode: "SJ-SLT-20261114-0001", realisasi: 0 });
});
afterEach(cleanup);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SopirPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openClose() {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: /Selesai: catat penerimaan/ }));
  return screen.findByRole("dialog");
}

const received = (d: HTMLElement) => within(d).getByLabelText(/Diterima \(/) as HTMLInputElement;
const empties = (d: HTMLElement) => within(d).getByLabelText(/kosong diterima/i) as HTMLInputElement;
const submit = (d: HTMLElement) => within(d).getByRole("button", { name: /Tutup surat jalan|Menyimpan/ });

describe("whose route it is", () => {
  // Round 4 R4-12: the kernet's page was headed with the driver's name.
  it("names the kernet, and the driver they ride with", async () => {
    api.getMyRun.mockResolvedValue({ ...runWith([stop()]), peran: "Kernet", kernet: "Ary Nurfianto" });
    setup();
    expect(await screen.findByText("Ary Nurfianto")).toBeTruthy();
    expect(screen.getByText(/Anda ikut sebagai kernet bersama Agus Prasetyo/)).toBeTruthy();
  });

  it("names the driver on the driver's own page", async () => {
    setup();
    expect(await screen.findByText("Agus Prasetyo")).toBeTruthy();
  });
});

describe("closing a drop", () => {
  it("will not file a count above what was loaded", async () => {
    const d = await openClose();
    fireEvent.change(received(d), { target: { value: "21" } });
    expect((submit(d) as HTMLButtonElement).disabled).toBe(true);
    expect(within(d).getByText(/Tidak bisa lebih dari 20/)).toBeTruthy();
  });

  it("will not file an emptied quantity box as zero", async () => {
    const d = await openClose();
    fireEvent.change(received(d), { target: { value: "" } });
    expect((submit(d) as HTMLButtonElement).disabled).toBe(true);
    expect(within(d).getByText(/Isi jumlah yang diterima/)).toBeTruthy();
  });

  it("will not file without the name of who received it", async () => {
    const d = await openClose();
    fireEvent.change(within(d).getByLabelText(/Diterima oleh/), { target: { value: "   " } });
    expect((submit(d) as HTMLButtonElement).disabled).toBe(true);
  });

  // Round 4 R4-13: one letter enabled the button, then the server refused
  // it (RECIPIENT_REQUIRED wants two characters).
  it("will not file a one-letter recipient name", async () => {
    const d = await openClose();
    fireEvent.change(within(d).getByLabelText(/Diterima oleh/), { target: { value: " A " } });
    expect((submit(d) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText(/Diterima oleh/), { target: { value: "Bu" } });
    expect((submit(d) as HTMLButtonElement).disabled).toBe(false);
  });

  it("will not file a negative number of empties", async () => {
    const d = await openClose();
    fireEvent.change(empties(d), { target: { value: "-5" } });
    expect((submit(d) as HTMLButtonElement).disabled).toBe(true);
  });

  // Before, the empties box only appeared after empties had been filed, so a
  // driver could never enter them.
  it("asks for empties on an exchange and follows the received count until the driver edits it", async () => {
    const d = await openClose();
    expect(empties(d).value).toBe("20");

    fireEvent.change(received(d), { target: { value: "15" } });
    expect(empties(d).value).toBe("15");

    fireEvent.change(empties(d), { target: { value: "12" } });
    fireEvent.change(received(d), { target: { value: "14" } });
    expect(empties(d).value).toBe("12");

    fireEvent.click(submit(d));
    await waitFor(() => expect(api.completeStop).toHaveBeenCalledOnce());
    expect(api.completeStop.mock.calls[0][0].lines[0]).toMatchObject({ realisasi: 14, kembali: 12 });
  });

  it("does not ask for empties on an accessory", async () => {
    api.getMyRun.mockResolvedValue(runWith([stop({
      lines: [{ productId: "scale", nama: "Timbangan", satuan: "unit", returnable: false, target: 1, realisasi: 0 }],
    })]));
    const d = await openClose();
    expect(within(d).queryByLabelText(/kosong diterima/i)).toBeNull();
  });

  it("warns when the phone is far from the pangkalan but still lets the driver close", async () => {
    api.checkLocation.mockResolvedValue({ verdict: "jauh", jarakMeter: 5_000 });
    const d = await openClose();
    expect(await within(d).findByRole("alert")).toBeTruthy();
    expect(within(d).getByRole("alert").textContent).toMatch(/Pastikan Anda sudah di lokasi/);
    expect((submit(d) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not warn on a rough fix or with no position at all", async () => {
    for (const verdict of ["kasar", "tanpa-lokasi"]) {
      api.checkLocation.mockResolvedValue({ verdict });
      const d = await openClose();
      await waitFor(() => expect(api.checkLocation).toHaveBeenCalled());
      expect(within(d).queryByRole("alert")).toBeNull();
      cleanup();
    }
  });

  it("files once however many times the button is pressed", async () => {
    let finish: (v: unknown) => void = () => {};
    api.completeStop.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const d = await openClose();

    fireEvent.click(submit(d));
    fireEvent.click(submit(d));
    fireEvent.click(submit(d));

    await waitFor(() => expect((submit(d) as HTMLButtonElement).disabled).toBe(true));
    expect(api.completeStop).toHaveBeenCalledTimes(1);
    finish({ kode: "SJ", realisasi: 20 });
  });

  it("never promises an invoice it does not raise", async () => {
    const d = await openClose();
    expect(d.textContent).not.toMatch(/tagihan/i);
  });
});

describe("reporting a kendala", () => {
  async function openHold() {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Ada kendala di lokasi/ }));
    return screen.findByRole("dialog");
  }

  it("will not file without saying what happened", async () => {
    const d = await openHold();
    const button = within(d).getByRole("button", { name: "Tandai tertunda" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText(/Apa yang terjadi/), { target: { value: "    " } });
    expect(button.disabled).toBe(true);
  });

  it("tells the driver to bring the load back and that the office knows", async () => {
    const d = await openHold();
    expect(d.textContent).toMatch(/dibawa kembali ke gudang/);
    expect(d.textContent).toMatch(/Kantor langsung diberi tahu/);
    expect(d.textContent).not.toMatch(/tidak menerbitkan tagihan|tetap terbuka/);
  });
});

describe("the day's summary", () => {
  it("shows empties and undelivered full cylinders as separate figures", async () => {
    const run = runWith([stop()]);
    run.totals = { ...run.totals, kosong: 260, isiKembali: 15 };
    api.getMyRun.mockResolvedValue(run);
    setup();
    const empties = await screen.findByText(/kosong diterima/i);
    expect(empties.nextElementSibling?.textContent).toBe("260");
    expect(screen.getByText("Isi dibawa kembali").nextElementSibling?.textContent).toBe("15");
  });

  it("labels each stop with its load when the driver has more than one today", async () => {
    api.getMyRun.mockResolvedValue(runWith([stop(), stop({ id: "stop-2", rit: 2, urutan: 1, outlet: "YATMIATUN" })]));
    setup();
    expect(await screen.findByText("Rit 2")).toBeTruthy();
    expect(screen.getByText("Rit 1")).toBeTruthy();
  });
});

describe("finding the next stop", () => {
  // A driver on their second load scrolled past every stop of the first --
  // three screens on a phone -- to find where to go next.
  it("puts the stops still to do above the finished ones", async () => {
    api.getMyRun.mockResolvedValue(runWith([
      stop({ id: "done-1", outlet: "BA'DRU", status: "Selesai", rit: 1 }),
      stop({ id: "done-2", outlet: "SITI", status: "Tertunda", rit: 1 }),
      stop({ id: "open-1", outlet: "ELIYA", status: "Antrian", tibaPada: undefined, rit: 2 }),
    ]));
    setup();
    await screen.findByText("ELIYA");
    const names = [...document.querySelectorAll("ol > li")].map((li) =>
      ["ELIYA", "BA'DRU", "SITI"].find((n) => li.textContent?.includes(n)));
    expect(names).toEqual(["ELIYA", "BA'DRU", "SITI"]);
    expect(screen.getByText("Sudah selesai (2)")).toBeTruthy();
  });

  // Tapping the name used to open a page the driver may not see.
  it("shows the pangkalan's name as text, not a link, to someone who cannot open it", async () => {
    setup();
    const name = await screen.findByText("SRI HARTINI ARIWATI");
    expect(name.closest("a")).toBeNull();
    cleanup();

    perms.granted.add("masterdata.read.outlets");
    setup();
    expect((await screen.findByText("SRI HARTINI ARIWATI")).closest("a")).not.toBeNull();
  });

  // A refusal usually means the kernet or the office filed first; the card
  // must stop offering the same tap.
  it("reads the run again after a filing is refused", async () => {
    api.getMyRun.mockResolvedValue(runWith([stop({ status: "Antrian", tibaPada: undefined })]));
    api.departStop.mockRejectedValue(new Error("Keberangkatan ke lokasi ini sudah tercatat."));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Berangkat ke/ }));
    await waitFor(() => expect(api.getMyRun).toHaveBeenCalledTimes(2));
  });
});
