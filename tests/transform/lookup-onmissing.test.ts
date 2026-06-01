import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

function hdr(onMissing?: string): string {
  return `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
${onMissing ? `target.onMissing = "${onMissing}"\n` : ''}
{$table.STATUS[code, name]}
"A", "Active"
"P", "Pending"

{result}
`;
}

function run(transformText: string, input: unknown) {
  return executeTransform(parseTransform(transformText), input);
}

describe('lookup miss honoring onMissing policy', () => {
  it('returns the matched value on a hit', () => {
    const r = run(hdr() + 'name = %lookup STATUS.name @.code', { code: 'A' });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('returns null silently on a miss when onMissing is unset (default)', () => {
    const r = run(hdr() + 'name = %lookup STATUS.name @.code', { code: 'Z' });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('raises T004 on a key miss when onMissing is fail', () => {
    const r = run(hdr('fail') + 'name = %lookup STATUS.name @.code', { code: 'Z' });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T004')).toBe(true);
  });

  it('raises a T004 warning on a key miss when onMissing is warn', () => {
    const r = run(hdr('warn') + 'name = %lookup STATUS.name @.code', { code: 'Z' });
    expect(r.success).toBe(true);
    expect(r.warnings.some((w) => w.code === 'T004')).toBe(true);
  });

  it('stays silent on a miss when onMissing is skip', () => {
    const r = run(hdr('skip') + 'name = %lookup STATUS.name @.code', { code: 'Z' });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('raises T003 when the lookup table is absent and onMissing is fail', () => {
    const r = run(hdr('fail') + 'name = %lookup NOPE.name @.code', { code: 'A' });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T003')).toBe(true);
  });

  it('stays silent when the lookup table is absent and onMissing is unset', () => {
    const r = run(hdr() + 'name = %lookup NOPE.name @.code', { code: 'A' });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('raises T004 when the return column is absent and onMissing is fail', () => {
    const r = run(hdr('fail') + 'name = %lookup STATUS.nope @.code', { code: 'A' });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T004')).toBe(true);
  });

  it('does not raise for lookupDefault misses even with onMissing fail', () => {
    const r = run(hdr('fail') + 'name = %lookupDefault STATUS.name @.code "Unknown"', { code: 'Z' });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('does not raise when a :default modifier rescues a lookup miss', () => {
    const r = run(hdr('fail') + 'name = %lookup STATUS.name @.code :default "Unknown"', { code: 'Z' });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});
