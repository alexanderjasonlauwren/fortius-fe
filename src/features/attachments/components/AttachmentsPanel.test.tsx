// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A photo opened in a new tab, and the browser decided whether that meant
 * showing it or saving it to Downloads. Images now open in the console's own
 * preview; a PDF or a workbook still goes to a tab.
 */

const state = vi.hoisted(() => ({
  listAttachments: vi.fn(),
  attachmentDownloadUrl: vi.fn(),
}));

vi.mock("@/lib/scope", () => ({ scopeKey: () => ["tenant", "branch"] }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (store: { hasPermission: () => boolean }) => unknown) =>
    selector({ hasPermission: () => false }),
}));
vi.mock("../api/attachmentApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/attachmentApi")>()),
  listAttachments: state.listAttachments,
  attachmentDownloadUrl: state.attachmentDownloadUrl,
}));

import { AttachmentsPanel } from "./AttachmentsPanel";

const file = (id: string, name: string, mime: string, scan = "clean") => ({
  id, namaFile: name, jenis: mime, ukuran: 2048, diunggah: "2026-11-24T08:00:00Z", pemindaian: scan,
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AttachmentsPanel ownerType="delivery" ownerId="dlv-1" readOnly />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.listAttachments.mockResolvedValue([
    file("a1", "depan.jpg", "image/jpeg"),
    file("a2", "nota.pdf", "application/pdf"),
    file("a3", "samping.png", "image/png"),
    file("a4", "virus.jpg", "image/jpeg", "infected"),
  ]);
  state.attachmentDownloadUrl.mockImplementation(
    async (_type: string, _owner: string, id: string) => `https://files.example/${id}?sig=x`,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.listAttachments.mockReset();
  state.attachmentDownloadUrl.mockReset();
});

describe("attachment preview", () => {
  it("shows an image inside the console instead of opening a tab", async () => {
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Lihat depan.jpg" }));

    const image = await screen.findByRole("img", { name: "depan.jpg" });
    expect(image.getAttribute("src")).toBe("https://files.example/a1?sig=x");
    expect(openTab).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Buka di tab baru/ }).getAttribute("href"))
      .toBe("https://files.example/a1?sig=x");
  });

  it("steps through the images only, skipping the PDF and the infected file", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "depan.jpg" }));
    await screen.findByRole("img", { name: "depan.jpg" });
    expect(screen.getByText(/Gambar 1 dari 2/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Berikutnya/ }));
    expect((await screen.findByRole("img", { name: "samping.png" })).getAttribute("src"))
      .toBe("https://files.example/a3?sig=x");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await screen.findByRole("img", { name: "depan.jpg" });
  });

  it("still opens a PDF in a new tab", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const openTab = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Buka nota.pdf" }));

    expect(openTab).toHaveBeenCalledOnce();
    await waitFor(() => expect(tab.location.href).toBe("https://files.example/a2?sig=x"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers the tab when the browser cannot draw the image", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Lihat samping.png" }));
    fireEvent.error(await screen.findByRole("img", { name: "samping.png" }));

    expect(await screen.findByText(/tidak bisa ditampilkan di sini/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Buka di tab baru/ })).toBeTruthy();
  });

  it("never offers an infected file", async () => {
    renderPanel();
    const button = await screen.findByRole("button", { name: "Lihat virus.jpg" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "virus.jpg" })).toBeNull();
  });
});
