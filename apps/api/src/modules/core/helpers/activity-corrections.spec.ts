import {
  ActivityStream,
  activityCorrectionSchema,
  applyCorrections,
  correctedFigures,
  findSpikes,
  summarizeStream,
} from '@openathlete/shared';

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

// Ten minutes, a sample a second, at 3 m/s and 150 bpm, 200 W
const steady = (): ActivityStream => ({
  time: range(601, (i) => i),
  distance: range(601, (i) => i * 3),
  heartrate: range(601, () => 150),
  watts: range(601, () => 200),
  altitude: range(601, (i) => 100 + (i % 2 ? 1.5 : 0)),
  latlng: range(601, (i) => [45 + i * 0.00003, 5]),
});

describe('findSpikes', () => {
  it('finds heart rate a strap made up, not a missing one', () => {
    const heartrate = range(60, (i) =>
      i === 10 ? 240 : i === 20 ? 205 : i === 30 ? 0 : 150,
    );
    expect(findSpikes(heartrate, 'heartrate')).toEqual([10, 20]);
  });

  it('keeps a sprint, drops a lone impossible sample', () => {
    const watts = range(60, (i) =>
      i >= 20 && i < 28 ? 1100 : i === 40 ? 1900 : 200,
    );
    expect(findSpikes(watts, 'watts')).toEqual([40]);
    expect(findSpikes([200, 3000, 200], 'watts')).toEqual([1]);
  });
});

describe('applyCorrections', () => {
  it('replaces spikes along the line between their neighbours', () => {
    const stream = steady();
    stream.heartrate![100] = 250;
    stream.heartrate![101] = 248;
    const { stream: fixed } = applyCorrections(stream, [
      { type: 'despike', channel: 'heartrate' },
    ]);
    expect(fixed.heartrate![100]).toBe(150);
    expect(fixed.heartrate![101]).toBe(150);
    // The original is left as it was
    expect(stream.heartrate![100]).toBe(250);
  });

  it('crops every channel and starts again from zero', () => {
    const { stream, offsetSec } = applyCorrections(steady(), [
      { type: 'crop', from: 60, to: 360 },
    ]);
    expect(offsetSec).toBe(60);
    expect(stream.time![0]).toBe(0);
    expect(stream.time![stream.time!.length - 1]).toBe(300);
    expect(stream.distance![0]).toBe(0);
    expect(stream.latlng).toHaveLength(301);
    expect(stream.watts).toHaveLength(301);
  });

  it('adds up crops made one after the other', () => {
    const { stream, offsetSec } = applyCorrections(steady(), [
      { type: 'crop', from: 60, to: 360 },
      { type: 'crop', from: 30, to: 200 },
    ]);
    expect(offsetSec).toBe(90);
    expect(stream.time![stream.time!.length - 1]).toBe(170);
  });

  it('smooths altitude noise away', () => {
    const { stream } = applyCorrections(steady(), [{ type: 'smoothAltitude' }]);
    const before = summarizeStream(steady())!.elevationGainM!;
    const after = summarizeStream(stream)!.elevationGainM!;
    expect(before).toBeGreaterThan(400);
    expect(after).toBeLessThan(5);
  });
});

describe('summarizeStream', () => {
  it('recomputes totals and averages', () => {
    const summary = summarizeStream(steady())!;
    expect(summary).toMatchObject({
      elapsedSec: 600,
      movingTimeSec: 600,
      distanceM: 1800,
      averageSpeed: 3,
      averageHeartrate: 150,
      maxHeartrate: 150,
      averageWatts: 200,
      maxWatts: 200,
    });
    expect(summary.normalizedWatts).toBeCloseTo(200);
  });

  it('leaves stops out of the moving time', () => {
    const stream = steady();
    // Standing still for the last two minutes
    stream.distance = stream.distance!.map((d, i) => (i > 480 ? 1440 : d));
    expect(summarizeStream(stream)!.movingTimeSec).toBe(480);
  });
});

describe('correctedFigures', () => {
  it('names only the figures a correction changes', () => {
    expect([
      ...correctedFigures([{ type: 'despike', channel: 'heartrate' }]),
    ]).toEqual(['averageHeartrate', 'maxHeartrate']);
    expect(correctedFigures([{ type: 'crop', from: 0, to: 10 }]).size).toBe(12);
  });
});

describe('activityCorrectionSchema', () => {
  it('refuses a crop that ends before it starts, and unknown kinds', () => {
    expect(
      activityCorrectionSchema.safeParse({ type: 'crop', from: 50, to: 10 })
        .success,
    ).toBe(false);
    expect(activityCorrectionSchema.safeParse({ type: 'rotate' }).success).toBe(
      false,
    );
  });
});
