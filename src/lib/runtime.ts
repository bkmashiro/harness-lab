import type { RuntimeHandle, RuntimeOptions, RunResult, TraceEvent } from './contracts';

export function startRun(options: RuntimeOptions): RuntimeHandle {
  if (typeof Worker === 'undefined') {
    const controller = new AbortController();
    let queuedSteering: string[] = [];
    let deliverSteering: (text: string) => void = (text) => { queuedSteering.push(text); };
    const result = runInProcess(options, { signal: controller.signal, getSteering: () => queuedSteering.splice(0), onAgentReady: (queue) => { for (const text of queuedSteering.splice(0)) queue(text); deliverSteering = queue; } });
    return { result, cancel: () => controller.abort(), steer: (text) => deliverSteering(text) };
  }

  const worker = new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' });
  let settled = false;
  let resolveResult!: (result: RunResult) => void;
  const result = new Promise<RunResult>((resolve) => { resolveResult = resolve; });
  const events: TraceEvent[] = [];
  const finish = (payload: RunResult) => {
    if (settled) return;
    settled = true;
    worker.terminate();
    resolveResult({ ...payload, events: payload.events?.length ? payload.events : events });
  };
  worker.onmessage = ({ data }) => {
    if (data?.type === 'event') {
      events.push(data.event as TraceEvent);
      options.onEvent?.(data.event as TraceEvent);
    } else if (data?.type === 'result') finish(data.result as RunResult);
    else if (data?.type === 'error') finish({ events, files: options.files ?? {}, messages: [], status: 'error', error: String(data.error) });
  };
  worker.onerror = (event) => finish({ events, files: options.files ?? {}, messages: [], status: 'error', error: event.message || 'Runtime worker failed' });
  worker.postMessage({ type: 'start', options: { ...options, onEvent: undefined } });
  return {
    result,
    cancel: () => { if (!settled) worker.postMessage({ type: 'cancel' }); },
    steer: (text) => { if (!settled) worker.postMessage({ type: 'steer', text }); },
  };
}

