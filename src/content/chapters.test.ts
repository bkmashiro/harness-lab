import { describe,it,expect } from 'vitest';
import { chapters } from './chapters';

describe('curriculum evidence contracts',()=>{
  it('offers nine unique chapters in one visual vocabulary',()=>{
    expect(chapters).toHaveLength(9);
    expect(new Set(chapters.map(c=>c.id)).size).toBe(9);
    const lanes=new Set(['user','context','provider','parser','harness','tools','workspace','session']);
    for(const chapter of chapters){
      expect(chapter.body.length).toBeGreaterThanOrEqual(3);
      expect(chapter.sources.length).toBeGreaterThan(0);
      for(const focus of chapter.focus) expect(lanes.has(focus)).toBe(true);
    }
  });
  it('pins upstream source to the published runtime revision',()=>{
    const sources=chapters.flatMap(c=>c.sources);
    for(const source of sources.filter(s=>s.url.includes('earendil-works/pi'))){
      expect(source.url).toContain('a13d35a742c6ef8462812a28fbe1d8c8b7431c32');
    }
    expect(chapters[0].body.join(' ')).toContain('本章仅有这三步');
  });
});
