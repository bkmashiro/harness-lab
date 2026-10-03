<script lang="ts">
  import type {TraceEvent,Lane} from '../contracts';
  import {eventFlow} from '../flow';
  export let events:TraceEvent[]=[];
  export let selected:TraceEvent|null=null;
  export let focus:string[]=[];
  export let onSelect:(id:string)=>void=()=>{};
  const actors:{id:Lane;label:string;description:string}[]=[
    {id:'user',label:'用户',description:'提出任务'}, {id:'context',label:'上下文',description:'组织模型输入'},
    {id:'provider',label:'模型接口',description:'请求与响应'}, {id:'parser',label:'解析器',description:'增量转为事件'},
    {id:'harness',label:'Harness',description:'控制下一步'}, {id:'tools',label:'工具',description:'执行动作'},
    {id:'workspace',label:'虚拟 FS',description:'文件状态'}, {id:'session',label:'会话',description:'消息与生命周期'}
  ];
  const structure:[Lane,Lane][]=[['user','context'],['context','provider'],['provider','parser'],['parser','harness'],['harness','tools'],['tools','workspace'],['tools','context']];
  $: nodes=actors.filter(n=>!focus.length||focus.includes(n.id)).map((n,i)=>({...n,x:32+i*176,y:62,w:132}));
  $: width=Math.max(560,nodes.length*176+20);
  $: past=events.filter(e=>selected&&e.seq<=selected.seq);
  $: flow=selected?eventFlow(selected):null;
  $: visibleFlow=flow&&nodes.some(n=>n.id===flow.from)&&nodes.some(n=>n.id===flow.to)?flow:null;
  $: activeLane=visibleFlow?.to??selected?.lane;
  $: links=structure.filter(([a,b])=>nodes.some(n=>n.id===a)&&nodes.some(n=>n.id===b));
  function latest(id:string){return past.filter(e=>e.lane===id).at(-1);}
  function point(id:string){const n=nodes.find(n=>n.id===id)!;return{x:n.x+n.w/2,y:n.y};}
  function selectLane(id:Lane){const e=latest(id);if(e)onSelect(e.id);}
  function payload(e:TraceEvent){
    const d=e.data as any;const call=d?.message?.content?.find?.((c:any)=>c.type==='toolCall');
    if(call)return `${call.name}(${JSON.stringify(call.arguments)})`;
    if(d?.path)return d.path;
    if(d?.toolName)return `${d.toolName} · ${d.toolCallId??''}`;
    if(d?.method)return `${d.method} ${d.url}`;
    return e.title;
  }
</script>
<div class="system-map">
  <svg viewBox={`0 0 ${width} 164`} role="img" aria-label="本章关注的参与者与当前操作">
    <defs><marker id="chapter-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#91a9a0"/></marker><marker id="chapter-flow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#16836b"/></marker></defs>
    {#each links as [a,b]}
      {@const from=point(a)}{@const to=point(b)}
      <path class="map-link" d={`M${from.x+66} 91 H${to.x-66}`} marker-end="url(#chapter-arrow)"/>
    {/each}
    {#if visibleFlow}
      {@const from=point(visibleFlow.from)}{@const to=point(visibleFlow.to)}
      {#if visibleFlow.from!==visibleFlow.to}<path class="flow-link" d={`M${from.x} 59 Q${(from.x+to.x)/2} 13 ${to.x} 59`} marker-end="url(#chapter-flow)"/>{/if}
    {/if}
    {#if selected}
      <g class="flow-tag" transform={`translate(${width/2},20)`}><title>{flow?.operation??selected.kind} · {payload(selected)}</title><rect x="-238" y="-12" width="476" height="25" rx="7"/><text text-anchor="middle" y="4">{flow?.operation??'查看真实事件'} · {payload(selected).slice(0,43)}</text></g>
    {/if}
    {#each nodes as node}
      <g role="button" tabindex="0" aria-label={`选择 ${node.label} 最近的已发生事件`} class:current={activeLane===node.id} class:visited={!!latest(node.id)} class="map-node" transform={`translate(${node.x},${node.y})`} onclick={()=>selectLane(node.id)} onkeydown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectLane(node.id);}}}>
        <rect width={node.w} height="57" rx="11"/><circle cx="15" cy="20" r="3.5"/><text x="27" y="24">{node.label}</text><text class="node-state" x="15" y="44">{activeLane===node.id?'当前操作':node.description}</text>
      </g>
    {/each}
    <text class="caption" x="32" y="151">只展开本章相关参与者 · 实线对应操作，虚线表示结构关系</text>
  </svg>
  {#if selected?.kind==='sse-frame'}<p>这是响应读取片段，可能含半个或多个 SSE 帧，不代表 token。</p>{/if}
</div>
<style>
.system-map{width:100%;min-width:0}.system-map svg{display:block;width:100%;height:auto}.map-link{stroke:#b9cbc2;stroke-width:1.3;stroke-dasharray:4 4;fill:none}.flow-link{stroke:#16836b;stroke-width:2.4;fill:none}.map-node{cursor:pointer;outline:none}.map-node rect{fill:#fff;stroke:#d6e3dc}.map-node circle{fill:#a7bcb1}.map-node text{font:600 15px system-ui,sans-serif;fill:#243e36}.map-node .node-state{font:12px system-ui,sans-serif;fill:#7a8d83}.map-node.visited rect{stroke:#94beaa}.map-node.current rect{fill:#eef8f1;stroke:#16836b;stroke-width:1.8}.map-node.current circle{fill:#16836b}.map-node:focus rect{stroke:#4d71bf;stroke-width:2}.flow-tag rect{fill:#e9f4ed;stroke:#b7d5c3}.flow-tag text{font:12px system-ui,sans-serif;fill:#216d50}.caption{font:11px system-ui,sans-serif;fill:#7c9085}.system-map p{font-size:11px;color:#7c9085;margin:0 12px}
</style>
