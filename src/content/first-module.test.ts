import {describe,it,expect} from 'vitest';
import {firstModule} from './first-module';

describe('first learning module content',()=>{
 it('contains six purposeful units, objectives and prerequisites',()=>{
  expect(firstModule.units.map(u=>u.id)).toEqual(['introduction','proposal','dispatch','result','exercise','assessment']);
  expect(firstModule.objectives.length).toBeGreaterThanOrEqual(3);expect(firstModule.prerequisites.length).toBeGreaterThanOrEqual(1);expect(firstModule.summary.length).toBeGreaterThanOrEqual(3);
  for(const unit of firstModule.units){expect(unit.goal.length).toBeGreaterThan(5);expect(unit.blocks.length).toBeGreaterThanOrEqual(2);}
 });
 it('explains tool fields and uses valid JSON examples and pinned sources',()=>{
  const proposal=firstModule.units.find(u=>u.id==='proposal')!;
  const fields=proposal.blocks.flatMap(b=>b.kind==='fields'?b.items.map(i=>i.name):[]);expect(fields).toEqual(expect.arrayContaining(['id','name','arguments']));
  const blocks=firstModule.units.flatMap(u=>u.blocks);expect(blocks.filter(b=>b.kind==='code').length).toBeGreaterThanOrEqual(2);
  for(const block of blocks){
   if(block.kind==='code'&&block.language==='json')expect(()=>JSON.parse(block.code)).not.toThrow();
   if(block.kind==='code'&&block.source?.url.includes('earendil-works/pi'))expect(block.source.url).toContain('a13d35a742c6ef8462812a28fbe1d8c8b7431c32');
  }
 });
 it('defines three answerable questions with explanations and review links',()=>{
  expect(firstModule.questions).toHaveLength(3);expect(new Set(firstModule.questions.map(q=>q.id)).size).toBe(3);
  for(const q of firstModule.questions){expect(q.choices.filter(c=>c.id===q.answer)).toHaveLength(1);expect(q.explanation.length).toBeGreaterThan(20);expect(firstModule.units.some(u=>u.id===q.reviewUnit)).toBe(true);}
 });
});
