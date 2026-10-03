<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { firstModule } from '../../content/first-module';
  import type { LessonBlock, LessonScene, QuizQuestion, UnitId } from '../learning';
  import type { RunResult, TraceEvent } from '../contracts';
  import { unitScene, runReadExercise, gradeExercise } from '../learning-runtime';

  export let events: TraceEvent[] = [];
  export let onScene: (scene: LessonScene) => void = () => {};
  export let onBusy: (busy: boolean) => void = () => {};

  const progressKey = 'harness-lab-first-module-progress';
  const validUnitIds: UnitId[] = ['introduction', 'proposal', 'dispatch', 'result', 'exercise', 'assessment'];
  type SavedProgress = { unitIds: UnitId[]; lastUnit: UnitId; assessmentPassed: boolean };
  const emptyProgress = (): SavedProgress => ({ unitIds: [], lastUnit: 'introduction', assessmentPassed: false });
  function readProgress(): SavedProgress {
    try {
      const raw = localStorage.getItem(progressKey);
      if (!raw) return emptyProgress();
      const value = JSON.parse(raw);
      if (!value || !Array.isArray(value.unitIds)) return emptyProgress();
      const unitIds = [...new Set(value.unitIds.filter((id: unknown) => typeof id === 'string' && validUnitIds.includes(id as UnitId)))] as UnitId[];
      const lastUnit = validUnitIds.includes(value.lastUnit) ? value.lastUnit as UnitId : 'introduction';
      return { unitIds, lastUnit, assessmentPassed: value.assessmentPassed === true };
    } catch { return emptyProgress(); }
  }
  let progress = readProgress();
  const moduleUnits = firstModule.units as import('../learning').LearningUnit[];
  const quizQuestions = firstModule.questions as QuizQuestion[];
  let selectedUnit: UnitId = progress.lastUnit;
  let lessonPane:HTMLElement;
  let exercisePath = '/src/sum.js';
  let prediction: 'file-content' | 'tool-error' | 'validation-error' | 'provider-error' | '' = '';
  let exerciseRunning = false;
  let exerciseFeedback = '';
  let exerciseAttemptCorrect = false;
  let exerciseResult: RunResult | null = null;
  let exerciseEvents: TraceEvent[] = [];
  let exerciseError = '';
  let quizAnswers: Record<string, string> = {};
  let quizSubmitted = false;
  let quizFeedback: Record<string, { correct: boolean; explanation: string }> = {};
  let activeHandle: ReturnType<typeof runReadExercise> | undefined;
  let exerciseGeneration=0;
  $: unit = moduleUnits.find((item) => item.id === selectedUnit) ?? moduleUnits[0];
  $: unitIndex = moduleUnits.findIndex((item) => item.id === selectedUnit);
  $: unitIdsCount = progress.unitIds.length;
  $: moduleCompleted = validUnitIds.every((id) => progress.unitIds.includes(id)) && progress.assessmentPassed;
  $: exercisePassed = progress.unitIds.includes('exercise');
  $: quizPassed = quizSubmitted && Object.keys(quizFeedback).length === quizQuestions.length && Object.values(quizFeedback).every(item=>item.correct);
  $: scene = unitScene(selectedUnit, events, exerciseEvents);

  $: {
    onScene(scene);
  }

  function saveProgress() {
    progress = { ...progress, lastUnit: selectedUnit };
    try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch { /* Storage can be unavailable in private browsing. */ }
  }
  function setCompleted(id: UnitId) {
    if (id === 'exercise' && !progress.unitIds.includes('exercise')) return;
    if (id === 'assessment' && !progress.assessmentPassed) return;
    if (!progress.unitIds.includes(id)) progress = { ...progress, unitIds: [...progress.unitIds, id] };
    saveProgress();
  }
  function changeUnit(id: UnitId) {
    if (id === selectedUnit) return;
    exerciseGeneration++;activeHandle?.cancel(); activeHandle = undefined;
    exerciseRunning = false; onBusy(false);
    exerciseFeedback = ''; exerciseAttemptCorrect = false; exerciseError = ''; exerciseResult = null; exerciseEvents = [];
    selectedUnit = id; progress = { ...progress, lastUnit: id }; saveProgress();
    void tick().then(()=>lessonPane?.scrollTo({top:0}));
  }
  function selectUnit(event: Event) {
    changeUnit((event.currentTarget as HTMLSelectElement).value as UnitId);
  }
  function nextUnit() { if (unitIndex < moduleUnits.length - 1) changeUnit(moduleUnits[unitIndex + 1].id); }
  function previousUnit() { if (unitIndex > 0) changeUnit(moduleUnits[unitIndex - 1].id); }

  async function runExercise() {
    if (!prediction || exerciseRunning) return;
    activeHandle?.cancel();
    exerciseEvents = []; exerciseResult = null; exerciseFeedback = ''; exerciseAttemptCorrect = false; exerciseError = '';
    exerciseRunning = true; onBusy(true);
    const generation=++exerciseGeneration;
    const path=exercisePath, predicted=prediction;
    const captured: TraceEvent[] = [];
    const handle = runReadExercise(path, (event) => {if(generation!==exerciseGeneration)return;captured.push(event);exerciseEvents=[...captured];});
    activeHandle = handle;
    try {
      const result = await handle.result;
      if (activeHandle !== handle) return;
      exerciseResult = result;
      exerciseEvents = result.events?.length ? result.events : captured;
      const grade = gradeExercise(path, predicted, result);
      exerciseFeedback = grade.explanation;
      exerciseAttemptCorrect = grade.correct;
      if (grade.correct) {
        if (!progress.unitIds.includes('exercise')) progress = { ...progress, unitIds: [...progress.unitIds, 'exercise'] };
        setCompleted('exercise');
      }
      const failureEvent = [...exerciseEvents].reverse().find((event) => /error|fail|invalid/i.test(`${event.kind} ${event.title}`));
      if (failureEvent) onScene(unitScene('exercise', events, exerciseEvents));
    } catch (error) {
      if (activeHandle !== handle) return;
      exerciseError = error instanceof Error ? error.message : String(error);
      exerciseFeedback = `练习未能完成：${exerciseError}`;
    } finally {
      if (activeHandle === handle) {
        activeHandle = undefined;
        exerciseRunning = false; onBusy(false);
      }
    }
  }

  function submitQuiz() {
    const next: Record<string, { correct: boolean; explanation: string }> = {};
    for (const question of quizQuestions as QuizQuestion[]) {
      const correct = quizAnswers[question.id] === question.answer;
      next[question.id] = { correct, explanation: question.explanation };
    }
    quizFeedback = next; quizSubmitted = true;
    const passed = Object.values(next).length === 3 && Object.values(next).every((item) => item.correct);
    if (passed) {
      progress = { ...progress, assessmentPassed: true };
      setCompleted('assessment');
    } else {
      saveProgress();
    }
  }
  function review(question: QuizQuestion) { changeUnit(question.reviewUnit); }
  function renderBlock(block: LessonBlock) { return block; }
  onDestroy(() => { exerciseGeneration++;activeHandle?.cancel();activeHandle=undefined;onBusy(false); });
