import { describe, expect, it } from "vitest";
import type { DispatchLane, StopStage } from "../types";
import { laneStage, orderLanes, splitLanes, VISIBLE_LANES } from "./railLanes";

function lane(driverId: string, ...stages: StopStage[]): DispatchLane {
  return {
    driverId,
    driver: driverId,
    plat: "-",
    armada: "-",
    kapasitas: 0,
    muatan: 0,
    status: "Standby",
    stops: stages.map((stage, i) => ({
      id: `${driverId}-${i}`,
      kode: "SJ",
      outlet: "P",
      kecamatan: "-",
      startMinute: i * 60,
      endMinute: i * 60 + 45,
      target: 0,
      realisasi: 0,
      stage,
    })),
  };
}

describe("the board's order", () => {
  it("takes a truck's state from its most urgent stop", () => {
    expect(laneStage(lane("a", "Selesai", "Tertunda", "Proses"))).toBe("Tertunda");
    expect(laneStage(lane("b", "Selesai", "Antrian"))).toBe("Antrian");
    expect(laneStage(lane("c", "Selesai"))).toBe("Selesai");
  });

  it("puts a failed stop first and finished trucks last, keeping ties in order", () => {
    const ordered = orderLanes([
      lane("done", "Selesai"),
      lane("road-1", "Proses"),
      lane("failed", "Selesai", "Tertunda"),
      lane("waiting", "Antrian"),
      lane("road-2", "Proses"),
    ]);
    expect(ordered.map((l) => l.driverId)).toEqual(["failed", "road-1", "road-2", "waiting", "done"]);
  });
});

describe("folding a large fleet", () => {
  it("draws a normal day whole", () => {
    const split = splitLanes([lane("ishak", "Proses"), lane("ary", "Antrian")], false);
    expect(split.folds).toBe(false);
    expect(split.shown).toHaveLength(2);
  });

  it("draws one truck over the cap rather than a summary row for it", () => {
    const lanes = Array.from({ length: VISIBLE_LANES + 1 }, (_, i) => lane(`t${i}`, "Proses"));
    expect(splitLanes(lanes, false)).toMatchObject({ folds: false, hidden: [] });
  });

  it("folds the rest, and what is shown plus what is counted is every truck", () => {
    const lanes = [
      ...Array.from({ length: 40 }, (_, i) => lane(`done${i}`, "Selesai")),
      ...Array.from({ length: 6 }, (_, i) => lane(`wait${i}`, "Antrian")),
      ...Array.from({ length: 5 }, (_, i) => lane(`road${i}`, "Proses")),
      lane("failed", "Tertunda"),
    ];
    const split = splitLanes(lanes, false);
    expect(split.folds).toBe(true);
    expect(split.shown.map((l) => l.driverId)).toEqual(["failed", "road0", "road1", "road2", "road3", "road4"]);
    expect(split.shown.length + split.hidden.length).toBe(lanes.length);
    expect(split.hiddenByStage).toEqual([
      { stage: "Antrian", count: 6 },
      { stage: "Selesai", count: 40 },
    ]);
  });

  it("draws every truck once expanded", () => {
    const lanes = Array.from({ length: 20 }, (_, i) => lane(`t${i}`, "Selesai"));
    const split = splitLanes(lanes, true);
    expect(split).toMatchObject({ folds: true, hidden: [] });
    expect(split.shown).toHaveLength(20);
  });
});
