import {defaultSettings,INITIAL_FILES,type TraceEvent,type RunResult} from './contracts';
import {startRun} from './runtime';
import type {LessonScene,UnitId} from './learning';
import {projectChapter} from './chapter-projection';

export type ExercisePrediction='file-content'|'tool-error'|'validation-error'|'provider-error';
const data=(e:TraceEvent)=>e.data as any;

export function unitScene(unitId:UnitId,events:TraceEvent[],exerciseEvents:TraceEvent[]=[]):LessonScene {
 const all=unitId==='exercise'?exerciseEvents:events;
 const overview=projectChapter('overview',all).events;
 const call=overview.find(e=>e.kind==='message_end');
 const id=data(call??{data:{}} as TraceEvent)?.message?.content?.find((part:any)=>part.type==='toolCall')?.id;
 const start=all.find(e=>e.kind==='tool_execution_start'&&data(e).toolCallId===id);
 const end=all.find(e=>e.kind==='tool_execution_end'&&data(e).toolCallId===id);
 const toolResult=all.find(e=>e.kind==='message_end'&&data(e).message?.role==='toolResult'&&data(e).message.toolCallId===id);
 const selected:TraceEvent[]=[];
 const add=(e:TraceEvent|undefined)=>{if(e&&!selected.includes(e))selected.push(e);};
 let focus:LessonScene['focus']=['provider','harness','tools'];
 switch(unitId){
  case 'introduction':case 'assessment':overview.forEach(add);break;
  case 'proposal':add(call);focus=['provider','harness'];break;
  case 'dispatch':add(start);add(all.find(e=>e.kind==='read'&&e.seq>(start?.seq??Infinity)&&e.seq<(end?.seq??Infinity)));add(end);focus=['harness','tools','workspace'];break;
  case 'result':add(end);add(toolResult);add(all.find(e=>e.kind==='serialized'&&e.seq>(toolResult?.seq??Infinity)));focus=['tools','harness','context','provider'];break;
  case 'exercise':add(call);add(start);add(end);add(toolResult);focus=['provider','harness','tools','workspace'];break;
 }
 selected.sort((a,b)=>a.seq-b.seq);
 const preferred=unitId==='exercise'&&end?end:selected[0];
 return {unitId,events:selected,preferredId:preferred?.id??null,focus,allEvents:all};
}

export function runReadExercise(path:string,onEvent?:(e:TraceEvent)=>void){
 return startRun({settings:{...defaultSettings,mode:'demo',apiKey:'',scenario:'read-once',demoReadPath:path,delayMs:0},prompt:`请调用 read_file 读取 ${JSON.stringify(path)}。`,files:{...INITIAL_FILES},onEvent});
}

export function gradeExercise(path:string,prediction:ExercisePrediction,result:RunResult){
 const end=result.events.find(e=>e.kind==='tool_execution_end'&&data(e).toolName==='read_file');
 const text=end?(data(end).result?.content??[]).map((part:any)=>part.text??'').join('\n'):result.error??'';
 let outcome:ExercisePrediction='provider-error';
 if(end){
  if(!data(end).isError)outcome='file-content';
  else if(/^File not found:/i.test(text))outcome='tool-error';
  else if(/validation|validate|invalid|minLength/i.test(text))outcome='validation-error';
  else outcome='tool-error';
 }
 const explanations:Record<ExercisePrediction,string>={
  'file-content':`参数通过检查，read_file 找到了 ${JSON.stringify(path)} 并返回文件内容。右侧可以查看本次返回值。`,
  'tool-error':`path 是合法字符串，参数检查通过。read_file 在虚拟 FS 中查找 ${JSON.stringify(path)} 时失败，harness 将异常整理为 isError: true 的工具结果。`,
  'validation-error':'path 未满足工具的参数 schema。Pi 在调用 execute 前拒绝了参数，并生成错误工具结果。',
  'provider-error':result.status==='cancelled'?'练习已停止，可修改路径后重试。':'这次运行没有取得工具结果，请查看运行错误后重试。'
 };
 return {correct:result.status==='completed'&&prediction===outcome,outcome,explanation:explanations[outcome]};
}
