import {describe,it,expect} from 'vitest';
import {defaultSettings} from './contracts';
import {previewApiRequest,testApi} from './api-lab';

describe('API teaching explorer',()=>{
 for(const protocol of ['chat','responses'] as const){
  it(`${protocol} previews and consumes non-stream JSON without executing tools`,async()=>{
   const settings={...defaultSettings,protocol,delayMs:0};const captured:any[]=[];
   const request=previewApiRequest(settings,false);expect(request.stream).toBe(false);
   await testApi(settings,false,(lane,kind,title,data)=>captured.push({lane,kind,title,data}));
   const response=captured.find(e=>e.kind==='api_test_result');expect(response.data.status).toBe(200);
   const body=JSON.parse(response.data.body);
   if(protocol==='chat'){expect(body.choices[0].message.tool_calls[0].function.name).toBe('read_file');}
   else{expect(body.output[0].type).toBe('function_call');expect(body.output[0].name).toBe('read_file');}
   expect(captured.some(e=>e.kind==='tool_execution_start')).toBe(false);
  });
 }
 it('preserves the distinct tool declaration formats',()=>{
  const chat=previewApiRequest({...defaultSettings,protocol:'chat'},true) as any;
  const responses=previewApiRequest({...defaultSettings,protocol:'responses'},true) as any;
  expect(chat.tools[0].function.name).toBe('read_file');expect(responses.tools[0].name).toBe('read_file');expect(responses.tools[0].function).toBeUndefined();
 });
});
