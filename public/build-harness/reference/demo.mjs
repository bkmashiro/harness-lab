import { createDemoProvider, createHarness, createWorkspaceTools } from './harness.mjs';

const files = {
  '/src/sum.js': 'export function sum(a, b) { return a - b; }',
  '/README.md': '# Tiny arithmetic module\nThe sum function should add its inputs.\n',
};
const events = [];
const harness = createHarness({ provider: createDemoProvider(), tools: createWorkspaceTools(files), maxTurns: 8, onEvent: (type, data) => events.push({ type, data }) });
const result = await harness.run('修复 /src/sum.js 的 sum(a, b)，先读取文件，修改后运行测试；只有测试通过才能报告成功。');
console.log(JSON.stringify({ result, files, events }, null, 2));
if (result.status !== 'completed' || !result.messages.some(m => m.role === 'tool' && m.name === 'run_tests' && !m.isError && m.content.includes('3 tests passed'))) process.exitCode = 1;
