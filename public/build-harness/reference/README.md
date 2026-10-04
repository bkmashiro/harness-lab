# 从零写 Harness：可运行参考实现

本目录是一份不依赖 Pi、SDK、npm 包或第三方运行时的教学代码。`harness.mjs` 只定义并导出函数：可由 Node.js 20+ 的 ESM 直接导入，也可供课程页面读取源码后在 worker 中执行。模块加载时不会发请求、读环境变量或启动任务。

## 文件

- `harness.mjs`：完整参考实现，纯 JavaScript 导出，无 import、无顶层执行、无 `import.meta`。
- `harness.d.mts`：匹配 ESM 文件的 TypeScript 公共声明，包含 Provider、Message、Tool、参数选项（API key 可省略）及返回值类型。
- `demo.mjs`：默认离线修复演示，不需要网络或密钥。
- `live.mjs`：可选 OpenAI 兼容非流式接入。只有显式运行且提供环境变量才发送请求。
- 项目中的 `src/build-harness/reference.test.ts`：验证流程、适配器和失败处理。

## 立即运行

```sh
# 解压下载包后，在同一目录运行
node demo.mjs
```

离线 demo 初始内存文件中 `sum(a, b)` 错误地做减法。模型模拟器根据当前消息和工具结果依次要求读取、写入加法实现、运行固定测试，然后根据测试结果生成结论。退出码非零表示没有完成或没有真实测试通过。不会访问网络。

可选 live 模式（不会自动运行）：

```sh
API_BASE_URL=https://api.example.com/v1 API_MODEL=your-model API_KEY=... API_PROTOCOL=chat \
  node public/build-harness/reference/live.mjs
```

`API_PROTOCOL` 可选 `chat` / `responses`。key 只进入 Authorization 请求头；事件不包含 headers 或 key。请只在信任的终端设置密钥。适配器发送 `stream: false`，无重试；失败 HTTP 状态会以错误结束，不会假装成功。真实服务端是否兼容这些协议仍取决于服务实现。教学页面及自动化测试只使用本地 mock fetch，不会触发付费调用。

## 调用链

```js
import { createHarness, createDemoProvider, createWorkspaceTools } from './harness.mjs';
const files = { '/src/sum.js': 'export function sum(a, b) { return a - b; }' };
const h = createHarness({ provider: createDemoProvider(), tools: createWorkspaceTools(files), maxTurns: 8,
  onEvent: (type, data) => console.log(type, data) });
const result = await h.run('请修复并测试');
```

1. `createHarness({ provider, tools, maxTurns, onEvent, signal })` 返回 `{ run(prompt) }`。
2. 每个 turn 将完整消息历史和公开工具定义传给 `provider({ messages, tools, signal })`。
3. `assistant` 消息有 `toolCalls` 时按名称查工具、解析 JSON 参数，再用 `validateArguments` 对约定的子集做校验。
4. 参数问题、未知工具和工具执行异常均创建带原 `toolCallId` 的 `role: 'tool'` 错误结果，使模型有机会解释；不合法的 provider 消息和 HTTP 错误则直接返回 `status: 'error'`。
5. 工具结果按请求顺序放回历史；没有工具调用的 assistant 文本结束 run。`maxTurns` 是模型请求轮数上限，超限返回 `limit`，中止信号返回 `cancelled`。

`run()` 返回 `{ status, messages, final, turns }`，status 为 `completed | limit | cancelled | error`。消息约定：user `{ role, content }`；assistant `{ role, content, toolCalls: [{ id, name, arguments }] }`；tool `{ role: 'tool', toolCallId, name, content, isError? }`。`onEvent` 收到 `model_request`、`model_response`、`tool_start`、`tool_end`、`run_end`。observer 抛错不会破坏 run。

## 工具及测试边界

`createWorkspaceTools(files)` 返回仅操作内存对象的 `read_file`、`write_file`、`run_tests`。路径做简单规范化，拒绝 `..`；所有路径都指向这个内存对象。`run_tests` 不 eval 模型写入的 JavaScript：只识别 `export function sum(a, b) { return a (+|-|*|/) b; }` 这个受限形式，对 `(2,3)`, `(-4,9)`, `(0,0)` 三组真实计算并逐项比较。因此任意语法、控制流或完整 JS 程序不在此测试器支持范围内；不匹配或任何用例失败都返回 `isError: true`，通过状态由这三个计算结果决定。

`validateArguments` 支持 object、required、properties 的 string/number/boolean/object/array 类型及 string 的 `minLength` / `maxLength`，这些约束对应本课工具的参数声明；`additionalProperties: false` 时按自有属性拒绝额外键，必填和属性检查也不接受继承属性。提供工具时，parameters 用于模型描述且同一 schema 子集会在本地执行前校验。

## 模型适配器

`createChatProvider({ baseUrl, model, apiKey, fetchImpl })` 和 `createResponsesProvider(...)` 各产生同一 provider 合约。两者只支持非流式请求，互转消息历史及工具调用 ID。`baseUrl` 必须为 HTTPS 或 localhost HTTP 的 API root；拒绝 URL userinfo、query、fragment，以及已含 `/chat/completions` 或 `/responses` 的错误 endpoint，避免把 key 发向拼错的 URL。`redirect: 'error'` 禁止带 Authorization 自动跟随重定向。响应非 2xx、非 JSON 或格式无效都显式失败。

`createMockFetch(protocol, scenario)` 是本地 Fetch 兼容实现，可验证教学页自行编写的 HTTP adapter 请求体与工具调用流程；它不会联网。默认 `repair`，另有 `invalid-args`、`unknown-tool`、`endless`、`http401` 场景。

## 公开 API

- `createHarness({ provider, tools, maxTurns = 8, onEvent, signal })`
- `createDemoProvider({ scenario = 'repair' } = {})`
- `createWorkspaceTools(files)`
- `validateArguments(schema, args)`
- `createChatProvider({ baseUrl, model, apiKey, fetchImpl = globalThis.fetch })`
- `createResponsesProvider({ baseUrl, model, apiKey, fetchImpl = globalThis.fetch })`
- `createMockFetch(protocol = 'chat', scenario = 'repair')`

这是为课程讲清控制流而做的最小实现，不提供流式输出、重试、并行工具调用、完整 schema 验证、生产级文件沙箱、计费控制或任意语言执行环境。
