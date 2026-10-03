import {test,expect} from '@playwright/test';
async function ready(page:import('@playwright/test').Page){await page.goto('/');await expect(page.getByTestId('run-status')).toContainText('已完成');}

test('first module introduces objectives and offers six learning units with code explanations',async({page})=>{
 await ready(page);await expect(page.getByTestId('module-title')).toBeVisible();await expect(page.getByText('学习目标',{exact:true})).toBeVisible();
 await expect(page.getByTestId('unit-select').locator('option')).toHaveCount(6);
 await page.getByTestId('unit-select').selectOption('proposal');await expect(page.locator('.learn-panel')).toContainText('arguments');await expect(page.locator('.learn-panel code')).toContainText(['read_file']);
 await page.getByTestId('right-tab-data').click();await page.getByTestId('raw-json-button').click();await expect(page.locator('.json-view')).toContainText('read_file');
 await page.screenshot({path:'docs/screenshots/module-proposal.png',fullPage:true});
 await page.getByTestId('right-tab-events').click();await expect(page.getByTestId('timeline-event')).toHaveCount(1);
 await page.getByTestId('unit-select').selectOption('dispatch');await expect(page.getByTestId('timeline-event').filter({hasText:'tool_execution_start'})).toHaveCount(1);
 await page.screenshot({path:'docs/screenshots/module-dispatch.png',fullPage:true});
});

test('exercise requires a prediction and exposes an actual missing-file tool error',async({page})=>{
 await ready(page);await page.getByTestId('unit-select').selectOption('exercise');await expect(page.getByTestId('exercise-run')).toBeDisabled();
 await page.getByTestId('exercise-path').fill('/src/missing.js');await page.getByTestId('exercise-prediction').selectOption('file-content');await page.getByTestId('exercise-run').click();
 await expect(page.getByTestId('exercise-feedback')).toContainText('查找');await expect(page.getByTestId('unit-complete')).toBeDisabled();
 await page.getByTestId('right-tab-data').click();await page.getByTestId('raw-json-button').click();await expect(page.locator('.json-view')).toContainText('File not found');
 await page.getByTestId('exercise-prediction').selectOption('tool-error');await page.getByTestId('exercise-run').click();await expect(page.getByTestId('module-progress')).toContainText('1 / 6');
 await page.screenshot({path:'docs/screenshots/module-exercise.png',fullPage:true});
});

test('empty path reaches actual Pi schema validation',async({page})=>{
 await ready(page);await page.getByTestId('unit-select').selectOption('exercise');await page.getByTestId('exercise-path').fill('');await page.getByTestId('exercise-prediction').selectOption('validation-error');await expect(page.getByTestId('exercise-run')).toBeEnabled();await page.getByTestId('exercise-run').click();await expect(page.getByTestId('exercise-feedback')).toContainText('schema');await expect(page.getByTestId('module-progress')).toContainText('1 / 6');
 await page.getByTestId('right-tab-data').click();await page.getByTestId('raw-json-button').click();await expect(page.locator('.json-view')).toContainText('isError');
});

test('knowledge check explains wrong answers and completion survives refresh',async({page})=>{
 await ready(page);const {firstModule}=await import('../src/content/first-module');
 for(const id of ['introduction','proposal','dispatch','result']){await page.getByTestId('unit-select').selectOption(id);await page.getByTestId('unit-complete').click();}
 await page.getByTestId('unit-select').selectOption('exercise');await page.getByTestId('exercise-path').fill('/src/missing.js');await page.getByTestId('exercise-prediction').selectOption('tool-error');await page.getByTestId('exercise-run').click();await expect(page.getByTestId('module-progress')).toContainText('5 / 6');
 await page.getByTestId('unit-select').selectOption('assessment');
 for(const q of firstModule.questions){const wrong=q.choices.find(c=>c.id!==q.answer)!;await page.locator(`[data-question="${q.id}"][data-choice="${wrong.id}"]`).click();}
 await page.getByTestId('quiz-submit').click();await expect(page.getByTestId('quiz-feedback')).toBeVisible();await expect(page.getByTestId('unit-complete')).toBeDisabled();
 for(const q of firstModule.questions)await page.locator(`[data-question="${q.id}"][data-choice="${q.answer}"]`).click();
 await page.getByTestId('quiz-submit').click();await expect(page.getByTestId('module-completed')).toBeVisible();
 await page.reload();await expect(page.getByTestId('module-completed')).toBeVisible();await expect(page.getByTestId('module-progress')).toContainText('6');
});
