<script lang="ts">
  import type { TraceEvent, Lane } from '../contracts';
  import {eventFlow} from '../flow';
  export let events: TraceEvent[] = [];
  export let selected: TraceEvent | null = null;
  export let focus: string[] = [];
  export let onSelect: (id: string) => void = () => {};

  const nodes: {id: Lane; label: string; x: number; y: number; w: number}[] = [
    {id:'user', label:'User', x:28, y:44, w:92}, {id:'context', label:'Context', x:151, y:44, w:108},
    {id:'provider', label:'Provider', x:290, y:44, w:112}, {id:'parser', label:'Parser', x:431, y:44, w:100},
    {id:'harness', label:'Harness', x:556, y:44, w:112}, {id:'tools', label:'Tools', x:693, y:44, w:92},
    {id:'workspace', label:'Workspace', x:550, y:133, w:128}, {id:'session', label:'Session', x:252, y:133, w:112}
  ];
  $: pastEvents = events.filter((event) => selected ? event.seq <= selected.seq : false);
  $: flow = selected ? eventFlow(selected) : null;
  function laneEvent(id: string) { return pastEvents.filter((event) => event.lane === id).at(-1); }
  function seen(id: string) { return !!laneEvent(id); }
  function active(id: string) { return selected?.lane === id; }
  function point(id: string) {
    const node = nodes.find((item) => item.id === id)!;
    return {x: node.x + node.w / 2, y: node.y - 2};
  }
  function payload(event: TraceEvent) {
    const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {};
    const candidates = [data.toolName, data.name, data.path, data.url, data.method, data.type, data.contentType];
    const details = candidates.filter((value) => typeof value === 'string' && value.length).slice(0, 2).join(' · ');
    if (details) return details.slice(0, 46);
    if (event.kind === 'request' || event.kind === 'response') return `${event.kind === 'request' ? 'HTTP 请求' : 'HTTP 响应'} · ${event.title}`.slice(0, 46);
    if (event.kind.includes('stream') || event.kind.includes('delta')) return `协议事件 · ${event.kind}`.slice(0, 46);
    if (typeof data.content === 'string') return `内容 · ${data.content.slice(0, 36)}`;
    return event.title.slice(0, 46);
  }
  function selectLane(id: Lane) {
    const latest = laneEvent(id);
    if (latest) onSelect(latest.id);
  }
</script>
<div class="system-map">
  <svg viewBox="0 0 820 190" role="img" aria-label="Agent 系统数据流及所选事件前后的实际事件映射">
    <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#a7b4b1" /></marker><marker id="flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#16836b" /></marker></defs>
    <path class="map-link" d="M120 68H149M259 68H288M402 68H429M531 68H554M668 68H691" marker-end="url(#arrow)" />
    <path class="map-link secondary" d="M739 91V116H615V130M610 91V122H365M306 91V122H306" marker-end="url(#arrow)" />
    <path class="map-link secondary" d="M254 150H125V91" marker-end="url(#arrow)" />
    {#if flow && selected}
      {@const from = point(flow.from)}{@const to = point(flow.to)}
      {#if flow.from!==flow.to}<path class="flow-link" d={`M${from.x} ${from.y} Q${(from.x+to.x)/2} 12 ${to.x} ${to.y}`} marker-end="url(#flow-arrow)" />{/if}
      <g class="flow-tag" transform="translate(410,15)"><title>{flow.operation} · {payload(selected)}</title><rect x="-170" y="-11" width="340" height="21" rx="6"/><text text-anchor="middle" y="3">{flow.operation} · {payload(selected).slice(0,30)}</text></g>
    {/if}
    {#each nodes as node}
      <g role="button" tabindex="0" aria-label={`选择 ${node.label} 通道最近的过去事件`} class:focused={focus.includes(node.id)} class:visited={seen(node.id)} class:current={active(node.id)} class="map-node {node.id}" transform={`translate(${node.x},${node.y})`} onclick={() => selectLane(node.id)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLane(node.id); } }}>
        <rect width={node.w} height="47" rx="10" /><circle cx="15" cy="16" r="3.2" /><text x="27" y="21">{node.label}</text>
        <text class="node-state" x="15" y="37">{active(node.id) ? '当前事件' : seen(node.id) ? `#${laneEvent(node.id)?.seq} 已发生` : focus.includes(node.id) ? '本章关注' : '等待'}</text>
      </g>
    {/each}
    <text class="map-caption" x="28" y="181">实线按所选操作展示数据关系；虚线为教学结构，不由事件时间相邻推断因果。</text>
  </svg>
  {#if selected?.kind==='sse-frame'}<p class="flow-note">此处是 fetch 读取的响应片段，可能包含半个或多个 SSE 帧；安全观测可能合并片段，不代表 token。</p>{:else if selected?.kind==='stream_event'}<p class="flow-note">此处是 Pi adapter 解析后的统一事件，原始响应可在 Provider 通道查看。</p>{/if}
</div>
<style>
.system-map{width:100%;overflow:hidden}.system-map svg{display:block;width:100%;height:auto;min-height:168px}.map-link{fill:none;stroke:#c5d0cb;stroke-width:1.4;stroke-dasharray:4 4}.map-link.secondary{stroke:#d5ddda;stroke-dasharray:3 5}.flow-link{fill:none;stroke:#16836b;stroke-width:2.2;stroke-dasharray:5 3}.map-node{cursor:pointer;outline:none}.map-node rect{fill:#fff;stroke:#dce4e0;stroke-width:1}.map-node circle{fill:#b4c0bb}.map-node text{font:600 12px system-ui,sans-serif;fill:#243b3c}.map-node text.node-state{font:10px system-ui,sans-serif;font-weight:400;fill:#82918c}.map-node.focused rect{stroke:#b8d8cc;fill:#f8fcfa}.map-node.visited rect{stroke:#88b9a5}.map-node.visited circle,.map-node.current circle{fill:#16836b}.map-node.current rect{stroke:#167d66;stroke-width:1.8;fill:#f1faf6}.map-node.current text.node-state{fill:#167d66;font-weight:600}.map-node:focus rect{stroke:#315dcb;stroke-width:2}.flow-tag rect{fill:#e8f5ef;stroke:#8bc5ad}.flow-tag text{font:10px system-ui,sans-serif;fill:#146f5b}.map-caption{font:10px system-ui,sans-serif;fill:#899691}.flow-note{margin:0 12px 8px;color:#74827d;font:10px/1.5 system-ui,sans-serif}
@media(max-width:520px){.system-map{overflow-x:auto;overscroll-behavior-x:contain}.system-map svg{width:680px;max-width:none}}
</style>
