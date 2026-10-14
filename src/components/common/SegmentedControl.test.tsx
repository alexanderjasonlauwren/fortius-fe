// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./Field";

afterEach(cleanup);

describe("SegmentedControl", () => {
  it("changes the choice without submitting the form it sits in", () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const change = vi.fn();
    render(
      <form onSubmit={submit}>
        <SegmentedControl value="cash" onChange={change}
          options={[{ value: "cash", label: "Kas" }, { value: "bank", label: "Bank" }]} />
      </form>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Bank" }));
    expect(change).toHaveBeenCalledWith("bank");
    expect(submit).not.toHaveBeenCalled();
  });
});
