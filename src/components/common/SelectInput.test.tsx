// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SelectInput } from "./Field";

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
  onChange,
  count = 3,
}: {
  onChange: (value: string) => void;
  count?: number;
}) {
  const [value, setValue] = useState("");
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="vendor">Vendor</label>
      <SelectInput
        id="vendor"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
      >
        <option value="">— Pilih —</option>
        {Array.from({ length: count }, (_, i) => (
          <option key={i} value={`v${i}`}>
            Vendor {i} · {i === 1 ? "Kas" : "Bank"}
          </option>
        ))}
      </SelectInput>
    </form>
  );
}

describe("SelectInput", () => {
  it("delivers a real change event with the picked option's value", () => {
    const change = vi.fn();
    render(<Harness onChange={change} />);
    const trigger = screen.getByRole("combobox", { name: "Vendor" });
    expect(trigger.textContent).toContain("— Pilih —");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Vendor 1 · Kas" }));

    expect(change).toHaveBeenCalledWith("v1");
    expect(trigger.textContent).toContain("Vendor 1 · Kas");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks with the keyboard", () => {
    const change = vi.fn();
    render(<Harness onChange={change} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Vendor" }), { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(change).toHaveBeenCalledWith("v1");
  });

  it("filters long lists by the search box", () => {
    const change = vi.fn();
    render(<Harness onChange={change} count={20} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Vendor" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cari pilihan" }), {
      target: { value: "vendor 17" },
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Cari pilihan" }), { key: "Enter" });
    expect(change).toHaveBeenCalledWith("v17");
  });
});
