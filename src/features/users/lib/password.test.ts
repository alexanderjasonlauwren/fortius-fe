import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";

describe("generatePassword", () => {
  it("always carries an upper, a lower, a digit and a symbol, at the asked length", () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[#%+=]/);
    }
  });

  it("never uses characters a driver could misread", () => {
    const sample = Array.from({ length: 200 }, () => generatePassword()).join("");
    expect(sample).not.toMatch(/[0O1lI]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generatePassword()));
    expect(seen.size).toBe(100);
  });
});
