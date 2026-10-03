self.onmessage = ({ data }: MessageEvent<{ source: string }>) => {
  const body = /export\s+function\s+sum\s*\(\s*a\s*,\s*b\s*\)\s*\{([\s\S]*?)\}/.exec(data.source)?.[1];
  const match = body && /return\s+([ab])\s*([+*/-])\s*([ab])\s*;?\s*$/.exec(body.trim());
  if (!match || body?.trim() !== match[0]) {
    self.postMessage({ ok: false, message: 'Test failed: expected a bounded exported sum(a, b) implementation.', results: [] });
    return;
  }
  const apply = (a: number, b: number) => {
    const left = match[1] === 'a' ? a : b;
    const right = match[3] === 'a' ? a : b;
    switch (match[2]) { case '+': return left + right; case '-': return left - right; case '*': return left * right; case '/': return left / right; }
  };
  const cases: [number, number, number][] = [[2, 3, 5], [-4, 9, 5], [0, 0, 0]];
  const results = cases.map(([a, b, expected]) => {
    const actual = apply(a, b);
    return { input: [a, b] as [number, number], expected, actual, pass: Object.is(actual, expected) };
  });
  const ok = results.every((result) => result.pass);
  self.postMessage({ ok, message: ok ? `All ${results.length} sum tests passed.` : 'Test failed: sum returned an unexpected result.', results });
};
export {};
