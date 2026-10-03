<script lang="ts">
  import { onMount } from 'svelte';
  import { chapters } from './content/chapters';
  import { DEFAULT_PROMPT, defaultSettings, INITIAL_FILES, type Settings, type TraceEvent } from './lib/contracts';
  import { startRun } from './lib/runtime';
  import SystemMap from './lib/components/SystemMap.svelte';
  import Inspector from './lib/components/Inspector.svelte';
  import { previewApiRequest, testApi } from './lib/api-lab';
  import { resolveEndpoint } from './lib/transport';

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
  const apiPreview = $derived(JSON.stringify(previewApiRequest(settings,apiStreaming,prompt),null,2));
  let savedNotice = $state('');
  let workspaceSaved = $state(false);
  const isDefaultPrompt = $derived(prompt.trim() === DEFAULT_PROMPT.trim());
  const demoFixtureNote = $derived(settings.mode === 'demo' && !isDefaultPrompt);
  const activeChapter = $derived(chapters[chapterIndex]);
  const currentEvent = $derived(events[selected] ?? null);
  const currentFiles = $derived(currentEvent?.files ?? (events.length ? events[events.length - 1].files : files));
  const endpoint = $derived.by(()=>{try{return resolveEndpoint(settings.baseUrl,settings.protocol);}catch(error){return String(error);}});
  const lanes = ['user','context','provider','parser','harness','tools','workspace','session'];

  function onEvent(event: TraceEvent) {
    events = [...events, event];
    selected = events.length - 1;
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
      if (events.length) selected = events.length - 1;
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
    showConfirm=false;apiOutcome='';events=[];selected=-1;status='running';apiController=new AbortController();
    const snapshot={...files,'/src/sum.js':fileEdit};
    try {
      await testApi({...settings},apiStreaming,(lane,kind,title,data,source)=>onEvent({id:`api-${events.length+1}`,seq:events.length+1,at:Date.now(),lane,kind,title,data,files:{...snapshot},source}),apiController.signal,prompt);
      status='completed';apiOutcome='响应已进入时间轴。单次实验不执行工具；返回课程可逐步查看。';
    } catch(error) {status=apiController.signal.aborted?'cancelled':'error';errorText=String(error);apiOutcome=errorText;}
    finally{apiController=undefined;}
  }
  function startApiTest(){confirmAction='api';if(settings.mode==='live')showConfirm=true;else void runApiTest();}
  function cancel() { running?.cancel(); apiController?.abort(); playing = false; }
  function step(delta: number) { playing = false; selected = Math.max(0, Math.min(events.length - 1, selected + delta)); }
  function togglePlay() {
    if (!events.length) return;
    if (playing) { playing = false; return; }
    playing = true;
    const tick = () => {
      if (!playing) return;
      if (selected >= events.length - 1) { playing = false; return; }
      selected += 1; setTimeout(tick, speed);
    };
    if (selected >= events.length - 1) selected = -1;
    setTimeout(tick, speed);
  }
  function chooseChapter(index: number) {
    chapterIndex = index;
    if (events.length) {
      const lane = chapters[index].focus[0];
      const found = events.findIndex((event) => event.lane === lane);
      if (found >= 0) selected = found;
    }
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
      if (page !== 'learn' || (event.target instanceof HTMLElement && ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))) return;
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
    <div class="top-center"><span class="crumb">交互课程</span><span class="crumb-slash">/</span><span>{page === 'learn' ? 'Agent 运行时' : '设置与 API'}</span></div>
    <div class="top-actions"><span class:live={settings.mode==='live'} class="mode-pill"><i></i>{settings.mode === 'demo' ? '本地模拟' : '真实 API'}</span><button class="icon-btn" title="导出 trace" onclick={exportTrace} disabled={!events.length}>↥</button><button data-testid="settings-button" class="settings-link" onclick={() => page = page === 'learn' ? 'settings' : 'learn'}><span class="gear">⚙</span><span>{page === 'learn' ? '设置' : '返回课程'}</span></button></div>
  </header>

  {#if page === 'learn'}
    <div class="workbench-layout">
      <aside class="sidebar">
        <div class="side-heading"><span class="eyebrow">LEARNING PATH</span><span class="lesson-count">{String(chapters.length).padStart(2,'0')} 章</span></div>
        <div class="course-title"><span class="course-icon">⌘</span><div><strong>Agent 系统</strong><small>运行时与协议</small></div></div>
        <nav class="chapter-list" aria-label="课程章节">
          {#each chapters as chapter, i}
            <button data-testid="chapter-button" class:active={chapterIndex===i} class="chapter" onclick={() => chooseChapter(i)}><span class="chapter-num">{String(i+1).padStart(2,'0')}</span><span class="chapter-name">{chapter.title}</span>{#if chapterIndex===i}<span class="chapter-arrow">↗</span>{/if}</button>
          {/each}
        </nav>
        <div class="side-bottom"><div class="progress-label"><span>课程进度</span><span>{chapterIndex+1} / {chapters.length}</span></div><div class="progress-track"><i style={`width:${((chapterIndex+1)/chapters.length)*100}%`}></i></div><button class="save-link" onclick={saveWorkspace}>⌑ 保存工作区</button>{#if workspaceSaved}<button class="save-link" onclick={restoreWorkspace}>↶ 恢复已保存工作区</button>{/if}</div>
      </aside>

      <main class="main-column">
        <div class="lesson-head"><div class="lesson-meta"><span class="eyebrow">第 {String(chapterIndex+1).padStart(2,'0')} 章</span><span class="meta-dot"></span><span>单步探索</span></div><h1>{activeChapter.title}</h1><p class="subtitle">{activeChapter.subtitle}</p></div>
        <section class="lesson-copy">
          {#each activeChapter.body as paragraph, i}<p><span class="paragraph-no">0{i+1}</span>{paragraph}</p>{/each}
        </section>
        <section class="diagram-panel" aria-label="Agent 系统数据流图">
          <div class="panel-heading"><div><span class="eyebrow">SYSTEM MAP</span><h2>一次运行中的数据流</h2></div><span class="panel-note"><i></i> 事件来自当前运行</span></div>
          <div data-testid="system-diagram"><SystemMap {events} selected={currentEvent} focus={activeChapter.focus} onSelect={(id)=>{const index=events.findIndex(e=>e.id===id);if(index>=0){selected=index;playing=false;}}} /></div>
          <div class="lane-legend">{#each lanes as lane}<span><i class={`lane-dot ${lane}`}></i>{lane}</span>{/each}</div>
        </section>
        <section class="activity-panel">
          <div class="activity-title"><div><span class="eyebrow">LIVE TRACE</span><h2>运行事件 <span class="event-total">{events.length}</span></h2></div><div data-testid="run-status" class="trace-state"><i class:busy={status==='running'} class:failed={status==='error'}></i>{status==='running'?'运行中':status==='completed'?'已完成':status==='cancelled'?'已停止':status==='error'?'发生错误':'等待运行'}</div></div>
          {#if status==='error' && errorText}<div class="error-banner"><strong>运行失败</strong><span>{errorText}</span></div>{/if}
          {#if events.length === 0}<div class="empty-trace"><div class="empty-mark">⌁</div><strong>{status==='running'?'正在等待第一条事件…':'这里将显示运行事件'}</strong><span>{settings.mode==='demo'?'本地模拟不会连接网络。':'真实模式仅在你确认后发起请求。'}</span></div>
          {:else}<div class="event-list">
            {#each events as event, i}
              <button data-testid="timeline-event" class:event-selected={selected===i} class="event-card" onclick={() => {selected=i; playing=false;}}><span class={`event-icon ${event.lane}`}>{event.lane==='provider'?'↗':event.lane==='tools'?'⌘':event.lane==='workspace'?'▤':event.lane==='user'?'◉':'↳'}</span><span class="event-main"><span class="event-overline"><b>{event.lane}</b><span>·</span><time>#{String(event.seq).padStart(2,'0')}</time><span class="kind-chip">{event.kind}</span></span><strong>{event.title}</strong><small>{event.source ?? '运行事件'} · {new Date(event.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small></span><span class="event-chevron">›</span></button>
            {/each}
          </div>{/if}
          <div class="timeline-controls"><div class="transport"><button data-testid="prev-button" aria-label="回退一步" onclick={() => step(-1)} disabled={!events.length || selected<=0}>‹</button><button class="play-button" aria-label={playing?'暂停':'播放'} onclick={togglePlay} disabled={!events.length}>{playing?'Ⅱ':'▶'}</button><button data-testid="next-button" aria-label="前进一步" onclick={() => step(1)} disabled={!events.length || selected>=events.length-1}>›</button></div><div class="range-wrap"><div class="range-caption"><span>事件回放 <b>{events.length ? String(Math.max(0,selected+1)).padStart(2,'0') : '00'} <em>/</em> {String(events.length).padStart(2,'0')}</b></span><label>速度 <select bind:value={speed}><option value={1400}>0.7×</option><option value={900}>1×</option><option value={480}>1.5×</option></select></label></div><input aria-label="事件时间轴" type="range" min="0" max={Math.max(events.length-1,0)} bind:value={selected} disabled={!events.length} /></div><button data-testid="export-button" class="export-link" onclick={exportTrace} disabled={!events.length}>导出 trace ↥</button></div>
        </section>
        <section class="exercise"><div class="exercise-head"><span class="exercise-icon">✳</span><div><span class="eyebrow">TRY IT YOURSELF</span><h2>动手观察</h2></div></div><label class="field-label" for="prompt">用户消息 <span>此内容会进入当前运行</span></label><textarea id="prompt" class="prompt-input" bind:value={prompt} rows="2"></textarea>{#if demoFixtureNote}<div class="fixture-note"><b>教学夹具与输入不匹配</b><span>本地 provider 只支持预设任务与故障情景，不理解任意指令。未匹配的请求会明确失败；自由探索请切换自己的 API。</span></div>{/if}<div class="file-edit-head"><span>初始文件 <code>/src/sum.js</code></span><span>虚拟工作区 · 可编辑</span></div><textarea class="code-editor" aria-label="编辑初始 sum.js" bind:value={fileEdit} spellcheck="false"></textarea><div class="run-actions"><button data-testid="run-button" class="primary-button" onclick={start} disabled={status==='running'}>{status==='running'?'运行中…':'▶　运行 '+(settings.mode==='demo'?'本地模拟':'真实 API')}</button>{#if status==='running'}<button data-testid="stop-button" class="quiet-button" onclick={cancel}>停止运行</button>{/if}<span class="run-hint">{settings.mode==='demo'?'离线运行 · 不会发送请求':'点击运行后仍需确认费用与数据发送'}</span></div></section>
        <section class="checkpoints"><div class="checkpoint-head"><span class="eyebrow">CHECKPOINT</span><span>本章自检</span></div>{#each activeChapter.checkpoints as checkpoint,i}<label class="check-row"><input type="checkbox" /><span class="check-num">0{i+1}</span><span>{checkpoint}</span></label>{/each}<div class="sources"><span class="eyebrow">参考来源</span>{#each activeChapter.sources as source}<a href={source.url} target="_blank" rel="noreferrer">↗ {source.label}</a>{/each}</div></section>
      </main>

      <aside data-testid="inspector" class="inspector-column"><Inspector event={currentEvent} files={currentFiles ?? files} prevFiles={selected>0?events[selected-1].files:INITIAL_FILES} onExport={exportFiles} /></aside>
    </div>
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
.api-code{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7f5;border:1px solid #e1e9e5;border-radius:10px;padding:18px;font:12px/1.6 ui-monospace,SFMono-Regular,monospace;color:#27463f}.api-explorer summary{cursor:pointer;font-size:13px;color:#35675b;margin:16px 0}.api-explorer .settings-actions{margin-top:16px}
</style>
