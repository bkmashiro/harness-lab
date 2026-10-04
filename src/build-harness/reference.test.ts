import { describe, expect, it } from 'vitest';
import {
  createChatProvider, createDemoProvider, createHarness, createMockFetch,
  createResponsesProvider, createWorkspaceTools, validateArguments,
} from '../../public/build-harness/reference/harness.mjs';
import type { Provider, ProviderInput } from '../../public/build-harness/reference/harness.mjs';

const seed = () => ({ '/src/sum.js': 'export function sum(a, b) { return a - b; }', '/README.md': '# demo' });
const make = (provider: Provider, options: { maxTurns?: number; onEvent?: (type: string, data: unknown) => void; signal?: AbortSignal } = {}) => {
  const files = seed();
  return { files, harness: createHarness({ provider, tools: createWorkspaceTools(files), ...options }) };
};

describe('zero-dependency reference harness', () => {
  it('repairs through read → write → genuine bounded test → final', async () => {
    const { files, harness } = make(createDemoProvider());
    const result = await harness.run('Fix sum');
    expect(result.status).toBe('completed');
    expect(files['/src/sum.js']).toContain('return a + b');
    expect(result.messages.filter(m => m.role === 'tool').map(m => m.name)).toEqual(['read_file', 'write_file', 'run_tests']);
    expect(result.messages.find((m): m is Extract<typeof m, { role: 'tool' }> => m.role === 'tool' && m.name === 'run_tests')!.content).toBe('All 3 tests passed.');
    expect(result.final).toMatch(/三个用例全部通过/);
    expect(result.messages.filter(m => m.role === 'tool').every(m => m.toolCallId)).toBe(true);
  });

  it.each(['chat', 'responses'] as const)('runs full repair against local %s mock adapter', async protocol => {
    const fetchImpl = createMockFetch(protocol);
    const provider = protocol === 'chat'
      ? createChatProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', apiKey: 'never-log-this', fetchImpl })
      : createResponsesProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', apiKey: 'never-log-this', fetchImpl });
    const events: Array<{ type: string; data: unknown }> = []; const { files, harness } = make(provider, { onEvent: (type: string, data: unknown) => events.push({ type, data }) });
    const result = await harness.run('repair');
    expect(result.status).toBe('completed');
    expect(files['/src/sum.js']).toContain('a + b');
    expect(result.messages.find((m): m is Extract<typeof m, { role: 'tool' }> => m.role === 'tool' && m.name === 'run_tests')!.content).toBe('All 3 tests passed.');
    expect(events.map(e => e.type)).toContain('run_end');
    expect(JSON.stringify(events)).not.toContain('never-log-this');
  });

  it('returns argument validation errors to the model without writing', async () => {
    const { files, harness } = make(createDemoProvider({ scenario: 'invalid-args' }));
    const result = await harness.run('repair');
    expect(result.status).toBe('completed');
    expect(files['/src/sum.js']).toContain('a - b');
    expect(result.messages.some(m => m.role === 'tool' && m.isError && /Invalid arguments/.test(m.content))).toBe(true);
    expect(result.final).toContain('Unable to continue');
  });

  it('returns unknown-tool errors with the original call ID', async () => {
    const { harness } = make(createDemoProvider({ scenario: 'unknown-tool' }));
    const result = await harness.run('repair');
    const assistant = result.messages.find((m): m is Extract<typeof m, { role: 'assistant' }> => m.role === 'assistant')!; const tool = result.messages.find((m): m is Extract<typeof m, { role: 'tool' }> => m.role === 'tool')!;
    expect(tool).toMatchObject({ toolCallId: assistant.toolCalls![0].id, name: 'delete_everything', isError: true });
  });

  it('stops endless tool calls at maxTurns', async () => {
    const { harness } = make(createDemoProvider({ scenario: 'endless' }), { maxTurns: 2 });
    const result = await harness.run('loop');
    expect(result).toMatchObject({ status: 'limit', turns: 2, final: '' });
  });

  it('honors an already-aborted signal without calling the provider', async () => {
    const controller = new AbortController(); controller.abort(); let invoked = false;
    const { harness } = make(async () => { invoked = true; return { role: 'assistant', content: 'x' }; }, { signal: controller.signal });
    expect((await harness.run('cancel')).status).toBe('cancelled'); expect(invoked).toBe(false);
  });

  it('does not invent a tool call when the provider receives no declared tools', async () => {
    let requests = 0;
    const provider: Provider = async (input: ProviderInput) => { requests++; expect(input.tools).toEqual([]); return createDemoProvider()(input); };
    const result = await createHarness({ provider, tools: [] }).run('hello');
    expect(requests).toBe(1);
    expect(result.status).toBe('completed');
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'No tools are available for this run.' });
  });

  it('ends on malformed provider response and HTTP failure', async () => {
    const malformed = make((async () => ({ role: 'user', content: 'oops' })) as unknown as Provider);
    expect((await malformed.harness.run('x')).status).toBe('error');
    for (const protocol of ['chat', 'responses'] as const) {
      const fetchImpl = createMockFetch(protocol, 'http401');
      const provider = protocol === 'chat'
        ? createChatProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl })
        : createResponsesProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl });
      const { harness } = make(provider);
      const result = await harness.run('x'); expect(result.status).toBe('error'); expect(result.final).toContain('HTTP 401');
    }
  });

  it('validates required types and min/max string lengths', () => {
    const schema = { type: 'object', required: ['path'], properties: { path: { type: 'string', minLength: 1, maxLength: 4 } } };
    expect(validateArguments(schema, { path: 'ok' })).toEqual({ path: 'ok' });
    expect(() => validateArguments(schema, { path: '' })).toThrow(/at least 1/);
    expect(() => validateArguments(schema, { path: '12345' })).toThrow(/at most 4/);
    expect(() => validateArguments(schema, {})).toThrow(/required/);
    const closed = { ...schema, additionalProperties: false };
    expect(() => validateArguments(closed, { path: 'ok', unexpected: true })).toThrow(/unexpected/);
    expect(() => validateArguments(closed, Object.assign(Object.create({ path: 'ok' }), {}))).toThrow(/required/);
  });

  it.each(['chat', 'responses'])('preserves genuine multi-turn request protocol for %s', async protocol => {
    const requests: any[] = []; let turn = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)); requests.push(body); turn++;
      const msgs = protocol === 'chat' ? body.messages : body.input;
      if (turn > 1) {
        const assistant = protocol === 'chat'
          ? msgs.find((m: any) => m.role === 'assistant' && m.tool_calls)
          : msgs.find((m: any) => m.type === 'function_call');
        const args = protocol === 'chat' ? JSON.parse(assistant.tool_calls[0].function.arguments) : JSON.parse(assistant.arguments);
        expect(args).toEqual({ path: '/src/sum.js' });
        expect(typeof args).toBe('object');
        if (protocol === 'responses') expect(msgs).toContainEqual(expect.objectContaining({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'thinking' }] }));
        const output = protocol === 'chat'
          ? msgs.find((m: any) => m.role === 'tool')
          : msgs.find((m: any) => m.type === 'function_call_output');
        expect(protocol === 'chat' ? output.tool_call_id : output.call_id).toBe(protocol === 'chat' ? assistant.tool_calls[0].id : assistant.call_id);
      }
      const next = turn === 1 ? { name: 'run_tests', args: { path: '/src/sum.js' }, id: 'independent-id' } : undefined;
      if (next) return new Response(JSON.stringify(protocol === 'chat'
        ? { choices: [{ message: { role: 'assistant', content: 'thinking', tool_calls: [{ id: next.id, type: 'function', function: { name: next.name, arguments: JSON.stringify(next.args) } }] } }] }
        : { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'thinking' }] }, { type: 'function_call', id: 'item-independent', call_id: next.id, name: next.name, arguments: JSON.stringify(next.args) }] }), { status: 200 });
      return new Response(JSON.stringify(protocol === 'chat'
        ? { choices: [{ message: { role: 'assistant', content: 'done' } }] }
        : { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] }] }), { status: 200 });
    };
    const provider = protocol === 'chat'
      ? createChatProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl })
      : createResponsesProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl });
    const harness = createHarness({ provider, tools: [{ name: 'run_tests', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, execute: async () => ({ content: 'actual tool result' }) }] });
    expect((await harness.run('go')).status).toBe('completed');
    expect(requests).toHaveLength(2);
  });

  it('does not execute partial tool calls on length/incomplete responses', async () => {
    let calls = 0;
    const chat = createChatProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { role: 'assistant', content: null, tool_calls: [{ id: 'partial', function: { name: 'x', arguments: '{' } }] } }] })) });
    const h = createHarness({ provider: chat, tools: [{ name: 'x', execute: async () => { calls++; return { content: 'bad' }; } }] });
    expect((await h.run('x')).status).toBe('error'); expect(calls).toBe(0);
    const responses = createResponsesProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl: async () => new Response(JSON.stringify({ status: 'incomplete', output: [{ type: 'function_call', call_id: 'partial', name: 'x', arguments: '{}' }] })) });
    expect((await createHarness({ provider: responses, tools: [{ name: 'x', execute: async () => { calls++; return { content: 'bad' }; } }] }).run('x')).status).toBe('error');
    expect(calls).toBe(0);
  });

  it('rejects malformed and truncated provider payloads', async () => {
    for (const text of ['{']) {
      const provider = createChatProvider({ baseUrl: 'https://mock.example/v1', model: 'mock-model', fetchImpl: async () => new Response(text) });
      expect((await createHarness({ provider }).run('x')).status).toBe('error');
    }
  });

  it('only reports mock success after a successful run_tests result', async () => {
    const mock = createMockFetch('chat', 'repair');
    const response = await mock('https://mock.example/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'mock-model', stream: false, tools: [{ type: 'function', function: { name: 'run_tests', parameters: { type: 'object' } } }], messages: [
      { role: 'assistant', content: null, tool_calls: [{ id: 'test-call', type: 'function', function: { name: 'run_tests', arguments: '{"path":"/src/sum.js"}' } }] },
      { role: 'tool', tool_call_id: 'test-call', name: 'run_tests', content: 'Tests failed: expected 5, got -1', isError: true },
    ] }) });
    const result = await response.json();
    expect(JSON.stringify(result)).toContain('没有成功结果');
    expect(JSON.stringify(result)).not.toMatch(/PASS|全部通过/);
  });

  it('mock fetch accepts standard fetch(url, init) and legacy init-only invocation without accepting malformed bodies', async () => {
    const mock = createMockFetch('chat');
    const body = JSON.stringify({ model: 'mock-model', stream: false, tools: [], messages: [{ role: 'user', content: 'x' }] });
    expect((await mock({ method: 'POST', body } as any)).status).toBe(200);
    expect((await mock('https://mock.example/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'wrong', stream: false, tools: [], messages: [] }) })).status).toBe(400);
  });

  it('does not report false PASS for the original subtraction implementation', async () => {
    const files = seed(); const tools = createWorkspaceTools(files);
    const outcome: any = await tools.find(t => t.name === 'run_tests')!.execute({ path: '/src/sum.js', content: '' });
    expect(outcome.isError).toBe(true);
    expect(outcome.details.results).toHaveLength(3);
    expect(outcome.details.results.every((r: { pass: boolean }) => r.pass)).toBe(false);
  });

  it('rejects arbitrary surrounding programs in the bounded arithmetic parser', async () => {
    const tool = createWorkspaceTools({ '/src/sum.js': 'const surprise = 1; export function sum(a,b){ return a+b; }' }).find(t => t.name === 'run_tests')!;
    const outcome = await tool.execute({ path: '/src/sum.js' });
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toMatch(/supported sum implementation/);
  });

  it('rejects unsafe/malformed bases before fetch can receive an API key', () => {
    expect(() => createChatProvider({ baseUrl: 'http://remote.example/v1', model: 'x', apiKey: 'secret' })).toThrow(/HTTPS/);
    expect(() => createChatProvider({ baseUrl: 'https://user:pass@example.test/v1', model: 'x', apiKey: 'secret' })).toThrow(/userinfo/);
    expect(() => createResponsesProvider({ baseUrl: 'https://example.test/v1/responses?key=secret', model: 'x', apiKey: 'secret' })).toThrow(/query/);
    expect(() => createChatProvider({ baseUrl: 'https://example.test/v1/chat/completions', model: 'x', apiKey: 'secret' })).toThrow(/API root/);
  });
});
