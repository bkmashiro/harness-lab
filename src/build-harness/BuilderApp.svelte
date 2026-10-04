<script lang="ts">
  import { onMount } from 'svelte';
  import './builder.css';
  import { builderLessons } from './lessons';
  import { runBuilderCode } from './sandbox';
  import { gradeBuilderRun } from './grading';
  import type { BuilderCheck, BuilderId, BuilderLesson, BuilderResult } from './contracts';

  type Scenario = 'repair' | 'invalid-args' | 'unknown-tool' | 'endless';
  type ResultTab = 'input' | 'messages' | 'events' | 'files' | 'value';
  type FocusMode = 'split' | 'reading' | 'editing';
  const scenarios: { id: Scenario; label: string }[] = [
    { id: 'repair', label: '正常修复' },
    { id: 'invalid-args', label: '无效参数' },
    { id: 'unknown-tool', label: '未知工具' },
    { id: 'endless', label: '持续请求（检查轮数上限）' }
  ];
  const recommendedScenario: Record<string, Scenario> = {
    messages: 'repair', provider: 'repair', tools: 'repair', dispatch: 'repair',
    loop: 'repair', workspace: 'repair', failures: 'invalid-args', limits: 'endless', 'real-api': 'repair'
  };
  const safeJson = (value: unknown) => {
    try { return JSON.stringify(value, null, 2) ?? String(value); } catch { return String(value); }
  };

  let selectedId = $state<BuilderId>('messages');
  let lessonIndex = $derived(builderLessons.findIndex((item: BuilderLesson) => item.id === selectedId));
  let lesson = $derived(builderLessons.find((item: BuilderLesson) => item.id === selectedId));
  let code = $state('');
  let sourceMode = $state<'starter' | 'learner' | 'reference'>('starter');
  let scenario = $state<Scenario>('repair');
  let focusMode = $state<FocusMode>('split');
  let resultTab = $state<ResultTab>('input');
  let status = $state('准备就绪');
  let running = $state(false);
  let result = $state<BuilderResult | null>(null);
  let checks = $state<BuilderCheck[]>([]);
  const resultMessages=$derived.by(()=>{const value=result?.value as {messages?:unknown[]}|undefined;return Array.isArray(value?.messages)?value.messages:[];});
  let completedIds = $state<string[]>([]);
  let handle: { cancel: () => void } | null = null;
  let runToken = 0;

  onMount(() => {
    try {
      const saved = localStorage.getItem('harness-builder-progress-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.selectedId === 'string' && builderLessons.some((item: BuilderLesson) => item.id === parsed.selectedId)) selectedId = parsed.selectedId;
        if (Array.isArray(parsed.completedIds)) completedIds = parsed.completedIds.filter((id: unknown) => builderLessons.some((item: BuilderLesson) => item.id === id));
        if (parsed.drafts && typeof parsed.drafts === 'object') drafts = parsed.drafts;
      }
    } catch { /* Ignore damaged or unavailable local progress. */ }
    loadCurrentLesson();
    return () => { runToken++; handle?.cancel(); };
  });

  let drafts = $state<Record<string, string>>({});
  function persist() {
    try { localStorage.setItem('harness-builder-progress-v1', JSON.stringify({ selectedId, completedIds, drafts })); } catch { /* Private mode or storage quota: keep the editor usable. */ }
  }
  function loadCurrentLesson() {
    if (!lesson) { code = ''; return; }
    code = drafts[selectedId] ?? lesson.starter;
    sourceMode = drafts[selectedId] ? 'learner' : 'starter';
    scenario = recommendedScenario[selectedId] ?? 'repair';
    result = null; checks = []; resultTab = 'input'; status = '准备就绪';
  }
  function selectLesson(id: string) {
    if (!builderLessons.some((item: BuilderLesson) => item.id === id)) return;
    runToken++;
    handle?.cancel(); handle = null; running = false;
    selectedId = id as BuilderId;
    loadCurrentLesson(); persist();
  }
  function updateCode(value: string) {
    code = value;
    sourceMode = 'learner';
    if (lesson) drafts[selectedId] = value;
    result = null; checks = []; status = '代码已修改，运行后查看新的检查结果';
    persist();
  }
  function loadStarter() {
    if (!lesson) return;
    code = lesson.starter; sourceMode = 'starter'; drafts[selectedId] = code;
    result = null; checks = []; status = '已还原本章起始代码'; persist();
  }
  function loadSolution() {
    if (!lesson) return;
    code = lesson.solution; sourceMode = 'reference'; drafts[selectedId] = code;
    result = null; checks = []; status = '已载入参考实现；可编辑后运行'; persist();
  }
  function loadExample(text:string){code=text;sourceMode='reference';drafts[selectedId]=text;result=null;checks=[];status='已载入示例，可编辑后运行';persist();}
  async function run() {
    if (!lesson || running) return;
    const token = ++runToken;
    result = null; checks = []; running = true; resultTab = 'input';
    status = '正在运行…';
    try {
      const current = runBuilderCode({ code, scenario });
      handle = current;
      const nextResult: BuilderResult = await current.result;
      if (token !== runToken) return;
      result = nextResult;
      handle = null;
      if (nextResult.status === 'completed') {
        checks = gradeBuilderRun(lesson, nextResult);
        if (checks.length > 0 && checks.every((check) => check.passed)) {
          if (!completedIds.includes(selectedId)) completedIds = [...completedIds, selectedId];
          status = '运行完成 · 本章检查全部通过';
        } else status = `运行完成 · ${checks.filter((check) => check.passed).length}/${checks.length} 项检查通过`;
        persist();
      } else if (nextResult.status === 'timeout') status = '运行超时 · 调整代码后可重试';
      else if (nextResult.status === 'cancelled') status = '运行已停止';
      else status = `运行错误 · ${nextResult.error ?? '请检查代码并重试'}`;
    } catch (error) {
      if (token !== runToken) return;
      result = { status: 'error', error: error instanceof Error ? error.message : String(error), events: [], files: {} };
      status = `运行错误 · ${result.error}`;
    } finally {
      if (token === runToken) { running = false; handle = null; }
    }
  }
  function stop() {
    if (!running) return;
    runToken++;
    handle?.cancel(); handle = null; running = false;
    result = { status: 'cancelled', events: [], files: {} };
    checks = []; status = '运行已停止';
  }
  function previous() { const index = builderLessons.findIndex((item: BuilderLesson) => item.id === selectedId); if (index > 0) selectLesson(builderLessons[index - 1].id); }
  function next() { const index = builderLessons.findIndex((item: BuilderLesson) => item.id === selectedId); if (index >= 0 && index < builderLessons.length - 1) selectLesson(builderLessons[index + 1].id); }
