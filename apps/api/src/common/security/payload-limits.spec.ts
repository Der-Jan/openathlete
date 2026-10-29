import type { Request, Response } from 'express';

import { exceedsArrayLimit, rejectOversizedArrays } from './payload-limits';

describe('exceedsArrayLimit', () => {
  it('accepts arrays up to the limit', () => {
    expect(exceedsArrayLimit({ steps: [1, 2, 3] }, 3)).toBe(false);
  });

  it('finds an oversized array at any depth', () => {
    expect(exceedsArrayLimit({ a: { b: [{ c: [1, 2, 3, 4] }] } }, 3)).toBe(
      true,
    );
  });

  it('walks a deeply nested body without overflowing the stack', () => {
    let body: unknown = [];
    for (let i = 0; i < 200_000; i++) body = [body];
    expect(exceedsArrayLimit(body)).toBe(false);
  });

  it('ignores bodies that are not objects', () => {
    expect(exceedsArrayLimit(undefined)).toBe(false);
    expect(exceedsArrayLimit('text')).toBe(false);
  });
});

describe('rejectOversizedArrays', () => {
  function run(path: string, body: unknown) {
    const next = jest.fn();
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) };
    rejectOversizedArrays(
      { path, body } as Request,
      res as unknown as Response,
      next,
    );
    return { next, status: res.status };
  }

  const huge = { items: new Array(10_001).fill(0) };

  it('answers 413 before the body reaches validation', () => {
    const { next, status } = run('/calendar/events', huge);
    expect(status).toHaveBeenCalledWith(413);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets Garmin notifications through, which skip Zod', () => {
    expect(
      run('/provider/garmin/webhook/health-ping', huge).next,
    ).toHaveBeenCalled();
  });
});
