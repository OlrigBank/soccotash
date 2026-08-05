import { defineConfig, devices } from '@playwright/test';

const baseURL=process.env.PLANNER_REGRESSION_BASE_URL||'http://127.0.0.1:8080';
const target=new URL(baseURL);
if(!['127.0.0.1','localhost'].includes(target.hostname))throw new Error(`Planner regression tests may only target local Docker, not ${target.origin}.`);
if(process.env.PLANNER_REGRESSION_ALLOW_MUTATION!=='yes')throw new Error('Set PLANNER_REGRESSION_ALLOW_MUTATION=yes to acknowledge disposable planner mutations.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for planner fixture setup and verification.');

export default defineConfig({
  testDir:'./tests/planner-regression',outputDir:'./test-results/planner-regression',timeout:120_000,
  expect:{timeout:15_000},fullyParallel:false,workers:1,forbidOnly:Boolean(process.env.CI),retries:0,
  reporter:[['list'],['html',{outputFolder:'playwright-report/planner-regression',open:'never'}]],
  use:{baseURL:target.origin,actionTimeout:15_000,navigationTimeout:20_000,locale:'en-GB',timezoneId:'Europe/London',
    trace:{mode:'on',screenshots:true,snapshots:true,sources:true},video:'on',screenshot:'only-on-failure'},
  projects:[{name:'docker-chromium',use:{...devices['Desktop Chrome']}}],
});
