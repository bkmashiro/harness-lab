import type { LearningModule } from '../lib/learning';

const piRevision = 'https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/agent/src/agent-loop.ts';

export const firstModule: LearningModule = {
  id: 'first-module',
  title: '从模型提议到工具执行',
  description: '跟踪一次 read_file 调用：模型提出工具请求，harness 查找并校验工具，工具结果再带着原调用 ID 回到消息历史。',
  prerequisites: [
    '会阅读简单的 JavaScript 对象和 JSON。',
    '知道函数可以接收参数并返回结果；不需要了解模型 API 或 agent 框架。',
  ],
  objectives: [
    '从助手消息中找出工具调用的 id、name 和 arguments，并说清它们各自的用途。',
    '按顺序说明 harness 如何查找工具、校验参数、执行工具并处理结果。',
    '用 toolCallId 将工具结果关联回请求，并解释它怎样进入下一次模型请求。',
  ],
  units: [
    {
      id: 'introduction',
      title: '工具调用的完整过程',
      goal: '建立模型提议、harness 调度、工具执行、结果回填的路线图。',
      focus: ['provider', 'harness', 'tools'],
      blocks: [
        { kind: 'paragraph', text: '假设用户问：“请读一下 /src/sum.js。”模型可以提出调用 read_file，并给出路径。此时文件还没有被读取：模型只产出了一个结构化请求。Harness 是接收请求并运行程序的那一层；它负责决定是否存在这个工具、参数是否合格，以及何时调用实现。' },
        { kind: 'fields', items: [
          { name: '模型', meaning: '根据对话提出下一步行动；在这次例子里，它生成 read_file 调用。', example: 'name: read_file' },
          { name: 'harness', meaning: '应用内的控制程序；它把模型的工具请求交给已注册的实现。', example: '在工具表中查找 read_file' },
          { name: '工具实现', meaning: '真正执行文件读取的函数；它接收通过校验的路径并返回内容或错误。', example: '读取课程演示环境里的 /src/sum.js' },
        ] },
        { kind: 'paragraph', text: '把四步连起来看：模型提出请求 → harness 查找和校验 → 工具执行 → harness 把结果加入历史。随后 harness 才能用更新后的历史发起下一次模型请求。这个次序让模型能根据真实工具结果继续回答。' },
      ],
    },
    {
      id: 'proposal',
      title: '读取模型的工具提议',
      goal: '辨认调用标识、工具名与参数，并理解调用提议还没有触发工具。',
      focus: ['provider', 'harness', 'tools'],
      blocks: [
        { kind: 'paragraph', text: '助手消息可以包含文字和 toolCall。下面的 JSON 展示 Pi 解析后的调用对象。课程用预设模型响应生成 read_file 提议，Pi 随后在浏览器中检查参数并执行工具。' },
        { kind: 'code', language: 'json', code: '{\n  "type": "toolCall",\n  "id": "call_read_01",\n  "name": "read_file",\n  "arguments": { "path": "/src/sum.js" }\n}', caption: '教学示例：call_read_01 用于说明字段关系，右侧显示本次运行生成的调用 ID。' },
        { kind: 'fields', items: [
          { name: 'id', meaning: '这次调用的唯一标识。工具执行事件和回填结果会沿用它，方便 harness 知道结果属于哪次请求。', example: 'call_read_01' },
          { name: 'name', meaning: '要运行的工具名；harness 用它在当前注册工具中查找实现。', example: 'read_file' },
          { name: 'arguments', meaning: '工具参数对象。harness 会先按 read_file 的参数 schema 检查它，再将合格参数交给工具。', example: '{ "path": "/src/sum.js" }' },
        ] },
        { kind: 'callout', title: '现在发生了什么', text: '模型已经请求读取 /src/sum.js，但磁盘或演示文件系统尚未因这条 JSON 自动改变，也没有读取结果。执行要等 harness 找到 read_file、校验 path 并调用其 execute 函数。' },
      ],
    },
    {
      id: 'dispatch',
      title: 'Harness 查找、校验，再执行',
      goal: '按源码中的实际顺序说明工具查找与 schema 校验，以及失败如何阻止执行。',
      focus: ['harness', 'tools', 'workspace'],
      blocks: [
        { kind: 'paragraph', text: 'Harness 把当前可执行工具放在 registry（注册表）里。Pi 在当前 context.tools 中按 name 查找；查不到就立即形成错误结果。找到 read_file 后，Pi 先运行可选的参数预处理，再用该工具的 schema 校验调用。只有准备结果通过后，控制流才会进入执行函数。' },
        { kind: 'code', language: 'typescript', code: 'const tool = tools.find((t) => t.name === toolCall.name);\nif (!tool) {\n\treturn {\n\t\tkind: "immediate",\n\t\tresult: createErrorToolResult(`Tool ${toolCall.name} not found`),\n\t\tisError: true,\n\t};\n}\n\ntry {\n\tconst preparedToolCall = prepareToolCallArguments(tool, toolCall);\n\tconst validatedArgs = validateToolArguments(tool, preparedToolCall);', caption: 'Pi agent-loop.ts 连续源码 12 行，去掉公共缩进（第 715–726 行）：先按名称查找，再预处理参数并校验；本片段尚未到工具执行行。', source: { label: 'Pi agent-loop.ts（固定 revision，行 715–726）', url: `${piRevision}#L715-L726` } },
        {kind:'callout',title:'观察事件与函数调用',text:'右侧的 tool_execution_start 表示 harness 开始处理这次请求。随后才查找工具并检查参数；通过检查后才调用 execute。参数失败也会产生 start/end 事件，错误结果说明了失败发生在哪一步。'},
        { kind: 'paragraph', text: '本课 read_file 的 schema 要求 path 是非空字符串，所以三种情况落在不同位置。/src/sum.js 是合格路径且文件存在，校验后执行并返回内容。/src/missing.js 仍是合格字符串，校验通过；工具运行时发现文件不存在，于是返回 tool error。空字符串不符合本课 schema，校验就失败，execute 不会读取任何路径。' },
        { kind: 'callout', title: '用错误发生的位置判断类型', text: '参数错误发生在 schema 校验处，工具没有开始读取文件。文件不存在发生在 read_file 已经执行之后。两者都可以回到模型历史成为错误结果，但修复方式不同：前者要改参数，后者要改路径或处理缺失文件。' },
      ],
    },
    {
      id: 'result',
      title: '结果带着原 ID 回到消息历史',
      goal: '跟踪 execute 收到的调用 ID、toolResult 的关联字段和下一次请求。',
      focus: ['tools', 'harness', 'context', 'provider'],
      blocks: [
        { kind: 'paragraph', text: '通过 schema 的调用进入 execute 时，Pi 把 toolCall.id 作为第一个参数传给工具。工具返回后，harness 产生 tool_execution_end 观察事件，再创建 role 为 toolResult 的消息。事件与消息都沿用原调用的 toolCallId，harness 通过这个字段关联请求和结果。' },
        { kind: 'code', language: 'typescript', code: 'const result = await prepared.tool.execute(\n\tprepared.toolCall.id,\n\tprepared.args as never,\n\tsignal,\n\t(partialResult) => {\n\t\tif (!acceptingUpdates) return;\n\t\tupdateEvents.push(Promise.resolve(onUpdate(partialResult)));\n\t},\n);\nacceptingUpdates = false;\nawait Promise.all(updateEvents);\nreturn { result, isError: result.isError === true };', caption: 'Pi agent-loop.ts 连续源码 12 行，去掉公共缩进（第 829–840 行）：调用 ID 作为 execute 首参传入；执行结果再被标记为成功或错误。', source: { label: 'Pi agent-loop.ts（固定 revision，行 829–840）', url: `${piRevision}#L829-L840` } },
        {kind:'paragraph',text:'这段代码中的 prepared.args 保存校验后的参数，as never 是 TypeScript 类型断言，运行时直接传入参数值。signal 传递取消通知，回调用于接收工具执行中的进度更新。这里关注第一个参数：原调用 ID 一直传到工具实现。'},
        { kind: 'fields', items: [
          { name: 'role', meaning: '标明这条历史消息是工具结果，便于下一次请求按消息类型处理。', example: 'toolResult' },
          { name: 'toolCallId', meaning: '指回助手提出的那次调用；这里仍是 call_read_01。', example: 'call_read_01' },
          { name: 'toolName', meaning: '记录产生结果的工具名，便于读取来源。', example: 'read_file' },
          { name: 'content / isError', meaning: 'content 放模型可读的结果文本；isError 标出这次工具是否失败。缺失文件与 schema 错误可分别写入不同错误内容。', example: '成功时为文件文本；失败时为错误说明 / true' },
        ] },
        { kind: 'code', language: 'typescript', code: 'function createToolResultMessage(finalized: FinalizedToolCallOutcome): ToolResultMessage {\n\treturn {\n\t\trole: "toolResult",\n\t\ttoolCallId: finalized.toolCall.id,\n\t\ttoolName: finalized.toolCall.name,\n\t\t// Untyped tools (JS extensions) can return results without content; normalize\n\t\t// so the null never enters session history or provider payloads.\n\t\tcontent: finalized.result.content ?? [],\n\t\tdetails: finalized.result.details,\n\t\tusage: finalized.result.usage,\n\t\tisError: finalized.isError,\n\t\ttimestamp: Date.now(),\n\t};\n}', caption: 'Pi agent-loop.ts 连续源码 14 行（第 922–935 行）：工具结果消息从原调用取回 id，写入 toolCallId。', source: { label: 'Pi agent-loop.ts（固定 revision，行 922–935）', url: `${piRevision}#L922-L935` } },
        { kind: 'paragraph', text: 'Pi 将 toolResult 消息追加到当前消息历史，再继续循环时用这份历史构造下一次模型输入。于是模型看到的不只是“曾经发出调用”，还看到 call_read_01 的结果。如果模型同时提出多次调用，每个结果用自己的 toolCallId 对应请求；本课只追踪一个调用，关联规则相同。' },
      ],
    },
    {
      id: 'exercise',
      title: '改路径，先预测再检查',
      goal: '用三个具体输入区分 schema 拒绝和工具执行错误。',
      focus: ['harness', 'tools', 'workspace'],
      blocks: [
        { kind: 'paragraph', text: '先在交互练习中把 arguments.path 从 /src/sum.js 改成下面一个值。在点击运行前，先预测：会返回文件文本、出现 schema error，还是出现 tool error？然后提交并查看 Pi harness 的参数校验和工具结果。' },
        { kind: 'fields', items: [
          { name: '路径 A', meaning: '有效路径，演示文件存在；预期校验通过并读到文件。', example: '/src/sum.js' },
          { name: '路径 B', meaning: '有效字符串，但演示文件系统里没有这个文件；预期校验通过，执行时返回 tool error。', example: '/src/missing.js' },
          { name: '路径 C', meaning: '空字符串不满足本课非空 path schema；预期出现 schema error，工具 execute 不会运行。', example: '""' },
        ] },
        { kind: 'callout', title: '按执行阶段核对预测', text: '先看 schema validation 是否通过，再看 read_file 是否被调用，最后读结果的 isError 和错误说明。路径 B 的错误表示工具执行时未找到文件；路径 C 的错误表示工具尚未开始。练习使用本站演示文件，不依赖付费 API 或实时模型。' },
      ],
    },
    {
      id: 'assessment',
      title: '测验与总结',
      goal: '用调用字段、错误发生阶段和结果关联键检验理解。',
      focus: ['harness', 'tools', 'context'],
      blocks: [
        { kind: 'paragraph', text: '完成测验时，把每题放回调用流程中判断。先认出消息里的 name 和 arguments，再确定当前处理阶段，最后用 ID 追踪返回结果。每题提交后都会说明原因并提示复习单元。' },
        { kind: 'callout', title: '检查标准', text: '能够指出工具请求从哪里来、谁调用工具实现、哪种错误发生在执行前或执行后，以及结果如何回到下一次请求，就掌握了这一模块的核心路线。' },
      ],
    },
  ],
  questions: [
    {
      id: 'proposal-fields',
      prompt: '助手提出 read_file 调用后，哪个字段让 harness 知道要查找哪一个已注册工具？',
      choices: [
        { id: 'a', text: 'id，因为它就是注册表里的工具名称。' },
        { id: 'b', text: 'name，因为 harness 按工具名查找实现。' },
        { id: 'c', text: 'arguments，因为路径同时决定工具名称。' },
      ],
      answer: 'b',
      explanation: 'name 是 read_file，Pi 用它在当前工具列表里找实现。id 标识这一次调用，arguments.path 告诉工具要读哪个路径。',
      reviewUnit: 'proposal',
    },
    {
      id: 'schema-or-tool-error',
      prompt: '本课 schema 要求 path 为非空字符串。把路径设为 /src/missing.js 后，最准确的预期是什么？',
      choices: [
        { id: 'a', text: 'schema 会拒绝，因为文件不存在。' },
        { id: 'b', text: '校验通过；read_file 执行后报告文件不存在，形成 tool error。' },
        { id: 'c', text: '工具不会执行，也不会产生结果消息。' },
      ],
      answer: 'b',
      explanation: '/src/missing.js 是符合类型和非空条件的字符串。Schema 不检查文件系统；工具开始读取后才发现文件不存在，并将失败作为工具结果回报。空字符串才会在本课 schema 校验阶段被拒绝。',
      reviewUnit: 'dispatch',
    },
    {
      id: 'result-link',
      prompt: '工具返回文件文本后，哪一个值把 toolResult 关联到助手之前提出的那次调用？',
      choices: [
        { id: 'a', text: 'toolCallId，值沿用助手 toolCall 的 id。' },
        { id: 'b', text: 'path，因为它在调用参数中唯一。' },
        { id: 'c', text: 'content，因为结果文本包含文件内容。' },
        { id: 'd', text: 'toolName，因为每次工具执行只会有一个调用。' },
      ],
      answer: 'a',
      explanation: 'Harness 在 execute 时传入原调用 ID，并把它写入 toolResult.toolCallId。路径、工具名和结果文本描述调用内容，不能替代这条显式关联。',
      reviewUnit: 'result',
    },
  ],
  summary: [
    '助手消息提出 toolCall：id 标识调用，name 选择工具，arguments 提供参数。',
    'Harness 用 name 查找注册实现，按 schema 校验参数；校验失败时不会调用工具。',
    '合格参数进入 execute；文件不存在等运行失败作为 tool error 返回。',
    'Harness 把结果以 toolCallId 关联回消息历史，再用于下一次模型请求。',
  ],
};
