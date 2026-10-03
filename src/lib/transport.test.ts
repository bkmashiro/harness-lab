import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROMPT, INITIAL_FILES, defaultSettings } from './contracts';
import { runInProcess } from './runtime';
import { createTransport, resolveEndpoint, sanitize } from './transport';

const emit = vi.fn();
const request = (url: string, body: unknown, protocol: 'chat'|'responses'='chat', signal?: AbortSignal) =>
  new Request(url, { method: 'POST', headers: { authorization: 'Bearer sk-test-secret', 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
const settings = (protocol: 'chat'|'responses'='chat', scenario: 'repair'|'invalid-args'|'provider-error'|'failed-test'='repair') => ({ ...defaultSettings, mode: 'demo' as const, protocol, scenario, baseUrl: 'https://unit.test/api', apiKey: 'sk-test-secret', model: 'test-model', delayMs: 0 });
const readBody = { messages: [{ role:'user', content:'请读取 /src/sum.js，修复 sum 并运行测试' }], tools: [{ type:'function', function:{ name:'read_file', parameters:{type:'object',properties:{path:{type:'string'}}}}}] };
const toolContext = (name:string, args:unknown, result:string) => ({ messages:[{role:'user',content:'修复 /src/sum.js'} ,{role:'assistant', tool_calls:[{id:'c1',type:'function',function:{name,arguments:JSON.stringify(args)}}]},{role:'tool',tool_call_id:'c1',name,content:result}], tools:[{type:'function',function:{name:'write_file',parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'}}}}}] });
async function consume(response: Response) { return await response.text(); }
function chatArguments(raw:string) {
  return raw.split(/\r?\n\r?\n/).flatMap(frame=>{
    const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');
    if (!data.startsWith('{')) return [];
    const parsed=JSON.parse(data);
    return parsed.choices?.flatMap((choice:any)=>choice.delta?.tool_calls?.map((call:any)=>call.function?.arguments ?? '') ?? []) ?? [];
  }).join('');
}

describe('transport URL and redaction', () => {
  it('joins exact API paths without injecting v1 and rejects unsafe URLs', () => {
    expect(resolveEndpoint('https://host.test/custom/', 'chat')).toBe('https://host.test/custom/chat/completions');
    expect(resolveEndpoint('https://host.test/v1', 'responses')).toBe('https://host.test/v1/responses');
    for (const value of ['https://user:pass@host.test/v1','https://host.test/v1?api_key=secret','http://host.test/v1']) expect(() => resolveEndpoint(value,'chat')).toThrow();
    expect(resolveEndpoint('http://localhost:8080/api','chat')).toBe('http://localhost:8080/api/chat/completions');
  });
  it('redacts credentials recursively and in arbitrary provider echoes', () => {
    const clean = JSON.stringify(sanitize({ authorization:'Bearer sk-secret-123', apiKey:'sk-secret-123', text:'provider echoed sk-secret-123' }));
    expect(clean).not.toContain('sk-secret-123');
    expect(clean).toContain('[REDACTED]');
  });
});

describe.each(['chat','responses'] as const)('%s fixture protocol', protocol => {
  it('returns parser-compatible streamed tool calls with fragmented args, then text after tool results', async () => {
    const fetcher = createTransport(settings(protocol), emit);
    const first = await fetcher(request('https://ignored.test', readBody));
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toContain('text/event-stream');
    const firstText = await consume(first);
    expect(firstText).toContain(protocol === 'chat' ? '"tool_calls"' : 'response.output_item.added');
    expect(firstText).toContain('read_file');
    const second = await fetcher(request('https://ignored.test', toolContext('read_file',{path:'/src/sum.js'},'export function sum(a,b){ return a-b; }')));
    const secondText = await consume(second);
    expect(secondText).toContain('write_file');
    const third = await fetcher(request('https://ignored.test', toolContext('write_file',{path:'/src/sum.js',content:'export function sum(a,b){ return a+b; }'},'Wrote /src/sum.js')));
    expect(await consume(third)).toContain('run_tests');
    const fourth = await fetcher(request('https://ignored.test', toolContext('run_tests',{},'Tests passed')));
    expect(await consume(fourth)).toContain(protocol === 'chat' ? '"content"' : 'response.output_text.delta');
  });
  it('emits request/response observations without leaking auth and rejects unmatched fixtures explicitly', async () => {
    const spy = vi.fn();
    const fetcher = createTransport(settings(protocol), spy);
    const response = await fetcher(request('https://ignored.test', readBody));
    await consume(response);
    const log = JSON.stringify(spy.mock.calls);
    expect(log).toContain('/api/');
    expect(log).not.toContain('sk-test-secret');
    const mismatch = await fetcher(request('https://ignored.test', {messages:[{role:'user',content:'do unrelated task'}]}));
    expect(mismatch.status).toBe(422);
    expect(await mismatch.text()).toContain('fixture mismatch');
  });
  it('supports invalid arguments and returns a fixture provider error with API-shaped JSON', async () => {
    const invalid = await createTransport(settings('chat','invalid-args'),emit)(request('https://ignored.test',readBody));
    const raw = await consume(invalid);
    expect(chatArguments(raw)).toBe('{}');
    const providerError = await createTransport(settings('responses','provider-error'),emit)(request('https://ignored.test',readBody));
    expect(providerError.status).toBe(429);
    expect(await providerError.json()).toMatchObject({error:{type:'fixture_error',code:'fixture_provider_error'}});
  });
  it('reports failed test results in the final assistant text', async () => {
    const fetcher=createTransport(settings('responses','failed-test'),emit);
    const final=await fetcher(request('https://ignored.test',toolContext('run_tests',{},'failed: expected 3 got -1')));
    expect(await consume(final)).toContain('测试未通过');
  });
  it('stops a delayed simulated stream when aborted', async () => {
    const controller=new AbortController();
    const fetcher=createTransport({...settings(),delayMs:25},emit,controller.signal);
    const response=await fetcher(request('https://ignored.test',readBody));
    const reader=response.body!.getReader();
    await reader.read(); controller.abort();
    let tail=await reader.read();
    while(!tail.done) tail=await reader.read();
    expect(tail.done).toBe(true);
  });
});

describe('real Pi provider adapter integration', () => {
  it('consumes Responses SSE through the installed Pi parser and completes repair', async () => {
    const result=await runInProcess({settings:{...defaultSettings,mode:'demo',protocol:'responses',scenario:'repair',delayMs:0},prompt:DEFAULT_PROMPT,files:INITIAL_FILES});
    expect(result.status).toBe('completed');
    expect(result.files['/src/sum.js']).toMatch(/return a\s*\+\s*b/);
    expect(result.events.some(event=>event.lane==='tools'&&/run_tests/.test(event.title))).toBe(true);
  });
});

describe('live transport', () => {
  it('passes requests to native fetch with redirect:error and captures metadata; cancels stream cleanly', async () => {
    const native = vi.fn(async (_input: RequestInfo|URL, init?: RequestInit) => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: ok\n\n')); c.close(); } }), {status:201,headers:{'content-type':'text/event-stream','x-request-id':'req-1'}}));
    vi.stubGlobal('fetch', native);
    const spy = vi.fn();
    const fetcher = createTransport({...settings(),mode:'live',baseUrl:'https://provider.test/v1'},spy);
    const res = await fetcher(request('https://provider.test/v1/chat/completions',readBody));
    expect(native).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({redirect:'error'}));
    expect(res.status).toBe(201);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(JSON.stringify(spy.mock.calls)).toContain('req-1');
    expect(JSON.stringify(spy.mock.calls)).toContain('data: ok');
  });
  it('does not leak a configured key split across network chunks', async () => {
    const key='unit-key-sensitive-7319';const spy=vi.fn();
    vi.stubGlobal('fetch',async()=>new Response(new ReadableStream({start(c){const encode=new TextEncoder();c.enqueue(encode.encode('data: '+key.slice(0,8)));c.enqueue(encode.encode(key.slice(8)+'\\n\\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}}));
    try {
      const res=await createTransport({...settings(),mode:'live',apiKey:key,baseUrl:'https://provider.test/v1'},spy)(request('https://provider.test/v1/chat/completions',readBody));
      await res.text();const observed=spy.mock.calls.filter(c=>c[1]==='sse-frame').map(c=>c[3]).join('');
      expect(observed).not.toContain(key);expect(observed).toContain('[REDACTED]');
    } finally {vi.unstubAllGlobals();}
  });
  it('blocks live requests that could send credentials to a different URL', async () => {
    const native=vi.fn(async()=>new Response('ok'));
    vi.stubGlobal('fetch',native);
    const fetcher=createTransport({...settings(),mode:'live',baseUrl:'https://provider.test/v1'},vi.fn());
    await expect(fetcher(request('https://attacker.test/v1/chat/completions',readBody))).rejects.toThrow('does not match');
    expect(native).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('returns network errors truthfully and records fragmented raw frames', async () => {
    const spy = vi.fn();
    const native = vi.fn(async () => new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: one'));c.enqueue(new TextEncoder().encode('\n\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}}));
    vi.stubGlobal('fetch', native);
    const fetcher = createTransport({...settings(),mode:'live',baseUrl:'https://provider.test/v1'},spy);
    const response = await fetcher(request('https://provider.test/v1/chat/completions',readBody));
    await consume(response);
    expect(JSON.stringify(spy.mock.calls)).toContain('data: one');
    vi.stubGlobal('fetch', async()=>{throw new TypeError('Failed to fetch');});
    const offline = createTransport({...settings(),mode:'live',baseUrl:'https://provider.test/v1'},spy);
    await expect(offline(request('https://provider.test/v1/chat/completions',readBody))).rejects.toThrow('Failed to fetch');
    vi.unstubAllGlobals();
  });
});
