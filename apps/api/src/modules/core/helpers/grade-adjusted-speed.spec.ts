import { gradeAdjustedSpeed, runningEnergyCost } from './grade-adjusted-speed';

describe('runningEnergyCost', () => {
  it('follows the published curve', () => {
    expect(runningEnergyCost(0)).toBeCloseTo(3.6, 5);
    expect(runningEnergyCost(0.1)).toBeCloseTo(5.97, 2);
    expect(runningEnergyCost(-0.2)).toBeCloseTo(1.8, 1);
  });
});

describe('gradeAdjustedSpeed', () => {
  it('leaves a flat speed unchanged', () => {
    expect(gradeAdjustedSpeed(3, 0)).toBeCloseTo(3, 5);
  });

  it('is faster than the speed uphill, slower on a gentle descent', () => {
    expect(gradeAdjustedSpeed(3, 0.1)).toBeGreaterThan(4.9);
    expect(gradeAdjustedSpeed(3, -0.1)).toBeLessThan(3);
  });

  it('caps the grade', () => {
    expect(gradeAdjustedSpeed(3, 2)).toBe(gradeAdjustedSpeed(3, 0.3));
    expect(gradeAdjustedSpeed(3, -2)).toBe(gradeAdjustedSpeed(3, -0.3));
  });
});
