import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bookerPageUrl=new URL('../../src/pages/booking/manage/[token]/planner/index.astro',import.meta.url);
const participantPageUrl=new URL('../../src/pages/planner/invite/[token].astro',import.meta.url);
const bookerApiUrl=new URL('../../src/pages/api/booking/planner/[token].ts',import.meta.url);
const participantApiUrl=new URL('../../src/pages/api/planner/participant/[token].ts',import.meta.url);

test('Bookers and editors receive local one-time QR capability controls',async()=>{
  const [bookerPage,participantPage,bookerApi,participantApi]=await Promise.all([bookerPageUrl,participantPageUrl,bookerApiUrl,participantApiUrl].map(url=>readFile(url,'utf8')));
  for(const page of [bookerPage,participantPage]){
    assert.match(page,/Create AI collaboration link/);
    assert.match(page,/data-download-ai-qr/);
    assert.match(page,/Copy AI link/);
    assert.match(page,/It will not be shown again/);
    assert.match(page,/data-revoke-ai-capability/);
  }
  assert.match(bookerPage,/planner-collaboration/,'Booker AI controls must remain grouped in the focused collaboration section');
  assert.match(participantPage,/canEdit&&<section[^>]+ai-sharing-heading/);
  for(const api of [bookerApi,participantApi]){
    assert.match(api,/QRCode\.toDataURL/);
    assert.match(api,/createPlanAiCapability/);
    assert.match(api,/revokePlanAiCapability/);
    assert.match(api,/new URL\(`\/planner\/ai\/\$\{created\.token\}\//);
  }
});

test('QR capability URLs are not sent to an external generator',async()=>{
  const sources=await Promise.all([bookerApiUrl,participantApiUrl].map(url=>readFile(url,'utf8')));
  for(const source of sources){
    assert.doesNotMatch(source,/fetch\([^)]*(?:qr|google|chart)/i);
    assert.match(source,/errorCorrectionLevel:'M'/);
  }
});
