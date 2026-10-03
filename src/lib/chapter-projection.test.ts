import {describe,it,expect,beforeAll} from 'vitest';
import {runInProcess} from './runtime';
import {defaultSettings,DEFAULT_PROMPT,INITIAL_FILES} from './contracts';
import {projectChapter} from './chapter-projection';
import type {TraceEvent} from './contracts';
let events:TraceEvent[]=[];
beforeAll(async()=>{events=(await runInProcess({settings:{...defaultSettings,delayMs:0},prompt:DEFAULT_PROMPT,files:INITIAL_FILES})).events;});

describe('chapter-focused projections of real Pi events',()=>{
 it('introduces only one model proposal and its actual execution/result',()=>{
  const view=projectChapter('overview',events);expect(events.length).toBeGreaterThan(30);expect(view.events.map(e=>e.kind)).toEqual(['message_end','tool_execution_start','tool_execution_end']);
  expect(view.events.every(e=>events.includes(e))).toBe(true);
  expect(view.preferredId).toBe(view.events[0].id);
 });
 it('shows one request boundary rather than all model rounds',()=>{
  const context=projectChapter('context',events);expect(context.events.map(e=>e.kind)).toEqual(['serialized','request']);
  expect(context.events.some(e=>e.kind==='tool_execution_end')).toBe(false);
 });
 it('binds tools to one call ID and keeps file mutations reachable',()=>{
  const view=projectChapter('tools',events);expect(view.events.some(e=>e.kind==='write')).toBe(true);
  const start=view.events.find(e=>e.kind==='tool_execution_start')!,end=view.events.find(e=>e.kind==='tool_execution_end')!;
  expect((start.data as any).toolCallId).toBe((end.data as any).toolCallId);
 });
 it('does not invent compression or failure evidence',()=>{
  expect(projectChapter('context-management',events).note).toContain('未执行');
  expect(projectChapter('failures',events).events).toHaveLength(0);
  expect(projectChapter('failures',events).note).toContain('没有失败');
 });
 it('preserves original identity and chronological order in every chapter',()=>{
  for(const id of ['overview','context','streaming','tools','loop','workspace-session','context-management','failures','api-lab']){
   const view=projectChapter(id,events);expect(view.events.every(e=>events.includes(e))).toBe(true);expect(view.events.map(e=>e.seq)).toEqual(view.events.map(e=>e.seq).sort((a,b)=>a-b));
   expect(new Set(view.events.map(e=>e.id)).size).toBe(view.events.length);
  }
 });
});
