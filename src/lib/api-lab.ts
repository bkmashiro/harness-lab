import { DEFAULT_PROMPT, type Settings, type Emit } from './contracts';
import { createTransport, resolveEndpoint, sanitize } from './transport';

export function previewApiRequest(settings:Settings, streaming:boolean, prompt=DEFAULT_PROMPT){
  const tool={name:'read_file',description:'读取教学虚拟文件；此单次 API 实验只观察响应，不执行工具。',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}};
  return settings.protocol==='chat'
    ? {model:settings.model,messages:[{role:'user',content:prompt}],tools:[{type:'function',function:tool}],stream:streaming}
    : {model:settings.model,input:[{role:'user',content:prompt}],tools:[{type:'function',...tool}],stream:streaming};
}

export async function testApi(settings:Settings,streaming:boolean,emit:Emit,signal?:AbortSignal,prompt=DEFAULT_PROMPT){
  const request=previewApiRequest(settings,streaming,prompt);
  const transport=createTransport(settings,emit,signal);
  const response=await transport(resolveEndpoint(settings.baseUrl,settings.protocol),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${settings.mode==='demo'?'demo-fixture-key':settings.apiKey}`},body:JSON.stringify(request),signal});
  const body=await response.text();
  const safe=JSON.stringify(sanitize(body)).split(settings.apiKey || '\u0000').join('[REDACTED]');
  emit('parser','api_test_result','单次 API 响应（未执行工具）',{status:response.status,streaming,body:JSON.parse(safe)},'api-lab');
  if(!response.ok) throw new Error(`API 返回 HTTP ${response.status}，详见时间轴响应。`);
  return JSON.parse(safe);
}
