import {test,expect} from '@playwright/test';

test('wide preview uses landscape space and renders Latin/CJK code with the bundled font',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await page.goto('/design/learning-layouts.html');await page.getByTestId('field-name').click();
 const main=await page.locator('main').boundingBox();expect(main!.width).toBeGreaterThan(1700);
 expect(await page.locator('.topic-head p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(18);
 await page.evaluate(async()=>{
  await document.fonts.load('16px "Harness Code Mono"');
  const probe=document.createElement('pre');probe.id='font-probe';probe.textContent='const 请求 = "读取"; // 中文注释';document.querySelector('main')!.append(probe);await document.fonts.ready;
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const doc=await cdp.send('DOM.getDocument');const node=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#font-probe'});
 const rendered=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});
 expect(rendered.fonts.length).toBeGreaterThan(0);expect(rendered.fonts.every((f:any)=>f.isCustomFont&&f.familyName.includes('Harness'))).toBe(true);
 expect(rendered.fonts.some((f:any)=>/SimSun|Songti|宋/i.test(f.familyName))).toBe(false);
 await page.evaluate(()=>document.getElementById('font-probe')!.remove());
 await page.screenshot({path:'docs/screenshots/design-wide.png',fullPage:true});
});

test('current course also uses the bundled code font',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('run-status')).toContainText('已完成');await page.getByTestId('unit-select').selectOption('proposal');
 await page.evaluate(()=>document.fonts.load('16px "Harness Code Mono"'));
 const family=await page.locator('.learn-panel pre').first().evaluate(e=>getComputedStyle(e).fontFamily);expect(family).toContain('Harness Code Mono');
});
