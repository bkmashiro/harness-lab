// Pure, dependency-free teaching harness. Safe to load in a browser worker or Node 20+.
export function createHarness({ provider, tools = [], maxTurns = 8, onEvent, signal } = {}) {
  if (typeof provider !== 'function') throw new TypeError('provider must be a function');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new RangeError('maxTurns must be a positive integer');
  const registry = new Map();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string' || !tool.name || typeof tool.execute !== 'function') throw new TypeError('Each tool needs a name and execute function');
    if (registry.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    registry.set(tool.name, tool);
  }
  const emit = (type, data) => { try { onEvent?.(type, data); } catch { /* observers cannot break a run */ } };
  return { run: async (prompt) => {
    const messages = [{ role: 'user', content: String(prompt) }];
    let status = 'completed'; let final = ''; let turns = 0;
    try {
      while (turns < maxTurns) {
        if (signal?.aborted) { status = 'cancelled'; break; }
        turns++;
        emit('model_request', { turn: turns, messages: clone(messages), tools: tools.map(publicTool) });
        const answer = await provider({ messages: clone(messages), tools: tools.map(publicTool), signal });
        if (signal?.aborted) { status = 'cancelled'; break; }
        if (!answer || answer.role !== 'assistant' || typeof answer.content !== 'string' || (answer.toolCalls !== undefined && !Array.isArray(answer.toolCalls))) throw new Error('Invalid provider response: expected assistant message with string content and optional toolCalls array');
        const calls = answer.toolCalls ?? [];
        if (calls.some(c => !c || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !(typeof c.arguments === 'string' || (c.arguments && typeof c.arguments === 'object' && !Array.isArray(c.arguments))))) throw new Error('Invalid provider response: malformed tool call');
        const assistant = { role: 'assistant', content: answer.content, ...(calls.length ? { toolCalls: calls.map(c => ({ id: c.id, name: c.name, arguments: c.arguments })) } : {}) };
        messages.push(assistant); emit('model_response', { turn: turns, message: clone(assistant) });
        if (!calls.length) { final = answer.content; break; }
        for (const call of calls) {
          if (signal?.aborted) { status = 'cancelled'; break; }
          const tool = registry.get(call.name);
          if (!tool) { messages.push(toolError(call, `Unknown tool: ${call.name}`)); continue; }
          let args;
          try {
            args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
            args = validateArguments(tool.parameters, args);
          } catch (error) { messages.push(toolError(call, `Invalid arguments: ${messageOf(error)}`)); continue; }
          emit('tool_start', { id: call.id, name: call.name, arguments: clone(args) });
          try {
            const result = await tool.execute(args, { signal });
            if (!result || typeof result.content !== 'string') throw new Error('Tool result must contain string content');
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result.content, ...(result.isError ? { isError: true } : {}) });
            emit('tool_end', { id: call.id, name: call.name, isError: Boolean(result.isError), content: result.content, ...(result.details === undefined ? {} : { details: result.details }) });
          } catch (error) {
            const err = toolError(call, `Tool failed: ${messageOf(error)}`); messages.push(err);
            emit('tool_end', { id: call.id, name: call.name, isError: true, content: err.content });
          }
        }
        if (status === 'cancelled') break;
      }
      if (status === 'completed' && turns >= maxTurns && [...messages].reverse().find(m => m.role === 'assistant')?.toolCalls?.length) status = 'limit';
      if (status === 'limit') final = '';
    } catch (error) { status = signal?.aborted ? 'cancelled' : 'error'; final = messageOf(error); }
    const result = { status, messages, final, turns };
    emit('run_end', { status, turns, final });
    return result;
  } };
}

