import { describe, expect, it } from "vitest";
import { terbilang } from "./terbilang";

describe("terbilang", () => {
  it("spells the client's September 2026 invoice the way it is printed", () => {
    expect(terbilang(12_298_915).toUpperCase()).toBe(
      "DUA BELAS JUTA DUA RATUS SEMBILAN PULUH DELAPAN RIBU SEMBILAN RATUS LIMA BELAS RUPIAH",
    );
  });

  it("says seratus and seribu, never satu ratus or satu ribu", () => {
    expect(terbilang(1_100)).toBe("seribu seratus rupiah");
    expect(terbilang(101_000)).toBe("seratus satu ribu rupiah");
    expect(terbilang(1_000_000)).toBe("satu juta rupiah");
  });

  it("handles the teens, sebelas and the empty groups between scales", () => {
    expect(terbilang(11)).toBe("sebelas rupiah");
    expect(terbilang(19)).toBe("sembilan belas rupiah");
    expect(terbilang(10)).toBe("sepuluh rupiah");
    expect(terbilang(2_000_005)).toBe("dua juta lima rupiah");
    expect(terbilang(1_000_000_000)).toBe("satu miliar rupiah");
    expect(terbilang(0)).toBe("nol rupiah");
  });

  it("drops sen, rounding to the rupiah", () => {
    expect(terbilang(12_937_267.2)).toBe(
      "dua belas juta sembilan ratus tiga puluh tujuh ribu dua ratus enam puluh tujuh rupiah",
    );
  });
});