</script>

<svelte:head>
  <title>Harness 实验室 · 九章代码实践</title>
  <meta name="description" content="从零学习构建 Agent Harness：阅读教材、编辑 JavaScript，在受限沙箱中运行并检查。" />
</svelte:head>

<div class="builder-app">
  <header class="builder-topbar">
    <a class="builder-brand" href="/" aria-label="返回课程首页"><span class="brand-symbol">H</span><span>Harness <span class="brand-light">实验室</span></span></a>
    <div class="chapter-nav">
      <button aria-label="上一章" onclick={previous} disabled={lessonIndex <= 0}>‹</button>
      <label for="builder-chapter">实验章节</label>
      <select id="builder-chapter" data-testid="builder-chapter" value={selectedId} onchange={(event) => selectLesson(event.currentTarget.value)}>
        {#each builderLessons as item, index (item.id)}
          <option value={item.id}>{String(index + 1).padStart(2, '0')} · {item.title}{completedIds.includes(item.id) ? ' ✓' : ''}</option>
        {/each}
      </select>
      <button aria-label="下一章" onclick={next} disabled={lessonIndex >= builderLessons.length - 1}>›</button>
    </div>
    <div class="top-actions"><div class="focus-switch" aria-label="面板布局"><button class:active={focusMode === 'split'} onclick={() => focusMode = 'split'}>并排</button><button class:active={focusMode === 'reading'} onclick={() => focusMode = 'reading'}>阅读</button><button class:active={focusMode === 'editing'} onclick={() => focusMode = 'editing'}>编辑</button></div><span class="mode-pill"><i></i>本地模拟</span><a class="back-link" href="/">返回课程</a></div>
  </header>

  <main class="builder-layout" class:reading-only={focusMode === 'reading'} class:editing-only={focusMode === 'editing'}>
    <section class="lesson-panel" aria-label="章节教材">
      {#if lesson}
        <div class="lesson-kicker"><span>BUILD A HARNESS</span><span>第 {String(lessonIndex + 1).padStart(2, '0')} / 09 章</span></div>
        <h1 data-testid="builder-title">{lesson.title}</h1>
        <p class="lesson-goal">{lesson.goal}</p>
        <div class="lesson-objectives"><h2>本章目标</h2><ul>{#each lesson.objectives as objective}<li>{objective}</li>{/each}</ul></div>
        <div class="lesson-blocks">
          {#each lesson.blocks as block, index}
            {#if block.kind === 'text'}
              <section class="text-block">{#if block.title}<h2>{block.title}</h2>{:else if index===0}<h2>概念与原理</h2>{/if}<p>{block.text}</p></section>
            {:else if block.kind === 'note'}
              <aside class="note-block"><span>{block.title ?? '关键提示'}</span><p>{block.text}</p></aside>
            {:else}
              <figure class="lesson-code"><figcaption><span>{block.title ?? '示例代码'}</span><span>{block.language ?? 'javascript'}</span>{#if block.text.includes('async function main(ctx)')}<button class="load-example" onclick={()=>loadExample(block.text)} disabled={running}>载入编辑器</button>{/if}</figcaption>{#if block.text.split('\n').length>20}<details><summary>查看完整示例（{block.text.split('\n').length} 行）</summary><pre><code>{block.text}</code></pre></details>{:else}<pre><code>{block.text}</code></pre>{/if}</figure>
            {/if}
          {/each}
        </div>
        <section class="task-card"><div class="section-label">YOUR TASK</div><h2>动手练习</h2><p>{lesson.task}</p></section>
        <section class="review-card"><h2>完成后回顾</h2><ul>{#each lesson.review as item}<li>{item}</li>{/each}</ul></section>
        <div class="lesson-bottom"><span>{completedIds.includes(selectedId) ? '✓ 本章已完成' : '完成所有检查以记录本章进度'}</span><button onclick={next} disabled={lessonIndex >= builderLessons.length - 1}>下一章 →</button></div>
      {:else}
        <div class="empty-lesson"><h1 data-testid="builder-title">课程材料正在准备</h1><p>本章教材尚未载入，请稍后刷新。</p></div>
      {/if}
    </section>

    <section class="workbench-panel" aria-label="代码实验台">
      <div class="workbench-heading"><div><div class="section-label">INTERACTIVE LAB</div><h2>编辑与运行</h2></div></div>
      <div class="editor-card">
        <div class="editor-toolbar"><div class="editor-file"><span class="js-badge">JS</span><span>main.js</span><span class="source-badge" class:reference={sourceMode === 'reference'}>{sourceMode === 'reference' ? '参考实现' : sourceMode === 'starter' ? '起始代码' : '你的代码'}</span></div><div class="editor-actions"><button data-testid="builder-starter" onclick={loadStarter} disabled={running}>还原起始</button><button data-testid="builder-solution" onclick={loadSolution} disabled={running}>查看参考</button></div></div>
        <textarea aria-label="JavaScript 编辑器" data-testid="builder-editor" spellcheck="false" autocapitalize="off" autocomplete="off" readonly={running} bind:value={code} oninput={(event) => updateCode(event.currentTarget.value)}></textarea>
        <div class="runbar"><div class="scenario-picker"><label for="builder-scenario">运行场景</label><select id="builder-scenario" data-testid="builder-scenario" bind:value={scenario} onchange={()=>{result=null;checks=[];status='场景已修改，运行后查看新结果'}} disabled={running}>{#each scenarios as item}<option value={item.id}>{item.label}</option>{/each}</select></div><div class="run-actions"><span class="status-text" data-testid="builder-status">{status}</span><button class="stop-button" data-testid="builder-stop" onclick={stop} disabled={!running}>停止</button><button class="run-button" data-testid="builder-run" onclick={run} disabled={running || !lesson}>{running ? '运行中…' : '▶ 运行检查'}</button></div></div>
      </div>
      <div class="results-card" data-testid="builder-result">
        <div class="result-tabs" role="tablist" aria-label="运行结果"><button class:active={resultTab === 'input'} role="tab" aria-selected={resultTab === 'input'} onclick={() => resultTab = 'input'}>检查 <span>{checks.length || ''}</span></button><button class:active={resultTab === 'messages'} role="tab" aria-selected={resultTab === 'messages'} onclick={() => resultTab = 'messages'}>消息</button><button class:active={resultTab === 'events'} role="tab" aria-selected={resultTab === 'events'} onclick={() => resultTab = 'events'}>事件 <span>{result?.events.length || ''}</span></button><button class:active={resultTab === 'files'} role="tab" aria-selected={resultTab === 'files'} onclick={() => resultTab = 'files'}>文件 <span>{result ? Object.keys(result.files).length : ''}</span></button><button class:active={resultTab==='value'} role="tab" aria-selected={resultTab==='value'} onclick={()=>resultTab='value'}>返回值</button></div>
        <div class="result-content">
          {#if resultTab === 'input'}
            {#if checks.length}
              <ul class="check-list">{#each checks as check (check.id)}<li class:passed={check.passed} data-testid="builder-check"><span class="check-icon">{check.passed ? '✓' : '×'}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></li>{/each}</ul>
            {:else if result}<div class="result-message" class:error={result.status === 'error' || result.status === 'timeout'}><strong>{result.status === 'completed' ? '脚本已运行完成' : result.status === 'timeout' ? '运行超时' : result.status === 'cancelled' ? '运行已停止' : '运行错误'}</strong>{#if result.error}<pre>{result.error}</pre>{/if}<p>运行成功只表示脚本结束；只有上方的所有检查通过，才会记录本章完成。</p></div>
            {:else}<p class="empty-result">运行后，检查结果会显示在这里。脚本不会自动执行。</p>{/if}
          {:else if resultTab === 'messages'}
            {#if resultMessages.length}<div class="message-list">{#each resultMessages as message,i}<article><small>消息 {i+1}</small><pre>{safeJson(message)}</pre></article>{/each}</div>{:else}<p class="empty-result">本次脚本未返回消息历史。</p>{/if}
          {:else if resultTab === 'events'}
            {#if result?.events.length}<ol class="event-list">{#each result.events as event (event.seq)}<li><div class="event-meta"><strong>{event.type}</strong><span>#{event.seq}</span></div><details><summary>查看事件数据</summary><pre>{safeJson(event.data)}</pre></details></li>{/each}</ol>{:else}<p class="empty-result">运行后将显示带序号的事件记录。</p>{/if}
          {:else if resultTab==='value'}
            {#if result}<pre data-testid="builder-raw-value">{safeJson(result.value)}</pre>{:else}<p class="empty-result">运行后查看脚本返回值。</p>{/if}
          {:else}
            {#if result && Object.keys(result.files).length}<div class="file-list">{#each Object.entries(result.files) as [path, content]}<details><summary><span>▤</span> {path}</summary><pre>{content}</pre></details>{/each}</div>{:else}<p class="empty-result">虚拟文件系统尚无文件。</p>{/if}
          {/if}
        </div>
      </div>
      <aside class="sandbox-note"><span class="shield">▣</span><p><strong>受限模拟环境</strong>　文件仅存在于虚拟工作区；网络关闭，不会读取主站密钥或浏览器存储。真实 API 的参考代码仅供本地 Node.js 环境使用。</p></aside>
      <div class="reference-links"><span>参考代码</span><a href="/build-harness/reference/harness.mjs" download>harness.mjs</a><a href="/build-harness/reference/demo.mjs" download>demo.mjs</a><a href="/build-harness/reference/live.mjs" download>live.mjs</a><a data-testid="builder-download" href="/build-harness/reference/reference.zip" download>下载全部示例 ↓</a></div>
    </section>
  </main>
</div>