export function validateArguments(schema, args) {
  if (!schema || schema.type !== 'object') return args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('arguments must be an object');
  for (const key of schema.required ?? []) if (!Object.hasOwn(args, key)) throw new TypeError(`${key} is required`);
  if (schema.additionalProperties === false) for (const key of Object.keys(args)) if (!Object.hasOwn(schema.properties ?? {}, key)) throw new TypeError(`${key} is not allowed`);
  for (const [key, rule] of Object.entries(schema.properties ?? {})) {
    if (!Object.hasOwn(args, key)) continue;
    const value = args[key];
    if (rule.type === 'string' && typeof value !== 'string') throw new TypeError(`${key} must be a string`);
    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError(`${key} must be a number`);
    if (rule.type === 'boolean' && typeof value !== 'boolean') throw new TypeError(`${key} must be a boolean`);
    if (rule.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new TypeError(`${key} must be an object`);
    if (rule.type === 'array' && !Array.isArray(value)) throw new TypeError(`${key} must be an array`);
    if (typeof value === 'string' && rule.minLength !== undefined && value.length < rule.minLength) throw new TypeError(`${key} must have at least ${rule.minLength} characters`);
    if (typeof value === 'string' && rule.maxLength !== undefined && value.length > rule.maxLength) throw new TypeError(`${key} must have at most ${rule.maxLength} characters`);
  }
  return args;
}

export function createWorkspaceTools(initialFiles = {}) {
  const files = initialFiles;
  const pathSchema = { type: 'string', minLength: 1, maxLength: 200 };
  const read = { name: 'read_file', description: 'Read a workspace file.', parameters: obj({ path: pathSchema }, ['path']), execute: async ({ path }) => {
    const key = normalizePath(path); if (!(key in files)) throw new Error(`File not found: ${path}`); return { content: files[key] };
  } };
  const write = { name: 'write_file', description: 'Replace a workspace file.', parameters: obj({ path: pathSchema, content: { type: 'string', maxLength: 100000 } }, ['path', 'content']), execute: async ({ path, content }) => {
    const key = normalizePath(path); files[key] = content; return { content: `Wrote ${key}` };
  } };
  const test = { name: 'run_tests', description: 'Run three fixed arithmetic tests against export function sum(a, b).', parameters: obj({ path: pathSchema }, []), execute: async ({ path = '/src/sum.js' } = {}) => {
    const key = normalizePath(path); if (!(key in files)) throw new Error(`File not found: ${key}`);
    const match = /^\s*export\s+function\s+sum\s*\(\s*a\s*,\s*b\s*\)\s*\{\s*return\s+([ab])\s*([+*/-])\s*([ab])\s*;?\s*\}\s*$/.exec(files[key]);
    const cases = [[2,3,5],[-4,9,5],[0,0,0]];
    const results = match ? cases.map(([a,b,expected]) => { const n={a,b}; const x=n[match[1]], y=n[match[3]]; const actual = match[2] === '+' ? x+y : match[2] === '-' ? x-y : match[2] === '*' ? x*y : x/y; return { input:[a,b], expected, actual, pass:Object.is(actual,expected) }; }) : [];
    const passed = results.length === cases.length && results.every(r => r.pass);
    const details = { ok: passed, results, message: passed ? `All ${results.length} tests passed.` : 'Tests failed: expected a supported sum implementation with all cases passing.' };
    return { content: details.message, isError: !passed, details };
  } };
  return [read, write, test];
}

export function createDemoProvider({ scenario = 'repair' } = {}) {
  let sequence = 0;
  return async ({ messages, tools }) => {
    const seen = messages.filter(m => m.role === 'assistant').length;
    const lastTool = [...messages].reverse().find(m => m.role === 'tool');
    const call = (name, args) => ({ role: 'assistant', content: '', toolCalls: [{ id: `demo-${++sequence}`, name, arguments: args }] });
    if (scenario === 'invalid-args' && !seen) return call('write_file', { path: '', content: 'export function sum(a,b){return a+b;}' });
    if (scenario === 'unknown-tool' && !seen) return call('delete_everything', {});
    if (scenario === 'endless') return call('read_file', { path: '/README.md' });
    if (!tools.some(t => t.name === 'read_file') && !seen) return { role: 'assistant', content: 'No tools are available for this run.' };
    if (lastTool?.isError) return { role: 'assistant', content: `Unable to continue: ${lastTool.content}` };
    if (!seen) return call('read_file', { path: '/src/sum.js' });
    if (lastTool?.name === 'read_file' && !messages.some(m => m.role === 'tool' && m.name === 'write_file')) return call('write_file', { path: '/src/sum.js', content: 'export function sum(a, b) { return a + b; }' });
    if (!messages.some(m => m.role === 'tool' && m.name === 'run_tests')) return call('run_tests', { path: '/src/sum.js' });
    const testResult = [...messages].reverse().find(m => m.role === 'tool' && m.name === 'run_tests');
    return { role: 'assistant', content: testResult?.isError ? `修复未通过：${testResult.content}` : '已修复 sum(a, b)，run_tests 的三个用例全部通过。' };
  };
}

export function createChatProvider({ baseUrl, model, apiKey, fetchImpl = globalThis.fetch }) {
  const endpoint = endpointFor(baseUrl, 'chat');
  return async ({ messages, tools, signal }) => {
    const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal, headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify({ model, stream: false, messages: chatMessages(messages), tools: tools.map(t => ({ type: 'function', function: { name:t.name, description:t.description, parameters:t.parameters } })) }) });
    const data = await readResponse(response);
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Error('Incomplete provider response: chat completion reached length limit');
    const msg = choice?.message;
    if (!msg || typeof msg.content !== 'string' && msg.content !== null) throw new Error('Invalid provider response: malformed chat completion');
    return { role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls ? { toolCalls: msg.tool_calls.map(c => ({ id:c.id, name:c.function?.name, arguments:c.function?.arguments })) } : {}) };
  };
}

