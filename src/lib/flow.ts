import type {Lane,TraceEvent} from './contracts';
export interface DataFlow{from:Lane;to:Lane;operation:string}
// These edges describe the observed operation, never causal links inferred from neighbouring timestamps.
export function eventFlow(event:TraceEvent):DataFlow|null{
 const kind=event.kind;
 const message=(event.data as any)?.message;
 if(kind==='message_end'&&message?.role==='assistant'&&message.content?.some((c:any)=>c.type==='toolCall'))return {from:'provider',to:'harness',operation:'完整工具提议'};
 if(kind==='message_end'&&message?.role==='toolResult')return {from:'harness',to:'context',operation:'追加工具结果消息'};
 if(kind==='request')return {from:'context',to:'provider',operation:'发送序列化请求'};
 if(kind==='serialized')return {from:'context',to:'provider',operation:'生成请求体（尚未发送）'};
 if(kind==='sse-frame')return {from:'provider',to:'parser',operation:'读取响应片段'};
 if(kind==='response')return {from:'provider',to:'parser',operation:'接收响应'};
 if(kind==='stream_event')return {from:'parser',to:'harness',operation:'解析为统一事件'};
 if(kind==='api_test_result')return {from:'provider',to:'parser',operation:'单次 API 观测'};
 if(kind==='tool_execution_start')return {from:'harness',to:'tools',operation:'校验后调度工具'};
 if(kind==='tool_execution_end')return {from:'tools',to:'harness',operation:'返回工具结果'};
 if(kind==='read')return {from:'workspace',to:'tools',operation:'读取文件内容'};
 if(kind==='write')return {from:'tools',to:'workspace',operation:'写入文件内容'};
 if(kind==='test')return {from:'workspace',to:'tools',operation:'受限算术测试结果'};
 if(kind==='input')return {from:'user',to:'context',operation:'加入用户消息'};
 if(kind==='transform')return {from:'context',to:'context',operation:'转换上下文'};
 return null;
}
