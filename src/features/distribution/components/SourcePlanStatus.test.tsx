// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcePlanStatus } from "./SourcePlanStatus";
import type { SourcePlanReview } from "../api/sourcePlanReview.contract";
afterEach(cleanup);
describe("source allocation state", () => {
  it("offers retry on the same created plan without manual-order fallback", () => {
    const retry = vi.fn();
    render(<MemoryRouter><SourcePlanStatus isLoading={false} error={new Error("network")} isFilling={false} canFill onRetry={retry} /></MemoryRouter>);
    expect(screen.getByRole("alert").textContent).toContain("bukan alokasi nol");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi pada rencana ini" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Lihat pesanan" })).toBeNull();
    expect(screen.getByText(/belum otomatis memperbarui draf/)).toBeTruthy();
  });
  it.each(["no_source", "uncovered_date", "empty_day", "incomplete"] as const)("displays %s without an action to invent allocations", (status) => {
    const review: SourcePlanReview = { status, date: "2026-09-19", rows: [], unresolvedRegistrationCodes: status === "incomplete" ? ["CODE-1"] : [] };
    render(<MemoryRouter><SourcePlanStatus review={review} isLoading={false} isFilling={false} canFill onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("status").textContent).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    if (status === "incomplete") expect(screen.getByText(/CODE-1/)).toBeTruthy();
  });
});