</script>

<section class="module-lesson" aria-labelledby="module-title">
  <header class="module-header">
    <div class="module-kicker">FIRST MODULE <span>·</span> LEARNING PATH</div>
    <h1 id="module-title" data-testid="module-title">{firstModule.title}</h1>
    <p class="module-description">{firstModule.description}</p>

    <div class="progress-line"><span data-testid="module-progress">已完成 {unitIdsCount} / 6 单元</span><div class="progress-track"><i style={`width:${Math.min(100, unitIdsCount / 6 * 100)}%`}></i></div>{#if moduleCompleted}<strong class="complete-badge" data-testid="module-completed">模块已完成</strong>{/if}</div>
    <nav class="unit-route" aria-label="六单元路线">{#each moduleUnits as item, index}<button class:active={item.id === selectedUnit} class:done={progress.unitIds.includes(item.id)} onclick={() => changeUnit(item.id)} aria-current={item.id === selectedUnit ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}{#if progress.unitIds.includes(item.id)}<b aria-label="已完成">✓</b>{/if}</button>{/each}</nav>
    <label class="unit-select-label" for="unit-select">课程单元</label><select id="unit-select" data-testid="unit-select" value={selectedUnit} onchange={selectUnit}>{#each moduleUnits as item, index}<option value={item.id}>{index + 1}. {item.title}</option>{/each}</select>
  </header>

  <div class="lesson-layout">
    <article class="lesson-pane" bind:this={lessonPane}>
      <div class="unit-heading"><div><span class="unit-number">UNIT {String(unitIndex + 1).padStart(2, '0')}</span><h2>{unit.title}</h2></div>{#if progress.unitIds.includes(unit.id)}<span class="unit-complete">✓ 已完成</span>{/if}</div>
      <p class="unit-goal">{unit.goal}</p>
      {#if unit.id === 'introduction'}
        <div class="overview-grid"><div><h2>学习目标</h2><ul>{#each firstModule.objectives as objective}<li>{objective}</li>{/each}</ul></div><div><h2>前置知识</h2><ul>{#each firstModule.prerequisites as prerequisite}<li>{prerequisite}</li>{/each}</ul></div></div>
        <p class="lesson-copy">{firstModule.description}</p>
        <h3>六个单元的路线</h3><ol class="route-list">{#each moduleUnits as item}<li><b>{item.title}</b><span>{item.goal}</span></li>{/each}</ol>
      {/if}
      {#each unit.blocks as rawBlock}
        {@const block = renderBlock(rawBlock)}
        {#if block.kind === 'paragraph'}<p class="lesson-copy">{block.text}</p>
        {:else if block.kind === 'code'}<figure class="code-block"><figcaption>{block.caption}<span>{block.language}</span></figcaption><pre><code>{block.code}</code></pre>{#if block.source}<a class="source-link" href={block.source.url} target="_blank" rel="noreferrer">来源：{block.source.label} ↗</a>{/if}</figure>
        {:else if block.kind === 'fields'}<dl class="field-list">{#each block.items as item}<div><dt>{item.name}</dt><dd>{item.meaning}{#if item.example}<code>{item.example}</code>{/if}</dd></div>{/each}</dl>
        {:else}<aside class="callout"><b>{block.title}</b><p>{block.text}</p></aside>{/if}
      {/each}

      {#if unit.id === 'exercise'}
        <section class="exercise-card" aria-labelledby="exercise-title"><span class="unit-number">TRY IT</span><h3 id="exercise-title">预测一次真实读取</h3><p>输入虚拟工作区中的文件路径，先判断运行结果，再执行读取。模型响应由预设脚本生成，Pi 在浏览器中校验参数并执行读取。</p>
          <label for="exercise-path">读取路径</label><input id="exercise-path" data-testid="exercise-path" bind:value={exercisePath} placeholder="/src/sum.js" disabled={exerciseRunning} />
          <label for="exercise-prediction">预测结果</label><select id="exercise-prediction" data-testid="exercise-prediction" bind:value={prediction} disabled={exerciseRunning}><option value="">先选择预测…</option><option value="file-content">读取成功并返回文件内容</option><option value="tool-error">工具执行错误</option><option value="validation-error">参数校验错误</option><option value="provider-error">Provider 错误</option></select>
          <button class="action-button" data-testid="exercise-run" onclick={runExercise} disabled={!prediction || exerciseRunning}>{exerciseRunning ? '读取中…' : '运行读取'}</button>
          {#if exerciseRunning}<p role="status">正在执行读取…</p>{/if}
          {#if exerciseError}<p class="error-message">{exerciseError}</p>{/if}
          {#if exerciseFeedback}<div class:feedback-correct={exerciseAttemptCorrect} class="exercise-feedback" data-testid="exercise-feedback" role="status"><b>{exerciseAttemptCorrect ? '预测正确' : '预测不匹配'}</b><p>{exerciseFeedback}</p>{#if exerciseResult?.status}<small>运行状态：{exerciseResult.status}</small>{/if}{#if exerciseResult?.error}<small>错误：{exerciseResult.error}</small>{/if}{#if exerciseResult && Object.keys(exerciseResult.files ?? {}).length}<details><summary>读取结果 / 文件快照</summary><pre>{JSON.stringify(exerciseResult.files, null, 2)}</pre></details>{/if}</div>{/if}
          {#if exerciseResult?.events?.length}<p class="trace-hint">在右侧查看这次调用、工具结果和文件快照。</p>{/if}
        </section>
      {/if}

      {#if unit.id === 'assessment'}
        <section class="quiz" aria-label="模块测验">{#each quizQuestions as question, index}<fieldset class="quiz-question" data-testid="quiz-question"><legend><span>{String(index + 1).padStart(2, '0')}</span>{question.prompt}</legend>{#each question.choices as choice}<label class:chosen={quizAnswers[question.id] === choice.id}><input type="radio" name={`quiz-${question.id}`} value={choice.id} data-testid="quiz-choice" data-question={question.id} data-choice={choice.id} bind:group={quizAnswers[question.id]} onchange={() => { quizSubmitted = false;quizFeedback={}; }} />{choice.text}</label>{/each}{#if quizFeedback[question.id]}<div class:answer-correct={quizFeedback[question.id].correct} class="quiz-explanation"><b>{quizFeedback[question.id].correct ? '正确' : '再想一想'}</b><p>{quizFeedback[question.id].explanation}</p><button type="button" onclick={() => review(question)}>复习：{moduleUnits.find((item) => item.id === question.reviewUnit)?.title}</button></div>{/if}</fieldset>{/each}
          <button class="action-button" data-testid="quiz-submit" onclick={submitQuiz} disabled={quizQuestions.some((question) => !quizAnswers[question.id])}>提交测验</button>
          {#if quizSubmitted}<div class="quiz-summary" data-testid="quiz-feedback" role="status"><b>{quizPassed ? '三题全对，测验通过' : '本次未通过，可修改答案后重试'}</b><p>{Object.values(quizFeedback).filter((item) => item.correct).length} / {Object.keys(quizFeedback).length} 题正确。</p>{#if quizPassed}<h3>模块小结</h3><ul>{#each firstModule.summary as point}<li>{point}</li>{/each}</ul>{/if}</div>{/if}
        </section>
      {/if}
      {#if unit.id !== 'exercise' && unit.id !== 'assessment'}<button class="complete-button" data-testid="unit-complete" onclick={() => setCompleted(unit.id)} disabled={progress.unitIds.includes(unit.id)}>{progress.unitIds.includes(unit.id) ? '本单元已完成' : '学完本单元'}</button>{:else}<button class="complete-button" data-testid="unit-complete" disabled={true}>{progress.unitIds.includes(unit.id)?'本单元已完成':'完成练习或测验后自动记录'}</button>{/if}
      <footer class="unit-pagination"><button data-testid="unit-prev" onclick={previousUnit} disabled={unitIndex === 0}>← 上一单元</button><button data-testid="unit-next" onclick={nextUnit} disabled={unitIndex === moduleUnits.length - 1}>下一单元 →</button></footer>
    </article>

  </div>

</section>

<style>
  .unit-route{display:none!important}.module-header select{display:block;width:100%;margin:12px 0 0;padding:8px;border:1px solid #dce7df;border-radius:6px;background:white;font-size:13px}.lesson-layout{display:block!important}.lesson-pane{height:100%}.module-lesson{height:100%;min-height:0;display:flex;flex-direction:column;color:#213b32}.module-header{flex:none;padding:20px 24px 14px;border-bottom:1px solid #e3ebe6;background:#fbfdfb}.module-kicker,.unit-number{font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#39836b}.module-kicker span{padding:0 5px;color:#a8b9b0}.module-header h1{font-size:25px;line-height:1.2;margin:6px 0}.module-description{margin:0;color:#62756b;font-size:13px}.overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 0}.overview-grid h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#62786d;margin:0 0 6px}.overview-grid ul{margin:0;padding-left:17px;color:#4d6258;font-size:12px;line-height:1.7}.progress-line{display:flex;align-items:center;gap:10px;color:#61756b;font-size:11px}.progress-track{height:5px;background:#e6eee8;border-radius:4px;flex:1;overflow:hidden}.progress-track i{display:block;height:100%;background:#318365;transition:width .2s}.complete-badge,.unit-complete{color:#167252;background:#e8f5ed;border-radius:20px;padding:4px 9px;font-size:10px}.unit-route{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-top:12px}.unit-route button{display:flex;align-items:center;gap:5px;min-width:0;padding:7px 6px;background:white;border:1px solid #e1e9e4;border-radius:7px;color:#63756b;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.unit-route button.active{border-color:#7eb49b;background:#eef7f1;color:#20664e}.unit-route button>span{color:#96a79d;font:10px ui-monospace,monospace}.unit-route button b{margin-left:auto;color:#20815c}.unit-select-label{display:none}.lesson-layout{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:16px;min-height:0;flex:1}.lesson-pane{overflow:auto;min-height:0;padding:22px 24px 18px}.unit-heading{display:flex;justify-content:space-between;align-items:flex-start}.unit-heading h2{font-size:20px;margin:4px 0 9px}.unit-goal{font-size:13px;color:#3c705c;margin:0 0 15px;padding:10px 12px;border-left:3px solid #5aa17c;background:#f0f7f2}.lesson-copy{border:0;background:none;padding:0;font-size:14px;line-height:1.75;color:#40574c;margin:13px 0}.lesson-copy:first-of-type{margin-top:8px}.lesson-pane h3{font-size:14px;margin:18px 0 8px}.route-list{list-style:none;padding:0;margin:0;display:grid;gap:5px}.route-list li{display:flex;gap:10px;font-size:12px;padding:7px 9px;background:#f7faf8;border-radius:6px}.route-list li b{min-width:82px;color:#2e6550}.route-list li span{color:#62746a}.code-block{margin:15px 0;border:1px solid #e1e9e4;border-radius:8px;overflow:hidden;background:#f7f9f8}.code-block figcaption{padding:7px 10px;font-size:11px;color:#64786d;background:#eef3ef}.code-block figcaption span{float:right;font-family:ui-monospace,monospace}.code-block pre,.exercise-feedback pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:12px;font:12px/1.6 ui-monospace,monospace;color:#304b3f;overflow:auto}.source-link{display:block;padding:8px 10px;border-top:1px solid #e1e9e4;font-size:11px;color:#39836b}.field-list{margin:12px 0;border:1px solid #e3ebe6;border-radius:8px;overflow:hidden}.field-list>div{display:grid;grid-template-columns:minmax(100px,.7fr) 2fr;gap:10px;padding:9px 11px;border-bottom:1px solid #edf1ee;font-size:12px}.field-list>div:last-child{border:0}.field-list dt{font:12px ui-monospace,monospace;color:#28634b}.field-list dd{margin:0;color:#586c60}.field-list code{display:block;margin-top:4px;color:#7c6550}.callout{background:#fff8e9;border:1px solid #f0e1ba;border-radius:8px;padding:11px 13px;margin:15px 0;color:#69572e;font-size:12px}.callout p{margin:5px 0 0;line-height:1.6}.complete-button,.action-button{border:0;border-radius:6px;padding:9px 13px;background:#267a59;color:white;font-size:12px;cursor:pointer}.complete-button{margin-top:18px}.complete-button:disabled,.action-button:disabled{opacity:.48;cursor:not-allowed}.unit-pagination{display:flex;justify-content:space-between;margin-top:17px;padding-top:12px;border-top:1px solid #e8eeea}.unit-pagination button{border:1px solid #dce7df;border-radius:6px;background:white;padding:7px 10px;color:#3f6854;cursor:pointer;font-size:11px}.unit-pagination button:disabled{opacity:.4;cursor:default}.exercise-card,.quiz{margin:18px 0;padding:15px;border:1px solid #dfe9e2;border-radius:10px;background:#fbfdfb}.exercise-card>p{font-size:12px;color:#65776d;line-height:1.6}.exercise-card>label{display:block;margin:11px 0 5px;font-size:11px;color:#51685b}.exercise-card input,.exercise-card select{width:100%;padding:9px;border:1px solid #dbe5de;border-radius:6px;background:white;color:#2d473a;font-size:12px}.exercise-card .action-button,.quiz>.action-button{margin-top:12px}.exercise-feedback{padding:10px;margin-top:12px;border-radius:7px;background:#fff5e5;color:#755a2d;font-size:12px}.exercise-feedback.feedback-correct{background:#eaf6ee;color:#286447}.exercise-feedback p{margin:5px 0;line-height:1.6}.exercise-feedback small{display:block;margin-top:5px}.exercise-feedback details{margin-top:8px}.exercise-feedback summary{cursor:pointer}.error-message{color:#a43f32}.quiz{display:grid;gap:10px}.quiz-question{border:1px solid #e1e9e4;border-radius:8px;padding:11px;margin:0}.quiz-question legend{font-size:12px;font-weight:700;line-height:1.5}.quiz-question legend span{font:10px ui-monospace,monospace;color:#378367;margin-right:7px}.quiz-question>label{display:flex;gap:8px;align-items:flex-start;margin-top:8px;padding:7px;border-radius:5px;font-size:11px;color:#53675c;cursor:pointer}.quiz-question>label.chosen{background:#eef6f0}.quiz-question input{accent-color:#328262}.quiz-explanation{margin-top:8px;padding:8px;border-radius:6px;background:#fff5e8;color:#705a35;font-size:11px}.quiz-explanation.answer-correct{background:#eaf6ee;color:#286447}.quiz-explanation p{line-height:1.55;margin:4px 0}.quiz-explanation button{padding:0;border:0;background:none;color:#287956;text-decoration:underline;cursor:pointer;font-size:11px}.quiz-summary{padding:10px;border-radius:7px;background:#edf7f0;color:#2c694a;font-size:12px}.quiz-summary p{margin:5px 0 0;line-height:1.6}.unit-select-label{color:#63756b}
  @media(max-width:760px){.module-lesson{height:100%;min-height:0}.module-header{padding:14px}.module-header h1{font-size:18px}.module-description,.module-kicker{display:none}.overview-grid{gap:8px}.unit-route{display:none}.unit-select-label{display:block;margin-top:10px;font-size:11px}.module-header select{display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #dce7df;border-radius:6px;background:white}.lesson-layout{display:block}.lesson-pane{overflow:auto;padding:12px 14px}.field-list>div{grid-template-columns:1fr;gap:4px}}
</style>
