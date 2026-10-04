import { createChatProvider, createHarness, createResponsesProvider, createWorkspaceTools } from './harness.mjs';

const { API_BASE_URL, API_MODEL, API_KEY, API_PROTOCOL = 'chat' } = process.env;
if (!API_BASE_URL || !API_MODEL || !API_KEY) throw new Error('Set API_BASE_URL, API_MODEL, and API_KEY in the environment.');
if (!['chat', 'responses'].includes(API_PROTOCOL)) throw new Error('API_PROTOCOL must be chat or responses.');
const logSafe=value=>console.log(JSON.stringify(value,null,2).split(API_KEY).join('[REDACTED]'));
const providerOptions = { baseUrl: API_BASE_URL, model: API_MODEL, apiKey: API_KEY };
const provider = API_PROTOCOL === 'responses' ? createResponsesProvider(providerOptions) : createChatProvider(providerOptions);
const files = {
  '/src/sum.js': 'export function sum(a, b) { return a - b; }',
  '/README.md': '# Tiny arithmetic module\nThe sum function should add its inputs.\n',
};
const harness = createHarness({ provider, tools: createWorkspaceTools(files), maxTurns: 8,
  onEvent: (type, data) => logSafe({ type, data: type === 'model_request' ? { turn: data.turn } : data }) });
const result = await harness.run('Fix /src/sum.js, read it first, run the supplied tests after editing, and report success only if they pass.');
logSafe({status:result.status,turns:result.turns,final:result.final,files});
const tested=result.messages.some(m=>m.role==='tool'&&m.name==='run_tests'&&!m.isError&&m.content.includes('3 tests passed'));
if(result.status!=='completed'||!tested)process.exitCode=1;
