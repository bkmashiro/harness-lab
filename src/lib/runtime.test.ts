import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT, INITIAL_FILES, defaultSettings } from './contracts';
import { runInProcess, runTeachingTest } from './runtime';

describe('Pi runtime teaching repair flow', () => {
  it('runs the real agent loop through read, repair, and test tools', async () => {
    const result = await runInProcess({
      settings: { ...defaultSettings, mode: 'demo', scenario: 'repair' },
      prompt: DEFAULT_PROMPT,
      files: INITIAL_FILES,
    });

    expect(result.status).toBe('completed');
    expect(result.files['/src/sum.js']).toMatch(/return a\s*\+\s*b/);
    expect(result.events.some((event) => event.lane === 'tools' && /read_file/.test(event.title))).toBe(true);
    expect(result.events.some((event) => event.lane === 'tools' && /write_file/.test(event.title))).toBe(true);
    expect(result.events.some((event) => event.lane === 'tools' && /run_tests/.test(event.title))).toBe(true);
    expect(result.events.some((event) => event.lane === 'harness' && /pass/i.test(event.title))).toBe(true);
  });

  it('failed-test scenario produces a real failing test outcome rather than only failure prose', async () => {
    const result = await runInProcess({settings:{...defaultSettings,delayMs:0,scenario:'failed-test'},prompt:DEFAULT_PROMPT,files:INITIAL_FILES});
    const testEvent = result.events.find(e=>e.kind==='test');
    expect(testEvent).toBeDefined();
    expect((testEvent!.data as {ok:boolean}).ok).toBe(false);
    expect(result.messages.some(m=>JSON.stringify(m).includes('测试未通过'))).toBe(true);
  });

  it('assigns increasing event identity and captures full immutable file snapshots', async () => {
    const seen: unknown[] = [];
    const result = await runInProcess({
      settings: { ...defaultSettings, mode: 'demo', scenario: 'repair' },
      prompt: DEFAULT_PROMPT,
      files: INITIAL_FILES,
      onEvent: (event) => seen.push(event),
    });

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.map((event) => event.seq)).toEqual(result.events.map((_, index) => index + 1));
    expect(new Set(result.events.map((event) => event.id)).size).toBe(result.events.length);
    expect(seen).toHaveLength(result.events.length);
    expect(result.events.every((event) => event.files['/README.md'] === INITIAL_FILES['/README.md'])).toBe(true);
    expect(result.events.some((event) => event.files['/src/sum.js'] === INITIAL_FILES['/src/sum.js'])).toBe(true);
    expect(result.events.at(-1)?.files['/src/sum.js']).toBe(result.files['/src/sum.js']);
  });

  it('runs only the bounded arithmetic subset and rejects arbitrary source without evaluating it', async () => {
    const passing = await runTeachingTest('export function sum(a, b) { return a + b; }');
    expect(passing.ok).toBe(true);
    expect(passing.results).toHaveLength(3);
    const rejected = await runTeachingTest('export function sum(a, b) { globalThis.pwned = true; return a + b; }');
    expect(rejected.ok).toBe(false);
    expect((globalThis as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it('excludes the configured credential from event snapshots and returned messages',async()=>{
    const key='unit-key-sensitive-7319';
    const result=await runInProcess({settings:{...defaultSettings,apiKey:key,delayMs:0},prompt:DEFAULT_PROMPT+' '+key,files:{...INITIAL_FILES,'/README.md':key}});
    expect(JSON.stringify(result.events)).not.toContain(key);
    expect(JSON.stringify(result.messages)).not.toContain(key);
  });

  it('does not execute malformed model tool arguments', async () => {
    const result = await runInProcess({
      settings: { ...defaultSettings, mode: 'demo', scenario: 'invalid-args' },
      prompt: DEFAULT_PROMPT,
      files: INITIAL_FILES,
    });

    expect(result.status).toBe('completed');
    expect(result.files['/src/sum.js']).toBe(INITIAL_FILES['/src/sum.js']);
    expect(result.events.some((event) => event.lane === 'tools' && /validation|invalid/i.test(event.title))).toBe(true);
  });
});
