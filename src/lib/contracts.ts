export type Lane = 'user'|'context'|'provider'|'parser'|'harness'|'tools'|'workspace'|'session';
export type Protocol = 'chat'|'responses';
export type Scenario = 'repair'|'invalid-args'|'provider-error'|'failed-test'|'read-once';
export interface Settings { mode:'demo'|'live'; protocol:Protocol; baseUrl:string; apiKey:string; model:string; delayMs:number; scenario:Scenario; demoReadPath?:string; toolExecution:'sequential'|'parallel'; }
export interface TraceEvent { id:string; seq:number; at:number; lane:Lane; kind:string; title:string; data:unknown; files:Record<string,string>; source?:string; }
export interface RunResult { events:TraceEvent[]; files:Record<string,string>; messages:unknown[]; status:'completed'|'cancelled'|'error'; error?:string; }
export type Emit = (lane:Lane,kind:string,title:string,data:unknown,source?:string)=>void;
export const defaultSettings:Settings = {mode:'demo',protocol:'chat',baseUrl:'https://api.openai.com/v1',apiKey:'',model:'gpt-4.1-mini',delayMs:25,scenario:'repair',toolExecution:'sequential'};
export const INITIAL_FILES:Record<string,string> = {'/src/sum.js':'export function sum(a, b) {\n  return a - b;\n}\n','/README.md':'修复 sum(a, b)，让它返回两个数的和。运行内置测试确认结果。\n'};
export const DEFAULT_PROMPT = '请读取 /src/sum.js，修复 sum 的错误，运行测试并说明结果。';
export interface RuntimeOptions { settings:Settings; prompt:string; files?:Record<string,string>; onEvent?:(event:TraceEvent)=>void; }
export interface RuntimeHandle { result:Promise<RunResult>; cancel:()=>void; steer:(text:string)=>void; }
export type TransportFactory = (settings:Settings,emit:Emit,signal?:AbortSignal)=>typeof fetch;
