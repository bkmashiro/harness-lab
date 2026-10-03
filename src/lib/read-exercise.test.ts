import {describe,it,expect} from 'vitest';
import {runInProcess} from './runtime';
import {defaultSettings,INITIAL_FILES} from './contracts';

for(const protocol of ['chat','responses'] as const){
 describe(`${protocol} read-only teaching exercise`,()=>{
  for(const path of ['/src/sum.js','/src/missing.js','']){
   it(`executes and reports the actual outcome for ${JSON.stringify(path)}`,async()=>{
    const result=await runInProcess({settings:{...defaultSettings,protocol,scenario:'read-once',demoReadPath:path,delayMs:0},prompt:`请调用 read_file 读取 ${JSON.stringify(path)}。`,files:INITIAL_FILES});
    expect(result.status).toBe('completed');
    const tools=result.events.filter(e=>e.kind==='tool_execution_end');expect(tools).toHaveLength(1);
    const tool=tools[0].data as any;expect(tool.toolName).toBe('read_file');expect(tool.isError).toBe(path!=='/src/sum.js');
    expect(result.files).toEqual(INITIAL_FILES);expect(result.events.some(e=>e.kind==='write'||e.kind==='test')).toBe(false);
    if(path==='/src/missing.js')expect(JSON.stringify(tool.result)).toContain('File not found');
    if(path==='')expect(JSON.stringify(tool.result)).toMatch(/validation|validate|invalid|minLength/i);
   });
  }
 });
}