export async function runInProcess(options: RuntimeOptions, internal: { signal?: AbortSignal; onEvent?: (event: TraceEvent) => void; getSteering?: () => string[]; onAgentReady?: (queue: (text: string) => void) => void } = {}): Promise<RunResult> {
  const [{ Agent }, { Type }, { stream: streamChat }, { stream: streamResponses }, { createTransport }] = await Promise.all([
    import('@earendil-works/pi-agent-core'),
    import('@earendil-works/pi-ai'),
    import('@earendil-works/pi-ai/api/openai-completions'),
    import('@earendil-works/pi-ai/api/openai-responses'),
    import('./transport'),
  ]);

  const files: Record<string, string> = { ...(options.files ?? {}) };
  const apiKey = options.settings.mode === 'demo' ? 'demo-fixture-key' : options.settings.apiKey;
  const events: TraceEvent[] = [];
  const messages: unknown[] = [];
  let nextEvent = 0;
  let turns = 0;
  const controller = new AbortController();
  if (internal.signal) {
    if (internal.signal.aborted) controller.abort();
    else internal.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const emit = (lane: TraceEvent['lane'], kind: string, title: string, data: unknown, source?: string) => {
    const safeData = redact(redact(data, apiKey), options.settings.apiKey);
    const event: TraceEvent = {
      id: `event-${++nextEvent}`,
      seq: nextEvent,
      at: Date.now(),
      lane,
      kind,
      title: redact(redact(title, apiKey), options.settings.apiKey) as string,
      data: safeData,
      files: redact(redact({ ...files }, apiKey), options.settings.apiKey),
      ...(source ? { source } : {}),
    };
    events.push(event);
    options.onEvent?.(event);
    internal.onEvent?.(event);
  };
  const validateString = (value: unknown, name: string, tool: string) => {
    try { assertString(value, name); }
    catch (error) { emit('tools', 'validation_error', `${tool} input validation failed`, { field: name, message: error instanceof Error ? error.message : String(error) }, 'pi-agent-core'); throw error; }
  };
  const say = (text: string) => ({ content: [{ type: 'text' as const, text }], details: { text } });
  const filePath = Type.String({ minLength: 1, maxLength: 200 });
  const tools: any[] = [
    {
      name: 'read_file', label: 'Read file', description: 'Read a file from the virtual project workspace.',
      parameters: Type.Object({ path: filePath }),
      execute: async (_id: string, args: { path: string }) => {
        validateString(args?.path, 'path', 'tool');
        const content = files[normalizePath(args.path)];
        if (content === undefined) throw new Error(`File not found: ${args.path}`);
        emit('tools', 'read', `read_file ${args.path}`, { path: args.path, content }, 'workspace');
        return say(content);
      },
    },
    {
      name: 'write_file', label: 'Write file', description: 'Write a complete file into the virtual project workspace.',
      parameters: Type.Object({ path: filePath, content: Type.String({ maxLength: 100_000 }) }),
      execute: async (_id: string, args: { path: string; content: string }) => {
        validateString(args?.path, 'path', 'tool');
        validateString(args?.content, 'content', 'tool');
        const path = normalizePath(args.path);
        files[path] = args.content;
        emit('tools', 'write', `write_file ${path}`, { path, content: args.content }, 'workspace');
        return say(`Wrote ${path}`);
      },
    },
    {
      name: 'run_tests', label: 'Run tests', description: 'Run the trusted bounded teaching test for the exported sum(a, b) function.',
      parameters: Type.Object({ path: Type.Optional(filePath) }),
      execute: async (_id: string, args: { path?: string }, signal?: AbortSignal) => {
        if (args?.path !== undefined) validateString(args.path, 'path', 'tool');
        const path = normalizePath(args.path ?? '/src/sum.js');
        const source = files[path];
        if (source === undefined) throw new Error(`File not found: ${path}`);
        emit('tools', 'tool', `run_tests ${path}`, { path }, 'executor');
        const outcome = await runTeachingTest(source, signal);
        emit('harness', 'test', outcome.ok ? 'Tests passed' : 'Tests failed', outcome, 'executor');
        return { ...say(outcome.message), details: outcome, isError: !outcome.ok };
      },
    },
  ];

  emit('context', 'run_start', 'Run started', { prompt: options.prompt, settings: { ...options.settings, apiKey: undefined } });
  emit('workspace', 'workspace_init', 'Virtual workspace ready', { paths: Object.keys(files) });
  const model = {
    id: options.settings.model || 'gpt-4o-mini', name: options.settings.model || 'gpt-4o-mini',
    api: options.settings.protocol === 'responses' ? 'openai-responses' : 'openai-completions',
    provider: 'openai', baseUrl: `${options.settings.baseUrl.replace(/\/$/, '')}/`, input: ['text' as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, reasoning: false, contextWindow: 32_000, maxTokens: 2048,
  };
  const transportFetch = createTransport(options.settings, (lane, kind, title, data, source) => emit(lane, kind, title, redact(data, apiKey), source), controller.signal);
  const fetch = transportFetch;
  const streamFn = (requestedModel: any, context: any, streamOptions: any = {}) => {
    const selected = options.settings.protocol === 'responses' ? streamResponses : streamChat;
    return selected(requestedModel, context, {
      ...streamOptions,
      apiKey: apiKey,
      fetch,
      signal: controller.signal,
      maxRetries: 0,
      onPayload: (payload: unknown) => emit('context', 'serialized', 'Pi 序列化请求体（发送前）', payload, options.settings.protocol),
      onResponse: (response: unknown) => emit('provider', 'metadata', 'Pi 响应元数据', response, options.settings.protocol),
      onProviderStreamEvent: (data: unknown) => emit('parser', 'stream_event', 'Provider stream event', data, options.settings.protocol),
    });
  };
  const agent = new Agent({
    initialState: { systemPrompt: 'You are a coding tutor. Use read_file, write_file, and run_tests to repair the virtual workspace. Do not claim tests passed unless run_tests succeeds.', model, tools },
    streamFn,
    toolExecution: options.settings.toolExecution,
    finishTurn: () => (++turns >= 12 ? { action: 'end' } : undefined),
  });
  const queueSteering = (text: string) => agent.steer({ role: 'user', content: text, timestamp: Date.now() });
  controller.signal.addEventListener('abort', () => agent.abort(), { once: true });
  for (const text of internal.getSteering?.() ?? []) queueSteering(text);
  internal.onAgentReady?.(queueSteering);
  agent.subscribe((event) => {
    if (event.type === 'message_start' || event.type === 'message_end' || event.type === 'turn_start' || event.type === 'turn_end' || event.type === 'agent_start' || event.type === 'agent_end') {
      if ('message' in event) messages.push(event.message);
      const { lane, title } = classifyAgentEvent(event.type);
      emit(lane, event.type, title, redact(event, apiKey), 'pi-agent-core');
    } else if (event.type === 'message_update') {
      emit('parser', event.assistantMessageEvent.type, 'Assistant stream update', redact(event.assistantMessageEvent, apiKey), 'pi-ai');
    } else if (event.type.startsWith('tool_execution')) {
      const call = event as Extract<typeof event, { type: 'tool_execution_start' | 'tool_execution_update' | 'tool_execution_end' }>;
      emit('tools', event.type, `${event.type}: ${call.toolName}`, redact(event, apiKey), 'pi-agent-core');
    }
  });

  let status: RunResult['status'] = 'completed';
  let error: string | undefined;
  try {
    await agent.prompt(options.prompt);
  } catch (cause) {
    status = controller.signal.aborted ? 'cancelled' : 'error';
    error = cause instanceof Error ? cause.message : String(cause);
  }
  if (controller.signal.aborted) status = 'cancelled';
  if (agent.state.errorMessage && status === 'completed') {
    status = agent.state.errorMessage.toLowerCase().includes('abort') ? 'cancelled' : 'error';
    error = agent.state.errorMessage;
  }
  const finalMessages = agent.state.messages.slice();
  const result: RunResult = { events, files: { ...files }, messages: redact(redact(finalMessages,apiKey),options.settings.apiKey), status, ...(error ? { error: redact(redact(error, apiKey),options.settings.apiKey) as string } : {}) };
  emit(status === 'error' ? 'harness' : 'session', 'run_end', `Run ${status}`, { status, error: result.error, messageCount: finalMessages.length });
  result.events = events;
  return result;
}

function classifyAgentEvent(type: string): { lane: TraceEvent['lane']; title: string } {
  if (type.startsWith('agent_')) return { lane: 'session', title: type === 'agent_start' ? 'Agent started' : 'Agent finished' };
  if (type.startsWith('turn_')) return { lane: 'harness', title: type === 'turn_start' ? 'Assistant turn started' : 'Assistant turn finished' };
  return { lane: 'context', title: type.replaceAll('_', ' ') };
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') throw new TypeError(`Tool input validation failed: ${name} must be a string`);
}

function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') throw new Error('Path traversal is not allowed');
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

function redact(value: unknown, secret: string): any {
  if (!secret) return value;
  if (typeof value === 'string') return value.split(secret).join('[REDACTED]');
  if (Array.isArray(value)) return value.map((item) => redact(item, secret));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, secret)]));
  return value;
}

