import {test,expect} from '@playwright/test';
const ids=['messages','provider','tools','dispatch','loop','workspace','failures','limits','real-api'];

test('all nine chapter references actually run and pass in the isolated browser executor',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1920,height:1080});await page.goto('/build-harness/');
 await expect(page.getByTestId('builder-title')).toBeVisible();
 for(const id of ids){
  await page.getByTestId('builder-chapter').selectOption(id);await page.getByTestId('builder-solution').click();await page.getByTestId('builder-run').click();
  await expect(page.getByTestId('builder-status')).toContainText('全部通过',{timeout:15000});
  await expect(page.getByTestId('builder-check')).toHaveClass(/passed/);
  if(id==='workspace')await page.screenshot({path:'docs/screenshots/build-harness-workspace.png',fullPage:true});
 }
 expect(errors).toEqual([]);await page.screenshot({path:'docs/screenshots/build-harness-api.png',fullPage:true});
 await page.reload();await expect(page.getByTestId('builder-chapter')).toHaveValue('real-api');
 expect(await page.getByTestId('builder-chapter').locator('option').filter({hasText:'✓'}).count()).toBe(9);
});

test('starter, syntax errors, timeout and stop do not pass, and the editor can recover',async({page})=>{
 await page.goto('/build-harness/');await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('0/1');
 await page.getByTestId('builder-editor').fill('async function main(ctx) { broken syntax ??? }');await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('运行错误');
 await page.getByTestId('builder-editor').fill('async function main(ctx) { while(true){} }');await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('运行超时',{timeout:10000});await expect.poll(()=>page.workers().length).toBe(0);
 await page.getByTestId('builder-run').click();await page.getByTestId('builder-stop').click();await expect(page.getByTestId('builder-status')).toContainText('已停止');
 await page.getByTestId('builder-solution').click();await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('全部通过');
});

test('user code cannot read host storage or make network requests',async({page})=>{
 await page.goto('/build-harness/');await page.evaluate(()=>localStorage.setItem('builder-host-canary','not-for-worker'));
 let attempted=0;await page.route('**/builder-private-probe',r=>{attempted++;return r.fulfill({body:'not-for-worker'});});
 const origin=new URL(page.url()).origin;
 await page.getByTestId('builder-editor').fill(`async function main(ctx) { let network; try { await fetch(${JSON.stringify(origin+'/builder-private-probe')}); network='allowed'; } catch { network='blocked'; } return {origin:location.origin,storage:typeof localStorage,network}; }`);
 await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('运行完成');
 // Inspect returned data through the page's normal result view.
 await page.getByRole('tab',{name:'消息',exact:true}).click();await expect(page.getByTestId('builder-result')).toContainText('未返回消息历史');
 await page.getByRole('tab',{name:'返回值',exact:true}).click();await expect(page.getByTestId('builder-raw-value')).toContainText('blocked');await expect(page.getByTestId('builder-raw-value')).toContainText('null');await expect(page.getByTestId('builder-raw-value')).toContainText('undefined');
 expect(attempted).toBe(0);
 await expect(page.locator('iframe[sandbox]')).toHaveCount(0);
});

test('narrow screen and focus modes retain navigation and clear outdated checks',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/build-harness/');await page.getByRole('button',{name:'阅读',exact:true}).click();await expect(page.locator('.workbench-panel')).toBeHidden();await page.getByRole('button',{name:'编辑',exact:true}).click();await expect(page.getByTestId('builder-editor')).toBeVisible();await page.getByRole('button',{name:'并排',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 await page.getByTestId('builder-solution').click();await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('全部通过');await page.getByTestId('builder-scenario').selectOption('unknown-tool');await expect(page.getByTestId('builder-check')).toHaveCount(0);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'docs/screenshots/build-harness-mobile.png',fullPage:true});
});

test('Responses sample and reference download are usable',async({page})=>{
 await page.goto('/build-harness/');await page.getByTestId('builder-chapter').selectOption('real-api');
 const figure=page.locator('.lesson-code').filter({hasText:'Responses：完整可运行参考'});await figure.getByRole('button',{name:'载入编辑器'}).click();await page.getByTestId('builder-run').click();await expect(page.getByTestId('builder-status')).toContainText('全部通过');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('builder-download').click()]);expect(download.suggestedFilename()).toContain('reference');
});
