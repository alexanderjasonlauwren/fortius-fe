import { describe, expect, it } from "vitest";
import { countsToSend, openDocuments } from "./runClose";
import type { RunDocument } from "../types";

function doc(id: string, status: RunDocument["status"], dimuat: number, diterima: number, kembali = 0): RunDocument {
  return {
    id, kode: `SJ-${id}`, outlet: `Pangkalan ${id}`, produk: "LPG 3 kg",
    dimuat, diterima, kembali, status, dikonfirmasi: false, koreksiTertunda: false,
  };
}

describe("openDocuments", () => {
  it("lists only surat jalan still waiting on the driver", () => {
    const open = openDocuments([
      doc("1", "Selesai", 50, 50), doc("2", "Antrian", 30, 0),
      doc("3", "Proses", 20, 0), doc("4", "Tertunda", 10, 0, 10),
    ]);
    expect(open.map((d) => d.id)).toEqual(["2", "3"]);
  });
});

describe("countsToSend", () => {
  // Round 1 N8: 40 of 50 filed with no return. Left as filed, nothing is
  // sent -- the server books the 10 as returned on its own.
  it("sends nothing for a drop left as the driver filed it", () => {
    const short = doc("1", "Selesai", 50, 40, 0);
    expect(countsToSend([short], { "1": { diterima: 40, kembali: 10, catatan: "" } })).toEqual([]);
  });

  it("sends a corrected drop with its reason, trimmed", () => {
    const typo = doc("1", "Selesai", 50, 50);
    expect(
      countsToSend([typo], { "1": { diterima: 45, kembali: 5, catatan: "  sopir salah ketik " } }),
    ).toEqual([{ deliveryId: "1", diterima: 45, kembali: 5, catatan: "sopir salah ketik" }]);
  });

  it("leaves out an empty reason rather than sending blank text", () => {
    const typo = doc("1", "Selesai", 50, 50);
    expect(countsToSend([typo], { "1": { diterima: 45, kembali: 5, catatan: "  " } })[0].catatan).toBeUndefined();
  });
});
