import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/design/learning-layouts-data.json',import.meta.url),'utf8'));

test('chapter-specific layout preview uses real values and local controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.goto('/design/learning-layouts.html');
 await page.getByTestId('topic-request').click();await page.getByTestId('field-id').click();await expect(page.getByTestId('field-detail')).toContainText(data.call.id);
 await page.getByTestId('field-arguments').click();await expect(page.getByTestId('field-detail')).toContainText('/src/sum.js');
 await expect(page.locator('input[type=range]')).toHaveCount(0);
 await page.screenshot({path:'docs/screenshots/design-request.png',fullPage:true});
 await page.getByTestId('topic-execution').click();await expect(page.getByTestId('execution-step')).toHaveCount(data.events.length);
 await page.getByTestId('step-next').click();await page.getByTestId('step-prev').click();await page.getByTestId('execution-step').last().click();
 await page.screenshot({path:'docs/screenshots/design-execution.png',fullPage:true});
 await page.getByTestId('topic-workspace').click();await page.getByTestId('view-before').click();await expect(page.getByTestId('workspace-content')).toContainText('return a - b');
 await page.getByTestId('view-after').click();await expect(page.getByTestId('workspace-content')).toContainText('return a + b');await page.getByTestId('view-diff').click();
 await page.screenshot({path:'docs/screenshots/design-workspace.png',fullPage:true});expect(errors).toEqual([]);
});

test('preview preserves text size instead of shrinking a canvas',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/design/learning-layouts.html');
 for(const topic of ['request','execution','workspace']){
  await page.getByTestId('topic-'+topic).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  const sizes=await page.locator('main pre:visible,main code:visible').evaluateAll(nodes=>nodes.map(n=>parseFloat(getComputedStyle(n).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
 }
 await page.screenshot({path:'docs/screenshots/design-mobile.png',fullPage:true});
});
