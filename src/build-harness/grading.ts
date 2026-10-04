import type {BuilderCheck,BuilderLesson,BuilderResult} from './contracts';
const seed='export function sum(a, b) { return a - b; }';
const valueOf=(result:BuilderResult)=>result.value as {messages?:any[];final?:string;status?:string}|undefined;
function linked(messages:any[]){
 const ids=new Map<string,string>();let count=0;
 for(const message of messages){
  if(message.role==='assistant')for(const call of message.toolCalls??[])ids.set(call.id,call.name);
  if(message.role==='tool'){if(!message.toolCallId||ids.get(message.toolCallId)!==message.name)return false;count++;}
 }
 return count>0;
}
export function gradeBuilderRun(lesson:BuilderLesson,result:BuilderResult):BuilderCheck[]{
 const value=valueOf(result);const messages=Array.isArray(value?.messages)?value.messages:[];
 const runtime=result.events.filter(e=>e.source==='runtime');
 const modelRequests=runtime.filter(e=>e.type==='model_request');
 const toolEnds=runtime.filter(e=>e.type==='tool_end').map(e=>e.data as any);
 const last=messages.at(-1);const test=toolEnds.find(e=>e.name==='run_tests');
 const repaired=/return\s+a\s*\+\s*b/.test(result.files['/src/sum.js']??'');
 const fullFlow=['read_file','write_file','run_tests'].every(name=>toolEnds.some(e=>e.name===name));
 const passedTests=test?.details?.ok===true&&test.details.results?.length===3&&test.details.results.every((r:any)=>r.pass===true);
 const finalAnswer=value?.status==='completed'&&last?.role==='assistant'&&!last.toolCalls?.length&&typeof value.final==='string'&&value.final.length>0;
 const success=fullFlow&&repaired&&passedTests&&finalAnswer&&linked(messages);
 const outcomes:Record<string,{passed:boolean;detail:string}>={
  'messages-user':{passed:messages.length===1&&messages[0].role==='user'&&typeof messages[0].content==='string'&&messages[0].content.length>0&&result.events.some(e=>e.type==='messages'&&(e.data as any)?.count===1),detail:`返回 ${messages.length} 条消息；需要一条非空 user 消息和消息计数事件。`},
  'assistant-response':{passed:messages.length===2&&messages[0].role==='user'&&last?.role==='assistant'&&modelRequests.length===1,detail:`实际调用 provider ${modelRequests.length} 次，返回历史应包含 user 与 assistant。`},
  'tool-registry':{passed:result.events.some(e=>e.type==='tools'&&Array.isArray(e.data)&&['read_file','write_file','run_tests'].every(name=>(e.data as any[]).some(t=>t.name===name&&t.parameters?.type==='object')))&&toolEnds.some(e=>e.name==='read_file'&&e.content?.includes('return a - b')),detail:'需要输出三项工具的参数声明，并通过提供的 read_file 读取初始源文件。'},
  'tool-result':{passed:linked(messages)&&toolEnds.some(e=>e.name==='read_file')&&messages.filter(m=>m.role==='tool').length===1,detail:'检查实际读取事件，以及 toolCallId 与原 assistant 调用的对应关系。'},
  'loop-complete':{passed:success,detail:`实际工具链 ${fullFlow?'齐全':'未完成'}；三个测试 ${passedTests?'通过':'未通过'}；最终回答 ${finalAnswer?'已返回':'未返回'}。`},
  'files-repaired':{passed:success,detail:`文件 ${repaired?'已改为加法':'仍未改正'}；需实际 write_file 和 run_tests，文件内容与三项用例同时通过。`},
  'tool-error':{passed:linked(messages)&&messages.some(m=>m.role==='tool'&&m.isError===true)&&modelRequests.length>=2&&result.files['/src/sum.js']===seed&&!toolEnds.some(e=>e.name==='write_file'),detail:'需要将失败关联到原调用并提交下一轮；无效写入应在执行前被拒绝，文件保持初始内容。'},
  'bounded-loop':{passed:['turn_limit','limit'].includes(value?.status??'')&&modelRequests.length>0&&modelRequests.length<=8&&linked(messages),detail:`无终点场景实际请求 ${modelRequests.length} 次，退出状态 ${value?.status??'缺失'}；上限检查要求 1–8 次并按限制退出。`},
  'http-roundtrip':{passed:result.events.some(e=>e.source==='runtime'&&e.type==='http_request')&&result.events.some(e=>e.source==='runtime'&&e.type==='http_response')&&fullFlow&&repaired&&passedTests&&finalAnswer&&linked(messages),detail:'检查本地 HTTP 请求/响应、三项工具调用、结果 ID、文件变更与实际测试结果。'}
 };
 return lesson.checks.map(check=>{
  const outcome=outcomes[check.id]??{passed:false,detail:'当前检查未定义，请报告这个章节问题。'};
  return {...check,passed:result.status==='completed'&&outcome.passed,detail:result.status==='completed'?outcome.detail:result.error??'运行未完成'};
 });
}
