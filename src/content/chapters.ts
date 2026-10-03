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
    title: "模型提议，谁来执行？",
    subtitle: "只看一次 read_file：模型返回结构，harness 调用工具。",
    body: [
      "模型先返回一个结构化工具调用：read_file，参数是 /src/sum.js。此时文件还没有被读取。右侧第一步展示这条完整助手消息，找出调用的 name、arguments 和 id。",
      "harness 收到完整消息后，找到 read_file 实现并检查参数，再调度它执行。右侧第二步是实际工具启动事件，带着同一个 toolCallId。这里开始接触执行环境，模型接口没有直接读取文件。",
      "工具从本站虚拟 FS 取得文件内容并返回。第三步展示真实返回值，后续章节再解释它如何进入下一轮请求。本章仅有这三步；模型回复由教学 provider 编排，Pi harness 与文件工具实际运行。"
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
    subtitle: "持有的历史、转换后的上下文、线上请求不是同一个对象。",
    body: [
      "修复 sum.js 前，harness 可能把 system 指令、用户要求、先前助手消息、工具调用和工具结果都放进 transcript。Pi agent-loop 在每次请求前依次应用 transformContext（可选）、convertToLlm，再 normalizeContext；转换后的消息才交给 StreamFn。自定义 UI 消息可以被过滤或转换。",
      "工具有两份不同身份：AgentContext.tools 是可执行实现；transcript system message 中的 toolsAdded/toolsRemoved 是对模型声明的工具接口。declareToolChanges 比较二者，在消息历史里记录声明变化。Provider adapter 再把归一化 transcript 序列化为某个 API 的请求格式。因此不要把 session 文件、Agent.state.messages、transform 后的消息、HTTP body 画成同一个共享列表。",
      "transformContext 只是可配置钩子，代码注释给了裁剪旧消息示例，不代表 agent-core 自带自动裁剪、摘要或 compaction。Pi coding-agent 的会话/上下文策略属于更上层，具体触发和持久化应沿那一层单独核对。"
    ],
    focus: ["context", "provider", "harness", "session"],
    checkpoints: ["按顺序说出 transformContext、convertToLlm、provider adapter。", "区分模型可见工具声明与 harness 可执行工具。", "为什么看到 state.messages 不足以证明请求 body 一模一样？"],
    sources: [
      { label: "Pi agent-loop.ts：请求边界", url: `${raw}/packages/agent/src/agent-loop.ts` },
      { label: "Pi types.ts：AgentMessage、AgentContext 与钩子契约", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi transcript.ts：system transcript 与工具声明变更", url: `${raw}/packages/ai/src/utils/transcript.ts` },
      { label: "Pi OpenAI Responses adapter：消息转换", url: `${raw}/packages/ai/src/api/openai-responses-shared.ts` }
    ]
  },
  {
    id: "streaming",
    title: "Streaming：增量数据，不是可执行半成品",
    subtitle: "provider 字节、协议事件、Pi 事件、完整消息有不同边界。",
    body: [
      "流式回复先到的是增量。Pi agent-core 的 message_start/message_update/message_end 表达统一后的助手消息生命周期；内部 AssistantMessageEvent 还可区分 text_delta、thinking_delta、toolcall_delta 等。event.partial 是当时的部分消息，不应误当成已校验、可执行的最终调用。",
      "以修复示例为例：toolCall 的 arguments 在流期间可能尚未收齐 JSON。agent-loop 等 provider 流结束并取得最终助手消息后，才筛选其 toolCall 内容并进入执行路径。Responses adapter 也会累积 function-call 参数，并要求 output_item.done 完成；若终止事件到达时调用仍有未完成缓冲，它报错而不把半截调用交给 harness。",
      "协议帧边界不是网络 packet，也不保证一帧对应一个模型 token。展示 fetch 可读块、SSE event/data 和 Pi 归一化事件时，分层标注来源。截断（stopReason=length）尤其危险：本版本会把该助手消息中的工具调用全部变成错误结果，不执行可能不完整的参数。"
    ],
    focus: ["provider", "parser", "harness", "tools"],
    checkpoints: ["区分原始 provider stream event 与 Pi AssistantMessageEvent。", "为什么不可收到一段看似合法的 JSON 就直接执行？", "Pi 收到 length 且消息含工具调用时如何处理？"],
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
    subtitle: "工具调用是一条带身份和检查点的控制流，不是一段代码文本。",
    body: [
      "助手消息中的工具调用带 id、name、arguments。Pi 根据 name 查找当前可执行工具，找不到就生成 error tool result；找到后可先 prepareArguments，再按工具 schema 验证，随后调用 beforeToolCall。被阻止、参数无效、工具抛错都形成错误结果，而不是把无效调用默默当成功。",
      "执行接口收到 toolCallId、已验证参数、AbortSignal 和可选进度回调。afterToolCall 可以改写结果；最终 tool_execution_end 是 UI/观察事件，toolResult message 才是回填到 transcript 的模型输入，带 toolCallId/toolName/content/isError。结构化 details 供 UI 或程序使用，不等价于发给模型的 content。",
      "sum.js 场景的 edit 工具究竟改了哪个文件、如何落盘，是执行环境适配器负责的事实。Pi coding-agent 的 edit.ts 使用文件操作、路径解析和变更队列；本站可能采用隔离的虚拟 FS，不能把它描述成上游 core 或真实 OS 文件操作。权限策略也应显示为实际接入的 hook/扩展，而非模型自动拥有或自动拒绝的能力。"
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
    subtitle: "一次助手回答是 turn；agent run 可以包含多轮。",
    body: [
      "runLoop 的内层流程在有工具调用或待注入 steering message 时继续。每个正常 provider 回答会成为助手消息；若工具批次没有要求终止，tool result 被追加后会开启下一次请求。无工具且无 steering 时会检查 follow-up；finishTurn 可结束，也可要求一次后续 continuation。error/aborted 是硬退出分支。",
      "Pi 默认工具批次并行，但每个调用的参数准备与 beforeToolCall 先按助手原始顺序完成；可执行的任务随后并发。tool_execution_end 按执行完成先后发出，tool result message 按助手消息中的工具调用顺序生成。顺序模式则逐一准备、执行、收尾。不要把屏幕上事件到达顺序误画成结果消息顺序。",
      "steering 在当前助手 turn 的工具执行之后注入，不会跳过该助手已经请求的工具；follow-up 在 agent 原本将停止时处理。Agent 持有队列、AbortController 和运行态，abort 是取消信号，不承诺撤销已完成的文件写入或外部副作用。本站的时间轴回退应恢复教学快照，不声称撤消真实操作。"
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
    title: "工作空间与 session：运行环境不等于对话",
    subtitle: "文件系统、进程和可恢复的 session 是不同资源。",
    body: [
      "read sum.js 得到的内容是一次工具结果；编辑后的 sum.js 是执行环境状态；用户/助手/工具消息组成对话上下文。三者有关联但不共享同一生命周期。重置可视化状态不会自动逆转已发生的文件写入。",
      "固定 Pi revision 的 agent-core 定义 AgentMessage、工具调用和内存态 Agent；其核心循环没有内建 OS workspace 或持久 session manager。上层 coding-agent 才定义 read/edit/bash 等工具，并在 SessionManager 中把 session entries 追加为 JSONL、按父子 ID 形成分支、投影成会话上下文。恢复 session 的消息历史不等于恢复当时进程、外部服务或文件系统快照。",
      "本站的浏览器虚拟 FS、测试 Worker，以及学习进度保存属于教学实现，不是 Pi 上游行为。若课程模拟“恢复”，应说明保存了哪些对象以及哪些状态未保存；运行任意用户代码也不能仅凭‘在 Worker 里’就宣称是通用安全沙箱。"
    ],
    focus: ["workspace", "session", "tools", "context"],
    checkpoints: ["分别指出消息历史、文件内容和进程状态由谁持有。", "JSONL session 能证明磁盘文件已回滚吗？", "哪些浏览器适配属于本站而非上游 Pi？"],
    sources: [
      { label: "Pi agent-core types.ts：AgentContext / AgentState", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi coding-agent session-manager.ts：JSONL 条目与上下文投影", url: `${raw}/packages/coding-agent/src/core/session-manager.ts` },
      { label: "Pi coding-agent read.ts：文件读取适配", url: `${raw}/packages/coding-agent/src/core/tools/read.ts` }
    ]
  },
  {
    id: "context-management",
    title: "Context management：保留、裁剪或摘要都有代价",
    subtitle: "有 hook 不代表有内置压缩；摘要也不是无损历史。",
    body: [
      "模型上下文是每次请求前选择、转换并序列化的输入，不必等于完整 session。transformContext 是 agent-core 的可选转换 hook；convertToLlm 还负责过滤/映射消息。代码提供了实现方裁剪历史的扩展点，却不证明 core 会监控 token 阈值或自行生成摘要。",
      "Pi coding-agent 有独立的 compaction 实现：根据 token 使用估算与配置阈值准备截断点，避开孤立的工具结果，再生成摘要并保留一段近期历史；SessionManager 记录 compaction 边界。这会压缩细节并改变后续模型看到的历史。它属于 coding-agent 的功能，不能倒推为 agent-core 默认行为。",
      "sum.js 实验可对照“完整工具轨迹”与“只留文件结论/测试摘要”的上下文，标出被删去的失败信息和调用参数。课程演示的 token 计数若用启发式应注明估算；模型报告 usage 才是 provider 返回的用量，二者不可混写。"
    ],
    focus: ["context", "session", "harness", "provider"],
    checkpoints: ["transformContext 存在能证明哪些事，不能证明哪些事？", "为什么压缩需要保留工具调用与结果的关联？", "区分 token 估算、上次 usage 与 provider 当前返回 usage。"],
    sources: [
      { label: "Pi agent-core types.ts：transformContext 契约", url: `${raw}/packages/agent/src/types.ts` },
      { label: "Pi coding-agent compaction.ts：压缩策略与估算", url: `${raw}/packages/coding-agent/src/core/compaction/compaction.ts` },
      { label: "Pi coding-agent agent-session.ts：高层 compaction 生命周期", url: `${raw}/packages/coding-agent/src/core/agent-session.ts` },
      { label: "Pi coding-agent session-manager.ts：持久化 compaction entry", url: `${raw}/packages/coding-agent/src/core/session-manager.ts` }
    ]
  },
  {
    id: "failures",
    title: "失败分支：把错误送回正确的边界",
    subtitle: "错误、截断、取消和权限阻止不是一种状态。",
    body: [
      "让测试暴露 sum.js 的加减法错误后，模型可能返回无效参数、未知工具、工具运行失败或错误的修复。Pi 在参数验证前不会调用 execute；验证、beforeToolCall 或执行抛错会转成 isError tool result，通常仍可作为下一轮上下文，让模型据此调整。工具拒绝策略来自已配置的 hook/工具，而非通用 harness 自动生成的权限体系。",
      "provider 的 stopReason=error 或 aborted 会使主循环结束；length 表示达到输出限制。此固定版本在 length 回复里即便解析出 toolCall，也会对调用生成失败结果、不执行它们，因为看似完整的参数也可能来自被截断的 JSON。解析错误与业务测试失败应分开标识。",
      "并行批次中某一调用失败不会自动代表其他副作用已经撤销；停止信号也只影响尊重 signal 的执行路径。浏览器 CORS/网络错误、HTTP 错误响应和 provider SSE 中的失败事件属于不同层级。故障注入和重试轨迹若由本站编排，标为教学情景，并避免伪装成实际 API 请求。"
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
    title: "API 实验室：协议不同，语义映射也不同",
    subtitle: "Chat Completions 与 Responses 不是只差一个 URL。",
    body: [
      "Pi 内部先把上下文整理成统一 transcript；adapter 再转换成各 API 的 wire format。Chat Completions 通常向 POST /chat/completions 发送 messages 数组，工具声明位于 tools；助手工具调用在 assistant.tool_calls 中，参数是 JSON 字符串。工具结果以 role=tool 的消息回传，并用 tool_call_id 对应调用。非流式返回是 completion 的 choices/message；流式则是带 choices[].delta 的 chat.completion.chunk，常以 data: [DONE] 结束。",
      "Responses 向 POST /responses 发送 input（字符串或 items/messages），工具声明也放 tools，但调用输出是 function_call item，使用 call_id、name、arguments；工具结果是 function_call_output item，以 call_id 关联。非流式主体含 response id/status/output items；流式使用有类型的事件，如 response.created、response.output_item.added、response.function_call_arguments.delta、response.output_item.done、response.completed。不要把它压平成 Chat Completions 的 delta/message 结构。",
      "两种协议都可能支持 streaming 和工具调用，但字段、结果归属、终止标记、增量事件不同。Pi 的两个 adapter 都做消息/工具转换并把 provider 事件归一化成 AssistantMessageEvent。官方文档描述的是服务端协议；本站模拟 transport 若直接返回预编排 Response 或 SSE，仅展示 adapter 的解析与 harness 行为，必须注明没有远程 HTTP 调用。",
      "教学 API trace 应依次可检查：归一化 transcript → adapter request body → Response status/headers → 原始可读字节/SSE event → JSON/event parser → Pi 统一事件 → 最终消息与工具调用 ID → 工具结果回填 → 下一请求。浏览器可见的读取块不是网络 packet；API key、TLS 内部和未公开推理不属于可观察数据。实时 BYOK 应由用户主动发起；本章引用文档而不发送收费请求。"
    ],
    focus: ["provider", "parser", "context", "tools", "harness"],
    checkpoints: ["两种协议分别在哪里携带工具结果？关联键是什么？", "Chat stream chunk 与 Responses SSE event 在结构上有什么不同？", "本地模拟 Response 能否证明访问过 OpenAI？为什么？"],
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
