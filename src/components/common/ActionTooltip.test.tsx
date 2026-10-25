// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActionTooltip } from "./ActionTooltip";

afterEach(cleanup);

// Radix positions the tooltip with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

function renderAction(disabled: boolean) {
  return render(
    <TooltipProvider delayDuration={0}>
      <ActionTooltip label="Ambil LO dari SIM3LON" disabled={disabled}>
        <button type="button" disabled={disabled} aria-label="Ambil LO">
          x
        </button>
      </ActionTooltip>
    </TooltipProvider>,
  );
}

describe("ActionTooltip", () => {
  it("describes the action when the button gets keyboard focus", async () => {
    renderAction(false);
    await act(async () => {
      fireEvent.focus(screen.getByRole("button", { name: "Ambil LO" }));
    });
    expect((await screen.findAllByText("Ambil LO dari SIM3LON")).length).toBeGreaterThan(0);
  });

  it("still describes a disabled action, through a wrapper that can take focus", async () => {
    renderAction(true);
    const button = screen.getByRole("button", { name: "Ambil LO" });
    const wrapper = button.parentElement!;
    expect(wrapper.tagName).toBe("SPAN");
    expect(wrapper.tabIndex).toBe(0);
    await act(async () => {
      fireEvent.focus(wrapper);
    });
    expect((await screen.findAllByText("Ambil LO dari SIM3LON")).length).toBeGreaterThan(0);
  });
});
