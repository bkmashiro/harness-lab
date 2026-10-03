import type {TraceEvent} from './contracts';
export interface ChapterProjection { events:TraceEvent[]; preferredId:string|null; note?:string }
const data=(e:TraceEvent)=>e.data && typeof e.data==='object' ? e.data as Record<string,any> : {};
const assistantCall=(e:TraceEvent,name?:string)=>e.kind==='message_end' && data(e).message?.role==='assistant' && data(e).message.content?.some((c:any)=>c.type==='toolCall' && (!name || c.name===name));

/** Exact event references from one run. No synthetic steps, renumbering or timestamp-based causal inference. */
export function projectChapter(chapterId:string,all:TraceEvent[]):ChapterProjection{
 let chosen:TraceEvent[]=[];let note:string|undefined;
 const first=(predicate:(e:TraceEvent)=>boolean)=>all.find(predicate);
 const add=(e:TraceEvent|undefined)=>{if(e && !chosen.some(c=>c.id===e.id))chosen.push(e);};
 const firstRequest=first(e=>e.kind==='request');
 const firstSerialized=first(e=>e.kind==='serialized');
 const call=first(e=>assistantCall(e));
 const callId=call && data(call).message.content.find((c:any)=>c.type==='toolCall')?.id;
 const firstToolStart=first(e=>e.kind==='tool_execution_start' && (!callId || data(e).toolCallId===callId));
 const firstToolEnd=first(e=>e.kind==='tool_execution_end' && (!callId || data(e).toolCallId===callId));
 const nextSerialized=all.find(e=>e.kind==='serialized' && e.seq>(firstToolEnd?.seq ?? Infinity));
 const inFirstResponse=(e:TraceEvent)=>e.seq>(firstRequest?.seq ?? 0) && e.seq<(firstToolStart?.seq ?? Infinity);
 switch(chapterId){
  case 'overview':
   add(call);add(firstToolStart);add(firstToolEnd);
   note='只看一次工具调用：模型提出行动 → harness 调度 → 工具返回。后续章节再逐层展开。';break;
  case 'context':
   add(firstSerialized);add(firstRequest);
   note='本章只对照第一轮请求：Pi 序列化的 body，以及 transport 实际接收的请求。';break;
  case 'streaming':{
   const raw=all.filter(e=>inFirstResponse(e)&&e.kind==='sse-frame');
   const parsed=all.filter(e=>inFirstResponse(e)&&e.kind==='stream_event');
   add(raw[0]);add(raw[1]);add(parsed[0]);add(parsed.find(e=>JSON.stringify(e.data).includes('arguments')));add(parsed.at(-1));add(call);
   note='选取第一条工具调用响应的读取片段、解析事件和完整消息；不是整轮日志，也不把读取片段当 token。';break;
  }
  case 'tools':{
   const writeCall=first(e=>assistantCall(e,'write_file')) ?? call;
   const id=writeCall && data(writeCall).message.content.find((c:any)=>c.type==='toolCall'&&(!assistantCall(writeCall,'write_file')||c.name==='write_file'))?.id;
   add(writeCall);add(first(e=>e.kind==='tool_execution_start'&&data(e).toolCallId===id));
   add(first(e=>e.kind==='write'&&e.seq>(writeCall?.seq??Infinity)));
   add(first(e=>e.kind==='tool_execution_end'&&data(e).toolCallId===id));
   add(first(e=>e.kind==='message_end'&&data(e).message?.role==='toolResult'&&data(e).message.toolCallId===id));
   note='聚焦一个工具调用及关联结果。事件 ID 与 toolCallId 保持原样，文件 Diff 使用原始前一事件的快照。';break;
  }
  case 'loop':
   add(firstSerialized);add(call);add(firstToolEnd);add(first(e=>e.kind==='turn_end'));add(nextSerialized);
   note='只看一次循环边界：工具结果怎样进入下一轮请求。';break;
  case 'workspace-session':
   add(first(e=>e.kind==='workspace_init'));add(first(e=>e.kind==='read'));add(first(e=>e.kind==='write'));add(first(e=>e.kind==='test'));
   note='对照同一文件的读写快照。这里展示本站虚拟 FS，不冒充上游 session 恢复。';break;
  case 'context-management':
   add(firstSerialized);add(nextSerialized);
   note='对比工具结果加入前后的两份真实请求。当前未执行上游 compaction；压缩算法只在源码说明中解读。';break;
  case 'failures':
   chosen=all.filter(e=>e.kind==='validation_error'||e.kind==='error'||(e.kind==='test'&&data(e).ok===false)||(e.kind==='tool_execution_end'&&data(e).isError)||(e.kind==='response'&&Number(data(e).status)>=400));
   if(!chosen.length)note='当前运行没有失败事件。可在实验中选择无效参数、Provider 错误或测试未通过，再观察对应边界。';break;
  case 'api-lab':
   add(firstSerialized);add(firstRequest);add(first(e=>e.kind==='response'));add(first(e=>e.kind==='sse-frame'));add(first(e=>e.kind==='api_test_result'));
   note='只展示接口边界；单次 JSON/SSE 实验可从设置页发起。';break;
  default:note='此章节没有可用的事件投影。';
 }
 chosen.sort((a,b)=>a.seq-b.seq);
 return {events:chosen,preferredId:chosen[0]?.id ?? null,...(note?{note}:{})};
}