export async function runTeachingTest(source: string, signal?: AbortSignal, timeoutMs = 1_000): Promise<{ ok: boolean; message: string; results: { input: [number, number]; expected: number; actual?: number; pass: boolean }[] }> {
  if (signal?.aborted) throw new Error('Test execution cancelled');
  if (typeof Worker !== 'undefined') {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./executor.worker.ts', import.meta.url), { type: 'module' });
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); };
      const abort = () => { cleanup(); reject(new Error('Test execution cancelled')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Test execution timed out')); }, timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) => { cleanup(); resolve(data); };
      worker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'Test worker failed')); };
      worker.postMessage({ source });
    });
  }
  const declaration = /export\s+function\s+sum\s*\(\s*a\s*,\s*b\s*\)\s*\{([\s\S]*?)\}/.exec(source);
  const body = declaration?.[1];
  const expr = body && /return\s+([ab])\s*([+*/-])\s*([ab])\s*;?\s*$/.exec(body.trim());
  if (!expr || body?.trim() !== expr[0]) return { ok: false, message: 'Test failed: expected a bounded exported sum(a, b) implementation.', results: [] };
  const operator = expr[2];
  const apply = (a: number, b: number) => {
    const values = { a, b };
    const left = values[expr[1] as 'a' | 'b'];
    const right = values[expr[3] as 'a' | 'b'];
    switch (operator) { case '+': return left + right; case '-': return left - right; case '*': return left * right; case '/': return left / right; }
  };
  const cases: [number, number, number][] = [[2, 3, 5], [-4, 9, 5], [0, 0, 0]];
  const deadline = Date.now() + timeoutMs;
  const results = cases.map(([a, b, expected]) => {
    if (Date.now() > deadline || signal?.aborted) throw new Error('Test execution timed out or cancelled');
    const actual = apply(a, b);
    return { input: [a, b] as [number, number], expected, actual, pass: Object.is(actual, expected) };
  });
  const ok = results.every((result) => result.pass);
  return { ok, message: ok ? `All ${results.length} sum tests passed.` : 'Test failed: sum returned an unexpected result.', results };
}
