// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumberInput } from "./NumberInput";

function Harness({ decimals, start = 0 }: { decimals?: number; start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <NumberInput aria-label="angka" value={value} onValueChange={setValue} decimals={decimals} />
      <output>{value}</output>
    </>
  );
}

describe("NumberInput", () => {
  afterEach(cleanup);

  it("takes 0560 as 560 and shows it without the zero", () => {
    render(<Harness decimals={0} />);
    const input = screen.getByLabelText("angka") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0560" } });
    expect(screen.getByRole("status").textContent).toBe("560");
    fireEvent.blur(input);
    expect(input.value).toBe("560");
  });

  it("formats on blur with comma thousands and a dot for decimals", () => {
    render(<Harness decimals={4} />);
    const input = screen.getByLabelText("angka") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "11584.4594" } });
    fireEvent.blur(input);
    expect(input.value).toBe("11,584.4594");
    expect(screen.getByRole("status").textContent).toBe("11584.4594");
  });

  it("edits the plain number once focused again", () => {
    render(<Harness start={6487297} />);
    const input = screen.getByLabelText("angka") as HTMLInputElement;
    expect(input.value).toBe("6,487,297");
    fireEvent.focus(input);
    expect(input.value).toBe("6487297");
  });
});
