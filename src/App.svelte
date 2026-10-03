<script lang="ts">
  import { onMount } from 'svelte';
  import { chapters } from './content/chapters';
  import { DEFAULT_PROMPT, defaultSettings, INITIAL_FILES, type Settings, type TraceEvent } from './lib/contracts';
  import { startRun } from './lib/runtime';
  import SystemMap from './lib/components/SystemMap.svelte';
  import Inspector from './lib/components/Inspector.svelte';
  import { previewApiRequest, testApi } from './lib/api-lab';
  import { resolveEndpoint } from './lib/transport';
  import { projectChapter } from './lib/chapter-projection';

  let page: 'learn' | 'settings' = $state('learn');
  let chapterIndex = $state(0);
  let events: TraceEvent[] = $state([]);
  let selected = $state(-1);
  let status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error' = $state('idle');
  let errorText = $state('');
  let settings: Settings = $state({...defaultSettings});
  let prompt = $state(DEFAULT_PROMPT);
  let files: Record<string,string> = $state({...INITIAL_FILES});
  let fileEdit = $state(INITIAL_FILES['/src/sum.js']);
  let running: ReturnType<typeof startRun> | undefined;
  let playing = $state(false);
  let speed = $state(900);
  let showConfirm = $state(false);
  let confirmAction:'agent'|'api' = $state('agent');
  let apiStreaming = $state(true);
  let apiController:AbortController | undefined;
  let apiOutcome = $state('');
  let rightTab: 'data'|'fs'|'events'|'source' = $state('events');
  let fullTrace = $state(false);
  let showExercise = $state(false);
  let readingOverride:number|null = $state(null);
  const apiPreview = $derived(JSON.stringify(previewApiRequest(settings,apiStreaming,prompt),null,2));
  let savedNotice = $state('');
  let workspaceSaved = $state(false);
  const isDefaultPrompt = $derived(prompt.trim() === DEFAULT_PROMPT.trim());
  const demoFixtureNote = $derived(settings.mode === 'demo' && !isDefaultPrompt);
  const activeChapter = $derived(chapters[chapterIndex]);
  const projection = $derived(projectChapter(activeChapter.id, events));
  const visibleEvents = $derived(fullTrace ? events : projection.events);
  const visibleSelected = $derived(visibleEvents.findIndex(event => event.id === events[selected]?.id));
  const currentEvent = $derived(visibleEvents[visibleSelected] ?? null);
  const readingStep=$derived(readingOverride??Math.max(0,Math.min(activeChapter.body.length-1,visibleSelected)));
  const currentFiles = $derived(currentEvent?.files ?? (events.length ? events[events.length - 1].files : files));
  const previousFiles = $derived.by(() => {
    if (!currentEvent) return INITIAL_FILES;
    const index = events.findIndex(event => event.id === currentEvent.id);
    return index > 0 ? events[index - 1].files : INITIAL_FILES;
  });
  const endpoint = $derived.by(()=>{try{return resolveEndpoint(settings.baseUrl,settings.protocol);}catch(error){return String(error);}});
  const lanes = ['user','context','provider','parser','harness','tools','workspace','session'];

  function focusEvent(preferredId: string | null = null) {
    const pool = fullTrace ? events : projectChapter(activeChapter.id, events).events;
    const target = (preferredId && pool.find(event => event.id === preferredId)) ?? pool[0];
    selected = target ? events.findIndex(event => event.id === target.id) : -1;
  }
  function onEvent(event: TraceEvent) {
    events = [...events, event];
    if (selected < 0) focusEvent(projection.preferredId);
  }
  async function run() {
    showConfirm = false;
    errorText = '';
    events = []; selected = -1; status = 'running'; playing = false;
    const runFiles = {...files, '/src/sum.js': fileEdit};
    files = runFiles;
    try {
      running = startRun({settings: {...settings}, prompt, files: runFiles, onEvent});
      const result = await running.result;
      files = result.files ?? runFiles;
      status = result.status === 'error' ? 'error' : result.status;
      if (result.error) errorText = result.error;
      if (events.length === 0) events = result.events ?? [];
      focusEvent(projectChapter(activeChapter.id, events).preferredId);
    } catch (error) {
      status = 'error'; errorText = error instanceof Error ? error.message : String(error);
    } finally { running = undefined; }
  }
  function start() {
    confirmAction='agent';
    if (settings.mode === 'live') showConfirm = true;
    else void run();
  }
  async function runApiTest() {
    showConfirm=false;apiOutcome='';errorText='';chapterIndex=chapters.findIndex(c=>c.id==='api-lab');rightTab='events';fullTrace=false;events=[];selected=-1;status='running';apiController=new AbortController();
    const snapshot={...files,'/src/sum.js':fileEdit};
    try {
      await testApi({...settings},apiStreaming,(lane,kind,title,data,source)=>onEvent({id:`api-${events.length+1}`,seq:events.length+1,at:Date.now(),lane,kind,title,data,files:{...snapshot},source}),apiController.signal,prompt);
      status='completed';apiOutcome='响应已进入时间轴。单次实验不执行工具；返回课程可逐步查看。';
    } catch(error) {status=apiController.signal.aborted?'cancelled':'error';errorText=String(error);apiOutcome=errorText;}
    finally{apiController=undefined;}
  }
  function startApiTest(){confirmAction='api';if(settings.mode==='live')showConfirm=true;else void runApiTest();}
  function cancel() { running?.cancel(); apiController?.abort(); playing = false; }
  function step(delta: number) {
    if(!visibleEvents.length)return;
    playing = false;readingOverride=null;
    const next = Math.max(0, Math.min(visibleEvents.length - 1, visibleSelected + delta));
    selected = next >= 0 ? events.findIndex(event => event.id === visibleEvents[next].id) : -1;
  }
  function selectVisible(event: TraceEvent) { readingOverride=null;selected = events.findIndex(item => item.id === event.id); playing = false; }
  function togglePlay() {
    if (!visibleEvents.length) return;
    if (playing) { playing = false; return; }
    playing = true;
    const tick = () => {
      if (!playing) return;
      const position = visibleEvents.findIndex(event => event.id === events[selected]?.id);
      if (position >= visibleEvents.length - 1) { playing = false; return; }
      selected = events.findIndex(event => event.id === visibleEvents[position + 1].id);
      setTimeout(tick, speed);
    };
    if (visibleSelected >= visibleEvents.length - 1) selected = -1;
    setTimeout(tick, speed);
  }
  function chooseChapter(index: number) {
    readingOverride=null;chapterIndex = Math.max(0, Math.min(chapters.length - 1, index));
    playing = false;
    focusEvent(projectChapter(chapters[chapterIndex].id, events).preferredId);
  }
  function clearKey() { settings = {...settings, apiKey: ''}; localStorage.removeItem('harness-lab-api-key'); savedNotice = '密钥已从当前设置移除'; }
  function rememberKey() {
    if (settings.apiKey) { localStorage.setItem('harness-lab-api-key', settings.apiKey); savedNotice = '已记住密钥（仅此浏览器）'; }
  }
  function saveWorkspace() {
    const {apiKey: _key, ...safeSettings} = settings;
    localStorage.setItem('harness-lab-workspace', JSON.stringify({chapterIndex, prompt, files: {...files, '/src/sum.js': fileEdit}, settings: safeSettings}));
    workspaceSaved = true; savedNotice = '工作区已保存在此浏览器';
  }
  function restoreWorkspace() {
    const raw = localStorage.getItem('harness-lab-workspace');
    if (!raw) { savedNotice = '没有找到已保存的工作区'; return; }
    try {
      const data = JSON.parse(raw);
      chapterIndex = data.chapterIndex ?? 0; prompt = data.prompt ?? DEFAULT_PROMPT;
      files = data.files ?? {...INITIAL_FILES}; fileEdit = files['/src/sum.js'] ?? INITIAL_FILES['/src/sum.js'];
      settings = {...settings, ...data.settings, apiKey: settings.apiKey}; workspaceSaved = true; savedNotice = '工作区已恢复；密钥不会随工作区保存';
    } catch { savedNotice = '工作区数据无法读取'; }
  }
  function exportTrace() {
    const safeEvents = JSON.parse(JSON.stringify(events, (key, value) => {
      if (/^(api.?key|authorization)$/i.test(key)) return '[REDACTED]';
      if (typeof value === 'string' && settings.apiKey && value.includes(settings.apiKey)) return value.replaceAll(settings.apiKey, '[REDACTED]');
      return value;
    }));
    const blob = new Blob([JSON.stringify({exportedAt: new Date().toISOString(), events: safeEvents}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'harness-lab-trace.json'; a.click(); URL.revokeObjectURL(url);
  }
  function exportFiles() {
    const blob = new Blob([JSON.stringify(currentFiles ?? files, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'harness-lab-files.json'; a.click(); URL.revokeObjectURL(url);
  }
  onMount(() => {
    const remembered = localStorage.getItem('harness-lab-api-key');
    if (remembered) settings = {...settings, apiKey: remembered};
    const keydown = (event: KeyboardEvent) => {
      if(event.key==='Escape'){showExercise=false;showConfirm=false;return;}
      if(showExercise||showConfirm)return;
      if (page !== 'learn' || (event.target instanceof HTMLElement && ['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(event.target.tagName))) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
      if (event.code === 'Space' && events.length) { event.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', keydown);
    if (settings.mode === 'demo') void run();
    return () => { window.removeEventListener('keydown', keydown); running?.cancel(); };
  });
</script>

<svelte:head><title>Harness Lab — Agent 系统学习工作台</title><meta name="description" content="从实际运行事件理解 agent harness 的数据流、工具调用与 API 协议。" /></svelte:head>

<div class="app-shell">
  <header class="topbar">
    <a class="brand" href="#home" aria-label="Harness Lab 首页" onclick={(e) => {e.preventDefault(); page='learn';}}><span class="brand-mark">h.</span><span>harness<span class="brand-light">lab</span></span></a>
    {#if page === 'learn'}<div class="chapter-nav"><button aria-label="上一章" onclick={() => chooseChapter(chapterIndex-1)} disabled={chapterIndex===0}>‹</button><label><span>章节</span><select data-testid="chapter-select" value={activeChapter.id} onchange={(event)=>chooseChapter(chapters.findIndex(chapter=>chapter.id===event.currentTarget.value))}>{#each chapters as chapter, i}<option value={chapter.id}>{String(i+1).padStart(2,'0')} · {chapter.title}</option>{/each}</select></label><button aria-label="下一章" onclick={() => chooseChapter(chapterIndex+1)} disabled={chapterIndex===chapters.length-1}>›</button></div>{/if}
    <div class="top-actions"><span class:live={settings.mode==='live'} class="mode-pill"><i></i>{settings.mode === 'demo' ? '本地模拟' : '真实 API'}</span><button class="icon-btn" title="导出 trace" onclick={exportTrace} disabled={!events.length}>↥</button><button data-testid="settings-button" class="settings-link" onclick={() => page = page === 'learn' ? 'settings' : 'learn'}><span class="gear">⚙</span><span>{page === 'learn' ? '设置' : '返回课程'}</span></button></div>
  </header>

  {#if page === 'learn'}
    <main class="workbench-layout">
      <section class="learn-panel">
        <div class="lesson-head"><div class="lesson-meta"><span class="eyebrow">第 {String(chapterIndex+1).padStart(2,'0')} 章 / {chapters.length} 章</span><span class="meta-dot"></span><span>单步探索</span></div><h1>{activeChapter.title}</h1><p class="subtitle">{activeChapter.subtitle}</p>{#if chapterIndex===8}<button class="api-chapter-link" onclick={()=>page='settings'}>打开 API 实验室 ↗</button>{/if}</div>
        <section class="lesson-copy"><div class="step-marker">阅读步骤 <b>{String(readingStep+1).padStart(2,'0')} / {String(activeChapter.body.length).padStart(2,'0')}</b></div><div class="explanation-nav" aria-label="本章解读">{#each activeChapter.body as _,i}<button data-testid="explanation-step" class:active={readingStep===i} onclick={()=>readingOverride=i}>解读 {i+1}</button>{/each}</div><p>{activeChapter.body[readingStep]}</p></section>
        <section class="diagram-panel" aria-label="Agent 系统数据流图"><div class="panel-heading"><div><span class="eyebrow">SYSTEM MAP</span><h2>本章机制聚焦</h2></div><span class="panel-note"><i></i> 当前章节事件</span></div><div data-testid="system-diagram"><SystemMap events={fullTrace?events:visibleEvents} selected={currentEvent} focus={fullTrace?[]:activeChapter.focus} onSelect={(id)=>{const item=visibleEvents.find(event=>event.id===id);if(item)selectVisible(item);}} /></div><div class="lane-legend">{#each (fullTrace?lanes:activeChapter.focus) as lane}<span><i class={`lane-dot ${lane}`}></i>{lane}</span>{/each}</div></section>
        <section class="chapter-notes"><div class="notes-head"><span class="eyebrow">CHECKPOINT</span><span>本章自检</span></div>{#each activeChapter.checkpoints as checkpoint,i}<div class="check-row"><span class="check-num">0{i+1}</span><span>{checkpoint}</span></div>{/each}<details class="sources"><summary>参考来源</summary>{#each activeChapter.sources as source}<a href={source.url} target="_blank" rel="noreferrer">↗ {source.label}</a>{/each}</details></section>
      </section>
      <section class="right-panel" aria-label="事件与数据检查">
        <div class="right-tabs" role="group" aria-label="检查器面板"><button data-testid="right-tab-data" class:active={rightTab==='data'} onclick={()=>rightTab='data'}>数据</button><button data-testid="right-tab-fs" class:active={rightTab==='fs'} onclick={()=>rightTab='fs'}>FS</button><button data-testid="right-tab-events" class:active={rightTab==='events'} onclick={()=>rightTab='events'}>事件 <span>{visibleEvents.length}</span></button><button data-testid="right-tab-source" class:active={rightTab==='source'} onclick={()=>rightTab='source'}>源码</button></div>
        {#if rightTab==='events'}<section class="events-view"><div class="panel-heading"><div><span class="eyebrow">CHAPTER EVENTS</span><h2>当前章节事件 <span class="event-total">{visibleEvents.length}</span></h2></div><div class="trace-state"><i class:busy={status==='running'} class:failed={status==='error'}></i>{status==='running'?'运行中':status==='completed'?'已完成':status==='cancelled'?'已停止':status==='error'?'发生错误':'等待运行'}</div></div>{#if status==='error'&&errorText}<div class="error-banner"><strong>运行失败</strong><span>{errorText}</span></div>{/if}{#if projection.note && !fullTrace}<div class="projection-note">{projection.note}{#if activeChapter.id==='failures'&&settings.mode==='demo'}<button onclick={()=>{settings={...settings,scenario:'provider-error'};showExercise=true;}}>运行错误情景</button>{/if}</div>{/if}{#if !visibleEvents.length}<div class="empty-trace"><div class="empty-mark">⌁</div><strong>{events.length?'本章暂无匹配事件':'运行后将在此显示本章事件'}</strong><span>{events.length?'选择其他章节或开启完整轨迹实验视图。':'运行后展示当前机制相关事件，不展开完整日志。'}</span></div>{:else}<div class="event-list">{#each visibleEvents as event}<button data-testid="timeline-event" class:event-selected={currentEvent?.id===event.id} class="event-card" onclick={()=>selectVisible(event)}><span class={`event-icon ${event.lane}`}>{event.lane==='provider'?'↗':event.lane==='tools'?'⌘':event.lane==='workspace'?'▤':event.lane==='user'?'◉':'↳'}</span><span class="event-main"><span class="event-overline"><b>{event.lane}</b><span>·</span><time>#{String(event.seq).padStart(2,'0')}</time><span class="kind-chip">{event.kind}</span></span><strong>{event.title}</strong><small>{event.source??'运行事件'} · {new Date(event.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small></span><span class="event-chevron">›</span></button>{/each}</div>{/if}</section>
        {:else if currentEvent}<div data-testid="inspector" class="inspector-host"><Inspector event={currentEvent} files={currentFiles??files} prevFiles={previousFiles} onExport={exportFiles} view={rightTab==='fs'?'files':rightTab==='source'?'source':'summary'} hideTabs={true}/></div>{:else}<div data-testid="inspector" class="inspector-empty"><span>⌁</span><b>等待本章匹配事件</b><p>检查器会跟随所选章节事件更新。</p></div>{/if}
        {#if rightTab!=='events'}<div class="inspector-export-row"><button data-testid="export-button" onclick={exportTrace} disabled={!events.length}>导出 trace ↥</button><button onclick={exportFiles}>导出文件</button></div>{/if}
      </section>
      <div class="workbench-footer"><div class="transport"><button data-testid="prev-button" aria-label="回退一步" onclick={()=>step(-1)} disabled={!visibleEvents.length||visibleSelected<=0}>‹</button><button class="play-button" aria-label={playing?'暂停':'播放'} onclick={togglePlay} disabled={!visibleEvents.length}>{playing?'Ⅱ':'▶'}</button><button data-testid="next-button" aria-label="前进一步" onclick={()=>step(1)} disabled={!visibleEvents.length||visibleSelected>=visibleEvents.length-1}>›</button></div><div class="range-wrap"><div class="range-caption"><span>章节回放 <b>{visibleEvents.length?String(Math.max(0,visibleSelected+1)).padStart(2,'0'):'00'} <em>/</em> {String(visibleEvents.length).padStart(2,'0')}</b></span><label>速度 <select bind:value={speed}><option value={1400}>0.7×</option><option value={900}>1×</option><option value={480}>1.5×</option></select></label></div><input aria-label="事件时间轴" type="range" min="0" max={Math.max(visibleEvents.length-1,0)} value={Math.max(visibleSelected,0)} oninput={(event)=>{const item=visibleEvents[Number(event.currentTarget.value)];if(item)selectVisible(item);}} disabled={!visibleEvents.length}/></div><span data-testid="run-status" class="footer-state"><i class:busy={status==='running'}></i>{status==='running'?'运行中':status==='completed'?'已完成':status==='cancelled'?'已停止':status==='error'?'发生错误':'等待运行'}</span><label class="full-trace"><input data-testid="full-trace-toggle" type="checkbox" bind:checked={fullTrace} onchange={()=>focusEvent(currentEvent?.id??projection.preferredId)}/>完整轨迹</label><button data-testid="experiment-button" class="secondary-button" onclick={()=>showExercise=!showExercise}>实验设置</button><button data-testid="run-button" class="primary-button" onclick={start} disabled={status==='running'}>{status==='running'?'运行中…':'▶　运行'}</button>{#if status==='running'}<button data-testid="stop-button" class="quiet-button" onclick={cancel}>停止</button>{/if}</div>
    </main>
    {#if showExercise}<div class="modal-scrim" role="presentation" onclick={(event)=>{if(event.target===event.currentTarget)showExercise=false;}}><div class="exercise-modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="exercise-title"><div class="exercise-head"><div><span class="eyebrow">EXPERIMENT</span><h2 id="exercise-title">实验设置</h2></div><button class="close-button" onclick={()=>showExercise=false} aria-label="关闭">×</button></div><label class="field-label" for="prompt">用户消息</label><textarea id="prompt" class="prompt-input" bind:value={prompt} rows="3"></textarea>{#if demoFixtureNote}<div class="fixture-note"><b>教学夹具与输入不匹配</b><span>本地 provider 仅支持预设任务；自由探索请切换自己的 API。</span></div>{/if}<div class="file-edit-head"><span>初始文件 <code>/src/sum.js</code></span><span>虚拟工作区 · 可编辑</span></div><textarea class="code-editor" aria-label="编辑初始 sum.js" bind:value={fileEdit} spellcheck="false"></textarea><div class="exercise-actions"><button class="secondary-button" onclick={saveWorkspace}>保存工作区</button><button class="secondary-button" onclick={restoreWorkspace}>恢复工作区</button><button class="primary-button" onclick={()=>{showExercise=false;start();}} disabled={status==='running'}>运行实验</button></div>{#if savedNotice}<p class="saved-notice">{savedNotice}</p>{/if}</div></div>{/if}
  {:else}
    <main class="settings-page">
      <div class="settings-intro"><span class="eyebrow">WORKSPACE PREFERENCES</span><h1>运行设置<span>与 API</span></h1><p>配置实验运行方式。密钥默认只驻留在当前页面内存中，不会自动保存或发送。</p></div>
      <div class="settings-grid"><section class="settings-card"><div class="setting-title"><span class="setting-index">01</span><div><h2>运行模式</h2><p>选择教学模拟或连接兼容 API。</p></div></div><label class="setting-label">运行模式<select data-testid="mode-select" bind:value={settings.mode}><option value="demo">本地模拟 · 仅用本地教学夹具</option><option value="live">真实 API · 确认后发送请求</option></select></label><label class="setting-label">故障情景<select data-testid="scenario-select" bind:value={settings.scenario}><option value="repair">正常修复</option><option value="invalid-args">无效工具参数</option><option value="provider-error">Provider 错误</option><option value="failed-test">测试未通过</option></select></label><label class="setting-label">工具调度<select bind:value={settings.toolExecution}><option value="sequential">顺序执行</option><option value="parallel">并行执行</option></select></label><label class="setting-label">事件延迟 <span>{settings.delayMs} ms</span><input type="range" min="0" max="1800" step="100" bind:value={settings.delayMs} /></label></section>
      <section class="settings-card"><div class="setting-title"><span class="setting-index">02</span><div><h2>Provider / API</h2><p>兼容 OpenAI 风格接口的服务地址。</p></div></div><div class="field-row"><label class="setting-label">协议<select data-testid="protocol-select" bind:value={settings.protocol}><option value="chat">Chat Completions</option><option value="responses">Responses</option></select></label><label class="setting-label">模型<input bind:value={settings.model} placeholder="模型 ID" /></label></div><label class="setting-label">Base URL<input bind:value={settings.baseUrl} placeholder="https://api.openai.com/v1" /></label><label class="setting-label">API Key <span>默认仅内存</span><input type="password" bind:value={settings.apiKey} autocomplete="off" placeholder="sk-••••••••••••" /></label><div class="key-actions"><button class="secondary-button" onclick={rememberKey} disabled={!settings.apiKey}>记住密钥</button><button class="text-button" onclick={clearKey}>清除密钥</button><span>浏览器本地存储并非加密保险库。</span></div><div class="endpoint-box"><span>最终请求端点</span><code>{endpoint}</code><span class="endpoint-method">POST</span></div>{#if settings.mode==='live'}<div class="warning-box"><b>发送前请确认</b><span>真实模式不会自动请求。你每次点击运行后都会再次看到数据与费用提示。提示：API key 将用于授权，请只连接你信任的服务。</span></div>{/if}</section>
      <section class="settings-card scenario-card api-explorer"><div class="setting-title"><span class="setting-index">04</span><div><h2>API 实验室</h2><p>单次请求看懂接口格式；完整 agent 运行使用 Pi 流式 adapter。</p></div></div><label class="setting-label">响应方式<select data-testid="api-stream-select" bind:value={apiStreaming}><option value={true}>流式 SSE</option><option value={false}>非流式 JSON</option></select></label><p class="privacy-foot">Chat Completions 使用 messages 和嵌套 function 工具；Responses 使用 input 和顶层 function 字段。此实验只观察 API 响应，不执行工具。模拟用量与延迟为教学设定。</p><details open><summary>实际将发送的请求体</summary><pre class="api-code">{apiPreview}</pre></details><div class="settings-actions"><button data-testid="api-test-button" class="primary-button" onclick={startApiTest} disabled={status==='running'}>测试单次 API</button>{#if status==='running'}<button class="secondary-button" onclick={cancel}>停止</button>{/if}<button class="secondary-button" onclick={()=>page='learn'}>在时间轴查看响应</button></div>{#if apiOutcome}<p class="saved-notice">{apiOutcome}</p>{/if}</section>
      <section class="settings-card scenario-card"><div class="setting-title"><span class="setting-index">03</span><div><h2>工作区与导出</h2><p>工作区内容仅保存在本机浏览器；不等同于可恢复的运行计划。</p></div></div><div class="storage-note"><span class="storage-icon">▤</span><div><b>本地浏览器存储</b><p>保存课程位置、prompt、虚拟文件与非密钥设置。运行事件不会作为工作区自动保存。</p></div></div><div class="settings-actions"><button class="secondary-button" onclick={saveWorkspace}>保存工作区</button><button class="secondary-button" onclick={restoreWorkspace}>恢复工作区</button><button class="text-button" onclick={exportTrace} disabled={!events.length}>导出 trace</button><button class="text-button" onclick={exportFiles}>导出本地文件</button></div>{#if savedNotice}<div class="saved-notice">✓ {savedNotice}</div>{/if}<p class="privacy-foot">trace 导出包含当前实际运行事件，不含设置或 API key。文件内容只有在点击“导出本地文件”时才会导出。</p></section></div>
    </main>
  {/if}

  {#if showConfirm}<div class="modal-scrim" role="presentation"><div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabindex="-1"><div class="confirm-icon">!</div><span class="eyebrow">REAL PROVIDER REQUEST</span><h2 id="confirm-title">确认发送 API 请求？</h2><p>请求将发送到以下端点。prompt 与虚拟工作区文件可能包含在请求上下文中。真实 API 可能产生费用。</p><div class="confirm-endpoint"><span>POST</span><code>{endpoint}</code></div><div class="confirm-model"><span>模型</span><b>{settings.model || '未设置'}</b><span class="redact">API Key 将用于授权，不会进入导出 trace。</span></div><div class="modal-actions"><button class="secondary-button" onclick={() => showConfirm=false}>取消</button><button class="danger-button" onclick={()=>confirmAction==='api'?runApiTest():run()}>我了解，发送请求</button></div></div></div>{/if}
  <footer class="app-footer"><span>HARNESS LAB · Pi 1.0.0</span><span>模型响应可模拟，harness 与工具实际运行；单次 API 实验只观察接口。</span></footer>
</div>
<style>
.explanation-nav{display:flex;gap:6px;margin:10px 0}.explanation-nav button{border:1px solid #dce6e0;border-radius:6px;background:#fff;padding:5px 10px;font-size:11px;color:#667b70;cursor:pointer}.explanation-nav button.active{background:#edf6ef;color:#167553;border-color:#aacdb8}.api-code{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7f5;border:1px solid #e1e9e5;border-radius:10px;padding:18px;font:12px/1.6 ui-monospace,SFMono-Regular,monospace;color:#27463f}.api-explorer summary{cursor:pointer;font-size:13px;color:#35675b;margin:16px 0}.api-explorer .settings-actions{margin-top:16px}
.diagram-panel .panel-heading,.diagram-panel .lane-legend{display:none}.diagram-panel{padding:8px;min-height:175px}.diagram-panel :global(svg){max-height:155px}.events-view .event-list{display:flex;flex-direction:column;gap:8px}.events-view .event-card{flex:none}.workbench-layout{align-items:stretch}.learn-panel,.right-panel{height:100%}.workbench-footer .secondary-button{display:inline-flex}
@media(max-width:720px){
.diagram-panel{min-height:110px;padding:6px}.diagram-panel :global(svg){max-height:110px}
.topbar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px}.chapter-nav{margin:0;display:grid;grid-template-columns:22px minmax(0,1fr) 22px;min-width:0}.chapter-nav label{min-width:0}.chapter-nav label>span{display:none}.chapter-nav select{width:100%;max-width:none;min-width:0}.top-actions{margin:0}.top-actions .mode-pill,.top-actions .icon-btn{display:none}.settings-link{font-size:0;width:29px;height:29px;padding:5px}.settings-link .gear{font-size:15px}.workbench-footer .secondary-button{font-size:9px;padding:5px 4px}.workbench-footer .range-wrap{min-width:40px}.workbench-footer .range-caption label{display:none}.lesson-copy>p{display:block;-webkit-line-clamp:unset;line-clamp:unset;overflow:visible}.explanation-nav{margin:6px 0}.explanation-nav button{padding:4px 8px;font-size:10px}
}

</style>
