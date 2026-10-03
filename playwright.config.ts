import { defineConfig } from '@playwright/test';
import {env} from 'node:process';
const port=Number(env.HARNESS_TEST_PORT??4173);
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./tests',use:{baseURL,headless:true},webServer:{command:`npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,url:baseURL,reuseExistingServer:false},timeout:45000});
