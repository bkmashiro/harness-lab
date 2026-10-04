export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };
export type Args = Record<string, unknown>;
export interface ToolCall { id: string; name: string; arguments: string | Args }
export interface ToolResult { content: string; isError?: boolean; details?: any }
export interface Tool { name: string; description?: string; parameters?: Record<string, any>; execute(args: Args, context?: { signal?: AbortSignal }): Promise<ToolResult> | ToolResult }
export interface ProviderInput { messages: Message[]; tools: Array<{ name: string; description: string; parameters: Record<string, any> }>; signal?: AbortSignal }
export type Provider = (input: ProviderInput) => Promise<{ role: 'assistant'; content: string; toolCalls?: ToolCall[] }>;
export type HarnessResult = { status: 'completed' | 'limit' | 'cancelled' | 'error'; messages: Message[]; final: string; turns: number };
export function createHarness(options: { provider: Provider; tools?: Tool[]; maxTurns?: number; onEvent?: (type: string, data: unknown) => void; signal?: AbortSignal }): { run(prompt: string): Promise<HarnessResult> };
export function validateArguments<T = Record<string, unknown>>(schema: Record<string, any>, args: unknown): T;
export function createWorkspaceTools(files?: Record<string, string>): Tool[];
export function createDemoProvider(options?: { scenario?: string }): Provider;
export interface ProviderOptions { baseUrl: string; model: string; apiKey?: string; fetchImpl?: typeof fetch }
export function createChatProvider(options: ProviderOptions): Provider;
export function createResponsesProvider(options: ProviderOptions): Provider;
export function createMockFetch(protocol?: 'chat' | 'responses', scenario?: string): typeof fetch;
