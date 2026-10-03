import type { Emit, Protocol, Settings } from './contracts';

const SECRET = /(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[^\s"']+|(?:api[_-]?key|authorization|token|password|secret)(["']?\s*[:=]\s*["']?)[^\s,"'}]+)/gi;
const REDACTED = '[REDACTED]';

export function sanitize(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET, () => REDACTED);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)$/i.test(key) ? REDACTED : sanitize(item);
    return out;
  }
  return value;
}

export function resolveEndpoint(baseUrl: string, protocol: Protocol): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new TypeError('Invalid base URL'); }
  if (url.username || url.password) throw new TypeError('URL userinfo is not allowed');
  if (url.search || url.hash) throw new TypeError('URL query strings and fragments are not allowed');
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new TypeError('Only HTTPS or localhost HTTP URLs are allowed');
  const suffix = protocol === 'chat' ? '/chat/completions' : '/responses';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${suffix}`;
  return url.toString();
}

function textOf(message: any): string {
  const content = Array.isArray(message?.content) ? message.content.map((part:any) => part?.text ?? '').join(' ') : message?.content;
  const parts = [content, message?.text, message?.arguments, message?.function_call?.arguments];
  const calls = message?.tool_calls ?? [];
  for (const call of calls) parts.push(call?.function?.arguments, call?.function?.name);
  if (message?.type === 'function_call') parts.push(message.name, message.arguments);
  return parts.filter((x) => typeof x === 'string').join(' ');
}
function getMessages(body: any): any[] { return Array.isArray(body?.messages) ? body.messages : Array.isArray(body?.input) ? body.input : [{ role: 'user', content: body?.input ?? '' }]; }
function getToolResults(messages: any[]) {
  return messages.filter((m) => ['tool', 'function'].includes(m?.role) || m?.type === 'function_call_output').map((m) => ({
    name: m.name ?? m.function_name ?? messages.find((x) => x.call_id === (m.tool_call_id ?? m.call_id) && x.type === 'function_call')?.name ?? messages.find((x) => (x.tool_calls ?? []).some((c: any) => c.id === m.tool_call_id))?.tool_calls?.[0]?.function?.name,
    text: typeof m.content === 'string' ? m.content : typeof m.output === 'string' ? m.output : JSON.stringify(m.content ?? m.output ?? ''),
  }));
}
function fixture(body: any, scenario: Settings['scenario'], readPath = '/src/sum.js') {
  const messages = getMessages(body);
  const userText = messages.filter((m) => m?.role === 'user').map(textOf).join(' ');
  const all = userText;
  const latest = [...messages].reverse().find((m) => m.role === 'user');
  const repairTask = /sum|src.sum.js/i.test(userText) && /(sum|repair|fix|修复|修正|读取|read)/i.test(userText);
  const results = getToolResults(messages);
  const called = (tool: string) => messages.some((m) => (m?.tool_calls ?? []).some((c: any) => c?.function?.name === tool) || (m?.type === 'function_call' && m?.name === tool));
  let call: {name:string;args:unknown}|undefined;
  let prose: string|undefined;
  if (scenario === 'provider-error') return { error: 'Simulated provider error', code: 'fixture_provider_error' };
  if (scenario === 'read-once') {
    const read = results.find(r=>r.name==='read_file');
    if(read)return {prose:`read_file 返回：${read.text}`};
    if(called('read_file'))return {mismatch:true as const};
    return {call:{name:'read_file',args:{path:readPath}}};
  }
  if (repairTask) {
    if (scenario === 'invalid-args' && (called('read_file') || results.some((r) => r.name === 'read_file' && /invalid|validation|error/i.test(r.text)))) {
      prose = '提供的 read_file 参数无效，未执行工具。';
    } else if (results.some((r) => r.name === 'run_tests') || called('run_tests')) {
      const testOutput = results.find((r) => r.name === 'run_tests')?.text ?? '';
      prose = scenario === 'failed-test' || /fail|error|not ok/i.test(testOutput) ? '修复已写入，但测试未通过；请检查测试输出后再继续。' : '已修复 /src/sum.js：sum(a, b) 现在返回 a + b。内置测试通过。';
    } else if (results.some((r) => r.name === 'write_file') || called('write_file')) call = {name:'run_tests',args:{}};
    else if (results.some((r) => r.name === 'read_file') || called('read_file')) call = { name:'write_file', args:{path:'/src/sum.js',content:scenario === 'failed-test' ? 'export function sum(a, b) {\n  return a * b;\n}\n' : 'export function sum(a, b) {\n  return a + b;\n}\n'} };
    else call = { name:'read_file', args: scenario === 'invalid-args' ? {} : {path:'/src/sum.js'} };
  } else if (/read_file|\/src\//i.test(latest ? textOf(latest) : '') && /\/src\/sum\.js/i.test(all)) {
    call = {name:'read_file',args:{path:'/src/sum.js'}};
  }
  if (!call && !prose) return { mismatch: true as const };
  return {call, prose};
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8', ...Object.fromEntries(new Headers(headers))}});
}
function sseResponse(frames: string[], signal?: AbortSignal, delayMs = 0) {
  const encoder = new TextEncoder();
  let index = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => { if (!closed) { closed = true; controller.close(); } };
      const push = () => {
        if (closed) return;
        if (signal?.aborted) { finish(); return; }
        if (index >= frames.length) { finish(); return; }
        const frame = frames[index++];
        // Deliberately split SSE wire bytes so consumers must handle arbitrary chunk boundaries.
        const split = Math.max(1, Math.floor(frame.length / 2));
        controller.enqueue(encoder.encode(frame.slice(0, split)));
        if (split < frame.length) controller.enqueue(encoder.encode(frame.slice(split)));
        if (delayMs > 0) timer = setTimeout(push, delayMs); else queueMicrotask(push);
      };
      push();
      signal?.addEventListener('abort', () => { if (timer) clearTimeout(timer); finish(); }, {once:true});
    },
    cancel() { closed = true; if (timer) clearTimeout(timer); },
  }), {status:200,headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','connection':'keep-alive'}});
}
function chatFrames(call: any, prose?: string) {
  const id = `call_${crypto.randomUUID()}`;
  const frames = [`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{role:'assistant'},finish_reason:null}]})}\n\n`];
  if (call) {
    frames.push(`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{tool_calls:[{index:0,id,type:'function',function:{name:call.name,arguments:''}}]},finish_reason:null}]})}\n\n`);
    const args = JSON.stringify(call.args); const split = Math.max(1, Math.floor(args.length / 2));
    for (const fragment of [args.slice(0,split),args.slice(split)]) if(fragment) frames.push(`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:fragment}}]},finish_reason:null}]})}\n\n`);
    frames.push(`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{},finish_reason:'tool_calls'}]})}\n\n`);
  } else {
    frames.push(`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{content:prose},finish_reason:null}]})}\n\n`);
    frames.push(`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:24,completion_tokens:12,total_tokens:36}})}\n\n`);
  }
  frames.push('data: [DONE]\n\n'); return frames;
}
function responsesFrames(call: any, prose?: string) {
  const rid = `resp_${crypto.randomUUID()}`;
  const initial = {id:rid,object:'response',created_at:1,status:'in_progress',model:'fixture',output:[],usage:null};
  const frames = [`event: response.created\ndata: ${JSON.stringify({type:'response.created',response:initial})}\n\n`];
  let output: any[];
  if (call) {
    const item = {id:`item_${crypto.randomUUID()}`,type:'function_call',status:'in_progress',call_id:`call_${crypto.randomUUID()}`,name:call.name,arguments:''}; output=[item];
    frames.push(`event: response.output_item.added\ndata: ${JSON.stringify({type:'response.output_item.added',output_index:0,item})}\n\n`);
    const args=JSON.stringify(call.args), split=Math.max(1,Math.floor(args.length/2));
    for(const delta of [args.slice(0,split),args.slice(split)]) if(delta) frames.push(`event: response.function_call_arguments.delta\ndata: ${JSON.stringify({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta})}\n\n`);
    item.arguments=args; item.status='completed';
    frames.push(`event: response.function_call_arguments.done\ndata: ${JSON.stringify({type:'response.function_call_arguments.done',item_id:item.id,output_index:0,arguments:args})}\n\n`);
    frames.push(`event: response.output_item.done\ndata: ${JSON.stringify({type:'response.output_item.done',output_index:0,item})}\n\n`);
  } else {
    const item={id:`item_${crypto.randomUUID()}`,type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:prose,annotations:[]}]}; output=[item];
    frames.push(`event: response.output_item.added\ndata: ${JSON.stringify({type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[{type:'output_text',text:'',annotations:[]}]}})}\n\n`);
    frames.push(`event: response.output_text.delta\ndata: ${JSON.stringify({type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:prose})}\n\n`);
    frames.push(`event: response.output_text.done\ndata: ${JSON.stringify({type:'response.output_text.done',item_id:item.id,output_index:0,content_index:0,text:prose})}\n\n`);
    frames.push(`event: response.content_part.done\ndata: ${JSON.stringify({type:'response.content_part.done',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:prose,annotations:[]}})}\n\n`);
    frames.push(`event: response.output_item.done\ndata: ${JSON.stringify({type:'response.output_item.done',output_index:0,item})}\n\n`);
  }
  const completed={...initial,status:'completed',output,usage:{input_tokens:24,output_tokens:12,total_tokens:36,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}};
  frames.push(`event: response.completed\ndata: ${JSON.stringify({type:'response.completed',response:completed})}\n\n`); return frames;
}

function observeStream(source: ReadableStream<Uint8Array>, emit: Emit, title: string, secret = ''): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const capture = (text: string, final = false) => {
    pending += text;
    if (secret) pending = pending.split(secret).join(REDACTED);
    // Retain enough suffix to recognise a known credential spanning fetch reads.
    // Observed fragments can be delayed/merged; the original wire bytes go to Pi unchanged.
    let retain = final || !secret ? 0 : Math.min(pending.length, secret.length - 1);
    while (retain > 0 && !pending.endsWith(secret.slice(0,retain))) retain--;
    const length = pending.length - retain;
    if (length) { emit('provider','sse-frame',title,sanitize(pending.slice(0,length))); pending = pending.slice(length); }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const {done,value}=await reader.read();
        if(done){capture(decoder.decode(),true);controller.close();return;}
        capture(decoder.decode(value,{stream:true}));
        controller.enqueue(value);
      } catch(error) { capture(decoder.decode(),true); controller.error(error); }
    },
    async cancel(reason) { pending=''; await reader.cancel(reason); },
  });
}

function requestDetails(input: RequestInfo|URL, init?: RequestInit) {
  const req = input instanceof Request ? input : new Request(input, init);
  return req.clone().text().then(body => ({url:req.url,method:req.method,headers:sanitize(Object.fromEntries(req.headers.entries())),body:sanitize(body)}));
}

export function createTransport(settings: Settings, emit: Emit, signal?: AbortSignal): typeof fetch {
  const nativeFetch = globalThis.fetch;
  const safe = (value: unknown) => {
    const clean = sanitize(value);
    if (!settings.apiKey) return clean;
    const redactValue = (item: any): any => typeof item === 'string' ? item.split(settings.apiKey).join(REDACTED) : Array.isArray(item) ? item.map(redactValue) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).map(([key,val]) => [key,redactValue(val)])) : item;
    return redactValue(clean);
  };
  const safeEmit: Emit = (lane,kind,title,data,source) => emit(lane,kind,title,safe(data),source ?? settings.protocol);
  return (async (input: RequestInfo|URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? new Request(input, init) : new Request(input, init);
    const details = await requestDetails(req);
    const endpoint = resolveEndpoint(settings.baseUrl, settings.protocol);
    if (settings.mode === 'live') {
      const requested = new URL(req.url);
      const configured = new URL(endpoint);
      if (requested.username || requested.password || requested.search || requested.hash || requested.origin !== configured.origin || requested.pathname !== configured.pathname) throw new TypeError('Request URL does not match the configured provider endpoint');
    }
    const observed = {...details, url:req.url, configuredEndpoint:endpoint};
    safeEmit('provider','request','Provider request',observed);
    if (signal?.aborted || req.signal.aborted) throw new DOMException('The operation was aborted.','AbortError');
    if (settings.mode === 'live') {
      let response: Response;
      try { response = await nativeFetch(req, {redirect:'error', signal:signal ?? req.signal}); }
      catch (error) { safeEmit('provider','network-error','Provider network error',{url:req.url,error:String(error)}); throw error; }
      const meta={status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers.entries())};
      safeEmit('provider','response','Provider response',meta);
      if (!response.body) return response;
      return new Response(observeStream(response.body,safeEmit,'Provider raw stream fragment（安全观测可能延迟/合并读取块）',settings.apiKey),{status:response.status,statusText:response.statusText,headers:response.headers});
    }
    let body: any = {};
    try { body=JSON.parse(typeof details.body === 'string' ? details.body : '{}'); } catch {}
    const result=fixture(body,settings.scenario,settings.demoReadPath);
    if (settings.scenario === 'invalid-args' && 'call' in result && result.call) safeEmit('tools','fixture','Invalid tool arguments fixture',{tool:result.call.name,args:result.call.args});
    if ('error' in result) {
      const error=jsonResponse({error:{message:result.error,type:'fixture_error',code:result.code}},429);
      safeEmit('provider','response','Simulated provider error',{status:error.status,body:await error.clone().text()}); return error;
    }
    if ('mismatch' in result) { const mismatch=jsonResponse({error:{message:'fixture mismatch: request does not match a supported simulation task',type:'fixture_mismatch'}},422); safeEmit('provider','response','Fixture mismatch',{status:422,body:await mismatch.clone().text()}); return mismatch; }
    if (body.stream === false) {
      const callId = `call_${crypto.randomUUID()}`;
      const wire = settings.protocol === 'chat'
        ? {id:'chatcmpl-fixture',object:'chat.completion',created:1,model:'fixture',choices:[{index:0,message:{role:'assistant',content:result.prose ?? null,...(result.call ? {tool_calls:[{id:callId,type:'function',function:{name:result.call.name,arguments:JSON.stringify(result.call.args)}}]} : {})},finish_reason:result.call ? 'tool_calls' : 'stop'}],usage:{prompt_tokens:24,completion_tokens:12,total_tokens:36}}
        : {id:`resp_${crypto.randomUUID()}`,object:'response',created_at:1,status:'completed',model:'fixture',output:result.call ? [{id:'item_fixture',type:'function_call',status:'completed',call_id:callId,name:result.call.name,arguments:JSON.stringify(result.call.args)}] : [{id:'item_fixture',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:result.prose,annotations:[]}]}],usage:{input_tokens:24,output_tokens:12,total_tokens:36}};
      safeEmit('provider','response','Simulated JSON response',{status:200,body:wire,usageNote:'模拟用量，非真实计量'});
      return jsonResponse(wire);
    }
    const frames=settings.protocol==='chat' ? chatFrames(result.call,result.prose) : responsesFrames(result.call,result.prose);
    safeEmit('provider','response','Simulated provider response',{status:200,headers:{'content-type':'text/event-stream; charset=utf-8'}});
    const response=sseResponse(frames,signal ?? req.signal,settings.delayMs);
    return new Response(observeStream(response.body!,safeEmit,'Simulated SSE raw chunk'),{status:200,headers:response.headers});
  }) as typeof fetch;
}
