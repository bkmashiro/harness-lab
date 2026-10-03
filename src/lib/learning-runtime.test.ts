import {describe,it,expect,beforeAll} from 'vitest';
import {runInProcess} from './runtime';
import {defaultSettings,DEFAULT_PROMPT,INITIAL_FILES,type RunResult} from './contracts';
import {unitScene,gradeExercise} from './learning-runtime';
let baseline:RunResult;
beforeAll(async()=>{baseline=await runInProcess({settings:{...defaultSettings,delayMs:0},prompt:DEFAULT_PROMPT,files:INITIAL_FILES});});
describe('learning unit scenes and feedback',()=>{
 it('binds the proposal, dispatch and result units to the same real call',()=>{
  const proposal=unitScene('proposal',baseline.events);expect(proposal.events).toHaveLength(1);
  const id=(proposal.events[0].data as any).message.content.find((p:any)=>p.type==='toolCall').id;
  const dispatch=unitScene('dispatch',baseline.events);expect((dispatch.events[0].data as any).toolCallId).toBe(id);expect(dispatch.events.some(e=>e.kind==='read')).toBe(true);
  const result=unitScene('result',baseline.events);expect(result.events.map(e=>e.kind)).toEqual(['tool_execution_end','message_end','serialized']);expect((result.events[1].data as any).message.toolCallId).toBe(id);
 });
 it('keeps exercise events separate from baseline when event IDs overlap',async()=>{
  const exercise=await runInProcess({settings:{...defaultSettings,scenario:'read-once',demoReadPath:'/src/missing.js',delayMs:0},prompt:'read_file',files:INITIAL_FILES});
  const scene=unitScene('exercise',baseline.events,exercise.events);expect(scene.allEvents).toBe(exercise.events);expect(scene.events.every(e=>exercise.events.includes(e))).toBe(true);
  expect((scene.events.find(e=>e.id===scene.preferredId)!.data as any).isError).toBe(true);
 });
 for(const [path,prediction] of [['/src/sum.js','file-content'],['/src/missing.js','tool-error'],['/src/invalid.js','tool-error'],['','validation-error']] as const){
  it(`grades ${JSON.stringify(path)} from actual tool output`,async()=>{
   const result=await runInProcess({settings:{...defaultSettings,scenario:'read-once',demoReadPath:path,delayMs:0},prompt:'read_file',files:INITIAL_FILES});
   expect(gradeExercise(path,prediction,result).correct).toBe(true);expect(gradeExercise(path,'provider-error',result).correct).toBe(false);
  });
 }
 it('does not mark an interrupted exercise as completed',()=>{
  expect(gradeExercise('/src/sum.js','provider-error',{events:[],files:{},messages:[],status:'cancelled'}).correct).toBe(false);
 });
});
