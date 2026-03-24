import { describe, it, expect } from "vitest";
import {
  calculateDailyGDH,
  calculateCumulativeGDH,
  calculateTempAdjustmentFactor,
  findBestTemplate,
  adjustCurve,
  type TemperatureDay,
} from "./forecast-calculator";

describe("calculateDailyGDH", () => {
  it("returns 0 when avg temp is below base temp", () => {
    expect(calculateDailyGDH(3.0, 4.5)).toBe(0);
  });

  it("returns 0 when avg temp equals base temp", () => {
    expect(calculateDailyGDH(4.5, 4.5)).toBe(0);
  });

  it("calculates GDH correctly above base temp", () => {
    expect(calculateDailyGDH(15, 4.5)).toBe(252);
  });

  it("calculates with explicit base temp of 4.5", () => {
    expect(calculateDailyGDH(10, 4.5)).toBe((10 - 4.5) * 24);
  });

  it("handles negative temperatures", () => {
    expect(calculateDailyGDH(-5, 4.5)).toBe(0);
  });
});

describe("calculateCumulativeGDH", () => {
  it("returns empty array for empty input", () => {
    expect(calculateCumulativeGDH([], 4.5)).toEqual([]);
  });

  it("calculates cumulative GDH correctly", () => {
    const temps: TemperatureDay[] = [
      { date: "2025-06-01", min: 10, max: 20, avg: 15 },
      { date: "2025-06-02", min: 12, max: 22, avg: 17 },
      { date: "2025-06-03", min: 5, max: 8, avg: 3 },
    ];

    const result = calculateCumulativeGDH(temps, 4.5);

    expect(result).toHaveLength(3);
    expect(result[0].gdh).toBe((15 - 4.5) * 24);
    expect(result[0].cumulativeGdh).toBe(result[0].gdh);
    expect(result[1].gdh).toBe((17 - 4.5) * 24);
    expect(result[1].cumulativeGdh).toBe(result[0].gdh + result[1].gdh);
    expect(result[2].gdh).toBe(0);
    expect(result[2].cumulativeGdh).toBe(result[1].cumulativeGdh);
  });

  it("preserves date information", () => {
    const temps: TemperatureDay[] = [
      { date: "2025-07-15", min: 12, max: 25, avg: 18 },
    ];
    const result = calculateCumulativeGDH(temps, 4.5);
    expect(result[0].date).toBe("2025-07-15");
  });
});

describe("calculateTempAdjustmentFactor", () => {
  it("returns 1.0 for empty arrays", () => {
    expect(calculateTempAdjustmentFactor([], [])).toBe(1.0);
    expect(
      calculateTempAdjustmentFactor(
        [{ date: "2025-01-01", min: 0, max: 10, avg: 5 }],
        []
      )
    ).toBe(1.0);
  });

  it("returns ratio of inside/outside avg temps", () => {
    const outside: TemperatureDay[] = [
      { date: "2025-06-01", min: 10, max: 20, avg: 15 },
      { date: "2025-06-02", min: 12, max: 22, avg: 17 },
    ];
    const inside: TemperatureDay[] = [
      { date: "2025-06-01", min: 15, max: 30, avg: 22 },
      { date: "2025-06-02", min: 17, max: 32, avg: 25 },
    ];

    const factor = calculateTempAdjustmentFactor(outside, inside);
    const expectedOutsideAvg = (15 + 17) / 2;
    const expectedInsideAvg = (22 + 25) / 2;
    expect(factor).toBeCloseTo(expectedInsideAvg / expectedOutsideAvg);
  });

  it("returns 1.0 when outside avg is 0", () => {
    const outside: TemperatureDay[] = [
      { date: "2025-01-01", min: -5, max: 5, avg: 0 },
    ];
    const inside: TemperatureDay[] = [
      { date: "2025-01-01", min: 5, max: 15, avg: 10 },
    ];
    expect(calculateTempAdjustmentFactor(outside, inside)).toBe(1.0);
  });
});

describe("findBestTemplate", () => {
  const templates = [
    { id: "t1", varietyId: "v1", winteredInTunnel: true, productionCycle: 1, plantingDate: "2025-03-15", outsideTemps: undefined },
    { id: "t2", varietyId: "v2", winteredInTunnel: false, productionCycle: 2, plantingDate: "2025-04-01", outsideTemps: undefined },
    { id: "t3", varietyId: "v1", winteredInTunnel: false, productionCycle: 1, plantingDate: "2025-05-01", outsideTemps: undefined },
  ];

  it("ranks by variety match (highest weight)", () => {
    const results = findBestTemplate(templates, { varietyId: "v1" });
    expect(results[0].template.varietyId).toBe("v1");
    expect(results[1].template.varietyId).toBe("v1");
  });

  it("considers tunnel match", () => {
    const results = findBestTemplate(templates, { varietyId: "v1", winteredInTunnel: true });
    expect(results[0].template.id).toBe("t1");
  });

  it("returns all templates sorted by score", () => {
    const results = findBestTemplate(templates, {});
    expect(results).toHaveLength(3);
  });

  it("calculates adjustment percent from temperature comparison", () => {
    const templatesWithTemps = [
      {
        id: "t1", varietyId: "v1", winteredInTunnel: true, productionCycle: 1,
        outsideTemps: [{ date: "2025-06-01", min: 10, max: 20, avg: 15 }] as TemperatureDay[],
      },
    ];

    const results = findBestTemplate(templatesWithTemps, {
      varietyId: "v1",
      forecastTemps: [{ date: "2026-06-01", min: 12, max: 24, avg: 18 }],
    });

    expect(results[0].adjustmentPercent).toBe(20);
  });
});

describe("adjustCurve", () => {
  it("returns copy for 0% adjustment", () => {
    const curve = [10, 20, 30, 20, 10];
    const adjusted = adjustCurve(curve, 0);
    expect(adjusted).toEqual(curve);
    adjusted[0] = 999;
    expect(curve[0]).toBe(10);
  });

  it("compresses curve for positive adjustment (warmer)", () => {
    const curve = [5, 10, 15, 20, 25, 30, 25, 20, 15, 10];
    const adjusted = adjustCurve(curve, 30);
    expect(adjusted.length).toBeLessThan(curve.length);
  });

  it("stretches curve for negative adjustment (colder)", () => {
    const curve = [10, 20, 30, 20, 10];
    const adjusted = adjustCurve(curve, -10);
    expect(adjusted.length).toBeGreaterThan(curve.length);
  });

  it("always returns at least 1 element for positive adjustment", () => {
    const curve = [100];
    const adjusted = adjustCurve(curve, 200);
    expect(adjusted.length).toBeGreaterThanOrEqual(1);
  });
});
