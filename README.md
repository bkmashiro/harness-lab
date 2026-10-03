# Harness Lab

一个纯静态、中文的 Agent harness 交互学习工作台。课程采用视口内双列布局：左侧讲当前机制并显示局部图解，右侧切换数据、虚拟 FS、事件和源码。章节通过顶部选择器切换，没有常驻目录。每章从同一份真实运行中选取相应事件，完整 trace 只在主动打开实验视图后展示。

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

## Cloudflare Pages

在 Pages 中选择静态站构建：
- 构建命令：`npm run build`
- 输出目录：`dist`
- Node.js：22.19 或更新版本
- 无 Pages Functions、无后台代理、无服务器密钥环境变量。

模型设置由访问者在浏览器填写。本站章节切换没有客户端 URL 路由，不需要自定义重写规则。尚未执行 CF Pages 部署；部署后的第三方 API CORS 需使用实际 Pages origin 验证。

## 可以学习什么

- 第一章只看一次 `read_file`：模型提出调用、harness 调度、工具返回，共三个真实步骤。
- 后续章节分别聚焦请求转换、流式解析、单次工具生命周期、循环边界和文件快照。完整修复流程仍保留在可主动开启的实验视图中。
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
