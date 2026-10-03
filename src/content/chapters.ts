export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  body: string[];
  focus: string[];
  checkpoints: string[];
  sources: { label: string; url: string }[];
}

const raw = "https://raw.githubusercontent.com/earendil-works/pi/a13d35a742c6ef8462812a28fbe1d8c8b7431c32";

export const chapters: Chapter[] = [
  {
    id: "overview",
    title: "从模型提议到工具执行",
    subtitle: "一次 read_file 调用：模型提出请求，harness 启动工具。",
    body: [
      "模型先返回一个结构化工具调用：read_file，参数是 /src/sum.js。第一步展示完整助手消息，找出调用的 name、arguments 和 id。",
      "harness 收到消息后开始处理 read_file 请求。第二步的 tool_execution_start 记录了这一步和 toolCallId。随后 harness 查找实现、检查参数，再调用工具读取文件。",
      "工具从本站虚拟 FS 读取文件并返回内容。第三步展示返回值；后续章节会说明它如何进入下一轮请求。模型回复由教学 provider 编排，Pi harness 与文件工具实际运行。"
    ],
    focus: ["provider", "harness", "tools"],
    checkpoints: ["哪一步只是提出调用，哪一步开始读取文件？", "找出贯穿调用与结果的 toolCallId。", "这次工具读取的是浏览器虚拟 FS 还是用户磁盘？"],
    sources: [
      { label: "Pi agent-loop.ts：主循环与工具批次", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi agent.ts：状态与生命周期封装", url: `${raw}/packages/agent/src/agent.ts` },
      { label: "Pi coding-agent agent-session.ts：会话层", url: `${raw}/packages/coding-agent/src/core/agent-session.ts` }
    ]
  },
  {
    id: "context",
    title: "本轮模型看见什么",
    subtitle: "历史消息经过转换，才成为发送给模型的请求内容。",
    body: [
      "修复 sum.js 前，harness 可能把 system 指令、用户要求、先前助手消息、工具调用和工具结果放进 transcript。Pi agent-loop 在每次请求前依次运行可选的 transformContext、convertToLlm 和 normalizeContext，再把转换后的消息交给 StreamFn。自定义 UI 消息可以被过滤或转换。",
      "工具有两种身份：AgentContext.tools 保存可执行实现；transcript system message 中的 toolsAdded/toolsRemoved 记录发给模型的工具接口。declareToolChanges 比较两者，并在消息历史中记录声明变化。Provider adapter 随后把归一化 transcript 序列化为 API 请求。session 文件保存会话记录，Agent.state.messages 保存当前消息，转换步骤生成模型输入，adapter 再生成 HTTP body。",
      "transformContext 是可配置钩子，代码注释以裁剪旧消息为例。agent-core 没有内置自动裁剪、摘要或 compaction。Pi coding-agent 在更上层实现会话与上下文策略，触发条件和持久化逻辑需检查对应代码。"
    ],
    focus: ["context", "provider", "harness", "session"],
    checkpoints: ["按顺序说出 transformContext、convertToLlm、provider adapter。", "区分模型可见工具声明与 harness 可执行工具。", "state.messages 经过哪些步骤才成为 HTTP body？"],
    sources: [
      { label: "Pi agent-loop.ts：请求边界", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi types.ts：AgentMessage、AgentContext 与钩子契约", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi transcript.ts：system transcript 与工具声明变更", url: `${raw}/packages/ai/src/utils/transcript.ts` },
      { label: "Pi OpenAI Responses adapter：消息转换", url: `${raw}/packages/ai/src/api/openai-responses-shared.ts` }
    ]
  },
  {
    id: "streaming",
    title: "Streaming：从增量事件到完整消息",
    subtitle: "响应字节怎样解析成事件，再组成消息。",
    body: [
      "流式回复以增量到达。Pi agent-core 的 message_start/message_update/message_end 表达统一后的助手消息生命周期；AssistantMessageEvent 还区分 text_delta、thinking_delta、toolcall_delta 等事件。event.partial 表示当前部分消息，最终调用要等消息完成并经过后续处理。",
      "修复示例中的 toolCall arguments 可能还没收齐 JSON。agent-loop 等 provider 流结束、取得最终助手消息后，才筛选 toolCall 并进入执行路径。Responses adapter 会累积 function-call 参数，并等待 output_item.done；终止事件到达时若调用仍有未完成缓冲，adapter 会报错。",
      "SSE 帧按 event/data 格式划分，fetch 每次读取的片段可能包含部分或多个帧。帧数与模型 token 数量没有固定对应关系，图中分别展示读取片段、协议事件和 Pi 事件。若 stopReason=length，本版本会把该助手消息中的工具调用转成错误结果，不执行可能不完整的参数。"
    ],
    focus: ["provider", "parser", "harness", "tools"],
    checkpoints: ["区分原始 provider stream event 与 Pi AssistantMessageEvent。", "工具调用执行前还要完成哪些步骤？", "Pi 收到 length 且消息含工具调用时如何处理？"],
    sources: [
      { label: "Pi types.ts：统一事件和消息类型", url: `${raw}/packages/ai/src/types.ts` },
      { label: "Pi agent-loop.ts：增量事件归并与 length 分支", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi Responses shared：流事件解析与调用终结", url: `${raw}/packages/ai/src/api/openai-responses-shared.ts` },
      { label: "OpenAI Chat Completions streaming events", url: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events" },
      { label: "OpenAI Responses streaming events", url: "https://developers.openai.com/api/reference/resources/responses/streaming-events" }
    ]
  },
  {
    id: "tools",
    title: "Tool lifecycle：请求、校验、执行、回填",
    subtitle: "工具调用沿着校验、执行和回填的控制流运行。",
    body: [
      "助手消息中的工具调用带有 id、name 和 arguments。Pi 根据 name 查找当前可执行工具；找不到时生成 error tool result。找到后可先运行 prepareArguments，再按工具 schema 验证，随后调用 beforeToolCall。拦截、参数无效或工具抛错都会形成错误结果。",
      "执行接口收到 toolCallId、已验证参数、AbortSignal 和可选进度回调。afterToolCall 可以改写结果；最终 tool_execution_end 是 UI/观察事件，toolResult message 才是回填到 transcript 的模型输入，带 toolCallId/toolName/content/isError。模型读取 content，UI 和程序还可以使用 details 中的结构化数据。",
      "本站的 write_file 工具通过已实现的虚拟 FS 修改 sum.js。Pi coding-agent 的 edit.ts 则使用文件操作、路径解析和变更队列。权限策略由接入的 hook 或扩展实现。"
    ],
    focus: ["tools", "harness", "workspace"],
    checkpoints: ["列出工具从模型提议到回填 transcript 的阶段。", "tool_execution_end 和 toolResult message 分别服务谁？", "无效参数是否会触达工具 execute？"],
    sources: [
      { label: "Pi agent-loop.ts：参数准备、校验和执行", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi types.ts：AgentTool / AgentToolResult 契约", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi coding-agent edit.ts：文件编辑工具实现", url: `${raw}/packages/coding-agent/src/core/tools/edit.ts` },
      { label: "OpenAI function calling 指南", url: "https://developers.openai.com/api/docs/guides/function-calling" }
    ]
  },
  {
    id: "loop",
    title: "循环、并发与何时结束",
    subtitle: "一次助手回答构成一个 turn；一次 agent run 可以包含多轮。",
    body: [
      "runLoop 的内层流程会在存在工具调用或待注入 steering message 时继续。每个正常 provider 回答都会成为助手消息；工具批次完成且未要求终止时，系统追加 tool result 并发起下一次请求。没有工具调用和 steering message 时，流程检查 follow-up；finishTurn 可以结束 turn，也可以要求一次 continuation。error/aborted 会直接退出。",
      "Pi 默认并行执行工具批次。每个调用的参数准备和 beforeToolCall 按助手消息中的顺序完成，之后并发执行。tool_execution_end 按完成先后发出，tool result message 则按工具调用原顺序生成。顺序模式会逐个完成准备、执行和收尾。",
      "steering message 在当前助手 turn 的工具执行后注入；follow-up 在 agent 原本将停止时处理。Agent 持有队列、AbortController 和运行态。abort 会发送取消信号，但已完成的文件写入和外部副作用不会因此自动撤销。本站时间轴回退展示当时的文件快照，运行后的工作区保持原状态。"
    ],
    focus: ["harness", "tools", "user", "provider"],
    checkpoints: ["并行任务的结束事件顺序和模型看到结果的顺序有何区别？", "steering 与 follow-up 在何时注入？", "取消后能否假定已经写入的文件会回滚？"],
    sources: [
      { label: "Pi agent-loop.ts：内外循环与调度", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi agent.ts：steering/follow-up 队列与 abort", url: `${raw}/packages/agent/src/agent.ts` },
      { label: "Pi types.ts：并发顺序契约", url: `${raw}/packages/agent/src/types.ts` }
    ]
  },
  {
    id: "workspace-session",
    title: "工作空间与 session：文件和消息状态",
    subtitle: "文件系统、进程和 session 各自保存不同状态。",
    body: [
      "read sum.js 的内容是工具结果；编辑后的 sum.js 属于执行环境状态；用户、助手和工具消息组成对话上下文。它们通过工具调用关联，各自有独立生命周期。重置可视化状态不会逆转已经写入的文件。",
      "固定 Pi revision 的 agent-core 定义 AgentMessage、工具调用和内存态 Agent，核心循环不含 OS workspace 或持久 session manager。上层 coding-agent 定义 read/edit/bash 等工具，并由 SessionManager 将 session entries 追加为 JSONL、按父子 ID 建立分支，再投影成会话上下文。恢复消息历史不会同时恢复进程、外部服务或文件系统快照。",
      "本站保存课程位置、prompt、虚拟文件与非密钥设置，恢复时读取这些数据。运行事件需另行导出。测试 Worker 解析受限算术函数，不执行任意用户程序。"
    ],
    focus: ["workspace", "session", "tools", "context"],
    checkpoints: ["分别指出消息历史、文件内容和进程状态由谁持有。", "恢复 JSONL session 会恢复哪些状态？", "哪些浏览器适配属于本站，哪些来自上游 Pi？"],
    sources: [
      { label: "Pi agent-core types.ts：AgentContext / AgentState", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi coding-agent session-manager.ts：JSONL 条目与上下文投影", url: `${raw}/packages/coding-agent/src/core/session-manager.ts` },
      { label: "Pi coding-agent read.ts：文件读取适配", url: `${raw}/packages/coding-agent/src/core/tools/read.ts` }
    ]
  },
  {
    id: "context-management",
    title: "Context management：保留、裁剪或摘要都有代价",
    subtitle: "agent-core 提供转换 hook；coding-agent 实现 compaction。",
    body: [
      "模型上下文是在每次请求前选择、转换并序列化的输入。transformContext 是 agent-core 的可选转换 hook；convertToLlm 负责过滤和映射消息。实现方可以通过这些扩展点裁剪历史，agent-core 本身不监控 token 阈值，也不自动生成摘要。",
      "Pi coding-agent 单独实现了 compaction：它根据 token 使用估算和配置阈值选择截断点，避开孤立的工具结果，生成摘要并保留一段近期历史；SessionManager 记录 compaction 边界。压缩会删减细节，改变后续模型看到的历史。这是 coding-agent 的功能。",
      "当前实验对照工具结果回填前后的两份请求，观察增加的消息、参数和结果。compaction 的摘要与近期历史如何组合，可查看本章源码。启发式 token 计数应标为估算，usage 表示 provider 返回的用量。"
    ],
    focus: ["context", "session", "harness", "provider"],
    checkpoints: ["transformContext 能做什么？哪些行为需检查其他代码？", "为什么压缩需要保留工具调用与结果的关联？", "区分 token 估算、上次 usage 与 provider 当前返回 usage。"],
    sources: [
      { label: "Pi agent-core types.ts：transformContext 契约", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi coding-agent compaction.ts：压缩策略与估算", url: `${raw}/packages/coding-agent/src/core/compaction/compaction.ts` },
      { label: "Pi coding-agent agent-session.ts：高层 compaction 生命周期", url: `${raw}/packages/coding-agent/src/core/agent-session.ts` },
      { label: "Pi coding-agent session-manager.ts：持久化 compaction entry", url: `${raw}/packages/coding-agent/src/core/session-manager.ts` }
    ]
  },
  {
    id: "failures",
    title: "失败分支：参数、工具与接口错误",
    subtitle: "错误、截断、取消和权限拦截走不同分支。",
    body: [
      "测试暴露 sum.js 的加减法错误后，模型可能返回无效参数、未知工具、运行失败或错误修复。Pi 先验证参数，再调用 execute；验证、beforeToolCall 或执行抛错都会转成 isError tool result，通常会进入下一轮上下文供模型调整。工具拒绝策略由已配置的 hook 或工具实现。",
      "provider 返回 stopReason=error 或 aborted 时，主循环结束；length 表示达到输出限制。此固定版本遇到 length 时，会为消息中的 toolCall 生成失败结果并跳过执行，因为参数可能是截断的 JSON。解析错误和业务测试失败应分别标识。",
      "并行批次中，一个调用失败不会撤销其他调用已产生的副作用；停止信号只影响遵守 signal 的执行路径。浏览器 CORS/网络错误、HTTP 错误响应和 provider SSE 失败事件属于不同层级。本站编排的故障注入和重试轨迹应标为教学情景。"
    ],
    focus: ["harness", "parser", "tools", "provider"],
    checkpoints: ["坏参数在哪里拒绝？工具抛错如何回到对话？", "stopReason=length 时为什么不执行已出现的 tool call？", "哪些失败可以从 API 响应看到，哪些只能看到浏览器网络错误？"],
    sources: [
      { label: "Pi agent-loop.ts：validation、工具错误、截断拒绝", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi types.ts：工具失败和终止原因", url: `${raw}/packages/agent/src/types.ts` },
      { label: "OpenAI Chat Completions create reference", url: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create" },
      { label: "OpenAI Responses create reference", url: "https://developers.openai.com/api/reference/resources/responses/methods/create" }
    ]
  },
  {
    id: "api-lab",
    title: "API 实验室：两种请求和响应格式",
    subtitle: "Chat Completions 与 Responses 使用不同的请求和事件结构。",
    body: [
      "Pi 内部先把上下文整理成统一 transcript；adapter 再转换成各 API 的 wire format。Chat Completions 通常向 POST /chat/completions 发送 messages 数组，工具声明位于 tools；助手工具调用在 assistant.tool_calls 中，参数是 JSON 字符串。工具结果以 role=tool 的消息回传，并用 tool_call_id 对应调用。非流式返回是 completion 的 choices/message；流式则是带 choices[].delta 的 chat.completion.chunk，常以 data: [DONE] 结束。",
      "Responses 向 POST /responses 发送 input（字符串或 items/messages），工具声明也放在 tools。调用以 function_call item 输出，包含 call_id、name、arguments；工具结果是通过 call_id 关联的 function_call_output item。非流式主体含 response id/status/output items；流式使用有类型的事件，如 response.created、response.output_item.added、response.function_call_arguments.delta、response.output_item.done、response.completed。",
      "两种协议都支持 streaming 和工具调用，但字段、结果归属、终止标记和增量事件各不相同。Pi 的两个 adapter 转换消息与工具，并将 provider 事件归一化为 AssistantMessageEvent。官方文档描述服务端协议；本站模拟 transport 直接返回预编排 Response 或 SSE，用来展示 adapter 解析和 harness 行为，不会发起远程 HTTP 调用。",
      "教学 API trace 可依次检查：归一化 transcript → adapter request body → Response status/headers → 原始可读字节/SSE event → JSON/event parser → Pi 统一事件 → 最终消息与工具调用 ID → 工具结果回填 → 下一请求。trace 记录浏览器可读的响应片段和解析结果，API key 始终隐藏；TLS 内部和未公开的模型推理无法获取。实时 BYOK 由用户主动发起；本章只引用文档，不发送收费请求。"
    ],
    focus: ["provider", "parser", "context", "tools", "harness"],
    checkpoints: ["两种协议分别在哪里携带工具结果？关联键是什么？", "Chat stream chunk 与 Responses SSE event 在结构上有什么不同？", "沿请求记录判断当前使用的是本地模拟还是远程 provider。"],
    sources: [
      { label: "Pi OpenAI Completions adapter", url: `${raw}/packages/ai/src/api/openai-completions.ts` },
      { label: "Pi OpenAI Responses adapter", url: `${raw}/packages/ai/src/api/openai-responses.ts` },
      { label: "Pi Responses message / tool wire conversion", url: `${raw}/packages/ai/src/api/openai-responses-shared.ts` },
      { label: "OpenAI Chat Completions create reference", url: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create" },
      { label: "OpenAI Chat Completions streaming events", url: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events" },
      { label: "OpenAI Responses create reference", url: "https://developers.openai.com/api/reference/resources/responses/methods/create" },
      { label: "OpenAI Responses streaming events", url: "https://developers.openai.com/api/reference/resources/responses/streaming-events" }
    ]
  }
];
