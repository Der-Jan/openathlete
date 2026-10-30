import { describe, expect, it } from 'vitest';

import {
  SPORT_TYPE,
  formatSpeed,
  formatSpeedUnit,
  getSportConfig,
  isPaceUnit,
  paceDistanceMeters,
} from '@openathlete/shared';

describe('pace units', () => {
  it('writes swim paces per 100 m and rowing paces per 500 m', () => {
    // 1:40 per 100 m and 2:00 per 500 m
    expect(formatSpeed(1, 'min/100m')).toBe('1:40');
    expect(formatSpeed(500 / 120, 'min/500m')).toBe('2:00');
    expect(formatSpeedUnit('min/100m')).toBe('min/100 m');
    expect(formatSpeedUnit('min/500m')).toBe('min/500 m');
    expect(formatSpeed(0, 'min/100m')).toBe('0');
  });

  it('knows which units are paces and what distance they refer to', () => {
    expect(isPaceUnit('min/km')).toBe(true);
    expect(isPaceUnit('min/100m')).toBe(true);
    expect(isPaceUnit('km/h')).toBe(false);
    expect(paceDistanceMeters('min/100m')).toBe(100);
    expect(paceDistanceMeters('min/500m')).toBe(500);
    expect(paceDistanceMeters('min/km')).toBe(1000);
    expect(paceDistanceMeters('km/h')).toBe(1000);
  });

  it('gives each sport the pace its athletes count in', () => {
    expect(getSportConfig(SPORT_TYPE.SWIMMING).speedUnit).toBe('min/100m');
    expect(getSportConfig(SPORT_TYPE.ROWING).speedUnit).toBe('min/500m');
    expect(getSportConfig(SPORT_TYPE.VIRTUAL_ROW).speedUnit).toBe('min/500m');
    expect(getSportConfig(SPORT_TYPE.RUNNING).speedUnit).toBe('min/km');
    expect(getSportConfig(SPORT_TYPE.KAYAKING).speedUnit).toBe('km/h');
  });
});
