import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(!specifier.startsWith('.')||/\.[a-z0-9]+$/i.test(specifier))throw error;return next(`${specifier}.ts`,context);}}});
const {normaliseSmsNumber,smsAvailable,sendSms,checkSms,SmsProviderError} = await import('../../src/lib/booker/sms.ts');
test('UK and Dutch SMS eligibility excludes landlines, other countries and Crown Dependencies',()=>{
  assert.equal(normaliseSmsNumber('07400 123456'),'+447400123456');
  assert.equal(normaliseSmsNumber('0044 7400 123456'),'+447400123456');
  assert.equal(normaliseSmsNumber('+31 6 12345678'),'+31612345678');
  assert.equal(normaliseSmsNumber('0031 6 12345678'),'+31612345678');
  for(const value of ['0612345678','+31201234567','+33612345678','+33123456789','020 7946 0000','+447700900123','+447911123456','garbage']) assert.throws(()=>normaliseSmsNumber(value));
});
test('Twilio provider handles configuration, original expiry, leading zero and safe errors',async()=>{
  const oldFetch=globalThis.fetch;const old={...process.env};let calls=0;
  try {
    process.env.BOOKER_SMS_ENABLED='false';assert.equal(smsAvailable(),false);
    globalThis.fetch=async()=>{calls++;return Response.json({});};
    await assert.rejects(()=>sendSms('+447400123456'));assert.equal(calls,0);
    Object.assign(process.env,{BOOKER_SMS_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture-only',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)});
    const created=Date.now()-240000;
    globalThis.fetch=async(_url,options)=>{
      assert.equal(new URLSearchParams(options?.body as URLSearchParams).get('Channel'),'sms');
      return Response.json({sid:'VE'+'c'.repeat(32),date_created:new Date(created).toISOString(),status:'pending'});
    };
    assert.equal((await sendSms('+447400123456')).expiresAt,created+600000);
    globalThis.fetch=async(_url,options)=>{assert.equal(new URLSearchParams(options?.body as URLSearchParams).get('Code'),'012345');return Response.json({status:'approved'});};
    assert.equal(await checkSms('VE'+'c'.repeat(32),'012345'),true);
    globalThis.fetch=async()=>Response.json({secret:'never surface'},{status:404});assert.equal(await checkSms('fixture','123456'),false);
    for(const [status,category] of [[429,'limited'],[401,'configuration'],[500,'unavailable']] as const){
      globalThis.fetch=async()=>Response.json({secret:'never surface'},{status});
      await assert.rejects(()=>checkSms('fixture','123456'),error=>error instanceof SmsProviderError&&error.category===category&&!error.message.includes('never surface'));
    }
    globalThis.fetch=async()=>{throw new Error('network credentials must not surface');};
    await assert.rejects(()=>sendSms('+447400123456'),error=>error instanceof SmsProviderError&&error.category==='unavailable');
  }finally{globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});
