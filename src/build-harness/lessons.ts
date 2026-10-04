import type { BuilderLesson } from './contracts';

/* Every example below is a classic-worker script: no module imports or exports. */
const common = `
const textOf = (r) => r?.content ?? r?.details?.text ?? JSON.stringify(r);
const toolByName = (ctx, name) => ctx.tools.find((t) => t.name === name);
const parseArgs = (raw) => typeof raw === 'string' ? JSON.parse(raw) : raw;
const check = (tool, args) => {
  if (!tool) throw new Error('unknown tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  const schema = tool.parameters ?? {};
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(args, key)) throw new Error('missing required field: ' + key);
  }
  for (const [key, rule] of Object.entries(schema.properties ?? {})) {
    if (!Object.hasOwn(args, key)) continue;
    const value = args[key];
    if (rule.type === 'string' && typeof value !== 'string') throw new Error(key + ' must be string');
    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(key + ' must be number');
    if (rule.type === 'boolean' && typeof value !== 'boolean') throw new Error(key + ' must be boolean');
    if (typeof value === 'string' && rule.minLength != null && value.length < rule.minLength) throw new Error(key + ' is too short');
    if (typeof value === 'string' && rule.maxLength != null && value.length > rule.maxLength) throw new Error(key + ' is too long');
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) if (!Object.hasOwn(schema.properties ?? {}, key)) throw new Error('unknown field: ' + key);
  }
  return args;
};
const executeCall = async (ctx, call) => {
  const tool = toolByName(ctx, call.name);
  const args = check(tool, parseArgs(call.arguments));
  const result = await tool.execute(args, { signal: ctx.signal });
  return { role: 'tool', toolCallId: call.id, name: call.name, content: textOf(result), isError: !!result?.isError };
};
const toolSpecs = (ctx) => ctx.tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
const repaired = (ctx) => Object.values(ctx.files).some((s) => /return\\s+a\\s*\\+\\s*b/.test(s));
`;
const registry = `
const registry = [
 { name:'read_file', description:'Read a project file', parameters:{type:'object',properties:{path:{type:'string',minLength:1,maxLength:200}},required:['path']}, execute:async ({path})=>({content:ctx.files[path] ?? 'missing'}) },
 { name:'write_file', description:'Replace a project file', parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']}, execute:async ({path,content})=>{ctx.files[path]=content;return {content:'written'}} },
 { name:'run_tests', description:'Run actual fixture tests', parameters:{type:'object',properties:{path:{type:'string'}},required:[]}, execute:async ({path='/src/sum.js'})=>({content:(await toolByName(ctx,'run_tests').execute({path},{signal:ctx.signal})).content}) }
];
`;
const loop = (max = 8) => `
const maxTurns = ${max};
for (let turn=0; turn<maxTurns; turn++) {
  if (ctx.signal?.aborted) return {messages, status:'cancelled'};
  const reply = await ctx.provider({messages, tools:toolSpecs(ctx), signal:ctx.signal});
  messages.push(reply);
  if (!reply.toolCalls?.length) return {messages, final:reply.content, status:'completed'};
  for (const call of reply.toolCalls) messages.push(await executeCall(ctx, call));
}
return {messages, status:'turn_limit'};
`;

