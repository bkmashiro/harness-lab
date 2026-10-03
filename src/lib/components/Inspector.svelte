<script lang="ts">
  import type { TraceEvent } from '../contracts';
  export let event: TraceEvent | null = null;
  export let files: Record<string,string> = {};
  export let prevFiles: Record<string,string> = {};
  export let onExport: () => void = () => {};
  let tab: 'summary'|'json'|'files'|'diff'|'source' = 'summary';
  let selectedFile = '/src/sum.js';
  const fileNames = () => Object.keys(files ?? {});
  const eventJson = () => JSON.stringify(event, null, 2);
  const sourceCommit = 'a13d35a742c6ef8462812a28fbe1d8c8b7431c32';
  function sourceLocation(source?: string) {
    if (!source) return null;
    const links: Record<string, {label:string; url?:string}> = {
      'pi-agent-core': {label:'pi-agent-core · Agent 状态/事件', url:`https://github.com/earendil-works/pi/blob/${sourceCommit}/packages/agent/src/agent.ts`},
      'pi-agent-core/loop': {label:'pi-agent-core · agent loop', url:`https://github.com/earendil-works/pi/blob/${sourceCommit}/packages/agent/src/agent-loop.ts`},
      'pi-ai': {label:'pi-ai · protocol API', url:`https://github.com/earendil-works/pi/blob/${sourceCommit}/packages/ai/src/types.ts`},
      'chat': {label:'pi-ai · OpenAI Chat Completions', url:`https://github.com/earendil-works/pi/blob/${sourceCommit}/packages/ai/src/api/openai-completions.ts`},
      'responses': {label:'pi-ai · OpenAI Responses', url:`https://github.com/earendil-works/pi/blob/${sourceCommit}/packages/ai/src/api/openai-responses.ts`},
      'workspace': {label:'本站实现说明 · 虚拟工作区读写'},
      'executor': {label:'本站实现说明 · 安全教学测试执行器'},
      'api-lab': {label:'本站实现说明 · API 单次请求/响应实验'},
    };
    return links[source] ?? {label:source, url:`https://github.com/earendil-works/pi/blob/${sourceCommit}/${source}`};
  }
  function diffLines(before: string, after: string) {
    const a = before.split('\n'); const b = after.split('\n');
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (suffix < a.length-prefix && suffix < b.length-prefix && a[a.length-1-suffix] === b[b.length-1-suffix]) suffix++;
    return [
      ...a.slice(0,prefix).map((text) => ({kind:'same', text})),
      ...a.slice(prefix,a.length-suffix).map((text) => ({kind:'removed', text})),
      ...b.slice(prefix,b.length-suffix).map((text) => ({kind:'added', text})),
      ...a.slice(a.length-suffix).map((text) => ({kind:'same', text}))
    ];
  }
  $: selectedFile = files?.[selectedFile] !== undefined ? selectedFile : fileNames()[0] ?? '/src/sum.js';
  $: sourceRef = sourceLocation(event?.source);
  $: before = prevFiles?.[selectedFile] ?? '';
  $: after = files?.[selectedFile] ?? '';
