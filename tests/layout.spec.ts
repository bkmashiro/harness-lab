import {test,expect} from '@playwright/test';

test('desktop chapter stays inside the viewport and does not expose a full trace by default',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto('/');await expect(page.getByTestId('run-status')).toContainText('已完成',{timeout:30000});
 expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(801);
 await expect(page.locator('.sidebar')).toHaveCount(0);
 expect(await page.locator('.lesson-copy p').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(160);
 await expect(page.getByTestId('system-diagram')).toBeInViewport();
 await expect(page.getByTestId('chapter-select')).toBeVisible();
 await page.getByTestId('right-tab-events').click();
 expect(await page.getByTestId('timeline-event').count()).toBeLessThanOrEqual(6);
 await expect(page.getByTestId('next-button')).toBeInViewport();
 await expect(page.getByTestId('experiment-button')).toBeInViewport();
 const lesson=await page.locator('.learn-panel').boundingBox(), footer=await page.locator('.workbench-footer').boundingBox();expect(lesson!.y+lesson!.height).toBeLessThanOrEqual(footer!.y);
 await page.screenshot({path:'docs/screenshots/workbench.png',fullPage:true});
});

test('context and workspace chapters show different focused data in the same right pane',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto('/');await expect(page.getByTestId('run-status')).toContainText('已完成',{timeout:30000});
 await page.getByTestId('chapter-select').selectOption('context');await page.getByTestId('right-tab-events').click();
 await expect(page.getByTestId('timeline-event').filter({hasText:'serialized'})).toHaveCount(1);
 await expect(page.getByTestId('timeline-event').filter({hasText:'tool_execution_end'})).toHaveCount(0);
 await page.getByTestId('explanation-step').nth(2).click();await expect(page.locator('.lesson-copy p')).toContainText('transformContext');
 await page.getByTestId('right-tab-data').click();await page.getByTestId('raw-json-button').click();await expect(page.locator('.json-view')).toContainText('serialized');
 await page.getByTestId('chapter-select').selectOption('workspace-session');await page.getByTestId('right-tab-fs').click();await expect(page.getByTestId('inspector')).toContainText('/src/sum.js');
 expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(801);
});
