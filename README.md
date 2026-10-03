# Harness Lab

一个纯静态、中文的 Agent harness 交互学习工作台。九章共用系统图、事件时间轴与运行检查器，逐步查看请求转换、SSE 解析、工具调用和文件变化。

默认模型响应由浏览器内模拟 provider 编排，**Pi harness、provider adapter、工具校验与教学测试实际执行**。无 API key、无远程请求。自由探索可切换自己的兼容 API。

![运行工作台](docs/screenshots/workbench.png)

## 本地运行

需要 Node.js 22.19 或更新版本（Pi 依赖要求）。

```sh
npm ci
npm run dev
```

终端显示本地 URL。不要通过 `file://` 打开构建文件，模块 Worker 需要 HTTP(S) origin。

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`dist/` 是静态部署产物，使用相对资源路径。部署后无需 Node 服务或模型代理。模拟运行需要先加载静态资源，未实现首次离线访问的 Service Worker 缓存。

## 可以学习什么

- 完整修复：读 `/src/sum.js`、把减法改成加法、运行三个算术测试、回填结果、输出回复。
- 本轮模型请求与本地历史的区别。
- Chat Completions / Responses 请求格式与流式事件。
- 工具参数校验、执行错误、取消及下一轮循环。
- 文件快照与会话历史的生命周期。
- 上游 session/compaction 机制的源码说明。它们不等同于本站已实现的持久化/压缩实验。

选择事件可查看原始结构及该时间点的文件；回退只切换查看位置，不重发 API、不撤销外部效果。默认演示全部由实际运行事件驱动，不是给 UI 喂预制 trace。

## 设置与 API 实验室

![API 设置与实验](docs/screenshots/api-lab.png)

配置 base URL、model、协议与 API key。单次 API 实验支持 SSE / 非流式 JSON、实际请求预览和响应观测；它不执行工具。完整 agent 使用 Pi 的流式 adapter，并把每轮工具结果重新提交给模型。

模拟 provider 支持正常修复、无效工具参数、provider 错误、真实失败测试。它不是通用模型，不理解任意任务；不匹配的请求明确失败。用量和延迟是模拟设定。

真实 API：
- 必须主动点击并确认费用与发送内容，不在页面打开时请求。
- API endpoint 必须允许浏览器 CORS。应用不会绕过 CORS 或静默转发到其他服务。
- 密钥默认仅页面内存；“记住”显式写入浏览器本地存储，非加密保险库。
- key / authorization 不进入公开事件或 trace 导出；工作区与 trace 含用户内容，只有主动操作才保存或导出。
- 停止尝试取消请求，不保证已计费调用或已发生效果被撤回。

## 执行边界

虚拟文件系统完全在浏览器中，不读写用户磁盘。教学执行器是受限算术解释器：只支持形如 `export function sum(a, b) { return a + b; }` 的函数，运算符可为 `+ - * /`。它不使用 eval，也不是完整 JavaScript VM。Worker 用于隔离和终止，不宣称通用安全沙箱。

本版没有 Python、通用终端、MCP、多 agent 执行器或上游 coding-agent session 恢复。相关章节明确区分源码机制与本站功能。

## 参照与证据

运行依赖固定为 `@earendil-works/pi-agent-core@1.0.0` 和 `@earendil-works/pi-ai@1.0.0`，公布的 gitHead：`a13d35a742c6ef8462812a28fbe1d8c8b7431c32`。

- [源码与接口证据](evidence/REFERENCE.md)
- [第三方说明](THIRD_PARTY_NOTICES.md)
- `src/lib/runtime.test.ts`：实际 Pi loop 与工具链路。
- `src/lib/transport.test.ts`：协议解析、观测、URL 和授权边界。
- `src/lib/api-lab.test.ts`：两种非流式格式与单次实验。
- `tests/`：实际 Chromium 交互、错误、取消、导出及窄屏验收。

未调用付费模型，真实第三方 provider 的 CORS/兼容性尚未实测，不把模拟测试当作真实模型验证。
