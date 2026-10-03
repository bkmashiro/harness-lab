import { test, expect } from '@playwright/test';

test('default simulation executes the real harness and exposes its trace', async ({ page }) => {
  const errors:string[]=[];
  page.on('pageerror', error => errors.push(error.message));
  const externalRequests:string[]=[];
  page.on('request', request => {if (!request.url().startsWith('http://127.0.0.1:4173')) externalRequests.push(request.url());});
  await page.goto('/');
  await expect(page.getByTestId('system-diagram')).toBeVisible();
  await expect(page.getByTestId('run-status')).toContainText(/completed|完成/, {timeout:30000});
  expect(await page.getByTestId('timeline-event').count()).toBe(3);
  await page.getByTestId('full-trace-toggle').check();
  expect(await page.getByTestId('timeline-event').count()).toBeGreaterThan(15);
  await page.getByTestId('timeline-event').last().click();
  await page.getByTestId('right-tab-data').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await page.getByTestId('prev-button').click();
  await page.getByTestId('next-button').click();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await page.getByTestId('right-tab-events').click();
  await page.getByTestId('timeline-event').filter({has:page.locator('.kind-chip').filter({hasText:/^write$/})}).click();
  await page.getByTestId('right-tab-fs').click();
  await page.getByTestId('file-diff-button').click();
  await expect(page.locator('.diff-view')).toContainText('return a - b');
  await expect(page.locator('.diff-view')).toContainText('return a + b');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'docs/screenshots/workbench-diff.png',fullPage:true});
});

test('Responses protocol also completes without a key', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-status')).toContainText(/completed|完成/,{timeout:30000});
  await page.getByTestId('settings-button').click();
  await page.getByTestId('protocol-select').selectOption('responses');
  await page.screenshot({path:'docs/screenshots/api-lab.png',fullPage:true});
  await page.getByTestId('settings-button').click();
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('run-status')).toContainText(/completed|完成/,{timeout:30000});
  expect(await page.getByTestId('timeline-event').count()).toBe(3);
  await page.getByTestId('full-trace-toggle').check();
  expect(await page.getByTestId('timeline-event').count()).toBeGreaterThan(15);
  await page.evaluate(()=>window.scrollTo(0,0));
});

test('390px layout remains readable without document overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByTestId('run-status')).toContainText(/completed|完成/,{timeout:30000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true);
  await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:true});
});
