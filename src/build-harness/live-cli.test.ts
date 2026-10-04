import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';

describe('downloadable reference CLI',()=>{
 it('runs the offline demo without dependencies or keys',()=>{
  const result=JSON.parse(execFileSync(process.execPath,['public/build-harness/reference/demo.mjs'],{encoding:'utf8'}));
  expect(result.result.status).toBe('completed');expect(result.result.turns).toBe(4);expect(result.files['/src/sum.js']).toContain('return a + b');
 });
 it('runs live-entry orchestration against local HTTP fixtures and scrubs echoed credentials',()=>{
  const code=`import {createMockFetch} from './public/build-harness/reference/harness.mjs';const mock=createMockFetch('chat');globalThis.fetch=async(u,o)=>{const r=await mock(u,o);const b=await r.json();if(b.choices?.[0]?.message?.content)b.choices[0].message.content+=' '+process.env.API_KEY;return new Response(JSON.stringify(b),{status:r.status,headers:{'content-type':'application/json'}});};await import('./public/build-harness/reference/live.mjs');`;
  const text=execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,API_BASE_URL:'https://mock.invalid/v1',API_MODEL:'mock-model',API_KEY:'test-credential-never-log',API_PROTOCOL:'chat'}});
  expect(text).not.toContain('test-credential-never-log');expect(text).toContain('[REDACTED]');expect(text).toContain('completed');expect(text).toContain('return a + b');
 });
});
