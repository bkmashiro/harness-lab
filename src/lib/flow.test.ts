import {describe,it,expect} from 'vitest';
import {eventFlow} from './flow';
import type {TraceEvent} from './contracts';
const event=(kind:string):TraceEvent=>({kind,lane:'harness',id:'1',seq:1,at:0,title:'test',data:{},files:{}});
describe('honest visual flow projection',()=>{
 it('distinguishes request preparation and schema rejection from tool execution',()=>{
  expect(eventFlow(event('tool_execution_start'))?.to).toBe('harness');
  const rejected={...event('tool_execution_end'),data:{isError:true,result:{content:[{type:'text',text:'Validation failed for tool read_file'}]}}};
  expect(eventFlow(rejected)?.from).toBe('harness');
  const missing={...rejected,data:{isError:true,result:{content:[{type:'text',text:'File not found: /src/invalid.js'}]}}};
  expect(eventFlow(missing)?.from).toBe('tools');
 });
 it('maps operations rather than inferring causality from adjacent timestamps',()=>{
  expect(eventFlow(event('agent_end'))).toBeNull();
  expect(eventFlow(event('serialized'))?.operation).toContain('尚未发送');
  expect(eventFlow(event('write'))).toEqual({from:'tools',to:'workspace',operation:'写入文件内容'});
  expect(eventFlow(event('read'))?.from).toBe('workspace');
  expect(eventFlow(event('sse-frame'))?.to).toBe('parser');
 });
});