export const builderLessons: BuilderLesson[] = [
{
 id:'messages', title:'第1章：把请求表示成消息', goal:'建立消息数组，并明确 user 与 assistant 的职责。',
 objectives:['按约定创建 user 消息','观察提交给模型的输入','区分消息历史与文件系统'],
 blocks:[
  {kind:'text',text:'Harness 组织模型请求、工具执行和多轮状态。本章先创建 messages：按时间排列的对象数组，每条 user 消息包含 role 和 content。浏览器编辑器使用普通 JavaScript 脚本，入口是 async function main(ctx)；下载的 Node 参考代码使用 .mjs 模块。'},
  {kind:'code',language:'javascript',title:'一条请求',text:"const messages = [{ role: 'user', content: '修复 /src/sum.js 中的减法错误。' }];"},
  {kind:'text',text:'输入状态从 [] 变为 [{role:"user",content:...}]。role 告诉下一步组件谁说了这句话；content 是本例的普通文本。下一章会调用 provider，把返回的 assistant 消息追加到这个数组。'},
  {kind:'code',language:'javascript',title:'本章可运行参考',text:"async function main(ctx) {\n  const messages = [{ role: 'user', content: ctx.prompt }];\n  ctx.emit('messages', { count: messages.length, firstRole: messages[0].role });\n  return { messages, status: 'ready' };\n}"},
  {kind:'text',text:'把 messages 留在 main 的局部变量里，可以清楚看出一次运行的边界。下面的 user→assistant→tool 记录会在后续章节逐步加入；本章先观察消息初始化，下一章再调用 provider。'},
 ],
 task:'starter 的 TODO 中创建一条 user 消息，content 使用 ctx.prompt；通过 emit 记录 count 与首条 role，再返回 messages。检查返回值只有一条 user 消息。',
 starter:"async function main(ctx) {\n  // TODO: create messages from ctx.prompt\n  const messages = [];\n  // TODO: emit message count and role\n  return { messages, status: 'ready' };\n}",
 solution:"async function main(ctx) {\n  const messages = [{ role: 'user', content: ctx.prompt }];\n  ctx.emit('messages', { count: messages.length, firstRole: messages[0].role });\n  return { messages, status: 'ready' };\n}",
 checks:[{id:'messages-user',label:'提交一条 user 消息'}],review:['为什么创建 user 消息不会修改 ctx.files？','若把 role 写成 assistant，调用记录表达的事实会怎样变化？']
},
{
 id:'provider', title:'第2章：调用模型并保存回答', goal:'把消息交给 provider，检查模型回答，并追加到历史。',
 objectives:['调用异步 provider','保存 assistant 响应','解释 await 对后续步骤的影响'],
 blocks:[
  {kind:'text',text:'provider 是宿主提供的模型调用函数，本实验用受控实现模拟返回值。它接收 messages、tools 和 signal，返回 assistant 对象。await 会等待 Promise 完成，因此后续检查看到的是已解析的 assistant，而不是尚未完成的任务。'},
  {kind:'code',language:'javascript',text:"const reply = await ctx.provider({ messages, tools: [], signal: ctx.signal });\nmessages.push(reply);"},
  {kind:'text',text:'调用前 messages 长度为 1；provider 返回后追加一条 assistant，长度变为 2。回答的 content 可能是文本；若模型请求工具，后续章节使用 toolCalls 字段。后面的工具执行和测试章节会检查任务结果。'},
  {kind:'code',language:'javascript',title:'完整入口',text:"async function main(ctx) {\n  const messages = [{ role: 'user', content: ctx.prompt }];\n  const reply = await ctx.provider({ messages, tools: [], signal: ctx.signal });\n  messages.push(reply);\n  ctx.emit('messages', { count: messages.length, lastRole: reply.role });\n  return { messages, final: reply.content, status: 'completed' };\n}"},
  {kind:'text',text:'provider 调用失败时 Promise 会 reject；本章暂不捕获，错误由宿主显示。之后会把工具错误变成 tool 消息交回模型。signal 在 provider 和工具之间传递取消通知，第八章会处理这一状态。'},
 ],
 task:'补全 starter：传入单条 user 消息、空 tools 和 signal；await 返回 assistant，追加并返回最终文本。',
 starter:"async function main(ctx) {\n  const messages = [{ role: 'user', content: ctx.prompt }];\n  // TODO: call ctx.provider and append its assistant response\n  return { messages, status: 'completed' };\n}",
 solution:"async function main(ctx) {\n  const messages = [{ role: 'user', content: ctx.prompt }];\n  const reply = await ctx.provider({ messages, tools: [], signal: ctx.signal });\n  messages.push(reply);\n  ctx.emit('messages', { count: messages.length, lastRole: reply.role });\n  return { messages, final: reply.content, status: 'completed' };\n}",
 checks:[{id:'assistant-response',label:'保存 provider 的 assistant 回答'}],review:['为何必须 await 后再追加回答？','assistant 普通文本能证明测试已运行吗？']
},
{
 id:'tools', title:'第3章：定义工具与参数约定', goal:'阅读工具清单与 schema，理解工具说明、参数、执行器的分工。',
 objectives:['读取 ctx.tools 工具注册表','识别 name/description/parameters/execute','解释有限 schema 约束'],
 blocks:[
  {kind:'text',text:'工具把模型可请求的动作映射到宿主执行能力。每项含 name、description、parameters 和 execute。description 让模型知道何时调用；parameters 描述对象形状；execute 接收参数并执行。ctx.tools 已由宿主提供，查看它不会修改项目。'},
  {kind:'code',language:'javascript',title:'工具参数示例',text:"{ name:'read_file', description:'Read a project file', parameters:{type:'object',properties:{path:{type:'string',minLength:1,maxLength:200}},required:['path']} }"},
  {kind:'text',text:'本练习支持 object、properties、required，以及 string/number/boolean 和 minLength/maxLength 的基础校验，另检查 additionalProperties:false 的未知字段。这些检查覆盖本课工具需要的约束；例如组合条件、格式、引用、数组规则不在本课程检查范围。未检查的字段不能声称已被拒绝。'},
  {kind:'code',language:'javascript',title:'定义自己的执行器',text:"const readFile = async ({path}) => {\n  if (typeof path !== 'string' || path.length < 1) throw new Error('path required');\n  if (!Object.hasOwn(ctx.files, path)) throw new Error('File not found: '+path);\n  return { content: ctx.files[path] };\n};"},
  {kind:'text',text:'工具函数通过 ctx.files 读取虚拟工作区。真实运行的 write_file 与 run_tests 已在 ctx.tools 中提供；本章先把工具声明与执行函数组成注册表，再实际调用 read_file。执行器返回 content，宿主把结果记录在事件与文件状态中。'},
 ],
 task:'遍历 ctx.tools，emit 每项 name 与 parameters；选择 read_file 并调用它读取 /src/sum.js。starter 留下注册表检查与工具读取两个 TODO。',
 starter:"async function main(ctx) {\n  // TODO: emit the available tool names and schemas\n  // TODO: call read_file on /src/sum.js\n  return { status: 'inspected' };\n}",
 solution:"async function main(ctx) {\n  ctx.emit('tools', ctx.tools.map(({name, parameters}) => ({name, parameters})));\n  const tool = ctx.tools.find((item) => item.name === 'read_file');\n  const result = await tool.execute({path:'/src/sum.js'}, {signal:ctx.signal});\n  ctx.emit('tool_result', {name:tool.name, content:result.content ?? result.details?.text});\n  return {status:'inspected'};\n}",
 checks:[{id:'tool-registry',label:'检查注册表并读取源文件'}],review:['schema.required 与 properties 分别约束什么？','本章实现能否校验 JSON Schema 的 format？为什么？']
},
{
 id:'dispatch', title:'第4章：分发一次工具调用', goal:'从 assistant 的 toolCalls 中解析参数、查找工具、校验并执行一次。',
 objectives:['按名称查找工具','接受 object 或 JSON 字符串参数','执行基础类型与必填校验'],
 blocks:[
  {kind:'text',text:'assistant 的 toolCalls 记录模型提出的动作。Harness 先按 name 查工具，再规范化 arguments。arguments 可以已经是对象，也可以是 JSON 字符串；字符串要 JSON.parse，非法 JSON 会抛错。'},
  {kind:'code',language:'javascript',text:"const args = typeof call.arguments === 'string'\n  ? JSON.parse(call.arguments)\n  : call.arguments;"},
  {kind:'text',text:'校验器先要求参数为对象，再检查 schema.required 和已声明字段的基础类型。对 read_file，{path:"/src/sum.js"} 合法，{} 缺少必填 path，{path:4} 类型不符。该子集不执行 schema 中未实现的关键字。'},
  {kind:'code',language:'javascript',title:'分发和规范化结果',text:"const tool = ctx.tools.find(t => t.name === call.name);\nif (!tool) throw new Error('unknown tool');\nconst result = await tool.execute(args, {signal:ctx.signal});\nmessages.push({role:'tool', toolCallId:call.id, name:call.name, content:result.content});"},
  {kind:'text',text:'工具结果用 tool 角色回到消息历史，并通过 toolCallId 指向对应调用。具体工具调用前 messages 含 user 和 assistant；执行后多一条 tool。模型下一次看到结果后才能决定继续调用或给最终回答。'},
 ],
 task:'实现最小 dispatch：读取一次 provider 的 toolCalls，查找工具、parse JSON 参数、校验必填和基础类型、execute，再追加 tool 消息。',
 starter:"async function main(ctx) {\n  const messages = [{role:'user', content:ctx.prompt}];\n  const reply = await ctx.provider({messages, tools:ctx.tools, signal:ctx.signal});\n  messages.push(reply);\n  // TODO: dispatch one call and append role=tool result\n  return {messages};\n}",
 solution:`${common}\nasync function main(ctx) {\n  const messages=[{role:'user',content:ctx.prompt}];\n  const reply=await ctx.provider({messages,tools:toolSpecs(ctx),signal:ctx.signal});\n  messages.push(reply);\n  if(reply.toolCalls?.[0]) messages.push(await executeCall(ctx,reply.toolCalls[0]));\n  return {messages,status:'dispatched'};\n}`,
 checks:[{id:'tool-result',label:'执行并关联一次工具结果'}],review:['toolCallId 为什么需要和请求 id 一致？','unknown-tool 发生在工具执行前还是后？']
},
{
 id:'loop', title:'第5章：循环直到任务完成', goal:'让模型读取工具结果、连续操作文件并以最终回答结束。',
 objectives:['实现 provider—dispatch 循环','在每轮保留完整消息历史','完成 read→write→run_tests 工作流'],
 blocks:[
  {kind:'text',text:'工具调用通常需要多轮：模型先请求 read_file；收到源代码后请求 write_file；看到写入结果后请求 run_tests；测试通过后返回普通 assistant 文本。循环每轮把累计 messages 发给 provider，因此模型可以根据真实工具结果继续判断。'},
  {kind:'code',language:'javascript',title:'消息顺序',text:"user → assistant(toolCalls) → tool → assistant(toolCalls) → tool → assistant(final)"},
  {kind:'text',text:'结束条件是 assistant 没有 toolCalls。若每次都无条件再次调用 provider，程序可能永不停止；本章先设 maxTurns=8。达到上限返回 turn_limit，表示请求次数已用完。下一轮输入包含上一轮 tool 消息。'},
  {kind:'code',language:'javascript',title:'可运行循环的控制骨架',text:"for (let turn=0; turn<8; turn++) {\n const reply=await ctx.provider({messages,tools:toolSpecs(ctx),signal:ctx.signal});\n messages.push(reply);\n if (!reply.toolCalls?.length) return {messages,final:reply.content};\n for (const call of reply.toolCalls) messages.push(await executeCall(ctx,call));\n}"},
  {kind:'text',text:'executeCall 将 toolCall 的参数解析、查找、基础校验和执行集中在一个函数中。工具结果的 content 进入下一次模型请求。最终完成还要看工作区内容与 run_tests 返回值；run_tests 的返回值提供测试证据。'},
 ],
 task:'将 starter 的单次 provider 调用扩展为有界循环，处理所有 toolCalls，记录 tool 消息；只在 assistant 无调用时返回 completed。',
 starter:`async function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n // TODO: repeat provider and dispatch calls until final reply\n return {messages,status:'incomplete'};\n}`,
 solution:`${common}\nasync function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n ${loop(8)}\n}`,
 checks:[{id:'loop-complete',label:'循环完成工具链并返回最终回答'}],review:['工具结果如何影响下一轮输入？','第八轮仍有工具调用时应该返回什么状态？']
},
{
 id:'workspace', title:'第6章：把 Harness 接到工作区', goal:'通过真实文件工具修复减法实现，并运行宿主测试。',
 objectives:['说明 ctx.files 是虚拟工作区','让工具执行写入文件','依据 run_tests 结果判断完成'],
 blocks:[
  {kind:'text',text:'本实验用 ctx.files 这个内存对象保存虚拟文件。初始 /src/sum.js 实现 a-b，任务要求 sum(a,b) 返回相加结果。read_file 返回当前文本，write_file 替换工作区内容，run_tests 对指定文件调用受限测试器。'},
  {kind:'code',language:'javascript',title:'状态变化',text:"before: ctx.files['/src/sum.js'] = 'return a - b'\nafter write_file: ctx.files['/src/sum.js'] = 'return a + b'"},
  {kind:'text',text:'正确次序是读文件、根据内容生成完整文件文本、写入、运行测试。run_tests 使用路径参数，省略时默认 /src/sum.js。工具可能返回 isError； Harness 应检查工具结果，失败信息也应写入消息历史，供下一轮处理。'},
  {kind:'code',language:'javascript',title:'真正执行测试',text:"const result = await tool.execute({path:'/src/sum.js'}, {signal:ctx.signal});\nif (result.isError) throw new Error(result.content);"},
  {kind:'text',text:'完成状态既包含通过的测试事件，也包含已修改的文件。消息、文件快照和测试结果一起说明本次运行完成了什么。共享代码模板仍由学生维护 lookup、校验、dispatch 和循环；宿主只提供单个文件操作及测试能力。'},
 ],
 task:'用完整 harness 循环修复文件。solution 必须调用 read_file、write_file、run_tests，由真实宿主工具修改 ctx.files 并通过测试。',
 starter:`async function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n // TODO: implement lookup, validation, dispatch, and bounded loop\n return {messages,status:'incomplete'};\n}`,
 solution:`${common}\nasync function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n ${loop(8)}\n}`,
 checks:[{id:'files-repaired',label:'文件已改正且 run_tests 通过'}],review:['如何区分文件文本正确与测试实际通过？','工作区变更是否直接写到了本机磁盘？']
},
{
 id:'failures', title:'第7章：把失败变成可处理结果', goal:'捕获未知工具、非法参数或执行错误，并把错误回填给模型。',
 objectives:['捕获 dispatch 异常','构造 isError tool 消息','保留后续修复机会'],
 blocks:[
  {kind:'text',text:'模型可能提交未知名称、无效 JSON 或不符合参数约定的内容。Harness 应在查找或执行边界捕获这些异常。否则主函数直接 reject，模型没有机会根据错误调整请求。'},
  {kind:'code',language:'javascript',title:'把异常反馈到对话',text:"try {\n messages.push(await executeCall(ctx, call));\n} catch (error) {\n messages.push({role:'tool',toolCallId:call.id,name:call.name,content:String(error),isError:true});\n}"},
  {kind:'text',text:'unknown-tool 的失败发生在执行器调用前；invalid-args 在 schema 子集校验时失败。两者都生成与原调用 id 关联的 tool 消息，并在下一轮交给 provider。真实执行器返回 isError 时也要保留标记。'},
  {kind:'code',language:'javascript',title:'错误记录前后',text:"before: assistant requests write_file(path=4)\nafter: tool {toolCallId:'c1', name:'write_file', isError:true, content:'path must be string'}"},
  {kind:'text',text:'错误消息应包含足以重试的信息，但避免塞入秘密或内部凭据。失败任务只有在后续 write_file 和 run_tests 成功后才完成。scenario 由宿主选择异常分支；脚本仍需自身捕获，并基于 tool 消息继续。'},
 ],
 task:'扩展 dispatch 循环，对 lookup、parse、validation、execute 的异常都追加 isError=true 的 tool 消息，再继续有限轮数。',
 starter:`async function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n // TODO: catch tool failures and return them as tool messages\n return {messages,status:'incomplete'};\n}`,
 solution:`${common}\nasync function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n const maxTurns=8;\n for(let turn=0;turn<maxTurns;turn++){\n  if(ctx.signal?.aborted)return {messages,status:'cancelled'};\n  const reply=await ctx.provider({messages,tools:toolSpecs(ctx),signal:ctx.signal});messages.push(reply);\n  if(!reply.toolCalls?.length)return {messages,final:reply.content,status:'completed'};\n  for(const call of reply.toolCalls){try{messages.push(await executeCall(ctx,call));}catch(error){messages.push({role:'tool',toolCallId:call.id,name:call.name,content:String(error),isError:true});ctx.emit('tool_error',{name:call.name,error:String(error)});}}\n }\n return {messages,status:'turn_limit'};\n}`,
 checks:[{id:'tool-error',label:'失败以 tool 错误消息回填并继续'}],review:['错误回填如何让模型重试？','哪些字段必须保持原 toolCall id？']
},
{
 id:'limits', title:'第8章：限制循环并响应取消', goal:'为 Harness 增加硬轮数上限、协作取消和准确终止状态。',
 objectives:['在源码设置正的 maxTurns','每轮检查 signal.aborted','区分 completed、cancelled、turn_limit'],
 blocks:[
  {kind:'text',text:'循环边界必须由 Harness 脚本自身控制。这里 maxTurns=8 是正整数上限：最多进行八次 provider 请求，超出时返回 turn_limit。宿主 timeout 是另一层时间限制，不能替代代码中的轮数边界。'},
  {kind:'code',language:'javascript',title:'检查取消与轮数',text:"const maxTurns = 8;\nfor (let turn=0; turn<maxTurns; turn++) {\n if (ctx.signal?.aborted) return {messages,status:'cancelled'};\n // provider and dispatch\n}\nreturn {messages,status:'turn_limit'};"},
  {kind:'text',text:'signal 是 AbortSignal，工具和 provider 都收到同一 signal，因而可协作终止。代码在每轮开始检查 aborted；执行器也可在工作期间观察 signal。cancelled 表示运行因取消退出。无 toolCalls 才表示 assistant 当前结束；任务测试通过仍要由工具结果确认。'},
  {kind:'code',language:'javascript',title:'状态与含义',text:"completed = assistant 没有新工具请求\ncancelled = signal 已中止\nturn_limit = 用尽八次 provider 请求仍未结束"},
  {kind:'text',text:'若把 maxTurns 写成 0，循环一次也不执行；若没有上界，scenario=endless 可持续制造工具调用。本章在脚本中直接定义请求次数上限，并在每轮检查取消。本次运行检查使用持续请求场景验证上限；浏览器停止按钮会终止当前 Worker，协作取消可用参考代码中的 AbortController 验证。'},
 ],
 task:'实现完整修复循环，源码内 hard-code 正整数上限（建议 8），传递 signal，检查取消，区分终止状态。',
 starter:`async function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n // TODO: add a positive hard turn bound and signal check\n return {messages,status:'incomplete'};\n}`,
 solution:`${common}\nasync function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n ${loop(8)}\n}`,
 checks:[{id:'bounded-loop',label:'持续请求按轮数限制退出'}],review:['宿主 timeout 与 maxTurns 各控制什么？','用尽轮数为何不能返回 completed？']
},
{
 id:'real-api', title:'第9章：自己序列化 HTTP 请求', goal:'以 mockFetch 验证 Chat Completions 适配器，理解 Responses 的不同字段。',
 objectives:['自己将内部消息转换为 Chat 请求 JSON','解析非流式 HTTP JSON 响应','比较 Responses 输入/输出字段','用本地 mockFetch 完成工具修复'],
 blocks:[
  {kind:'text',text:'内部 user/assistant/tool 消息是课程内协议；HTTP adapter 把它们转换成服务端协议。本章只发送非流式请求，不使用 key、不访问网络。ctx.mockFetch("chat") 是本地替身，返回符合预期的 JSON。adapter 要自行构造 body、检查 response.ok、解析 JSON，再把 assistant 响应转回内部格式。'},
  {kind:'code',language:'javascript',title:'Chat Completions 消息转换',text:"{role:'user',content:'修复'} → {role:'user',content:'修复'}\n内部 tool → {role:'tool',tool_call_id:'c1',content:'写入成功'}\nassistant 工具请求 → choices[0].message.tool_calls[]"},
  {kind:'text',text:'Chat 请求的工具定义放在 tools，每项含 type:function 和 function.name/description/parameters；tool_choice 可用 auto。非流式响应从 choices[0].message 读取 content 与 tool_calls。工具参数通常以 JSON 字符串返回，Harness 解析后校验。错误 HTTP 状态应抛错，不能把无效响应当成空 assistant。'},
  {kind:'code',language:'javascript',title:'Responses 协议对照',text:"POST /v1/responses: {model, input, tools:[{type:'function',name,description,parameters}], stream:false}\n输出 output[] 可含 {type:'function_call',call_id,name,arguments}\n输入工具结果用 {type:'function_call_output',call_id,output}"},
  {kind:'text',text:'Responses 使用 input 与 output 项目；工具调用以 function_call 表示，关联字段是 call_id，参数 arguments 仍需解析。Chat Completions 则使用 messages、choices[0].message.tool_calls 与 tool_call_id。两者字段不同，adapter 应明确选择协议，不能混用。以下主 solution 实现 Chat；下方 Responses 完整脚本也可载入编辑器，运行同一修复任务。'},
  {kind:'code',language:'javascript',title:'Responses adapter 独立可运行片段',text:"async function responsesOnce(ctx, messages, tools) {\n const input = messages.map(m => m.role === 'tool' ? {type:'function_call_output',call_id:m.toolCallId,output:m.content} : {role:m.role,content:m.content ?? ''});\n const response = await ctx.mockFetch('responses')({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'mock-model',input,tools:tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.parameters})),stream:false})});\n if(!response.ok) throw new Error('HTTP '+response.status);\n const data=await response.json(); const item=(data.output ?? []).find(x=>x.type==='message'||x.type==='function_call');\n return item?.type==='function_call' ? {role:'assistant',content:null,toolCalls:[{id:item.call_id,name:item.name,arguments:item.arguments}]} : {role:'assistant',content:item?.content?.[0]?.text ?? ''};\n}"},
  {kind:'text',text:'课堂主 solution 的 chatHTTP 会把内部消息序列化为 Chat body，并从 mockFetch 返回值恢复 assistant/toolCalls。之后使用前几章自己编写的 lookup、基础 schema 检查、dispatch 和 maxTurns 循环。例子只覆盖本课程所需字段；不处理流式事件、重试、认证、厂商扩展或完整协议兼容。'},
 ],
 task:'实现非流式 Chat adapter 和有界修复循环。所有 HTTP 测试经 ctx.mockFetch("chat") 本地完成；无 API key、无付费调用。Responses 对照代码给出独立 adapter 示例。',
 starter:`async function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n // TODO: build Chat request JSON using ctx.mockFetch('chat')\n // TODO: parse response, dispatch tool calls, enforce a turn bound\n return {messages,status:'incomplete'};\n}`,
 solution:`${common}\nasync function main(ctx) {\n const messages=[{role:'user',content:ctx.prompt}];\n const tools=toolSpecs(ctx); const mock=ctx.mockFetch('chat'); const maxTurns=8;\n for(let turn=0;turn<maxTurns;turn++){\n  if(ctx.signal?.aborted)return {messages,status:'cancelled'};\n  const body={model:'mock-model',messages:messages.map(m=>m.role==='tool'?{role:'tool',tool_call_id:m.toolCallId,name:m.name,content:m.content}:{role:m.role,content:m.content??'',...(m.toolCalls?.length?{tool_calls:m.toolCalls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:typeof c.arguments==='string'?c.arguments:JSON.stringify(c.arguments)}}))}:{})}),tools:tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),tool_choice:'auto',stream:false};\n  const response=await mock('https://mock.invalid/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('HTTP '+response.status);\n  const data=await response.json();const m=data.choices?.[0]?.message;if(!m)throw new Error('Missing choices[0].message');\n  const reply={role:'assistant',content:m.content??'',...(m.tool_calls?.length?{toolCalls:m.tool_calls.map(c=>({id:c.id,name:c.function.name,arguments:c.function.arguments}))}:{})};messages.push(reply);\n  if(!reply.toolCalls?.length)return {messages,final:reply.content,status:'completed'};\n  for(const call of reply.toolCalls){try{messages.push(await executeCall(ctx,call));}catch(error){messages.push({role:'tool',toolCallId:call.id,name:call.name,content:String(error),isError:true});}}\n }\n return {messages,status:'turn_limit'};\n}`,
 checks:[{id:'http-roundtrip',label:'mockFetch 请求往返并完成修复测试'}],review:['工具结果在 Chat body 中使用哪个关联字段？','Responses 的 call_id/output 与 Chat 的 tool_call_id/content 有何差异？','本实验是否发出外部网络请求？']
}
];
const responsesAdapter = `
async function main(ctx) {
 const mock=ctx.mockFetch('responses');
 const tools=toolSpecs(ctx);
 ctx.provider=async({messages,signal})=>{
  const input=messages.flatMap(m=>{
   if(m.role==='tool')return [{type:'function_call_output',call_id:m.toolCallId,output:m.content}];
   if(m.role==='assistant'&&m.toolCalls?.length)return [
    ...(m.content?[{type:'message',role:'assistant',content:[{type:'output_text',text:m.content}]}]:[]),
    ...m.toolCalls.map(c=>({type:'function_call',call_id:c.id,name:c.name,arguments:typeof c.arguments==='string'?c.arguments:JSON.stringify(c.arguments)}))
   ];
   return [{type:'message',role:m.role,content:[{type:m.role==='assistant'?'output_text':'input_text',text:m.content}]}];
  });
  const response=await mock('https://mock.invalid/v1/responses',{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({model:'mock-model',stream:false,input,tools:tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.parameters,strict:false}))})});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();if(!Array.isArray(data.output))throw new Error('Missing output');
  const calls=data.output.filter(i=>i.type==='function_call').map(i=>({id:i.call_id,name:i.name,arguments:i.arguments}));
  const text=data.output.filter(i=>i.type==='message').flatMap(i=>i.content??[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
  return {role:'assistant',content:text,...(calls.length?{toolCalls:calls}:{})};
 };
 const messages=[{role:'user',content:ctx.prompt}];
 ${loop(8)}
}`;
export const responsesBuilderSolution=common+responsesAdapter;
const apiLesson=builderLessons.find(lesson=>lesson.id==='real-api')!;
apiLesson.blocks=apiLesson.blocks.map(block=>block.title==='Responses adapter 独立可运行片段'?{...block,title:'Responses：完整可运行参考',text:responsesBuilderSolution}:block);
