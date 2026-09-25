import { describe, expect, it } from "vitest";
import { isWithinIndonesia, parseCoordinatePaste } from "./parseCoordinates";

describe("parseCoordinatePaste", () => {
  it("reads a Google Maps 'copy coordinates' pair", () => {
    expect(parseCoordinatePaste("-7.3305, 110.5084")).toEqual({ lat: -7.3305, lng: 110.5084 });
  });

  it("tolerates no space after the comma", () => {
    expect(parseCoordinatePaste("-7.3305,110.5084")).toEqual({ lat: -7.3305, lng: 110.5084 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCoordinatePaste("  -7.3305, 110.5084  ")).toEqual({ lat: -7.3305, lng: 110.5084 });
  });

  it("rejects a single number", () => {
    expect(parseCoordinatePaste("-7.3305")).toBeNull();
  });

  it("rejects a non-numeric pair", () => {
    expect(parseCoordinatePaste("Salatiga, Jawa Tengah")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseCoordinatePaste("")).toBeNull();
  });
});

describe("isWithinIndonesia", () => {
  it("accepts Salatiga", () => {
    expect(isWithinIndonesia(-7.3305, 110.5084)).toBe(true);
  });

  it("rejects 0,0", () => {
    expect(isWithinIndonesia(0, 0)).toBe(false);
  });

  it("rejects a swapped lat/lng pair", () => {
    // Salatiga's own pair, reversed -- lng 110 read as a latitude is already
    // out of Indonesia's box, which is exactly the mistake this catches.
    expect(isWithinIndonesia(110.5084, -7.3305)).toBe(false);
  });
});
