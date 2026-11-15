import { describe, it, expect } from "vitest";
import { validateSkipIntervals } from "../src/server/services/aniskip.js";

describe("AniSkip Interval Validation", () => {
  it("extracts valid OP and ED intervals", () => {
    const raw = [
      {
        skipType: "op",
        interval: { startTime: 15.5, endTime: 105.5 },
        episodeLength: 1440,
      },
      {
        skipType: "ed",
        interval: { startTime: 1320, endTime: 1410 },
        episodeLength: 1440,
      },
    ];

    const result = validateSkipIntervals(raw);
    expect(result.length).toBe(2);
    expect(result[0]?.skipType).toBe("op");
    expect(result[0]?.interval.startTime).toBe(15.5);
    expect(result[0]?.interval.endTime).toBe(105.5);
    expect(result[1]?.skipType).toBe("ed");
  });

  it("filters out invalid skip types, negative times, and reversed intervals", () => {
    const invalid = [
      {
        skipType: "recap", // not op or ed
        interval: { startTime: 0, endTime: 60 },
      },
      {
        skipType: "op",
        interval: { startTime: -5, endTime: 90 }, // negative start
      },
      {
        skipType: "op",
        interval: { startTime: 100, endTime: 50 }, // reversed
      },
      {
        skipType: "op",
        interval: { startTime: 0, endTime: 600 }, // longer than 300s
      },
    ];

    const result = validateSkipIntervals(invalid);
    expect(result.length).toBe(0);
  });

  it("handles malformed inputs safely", () => {
    expect(validateSkipIntervals([])).toEqual([]);
    expect(validateSkipIntervals(null as unknown as unknown[])).toEqual([]);
    expect(validateSkipIntervals([null, undefined, "invalid", 123])).toEqual([]);
  });
});