</script>
<div class="inspector">
  <div class="inspector-head"><div><span class="eyebrow">INSPECTOR</span><h2>运行检查器</h2></div><span class="inspect-live"><i></i>{event ? `#${String(event.seq).padStart(2,'0')}` : '等待事件'}</span></div>
  <div class="inspector-tabs" role="tablist" aria-label="运行检查器视图">
    <button class:active={tab==='summary'} role="tab" aria-selected={tab==='summary'} onclick={() => tab='summary'}>摘要</button>
    <button class:active={tab==='json'} role="tab" aria-selected={tab==='json'} onclick={() => tab='json'}>JSON</button>
    <button class:active={tab==='files'} role="tab" aria-selected={tab==='files'} onclick={() => tab='files'}>文件</button>
    <button class:active={tab==='diff'} role="tab" aria-selected={tab==='diff'} onclick={() => tab='diff'}>Diff</button>
    <button class:active={tab==='source'} role="tab" aria-selected={tab==='source'} onclick={() => tab='source'}>源码</button>
  </div>
  {#if !event}<div class="inspector-empty"><span>⌁</span><b>选择一条运行事件</b><p>检查器会跟随所选时间点更新。未发生的文件状态不会提前显示。</p></div>
  {:else if tab==='summary'}
    <div class="inspector-content"><div class="event-summary"><span class="summary-kind">{event.kind}</span><h3>{event.title}</h3><p>{event.lane} 通道 · 序号 {event.seq}</p></div><div class="inspect-section"><span class="eyebrow">事件信息</span><dl><div><dt>事件 ID</dt><dd>{event.id}</dd></div><div><dt>通道</dt><dd>{event.lane}</dd></div><div><dt>时间</dt><dd>{new Date(event.at).toLocaleTimeString('zh-CN')}</dd></div><div><dt>来源</dt><dd>{sourceRef?.label ?? event.source ?? '运行时事件'}</dd></div></dl></div><div class="inspect-section"><span class="eyebrow">数据摘要</span><pre class="data-preview">{JSON.stringify(event.data, null, 2)}</pre></div></div>
  {:else if tab==='json'}
    <div class="inspector-content"><div class="inspect-kicker">当前选中事件 · 原始结构</div><pre class="json-view">{eventJson()}</pre></div>
  {:else if tab==='files'}
    <div class="inspector-content"><div class="inspect-kicker">此事件时刻的工作区快照</div>{#if fileNames().length}<div class="file-picker">{#each fileNames() as filename}<button class:chosen={selectedFile===filename} onclick={() => selectedFile=filename}>{filename}</button>{/each}</div><pre class="file-view">{files[selectedFile] ?? '此事件尚无该文件快照。'}</pre><button class="inspector-export" onclick={onExport}>导出本地文件 ↥</button>{:else}<div class="mini-empty">该事件未携带文件快照。</div>{/if}</div>
  {:else if tab==='diff'}
    <div class="inspector-content"><div class="inspect-kicker">与前一状态逐行比较 · {selectedFile}</div>{#if fileNames().length}<div class="file-picker">{#each fileNames() as filename}<button class:chosen={selectedFile===filename} onclick={() => selectedFile=filename}>{filename}</button>{/each}</div><div class="diff-view" aria-label="文件差异">{#each diffLines(before,after) as line}<div class:added={line.kind==='added'} class:removed={line.kind==='removed'} class="diff-line"><span>{line.kind==='added'?'+':line.kind==='removed'?'-':' '}</span><code>{line.text || ' '}</code></div>{/each}</div><div class="diff-legend"><span class="removed-text">− before</span><span class="added-text">+ after</span></div>{:else}<div class="mini-empty">该事件未携带文件快照。</div>{/if}</div>
  {:else}
    <div class="inspector-content"><div class="inspect-kicker">固定版本源码定位</div>{#if sourceRef}{#if sourceRef.url}<a class="source-ref" href={sourceRef.url} target="_blank" rel="noreferrer">↗ {sourceRef.label}</a>{:else}<div class="source-ref">{sourceRef.label}</div>{/if}<p class="source-pin">{#if sourceRef.url}Pi 仓库固定提交 <code>{sourceCommit.slice(0,12)}</code> · 路径按事件来源映射{:else}本站实现说明 · 本地运行时源码不作为可点击外链{/if}</p><pre class="source-note">源码仅作为定位链接；事件内容按纯文本显示，不会动态加载或执行。</pre>{:else}<div class="mini-empty">此事件没有源码引用。</div>{/if}</div>
  {/if}
  <div class="inspector-foot"><span><i></i> 事件快照</span><span>{event ? '已同步' : '无数据'}</span></div>
</div>
<style>
.inspector{height:100%;min-height:500px;background:#fff;border:1px solid #e3e9e5;border-radius:14px;display:flex;flex-direction:column;overflow:hidden}.inspector-head{padding:22px 20px 17px;display:flex;align-items:center;justify-content:space-between}.inspector-head h2{font-size:16px;margin:6px 0 0;color:#1c3436}.eyebrow{font-size:9px;letter-spacing:.13em;color:#8b9993;font-weight:700}.inspect-live{font-size:10px;color:#16836b;display:flex;gap:6px;align-items:center}.inspect-live i,.inspector-foot i{width:6px;height:6px;border-radius:50%;background:#28a67b}.inspector-tabs{display:grid;grid-template-columns:repeat(5,1fr);padding:0 14px;border-bottom:1px solid #e8eeea}.inspector-tabs button{border:0;background:transparent;padding:11px 2px;color:#7c8984;font:500 11px inherit;border-bottom:2px solid transparent;cursor:pointer}.inspector-tabs button.active{border-color:#18836b;color:#146f5b;font-weight:700}.inspector-content{padding:18px 18px 24px;overflow:auto;flex:1;min-height:0}.event-summary{padding:16px;background:#f5f9f6;border:1px solid #e5eee8;border-radius:10px}.summary-kind{display:inline-block;background:#e7f3ed;color:#19745f;padding:4px 7px;border-radius:4px;font-size:9px;font-weight:700}.event-summary h3{font-size:15px;line-height:1.45;color:#243b3b;margin:12px 0 6px}.event-summary p,.inspect-kicker{font-size:10px;color:#82908b}.inspect-section{padding:20px 0;border-bottom:1px solid #edf1ee}.inspect-section dl{margin:10px 0 0}.inspect-section dl div{display:grid;grid-template-columns:62px minmax(0,1fr);gap:8px;padding:7px 0;font-size:10px}.inspect-section dt{color:#8b9692}.inspect-section dd{margin:0;color:#354947;overflow-wrap:anywhere}.data-preview,.json-view,.file-view,.source-note{background:#f7f9f8;border:1px solid #edf1ef;border-radius:8px;padding:12px;color:#425451;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;max-height:260px;overflow:auto}.json-view{margin-top:12px;max-height:600px}.file-picker{display:flex;flex-wrap:wrap;gap:5px;margin:12px 0}.file-picker button{border:1px solid #e0e8e3;background:#fff;border-radius:5px;padding:5px 7px;color:#60716b;font:10px ui-monospace,monospace;cursor:pointer}.file-picker button.chosen{border-color:#8bbba6;background:#f1f8f4;color:#176f5b}.file-view{max-height:360px}.inspector-export{width:100%;border:1px solid #dbe6df;background:#fff;border-radius:7px;padding:9px;color:#426259;font-size:10px;cursor:pointer}.diff-view{border:1px solid #e7ece9;border-radius:8px;overflow:auto;background:#f8faf9}.diff-line{display:flex;min-height:21px;font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#65736e}.diff-line>span{flex:0 0 22px;text-align:center;color:#929f99}.diff-line code{white-space:pre;padding-right:8px}.diff-line.added{background:#eaf7ef;color:#176a44}.diff-line.added>span{color:#187648}.diff-line.removed{background:#fff0ed;color:#9c4034}.diff-line.removed>span{color:#bb5142}.diff-legend{display:flex;gap:12px;padding:8px 2px;font:10px system-ui,sans-serif}.removed-text{color:#a34a3c}.added-text{color:#21774c}.source-ref{display:block;margin-top:14px;padding:12px;border:1px solid #dce8e1;border-radius:8px;background:#f6faf7;color:#176f5b;font-size:11px;overflow-wrap:anywhere}.source-pin{font-size:10px;color:#7d8a84;overflow-wrap:anywhere}.source-pin code{font-family:ui-monospace,monospace}.source-note{font-size:9px}.mini-empty{border:1px dashed #dce5e0;border-radius:8px;padding:24px 14px;color:#899590;font-size:11px;text-align:center;margin-top:15px}.inspector-empty{flex:1;padding:48px 22px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center}.inspector-empty>span{font-size:32px;color:#a0bdb0}.inspector-empty b{font-size:12px;color:#475b56;margin-top:14px}.inspector-empty p{font-size:10px;line-height:1.7;color:#899590}.inspector-foot{border-top:1px solid #edf1ef;padding:12px 18px;display:flex;justify-content:space-between;font-size:9px;color:#85928d}.inspector-foot span:first-child{display:flex;align-items:center;gap:6px}
</style>