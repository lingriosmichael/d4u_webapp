import { describe, expect, it } from "vitest";
import { formatAmountInput, netFromGross, parseGermanAmount } from "@/lib/parse-amount";

// Money input: a wrong parse here routes, reserves and pays a different
// amount than the person typed. "1.500" used to become 1.5 and "12abc" 12.

describe("parseGermanAmount", () => {
  it.each([
    ["1500", 1500],
    ["1500,5", 1500.5],
    ["1500,50", 1500.5],
    ["0,99", 0.99],
    ["1.500", 1500],
    ["1.500,00", 1500],
    ["1.234,56", 1234.56],
    ["1.234.567,89", 1234567.89],
    ["12.345", 12345],
    ["1.5", 1.5],
    ["1500.50", 1500.5],
    [" 1.234,56 € ", 1234.56],
    ["1 234,56", 1234.56],
  ])("parses %j as %d", (input, expected) => {
    expect(parseGermanAmount(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "12abc",
    "1,500", // three decimals: ambiguous, never guessed
    "1,2,3",
    "1.2345",
    "1500,505",
    "1.50.0",
    "12.34,56", // thousands group of two digits
    "-5",
    ",5",
    "1500,",
  ])("rejects %j", (input) => {
    expect(parseGermanAmount(input)).toBeNaN();
  });
});

describe("formatAmountInput", () => {
  it("shows two decimals with a comma, round-tripping through the parser", () => {
    expect(formatAmountInput(1234.5)).toBe("1234,50");
    expect(parseGermanAmount(formatAmountInput(840.34))).toBe(840.34);
  });
});

describe("netFromGross", () => {
  it("matches the backend's rounding at each VAT rate", () => {
    expect(netFromGross(1000, 19)).toBe(840.34);
    expect(netFromGross(1000, 7)).toBe(934.58);
    expect(netFromGross(1000, 0)).toBe(1000);
  });
});