export function createResponsesProvider({ baseUrl, model, apiKey, fetchImpl = globalThis.fetch }) {
  const endpoint = endpointFor(baseUrl, 'responses');
  return async ({ messages, tools, signal }) => {
    const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal, headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify({ model, stream: false, input: responsesInput(messages), tools: tools.map(t => ({ type:'function', name:t.name, description:t.description, parameters:t.parameters, strict:false })) }) });
    const data = await readResponse(response);
    if (data?.status === 'incomplete') throw new Error('Incomplete provider response: Responses API status is incomplete');
    if (!Array.isArray(data?.output)) throw new Error('Invalid provider response: malformed Responses API output');
    const calls = data.output.filter(x => x.type === 'function_call').map(x => ({ id:x.call_id ?? x.id, name:x.name, arguments:x.arguments }));
    const text = data.output.filter(x => x.type === 'message').flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text).join('');
    return { role:'assistant', content:text, ...(calls.length ? { toolCalls:calls } : {}) };
  };
}

export function createMockFetch(protocol = 'chat', scenario = 'repair') {
  if (!['chat','responses'].includes(protocol)) throw new TypeError('protocol must be chat or responses');
  let id = 0;
  return async (_url, init = {}) => {
    if (init.body === undefined && _url && typeof _url === 'object' && 'body' in _url) init = _url;
    const body = JSON.parse(init.body ?? '{}');
    if (body.stream !== false || body.model !== 'mock-model' || !Array.isArray(body.tools) || !Array.isArray(protocol === 'chat' ? body.messages : body.input)) return jsonResponse({ error:{ message:'Unexpected mock request payload' } }, 400);
    const toolDefs = body.tools.map(t => protocol === 'chat' ? t?.function : t);
    if (toolDefs.some(t => !t || typeof t.name !== 'string' || !t.name || !t.parameters || t.parameters.type !== 'object')) return jsonResponse({ error:{ message:'Malformed tool definitions' } }, 400);
    if (scenario === 'http401') return jsonResponse({ error:{ message:'Unauthorized' } }, 401);
    const msgs = protocol === 'chat' ? body.messages ?? [] : body.input ?? [];
    const hasTool = name => protocol === 'chat' ? msgs.some(m => m.role === 'tool' && m.name === name) : msgs.some(m => m.type === 'function_call' && m.name === name);
    const toolResult = name => protocol === 'chat' ? [...msgs].reverse().find(m => m.role === 'tool' && m.name === name) : [...msgs].reverse().find(m => m.type === 'function_call_output' && msgs.some(c => c.type === 'function_call' && c.name === name && c.call_id === m.call_id));
    for (const m of msgs) if (protocol === 'chat' && m.role === 'tool') {
      const call = msgs.flatMap(a => a.role === 'assistant' ? a.tool_calls ?? [] : []).find(c => c.id === m.tool_call_id);
      if (!call || call.function?.name !== m.name || typeof m.content !== 'string') return jsonResponse({ error:{ message:'Tool result does not match assistant call ID/name/content' } }, 400);
    }
    for (const m of msgs) if (protocol === 'responses' && m.type === 'function_call_output') {
      const call = msgs.find(c => c.type === 'function_call' && c.call_id === m.call_id);
      if (!call || typeof m.output !== 'string') return jsonResponse({ error:{ message:'Tool result does not match assistant call ID/content' } }, 400);
    }
    for (const m of msgs) {
      if (protocol === 'chat' && m.role === 'assistant' && m.tool_calls) for (const c of m.tool_calls) {
        let args; try { args = JSON.parse(c.function?.arguments); } catch { return jsonResponse({ error:{ message:'Malformed assistant tool arguments' } }, 400); }
        if (!args || typeof args !== 'object' || Array.isArray(args) || typeof c.id !== 'string' || !c.id || typeof c.function?.name !== 'string') return jsonResponse({ error:{ message:'Malformed assistant tool call' } }, 400);
      }
      if (protocol === 'responses' && m.type === 'function_call') {
        let args; try { args = JSON.parse(m.arguments); } catch { return jsonResponse({ error:{ message:'Malformed assistant tool arguments' } }, 400); }
        if (!args || typeof args !== 'object' || Array.isArray(args) || typeof m.call_id !== 'string' || !m.call_id || typeof m.name !== 'string') return jsonResponse({ error:{ message:'Malformed assistant tool call' } }, 400);
      }
    }
    const seen = protocol === 'chat' ? msgs.filter(m => m.role === 'assistant').length : msgs.filter(m => m.type === 'function_call' || m.type === 'message' && m.role === 'assistant').length;
    let name, args;
    if (scenario === 'invalid-args' && !seen) { name='write_file'; args={path:'',content:'bad'}; }
    else if (scenario === 'unknown-tool' && !seen) { name='not_a_tool'; args={}; }
    else if (scenario === 'endless') { name='read_file'; args={path:'/README.md'}; }
    else if (!seen) { name='read_file'; args={path:'/src/sum.js'}; }
    else if (hasTool('read_file') && !hasTool('write_file')) { name='write_file'; args={path:'/src/sum.js',content:'export function sum(a, b) { return a + b; }'}; }
    else if (!hasTool('run_tests')) { name='run_tests'; args={path:'/src/sum.js'}; }
    else if (hasTool('run_tests')) {
      const output = toolResult('run_tests');
      const successful = output && (protocol === 'chat' ? !output.isError && /All 3 tests passed\./.test(output.content) : /All 3 tests passed\./.test(output.output));
      const text = successful ? '已修复；run_tests 已实际通过。' : '修复未通过：run_tests 没有成功结果。';
      return jsonResponse(protocol === 'chat' ? { choices:[{ message:{ role:'assistant', content:text } }] } : { output:[{ type:'message', role:'assistant', content:[{ type:'output_text', text }] }] });
    }
    else {
      const output = protocol === 'chat' ? { choices:[{ message:{ role:'assistant', content:'已修复；测试结果已返回。' } }] } : { output:[{ type:'message', role:'assistant', content:[{ type:'output_text', text:'已修复；测试结果已返回。' }] }] };
      return jsonResponse(output);
    }
    id++;
    const output = protocol === 'chat' ? { choices:[{ message:{ role:'assistant', content:null, tool_calls:[{id:`mock-${id}`,type:'function',function:{name,arguments:JSON.stringify(args)}}] } }] } : { output:[{type:'function_call',id:`item-${id}`,call_id:`mock-${id}`,name,arguments:JSON.stringify(args)}] };
    return jsonResponse(output);
  };
}

