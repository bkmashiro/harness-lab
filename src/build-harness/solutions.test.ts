import {describe,it,expect} from 'vitest';
import {builderLessons,responsesBuilderSolution} from './lessons';
import {gradeBuilderRun} from './grading';
import {createDemoProvider,createWorkspaceTools,createMockFetch} from '../../public/build-harness/reference/harness.mjs';
import type {BuilderResult,BuilderEvent,BuilderLesson} from './contracts';

const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function execute(lesson:BuilderLesson,code:string,abortAfter?:number):Promise<BuilderResult>{
 const files={'/src/sum.js':'export function sum(a, b) { return a - b; }','/README.md':'修复 sum(a, b)，运行三个算术测试。'};
 const events:BuilderEvent[]=[];let seq=0;let requests=0;
 const emit=(type:string,data:unknown,source:'runtime'|'learner'='runtime')=>events.push({seq:++seq,type,data:JSON.parse(JSON.stringify(data)),source});
 const scenario=lesson.id==='failures'?'invalid-args':lesson.id==='limits'?'endless':'repair';
 const controller=new AbortController();
 const tools=createWorkspaceTools(files).map(tool=>({...tool,execute:async(args:any,options:any)=>{
  emit('tool_start',{name:tool.name,arguments:args});const output=await tool.execute(args,options);emit('tool_end',{name:tool.name,...output});return output;
 }}));
 const provider=createDemoProvider({scenario});
 const ctx={files,tools,prompt:'读取 /src/sum.js，修复 sum 的减法错误，运行测试并说明结果。',signal:controller.signal,emit:(t:string,d:unknown)=>emit(t,d,'learner'),
  provider:async(input:any)=>{emit('model_request',{messages:input.messages,tools:input.tools});const value=await provider(input);emit('model_response',value);if(abortAfter&&++requests>=abortAfter)controller.abort();return value;},
  mockFetch:(protocol:'chat'|'responses')=>{const mock=createMockFetch(protocol,scenario);return async(input:any,init:any)=>{emit('http_request',{protocol,body:JSON.parse(init.body)});const response=await mock(input,init);emit('http_response',{protocol,status:response.status,body:await response.clone().json()});return response;}}
 };
 try{return {status:'completed',value:await new AsyncFunction('ctx',code+'\nreturn await main(ctx);')(ctx),files,events};}
 catch(error){return {status:'error',error:String(error),files,events};}
}

describe('all nine executable builder chapters',()=>{
 expect(builderLessons.map(l=>l.id)).toEqual(['messages','provider','tools','dispatch','loop','workspace','failures','limits','real-api']);
 for(const lesson of builderLessons){
  it(`${lesson.id}: working solution passes observed checks`,async()=>{
   expect(lesson.blocks.length).toBeGreaterThanOrEqual(5);const result=await execute(lesson,lesson.solution);
   expect(result.status,result.error).toBe('completed');expect(gradeBuilderRun(lesson,result).every(c=>c.passed),JSON.stringify(gradeBuilderRun(lesson,result))).toBe(true);
  });
  it(`${lesson.id}: unfinished starter is not marked complete`,async()=>{
   const result=await execute(lesson,lesson.starter);expect(gradeBuilderRun(lesson,result).every(c=>c.passed)).toBe(false);
  });
 }
 it('limits solution responds to an actual aborted signal',async()=>{
  const lesson=builderLessons.find(l=>l.id==='limits')!;const result=await execute(lesson,lesson.solution,1);expect((result.value as any).status).toBe('cancelled');
 });
 it('Responses example also completes the real virtual-file repair',async()=>{
  const lesson=builderLessons.find(l=>l.id==='real-api')!;const result=await execute(lesson,responsesBuilderSolution);expect(result.status,result.error).toBe('completed');expect(gradeBuilderRun(lesson,result).every(c=>c.passed)).toBe(true);
 });
});
