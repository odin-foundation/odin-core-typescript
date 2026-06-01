/**
 * Transform engine enforcement gaps: stable error codes (T001, T003, T005,
 * T006, T008, T009), onMissing policy for source fields, and @import resolution.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../src/index.js';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

function header(
  format: string,
  target: Record<string, string> = {},
  meta: Record<string, string> = {}
): string {
  const m = [
    'odin = "1.0.0"',
    'transform = "1.0.0"',
    `direction = "odin->${format}"`,
    ...Object.entries(meta).map(([k, v]) => `${k} = ${v}`),
  ];
  const t = [
    `format = "${format}"`,
    ...Object.entries(target).map(([k, v]) => `${k} = "${v}"`),
  ];
  return `{$}\n${m.join('\n')}\n\n{$source}\nformat = "odin"\n\n{$target}\n${t.join('\n')}\n\n`;
}

function run(
  transform: string,
  input: string,
  opts: { format?: string; target?: Record<string, string> } = {}
) {
  const text = header(opts.format ?? 'odin', opts.target ?? {}) + transform;
  const source = Odin.parse(input).toJSON();
  return executeTransform(parseTransform(text), source);
}

describe('T001 — unknown verb', () => {
  it('emits T001 for an unknown built-in verb', () => {
    const r = run('{out}\nx = %notAVerb @.a', 'a = ##1');
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T001');
    expect(r.errors[0]?.field).toBe('x');
  });

  it('does not raise for an unregistered custom %& verb (extension point)', () => {
    const r = run('{out}\nx = %&my.thing @.a', 'a = "v"');
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('demotes T001 to a warning under onError = warn', () => {
    const r = run('{out}\nx = %notAVerb @.a', 'a = ##1', { target: { onError: 'warn' } });
    expect(r.success).toBe(true);
    expect(r.warnings.some((w) => w.code === 'T001')).toBe(true);
  });
});

describe('T003 — lookup table not found', () => {
  it('emits T003 (not T004) when the table is undeclared and onMissing = fail', () => {
    const r = run('{out}\nx = %lookup "GHOST.code" @.k', 'k = "active"', {
      target: { onMissing: 'fail' },
    });
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T003');
  });

  it('stays silent for an undeclared table under the default policy', () => {
    const r = run('{out}\nx = %lookup "GHOST.code" @.k', 'k = "active"');
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('demotes T003 to a warning under onMissing = warn', () => {
    const r = run('{out}\nx = %lookup "GHOST.code" @.k', 'k = "active"', {
      target: { onMissing: 'warn' },
    });
    expect(r.success).toBe(true);
    expect(r.warnings.some((w) => w.code === 'T003')).toBe(true);
  });

  it('still emits T004 for a missing key in a declared table', () => {
    const transform =
      '{$table.T[name, code]}\n"foo", ##1\n\n{out}\nx = %lookup "T.code" @.k';
    const r = run(transform, 'k = "bar"', { target: { onMissing: 'fail' } });
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T004');
  });
});

describe('T005 — source path not found / onMissing', () => {
  it('emits T005 when a :required source path is absent', () => {
    const r = run('{out}\nx = @.does.not.exist :required', 'a = ##1');
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T005');
  });

  it('emits T005 for an absent path under onMissing = fail without :required', () => {
    const r = run('{out}\nx = @.does.not.exist', 'a = ##1', {
      target: { onMissing: 'fail' },
    });
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T005');
  });

  it('warns for an absent path under onMissing = warn', () => {
    const r = run('{out}\nx = @.does.not.exist', 'a = ##1', {
      target: { onMissing: 'warn' },
    });
    expect(r.success).toBe(true);
    expect(r.warnings.some((w) => w.code === 'T005')).toBe(true);
  });

  it('stays silent for an absent path under the default (skip) policy', () => {
    const r = run('{out}\nx = @.does.not.exist', 'a = ##1');
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('treats a present-but-null required field as SOURCE_MISSING, not T005', () => {
    const r = run('{out}\nx = @.a :required', 'a = ~');
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('SOURCE_MISSING');
  });

  it('does not raise T005 when a verb result is null', () => {
    const r = run('{out}\nx = %upper @.missing', 'a = ##1', {
      target: { onMissing: 'fail' },
    });
    expect(r.errors.some((e) => e.code === 'T005')).toBe(false);
  });
});

describe('T006 — invalid output format', () => {
  it('emits T006 for an unregistered target format', () => {
    const r = run('{out}\nx = @.a', 'a = ##1', { format: 'notaformat' });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T006')).toBe(true);
  });

  it('still produces output for each known format', () => {
    for (const fmt of ['odin', 'json', 'xml', 'csv']) {
      const r = run('{out}\nx = @.a', 'a = ##1', { format: fmt });
      expect(r.errors.some((e) => e.code === 'T006'), `format ${fmt}`).toBe(false);
      expect(r.formatted.length).toBeGreaterThan(0);
    }
  });
});

describe('T009 — loop source not array', () => {
  it('emits T009 for a present non-array scalar', () => {
    const r = run('{out[]}\n:loop notArr\nx = @.a', 'notArr = "scalar"');
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T009');
  });

  it('yields zero rows with no error for an absent loop source', () => {
    const r = run('{out[]}\n:loop missing\nx = @.a', 'a = ##1');
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('demotes T009 to a warning under onError = warn', () => {
    const r = run('{out[]}\n:loop notArr\nx = @.a', 'notArr = "scalar"', {
      target: { onError: 'warn' },
    });
    expect(r.success).toBe(true);
    expect(r.warnings.some((w) => w.code === 'T009')).toBe(true);
  });
});

describe('T008 — accumulator overflow', () => {
  it('emits T008 when an integer accumulator exceeds safe capacity', () => {
    const transform =
      '{$accumulator}\ntotal = ##0\n\n{out}\nx = %accumulate "total" @.a';
    const r = run(transform, 'a = ##99999999999999999999');
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T008');
  });

  it('does not raise for ordinary accumulation', () => {
    const transform =
      '{$accumulator}\ntotal = ##0\n\n{out}\nx = %accumulate "total" @.a';
    const r = run(transform, 'a = ##5');
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('@import resolution', () => {
  const tablesDoc = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->odin"

{$source}
format = "odin"

{$target}
format = "odin"

{$table.STATES[code, name]}
"CA", "California"
"TX", "Texas"
`;

  const sharedDoc = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->odin"

{$source}
format = "odin"

{$target}
format = "odin"

{shared}
greeting = "hello"
`;

  const main = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->odin"

@import ./tables/states.odin
@import ./mappings/shared.odin

{$source}
format = "odin"

{$target}
format = "odin"
onMissing = "fail"

{out}
state = %lookup "STATES.name" @.code
`;

  const resolver = (p: string): string | undefined => {
    if (p.includes('states')) return tablesDoc;
    if (p.includes('shared')) return sharedDoc;
    return undefined;
  };

  it('makes an imported $table usable by %lookup', () => {
    const src = Odin.parse('code = "CA"').toJSON();
    const r = executeTransform(parseTransform(main), src, { importResolver: resolver });
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.formatted).toContain('California');
  });

  it('merges an imported mapping segment into the output', () => {
    const src = Odin.parse('code = "TX"').toJSON();
    const r = executeTransform(parseTransform(main), src, { importResolver: resolver });
    expect(r.formatted).toContain('greeting');
    expect(r.formatted).toContain('hello');
  });

  it('leaves the imported table unresolved without a resolver (T003)', () => {
    const src = Odin.parse('code = "CA"').toJSON();
    const r = executeTransform(parseTransform(main), src);
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T003');
  });

  it('local declarations take precedence over imported ones', () => {
    const localTable = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->odin"

@import ./tables/states.odin

{$source}
format = "odin"

{$target}
format = "odin"

{$table.STATES[code, name]}
"CA", "Local-California"

{out}
state = %lookup "STATES.name" @.code
`;
    const src = Odin.parse('code = "CA"').toJSON();
    const r = executeTransform(parseTransform(localTable), src, {
      importResolver: resolver,
    });
    expect(r.formatted).toContain('Local-California');
  });

  it('ignores an import the resolver cannot satisfy', () => {
    const t = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->odin"

@import ./missing/nowhere.odin

{$source}
format = "odin"

{$target}
format = "odin"

{out}
x = @.a
`;
    const src = Odin.parse('a = ##1').toJSON();
    const r = executeTransform(parseTransform(t), src, { importResolver: resolver });
    expect(r.success).toBe(true);
  });
});
