import { describe, expect, it } from "vitest";
import type { AssignmentSuggestion, PlanRow, VehicleOption } from "../types";
import { applySuggestion, compareStops, moveStop } from "./stopOrder";

function row(overrides: Partial<PlanRow> & { id: string; outlet: string }): PlanRow {
  return {
    outletId: overrides.id,
    alamat: "—",
    lines: [],
    jumlahUnit: 30,
    driverId: null,
    driver: "Belum ditetapkan",
    vehicleId: null,
    vehicle: "Belum ditetapkan",
    jamPengiriman: "—",
    statusBayar: "Lunas",
    sisaKuotaOutlet: 0,
    piutang: 0,
    piutangJatuhTempo: 0,
    tripNo: null,
    urutan: null,
    ...overrides,
  };
}

describe("compareStops", () => {
  it("orders by trip, then position, then falls back to name", () => {
    const a = row({ id: "a", outlet: "Zeta", tripNo: 1, urutan: 2 });
    const b = row({ id: "b", outlet: "Ahmad", tripNo: 1, urutan: 1 });
    const c = row({ id: "c", outlet: "Beta", tripNo: 2, urutan: 1 });
    const d = row({ id: "d", outlet: "Alpha", tripNo: null, urutan: null });

    expect([a, b, c, d].sort(compareStops)).toEqual([b, a, c, d]);
  });
});

describe("applySuggestion", () => {
  const vehicles: VehicleOption[] = [{ id: "v1", label: "H 1234 AB", kapasitas: 300 }];

  it("keeps the suggested order and truck, not the array order", () => {
    // Rows arrive alphabetical (A, B, C), as `toPlanRows` sorts an
    // unassigned board -- the suggestion puts them C, A, B on one truck.
    const rows = [
      row({ id: "a", outlet: "Pangkalan A" }),
      row({ id: "b", outlet: "Pangkalan B" }),
      row({ id: "c", outlet: "Pangkalan C" }),
    ];
    const suggestion: AssignmentSuggestion = {
      trips: [
        {
          tripNo: 1,
          driverId: "d1",
          driver: "Slamet",
          vehicleId: "v1",
          armada: "H 1234 AB",
          kapasitas: 300,
          muatan: 90,
          muatanBerisiko: 0,
          stops: [
            { outletId: "c", outlet: "Pangkalan C", jumlahUnit: 30, urutan: 1, lunas: true },
            { outletId: "a", outlet: "Pangkalan A", jumlahUnit: 30, urutan: 2, lunas: true },
            { outletId: "b", outlet: "Pangkalan B", jumlahUnit: 30, urutan: 3, lunas: true },
          ],
        },
      ],
      unroutable: [],
      dasar: "test",
    };

    const result = applySuggestion(rows, suggestion, vehicles);
    const byId = new Map(result.map((r) => [r.id, r]));

    expect(byId.get("a")?.urutan).toBe(2);
    expect(byId.get("b")?.urutan).toBe(3);
    expect(byId.get("c")?.urutan).toBe(1);
    for (const r of result) {
      expect(r.vehicleId).toBe("v1");
      expect(r.vehicle).toBe("H 1234 AB");
      expect(r.driverId).toBe("d1");
      expect(r.tripNo).toBe(1);
    }
  });

  it("clears a stop the suggestion leaves out, rather than keeping its old run", () => {
    const rows = [
      row({ id: "a", outlet: "Pangkalan A", driverId: "old", driver: "Old Driver", tripNo: 1, urutan: 1 }),
    ];
    const suggestion: AssignmentSuggestion = { trips: [], unroutable: [], dasar: "test" };

    const result = applySuggestion(rows, suggestion, vehicles);

    expect(result[0].driverId).toBeNull();
    expect(result[0].driver).toBe("Belum ditetapkan");
    expect(result[0].tripNo).toBeNull();
    expect(result[0].urutan).toBeNull();
  });

  it("leaves an already-chosen truck alone when the suggestion names none", () => {
    // The mock suggester has no coordinates and never proposes a vehicle --
    // see suggestAssignment.ts's own DASAR_KAPASITAS note.
    const rows = [row({ id: "a", outlet: "Pangkalan A", vehicleId: "v1", vehicle: "H 1234 AB" })];
    const suggestion: AssignmentSuggestion = {
      trips: [
        {
          tripNo: 1,
          driverId: "d1",
          driver: "Slamet",
          armada: "—",
          kapasitas: 300,
          muatan: 30,
          muatanBerisiko: 0,
          stops: [{ outletId: "a", outlet: "Pangkalan A", jumlahUnit: 30, urutan: 1, lunas: true }],
        },
      ],
      unroutable: [],
      dasar: "test",
    };

    const result = applySuggestion(rows, suggestion, vehicles);

    expect(result[0].vehicleId).toBe("v1");
    expect(result[0].vehicle).toBe("H 1234 AB");
  });
});

describe("moveStop", () => {
  function run(): PlanRow[] {
    return [
      row({ id: "a", outlet: "A", driverId: "d1", tripNo: 1, urutan: 1 }),
      row({ id: "b", outlet: "B", driverId: "d1", tripNo: 1, urutan: 2 }),
      row({ id: "c", outlet: "C", driverId: "d1", tripNo: 1, urutan: 3 }),
      row({ id: "x", outlet: "X", driverId: "d2", tripNo: 1, urutan: 1 }),
    ];
  }

  it("swaps within a run and renumbers 1..n", () => {
    const result = moveStop(run(), "b", -1);
    const byId = new Map(result.map((r) => [r.id, r]));

    expect(byId.get("b")?.urutan).toBe(1);
    expect(byId.get("a")?.urutan).toBe(2);
    expect(byId.get("c")?.urutan).toBe(3);
  });

  it("is a no-op at either edge of the run", () => {
    const rows = run();
    expect(moveStop(rows, "a", -1)).toEqual(rows);
    expect(moveStop(rows, "c", 1)).toEqual(rows);
  });

  it("never touches another run", () => {
    const result = moveStop(run(), "b", -1);
    const x = result.find((r) => r.id === "x");
    expect(x?.urutan).toBe(1);
  });

  it("is a no-op for a stop with no driver", () => {
    const rows = [row({ id: "a", outlet: "A" })];
    expect(moveStop(rows, "a", 1)).toEqual(rows);
  });
});
