import {test,expect} from '@playwright/test';

async function ready(page:import('@playwright/test').Page){await page.goto('/');await expect(page.getByTestId('run-status')).toContainText('已完成',{timeout:30000});}
async function scenario(page:import('@playwright/test').Page,value:string){await page.getByTestId('settings-button').click();await page.getByTestId('scenario-select').selectOption(value);await page.getByTestId('settings-button').click();await page.getByTestId('run-button').click();}

test('provider failure remains visible rather than showing a success trace',async({page})=>{
 await ready(page);await scenario(page,'provider-error');await expect(page.getByTestId('run-status')).toContainText('发生错误');await expect(page.getByText('运行失败',{exact:true})).toBeVisible();
});

test('invalid arguments never execute a workspace write',async({page})=>{
 await ready(page);await scenario(page,'invalid-args');await expect(page.getByTestId('run-status')).toContainText('已完成');
 await page.getByTestId('full-trace-toggle').check();
 await expect(page.getByTestId('timeline-event').filter({hasText:'write_file /src/sum.js'})).toHaveCount(0);
});

test('exported trace has actual failed tests and no configured API key',async({page})=>{
 await ready(page);await page.getByTestId('settings-button').click();await page.getByTestId('scenario-select').selectOption('failed-test');
 await page.locator('input[type=password]').fill('example-private-key-never-export');
 await page.getByTestId('settings-button').click();await page.getByTestId('run-button').click();await expect(page.getByTestId('run-status')).toContainText('已完成');
 await page.getByTestId('right-tab-data').click();
 const downloadPromise=page.waitForEvent('download');await page.getByTestId('export-button').click();const download=await downloadPromise;const stream=await download.createReadStream();let body='';for await(const chunk of stream!) body+=chunk.toString();
 expect(body).not.toContain('example-private-key-never-export');const trace=JSON.parse(body);expect(trace.events.find((e:any)=>e.kind==='test').data.ok).toBe(false);
});

test('single-call API lab compares non-stream JSON without executing any tool',async({page})=>{
 await ready(page);await page.getByTestId('settings-button').click();await page.getByTestId('api-stream-select').selectOption({label:'非流式 JSON'});await page.getByTestId('api-test-button').click();
 await expect(page.getByText('响应已进入时间轴。单次实验不执行工具；返回课程可逐步查看。')).toBeVisible();
 await page.getByTestId('settings-button').click();await page.getByTestId('full-trace-toggle').check();await expect(page.getByTestId('timeline-event').filter({hasText:'api_test_result'})).toHaveCount(1);await expect(page.getByTestId('timeline-event').filter({hasText:'tool_execution_start'})).toHaveCount(0);
});

test('cancellation stops a delayed run and preserves its partial trace',async({page})=>{
 await ready(page);await page.getByTestId('settings-button').click();await page.locator('input[type=range]').fill('1800');await page.getByTestId('settings-button').click();await page.getByTestId('run-button').click();await page.getByTestId('stop-button').click();await expect(page.getByTestId('run-status')).toContainText('已停止');await page.getByTestId('full-trace-toggle').check();expect(await page.getByTestId('timeline-event').count()).toBeGreaterThan(0);
});

test('live mode does not send any provider request before explicit confirmation',async({page})=>{
 await ready(page);const requests:string[]=[];page.on('request',r=>{if(r.url().includes('api.openai.com'))requests.push(r.url());});
 await page.getByTestId('settings-button').click();await page.getByTestId('mode-select').selectOption('live');await page.getByTestId('settings-button').click();await page.getByTestId('run-button').click();
 await expect(page.getByRole('dialog')).toBeVisible();expect(requests).toEqual([]);await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();expect(requests).toEqual([]);
});
