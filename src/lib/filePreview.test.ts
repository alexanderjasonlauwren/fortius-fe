import { describe, expect, it } from "vitest";
import { linkIsOtherFile, looksLikeImage } from "./filePreview";

describe("telling a picture from other files", () => {
  it.each([
    [{ mime: "image/jpeg" }, true],
    [{ mime: "IMAGE/PNG", name: "x.pdf" }, true],
    [{ mime: "application/pdf", name: "foto.jpg" }, false],
    [{ name: "struk.webp" }, true],
    [{ name: "rekap.xlsx" }, false],
    [{ name: "nota.PDF" }, false],
    // OCR receipts and transfer slips arrive without a type: they are photos.
    [{}, true],
    [{ name: "IMG_2041" }, true],
  ])("%o -> %s", (file, expected) => {
    expect(looksLikeImage(file)).toBe(expected);
  });

  it("reads the signed link's path, not its query", () => {
    expect(linkIsOtherFile("https://r2.example/t/ocr/5/a.pdf?X-Amz-Signature=abc")).toBe(true);
    expect(linkIsOtherFile("https://r2.example/t/ocr/5/a.jpeg?X-Amz-Signature=x.pdf")).toBe(false);
    expect(linkIsOtherFile("not a url")).toBe(false);
  });
});
