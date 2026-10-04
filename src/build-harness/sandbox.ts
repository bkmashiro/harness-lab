import type {BuilderEvent,BuilderHandle,BuilderResult,BuilderRunInput} from './contracts';

let referencePromise:Promise<string>|undefined;
function referenceSource(){
 return referencePromise??=fetch(new URL('./reference/harness.mjs',location.href),{credentials:'omit',redirect:'error'}).then(async r=>{if(!r.ok)throw new Error(`参考代码加载失败：HTTP ${r.status}`);return r.text();}).catch(e=>{referencePromise=undefined;throw e;});
}

const workerSource=String.raw`
self.onmessage=async({data})=>{
 const events=[];let seq=0;const files={'/src/sum.js':'export function sum(a, b) { return a - b; }','/README.md':'修复 sum(a, b)，运行三个算术测试。'};
 const clean=value=>{
  const text=JSON.stringify(value,(_key,v)=>typeof v==='function'?'[function]':v);
  if(new TextEncoder().encode(text??'').byteLength>200000)throw new Error('输出超过本实验的 200KB 限制');return text===undefined?null:JSON.parse(text);
 };
 const emit=(type,payload,source='runtime')=>{if(events.length>=200)return;const event={seq:++seq,type:String(type).slice(0,100),data:clean(payload),source};events.push(event);postMessage({kind:'event',event,files:clean(files)});};
 try{
  const source=data.reference.replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let)\b)/gm,'');
  const helpers=new Function(source+'\nreturn {createDemoProvider,createWorkspaceTools,createMockFetch};')();
  const controller=new AbortController();
  const tools=helpers.createWorkspaceTools(files).map(tool=>({...tool,execute:async(args,options)=>{
   emit('tool_start',{name:tool.name,arguments:args});
   try{const output=await tool.execute(args,options);emit('tool_end',{name:tool.name,...output});return output;}
   catch(e){emit('tool_end',{name:tool.name,isError:true,content:String(e)});throw e;}
  }}));
  const provider=helpers.createDemoProvider({scenario:data.scenario});let requests=0;
  const ctx={files,prompt:'读取 /src/sum.js，修复 sum 的减法错误，运行测试并说明结果。',tools,signal:controller.signal,emit:(type,payload)=>emit(type,payload,'learner'),
   provider:async(input)=>{emit('model_request',{messages:input.messages,tools:input.tools});const reply=await provider(input);emit('model_response',reply);if(data.abortAfterRequests&&++requests>=data.abortAfterRequests)controller.abort();return reply;},
   mockFetch:(protocol)=>{const mock=helpers.createMockFetch(protocol,data.scenario);return async(input,init)=>{
    const options=typeof input==='object'&&!(input instanceof Request)?input:init;
    emit('http_request',{protocol,body:JSON.parse(options?.body??'{}')});
    const response=await mock(typeof input==='object'?'https://mock.invalid/v1':input,options);
    emit('http_response',{protocol,status:response.status,body:await response.clone().json()});return response;
   }}
  };
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('ctx',data.code+'\nif(typeof main!=="function")throw new Error("请定义 async function main(ctx)");return await main(ctx);');
  const value=await run(ctx);
  postMessage({kind:'result',status:'completed',value:clean(value),files:clean(files),events});
 }catch(e){postMessage({kind:'result',status:'error',error:String(e?.message??e).slice(0,4000),files:clean(files),events});}
};`;

export function runBuilderCode(input:BuilderRunInput):BuilderHandle{
 const observed:BuilderEvent[]=[];let latestFiles:Record<string,string>={};
 let frame:HTMLIFrameElement|undefined;let done=false;let timer:ReturnType<typeof setTimeout>;
 const runId=crypto.randomUUID();let settle:(r:BuilderResult)=>void;
 const result=new Promise<BuilderResult>(resolve=>settle=resolve);
 const finish=(r:BuilderResult)=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',receive);frame?.remove();settle(r);};
 const receive=(event:MessageEvent)=>{
  if(done||event.source!==frame?.contentWindow||event.data?.runId!==runId||!['event','result'].includes(event.data?.kind))return;
  const payload=event.data;
  if(payload.kind==='event'){if(observed.length<200)observed.push(payload.event);latestFiles=payload.files??latestFiles;return;}
  finish({status:payload.status==='completed'?'completed':'error',value:payload.value,files:payload.files??{},events:payload.events??[],...(payload.error?{error:String(payload.error)}:{})});
 };
 window.addEventListener('message',receive);
 const timeout=Math.min(10000,Math.max(100,input.timeoutMs??3000));
 timer=setTimeout(()=>finish({status:'timeout',error:`运行超过 ${timeout}ms，已终止执行实例。`,events:observed,files:latestFiles}),timeout);
 if(new TextEncoder().encode(input.code).byteLength>100000){finish({status:'error',error:'代码超过本实验的 100KB 限制。',events:[],files:{}});}
 else void referenceSource().then(reference=>{
  if(done)return;
  frame=document.createElement('iframe');frame.hidden=true;frame.sandbox.add('allow-scripts');
  const payload=JSON.stringify({runId,code:input.code,reference,scenario:input.scenario??'repair',abortAfterRequests:input.abortAfterRequests}).replaceAll('<','\\u003c');
  const worker=JSON.stringify(workerSource).replaceAll('<','\\u003c');
  frame.srcdoc=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; worker-src blob:; connect-src 'none'; child-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'"><script>const payload=${payload};try{const worker=new Worker(URL.createObjectURL(new Blob([${worker}],{type:'text/javascript'})));worker.onmessage=e=>parent.postMessage({...e.data,runId:payload.runId},'*');worker.onerror=()=>parent.postMessage({kind:'result',status:'error',error:'Worker 启动或执行失败',runId:payload.runId},'*');worker.postMessage(payload);}catch(e){parent.postMessage({kind:'result',status:'error',error:String(e),runId:payload.runId},'*');}<\/script>`;
  document.body.append(frame);
 }).catch(e=>finish({status:'error',error:String(e),events:[],files:{}}));
 return {result,cancel:()=>finish({status:'cancelled',error:'已停止当前运行。',events:observed,files:latestFiles})};
}
