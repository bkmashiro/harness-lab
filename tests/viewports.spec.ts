import {test,expect} from '@playwright/test';
for(const [width,height] of [[1440,900],[1024,768],[390,844],[320,720]]){
 test(`${width}x${height}: chapter controls remain usable without page scrolling`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height});await page.goto('/');await expect(page.getByTestId('run-status')).toContainText('已完成');
  const size=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));expect(size.w).toBeLessThanOrEqual(width+1);expect(size.h).toBeLessThanOrEqual(height+1);
  await expect(page.getByTestId('settings-button')).toBeInViewport();await expect(page.getByTestId('experiment-button')).toBeInViewport();await expect(page.getByTestId('chapter-select')).toBeInViewport();
  await page.getByTestId('experiment-button').click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('chapter-select').selectOption('failures');await page.keyboard.press('ArrowRight');expect(errors).toEqual([]);
  await page.getByTestId('chapter-select').selectOption('overview');
  if(width===320)await page.screenshot({path:'docs/screenshots/mobile-320.png',fullPage:true});
 });
}
