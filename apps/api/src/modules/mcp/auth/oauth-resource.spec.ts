import { withoutTrailingSlashes } from './oauth.service';

describe('resource comparison', () => {
  it('ignores trailing slashes only', () => {
    expect(withoutTrailingSlashes('https://api.example.org/mcp/')).toBe(
      'https://api.example.org/mcp',
    );
    expect(withoutTrailingSlashes('https://api.example.org/mcp///')).toBe(
      'https://api.example.org/mcp',
    );
    expect(withoutTrailingSlashes('https://api.example.org/mcp')).toBe(
      'https://api.example.org/mcp',
    );
    expect(withoutTrailingSlashes('///')).toBe('');
  });

  it('stays fast on a hostile resource', () => {
    const hostile = '/'.repeat(200_000) + 'x';
    const started = performance.now();
    expect(withoutTrailingSlashes(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
