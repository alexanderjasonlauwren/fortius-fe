// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TextInput } from "./Field";

beforeAll(() => {
  // Radix positions popovers with ResizeObserver, which jsdom does not ship.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

function Harness({
  type,
  initial,
  min,
  onChange,
}: {
  type: "date" | "month";
  initial: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="when">Tanggal</label>
      <TextInput
        id="when"
        type={type}
        min={min}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
      />
    </>
  );
}

describe("TextInput type=date", () => {
  it("picks a day as YYYY-MM-DD through a real change event", () => {
    const change = vi.fn();
    render(<Harness type="date" initial="2026-10-17" onChange={change} />);
    const trigger = screen.getByRole("button", { name: "Tanggal" });
    expect(trigger.textContent).toContain("17 Okt 2026");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /20 Oktober 2026/ }));

    expect(change).toHaveBeenCalledWith("2026-10-20");
    expect(trigger.textContent).toContain("20 Okt 2026");
  });

  it("refuses days before min", () => {
    const change = vi.fn();
    render(<Harness type="date" initial="2026-10-17" min="2026-10-15" onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Tanggal" }));
    fireEvent.click(screen.getByRole("button", { name: /14 Oktober 2026/ }));
    expect(change).not.toHaveBeenCalled();
  });

  it("pages a month by keyboard, clamping 31 Oct to 30 Nov", () => {
    const change = vi.fn();
    render(<Harness type="date" initial="2026-10-31" onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Tanggal" }));
    // Next month from 31 Oct clamps to 30 Nov rather than rolling into December.
    fireEvent.keyDown(screen.getByRole("grid"), { key: "PageDown" });
    expect(screen.getByRole("grid", { name: "November 2026" })).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/30 November 2026/);
  });
});

describe("TextInput type=month", () => {
  it("picks a month as YYYY-MM", () => {
    const change = vi.fn();
    render(<Harness type="month" initial="2026-10" onChange={change} />);
    const trigger = screen.getByRole("button", { name: "Tanggal" });
    expect(trigger.textContent).toContain("Oktober 2026");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Maret 2026" }));

    expect(change).toHaveBeenCalledWith("2026-03");
  });
});