function endpointFor(baseUrl, protocol) {
  let url; try { url = new URL(baseUrl); } catch { throw new TypeError('baseUrl must be a valid URL'); }
  if (url.username || url.password || url.search || url.hash) throw new TypeError('baseUrl must not contain userinfo, query, or fragment');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new TypeError('baseUrl must use HTTPS or localhost HTTP');
  const suffix = protocol === 'chat' ? '/chat/completions' : '/responses';
  if (url.pathname.replace(/\/$/,'').endsWith(suffix)) throw new TypeError(`baseUrl must be the API root, not an endpoint ending in ${suffix}`);
  url.pathname = `${url.pathname.replace(/\/$/,'')}${suffix}`; return url.toString();
}
async function readResponse(response) { if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'} from model provider`); try { return await response.json(); } catch { throw new Error('Invalid provider response: body is not JSON'); } }
function argumentObject(value) { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('tool arguments must encode an object'); return parsed; }
function chatMessages(messages) { return messages.flatMap(m => m.role === 'tool' ? [{role:'tool',tool_call_id:m.toolCallId,name:m.name,content:m.content}] : [{role:m.role,content:m.content,...(m.toolCalls ? {tool_calls:m.toolCalls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(argumentObject(c.arguments))}}))} : {})}]); }
function responsesInput(messages) { return messages.flatMap(m => m.role === 'tool' ? [{type:'function_call_output',call_id:m.toolCallId,output:m.content}] : m.role === 'assistant' && m.toolCalls ? [...(m.content ? [{type:'message',role:'assistant',content:[{type:'output_text',text:m.content}]}] : []),...m.toolCalls.map(c=>({type:'function_call',call_id:c.id,name:c.name,arguments:JSON.stringify(argumentObject(c.arguments))}))] : [{type:'message',role:m.role,content:[{type:m.role === 'assistant' ? 'output_text' : 'input_text',text:m.content}]}]); }
function jsonResponse(body, status=200) { return new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}}); }
function obj(properties, required) { return {type:'object',properties,required,additionalProperties:false}; }
function normalizePath(value) { const parts=[]; for(const p of String(value).replaceAll('\\','/').split('/')) { if(!p||p==='.') continue; if(p==='..') throw new Error('Path traversal is not allowed'); parts.push(p); } return `/${parts.join('/')}`; }
function toolError(call, content) { return {role:'tool',toolCallId:call.id,name:call.name,content,isError:true}; }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function publicTool(tool) { return {name:tool.name,description:tool.description ?? '',parameters:tool.parameters ?? {type:'object',properties:{}}}; }
