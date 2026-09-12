import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import pg from 'pg';
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (error) {
  if (!specifier.startsWith('.') || /\.[a-z0-9]+$/i.test(specifier)) throw error;
  return next(`${specifier}.ts`, context);
} } });

test('E11-F03 verification, accounts and private ownership', async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'A local test database is required.');
  const schema = `booker_accounts_${crypto.randomBytes(8).toString('hex')}`;
  const control = new pg.Pool({ connectionString: databaseUrl });
  let application: pg.Pool | undefined;
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl); url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString(); process.env.DATABASE_SSL = 'false';
    process.env.BOOKER_VERIFICATION_SECRET = crypto.randomBytes(32).toString('hex');
    const migration = new pg.Pool({ connectionString: url.toString() });
    let migratedReference = '';
    try {
      const directory = new URL('../../db/', import.meta.url);
      for (const filename of (await readdir(directory)).filter(file=>file.endsWith('.sql')).sort()) {
        if (filename.startsWith('059')) {
          const inserted = await migration.query(`INSERT INTO provisional_bookings(property_id,arrival,departure,guests,guest_name,guest_email,guest_telephone_e164)
            VALUES('bespoke-arrangement','2099-10-19','2099-10-23',2,'Migration fixture',' Claim@Example.test ','+447700900123') RETURNING public_id::text`);
          migratedReference = inserted.rows[0].public_id;
        }
        await migration.query(await readFile(new URL(filename,directory),'utf8'));
      }
    } finally { await migration.end(); }
    const accounts = await import('../../src/lib/booker/accounts.ts');
    const { requestCode, checkCode } = await import('../../src/lib/booker/verification.ts');
    const { bookerContext } = await import('../../src/lib/booker/context.ts');
    const { getPool } = await import('../../src/lib/booking/db.ts');
    const { resolveBookingAccessCredential, revokeBookingAccessCredential } = await import('../../src/lib/booking/booking-access.ts');
    const { createProvisionalBooking, getCustomerBookingPage } = await import('../../src/lib/booking/repository.ts');
    const { getBookingMessagesByToken } = await import('../../src/lib/booking/messaging.ts');
    application = getPool(); const db = application;
    const sent = new Map<string,string>();
    const provider = { async send(identity: {identifier:string}, code:string) { sent.set(identity.identifier,code); return identity.identifier; }, async check(id:string, code:string) { return sent.get(id) === code; } };
    const browserHash = accounts.hashToken(accounts.randomToken());
    const identity = accounts.normaliseIdentity('email','New@Example.test');
    const request = (contact = identity, browser = browserHash, purpose: 'booking'|'login' = 'booking') => requestCode({identity:contact,browserHash:browser,purpose,ip:crypto.randomUUID()},provider);
    await t.test('normalises contacts and rejects invalid input without truncation', () => {
      assert.equal(identity.identifier,'new@example.test');
      assert.equal(accounts.normaliseIdentity('sms','07700 900123').identifier,'+447700900123');
      assert.throws(()=>accounts.normaliseIdentity('email','a'.repeat(255)+'@example.test'));
    });
    await t.test('migration chooses email without pre-verifying or creating accounts', async () => {
      const row=(await db.query('SELECT booker_claim_channel,booker_claim_identifier,booker_account_id FROM provisional_bookings WHERE public_id=$1',[migratedReference])).rows[0];
      assert.deepEqual(row,{booker_claim_channel:'email',booker_claim_identifier:'claim@example.test',booker_account_id:null});
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_accounts')).rows[0].n,0);
    });
    let challenge: Awaited<ReturnType<typeof request>>;
    await t.test('wrong browser/purpose fail; failed guesses persist; a code is single-use', async () => {
      challenge=await request(); const code=sent.get(identity.identifier)!;
      await assert.rejects(()=>checkCode({id:challenge.challengeId,code,browserHash:'other',purpose:'booking'},provider));
      await assert.rejects(()=>checkCode({id:challenge.challengeId,code,browserHash,purpose:'login'},provider));
      await assert.rejects(()=>checkCode({id:challenge.challengeId,code:'wrong',browserHash,purpose:'booking'},provider));
      assert.equal((await db.query('SELECT attempts FROM booker_challenges WHERE id=$1',[challenge.challengeId])).rows[0].attempts,1);
      const results=await Promise.allSettled([1,2].map(()=>checkCode({id:challenge.challengeId,code,browserHash,purpose:'booking'},provider)));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_accounts')).rows[0].n,0);
    });
    const submissionId=crypto.randomUUID();
    const input={propertyId:'bespoke-arrangement',arrival:'2099-10-19',departure:'2099-10-23',guests:2,pets:0,name:'Disposable account fixture',email:identity.identifier,telephone:'+447700900999',telephoneE164:'+447700900999',authorisation:{browserHash,accountId:null,email:identity.identifier,mobile:'+447700900999',submissionId}};
    let reference='',accountId='',sessionToken='';
    await t.test('concurrent submission creates one account and booking with hashed sessions',async()=>{
      const saved=await Promise.all([createProvisionalBooking(input),createProvisionalBooking(input)]);
      assert.equal((await accounts.resumeSubmission(submissionId,browserHash))?.reference,saved[0].reference);
      await assert.rejects(()=>accounts.resumeSubmission(submissionId,'another browser'));
      assert.equal(saved[0].reference,saved[1].reference); reference=saved[0].reference;sessionToken=saved[0].sessionToken!;
      assert.ok(sessionToken.length>=43);
      accountId=(await db.query('SELECT booker_account_id FROM provisional_bookings WHERE public_id=$1',[reference])).rows[0].booker_account_id;
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_identities WHERE account_id=$1',[accountId])).rows[0].n,1);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_sessions WHERE token_hash=$1',[sessionToken])).rows[0].n,0);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_sessions WHERE token_hash=$1',[accounts.hashToken(sessionToken)])).rows[0].n,1);
      await assert.rejects(()=>createProvisionalBooking({...input,authorisation:{...input.authorisation,browserHash:'wrong'}}));
      await assert.rejects(()=>createProvisionalBooking({...input,authorisation:{...input.authorisation,submissionId:crypto.randomUUID()}}));
    });
    await t.test('session identity permits repeat booking; unverified secondary contact does not',async()=>{
      await createProvisionalBooking({...input,authorisation:{...input.authorisation,accountId,submissionId:crypto.randomUUID()}});
      await assert.rejects(()=>createProvisionalBooking({...input,email:'',authorisation:{...input.authorisation,email:'',accountId,submissionId:crypto.randomUUID()}}));
    });
    await t.test('private pages and messages require matching account and honour revocation',async()=>{
      assert.equal((await resolveBookingAccessCredential(reference)).allowed,false);
      await bookerContext.run({accountId:crypto.randomUUID()},async()=>assert.equal(await getCustomerBookingPage(reference),null));
      await bookerContext.run({accountId},async()=>{
        assert.equal((await resolveBookingAccessCredential(reference)).allowed,true);
        assert.ok(await getCustomerBookingPage(reference));
        assert.ok((await getBookingMessagesByToken(reference,'booker')).length);
        const legacy=(await db.query('SELECT customer_access_token FROM provisional_bookings WHERE public_id=$1',[reference])).rows[0].customer_access_token;
        assert.equal((await resolveBookingAccessCredential(legacy)).allowed,false);
        await revokeBookingAccessCredential({reference,adminUserId:crypto.randomUUID(),reason:'Test revocation'});
        assert.equal((await resolveBookingAccessCredential(reference)).allowed,false);
        assert.deepEqual(await getBookingMessagesByToken(reference,'booker'),[]);
      });
    });
    await t.test('login claims migrated bookings and unknown contacts cannot sign in',async()=>{
      const contact=accounts.normaliseIdentity('email','claim@example.test');
      const code=await request(contact,browserHash,'login');
      const result=await checkCode({id:code.challengeId,code:sent.get(contact.identifier)!,browserHash,purpose:'login'},provider);
      assert.ok(result.sessionToken);
      assert.ok((await db.query('SELECT booker_account_id FROM provisional_bookings WHERE public_id=$1',[migratedReference])).rows[0].booker_account_id);
      const unknown=accounts.normaliseIdentity('email','unknown@example.test');
      const unknownRequest=await request(unknown,browserHash,'login');
      assert.equal(unknownRequest.message,code.message);assert.equal(sent.has(unknown.identifier),false);
      await assert.rejects(()=>checkCode({id:unknownRequest.challengeId,code:'123456',browserHash,purpose:'login'},provider));
    });
    await t.test('hourly destination and IP limits cannot be bypassed with a new browser',async()=>{
      const contact=accounts.normaliseIdentity('email','limited@example.test');
      const destination=accounts.hashToken(`email:${contact.identifier}`);
      await db.query("INSERT INTO booker_verification_requests(destination_hash,ip_hash,created_at) SELECT $1,'limit-fixture',NOW()-INTERVAL '2 minutes' FROM generate_series(1,5)",[destination]);
      await assert.rejects(()=>request(contact,accounts.hashToken(accounts.randomToken())),error=>error instanceof accounts.BookerError&&error.status===429);
      await db.query("INSERT INTO booker_verification_requests(destination_hash,ip_hash,created_at) SELECT 'ip-fixture',$1,NOW()-INTERVAL '2 minutes' FROM generate_series(1,20)",[accounts.hashToken('limited-ip')]);
      await assert.rejects(()=>requestCode({identity:accounts.normaliseIdentity('email','another@example.test'),purpose:'booking',browserHash,ip:'limited-ip'},provider),error=>error instanceof accounts.BookerError&&error.status===429);
    });
    await t.test('expiry, attempt cap, resend throttle and delivery failure fail closed',async()=>{
      const contact=accounts.normaliseIdentity('sms','+447400123555');
      const issued=await request(contact);
      await assert.rejects(()=>request(contact),error=>error instanceof accounts.BookerError&&error.status===429);
      for(let i=0;i<5;i++) await assert.rejects(()=>checkCode({id:issued.challengeId,code:'wrong',browserHash,purpose:'booking'},provider));
      await assert.rejects(()=>checkCode({id:issued.challengeId,code:sent.get(contact.identifier)!,browserHash,purpose:'booking'},provider));
      const expiry=await request(accounts.normaliseIdentity('email','expired@example.test'));
      await db.query("UPDATE booker_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[expiry.challengeId]);
      await assert.rejects(()=>checkCode({id:expiry.challengeId,code:sent.get('expired@example.test')!,browserHash,purpose:'booking'},provider));
      await assert.rejects(()=>requestCode({identity:accounts.normaliseIdentity('email','failure@example.test'),purpose:'booking',browserHash,ip:'failure'}, {...provider,send:async()=>{throw new Error('delivery failure');}}));
      const sms=accounts.normaliseIdentity('sms','+447400123556');const success=await request(sms);
      assert.equal((await checkCode({id:success.challengeId,code:sent.get(sms.identifier)!,browserHash,purpose:'booking'},provider)).verified,true);
    });
    await t.test('expired sessions are rejected and grants roll back with failed creation',async()=>{
      const cookies={get:()=>({value:sessionToken})} as any;
      assert.equal(await accounts.sessionAccount(cookies),accountId);
      await db.query("UPDATE booker_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1",[accounts.hashToken(sessionToken)]);
      assert.equal(await accounts.sessionAccount(cookies),null);
      const count=(await db.query('SELECT COUNT(*)::int AS n FROM booker_accounts')).rows[0].n;
      await assert.rejects(()=>createProvisionalBooking({...input,name:null as unknown as string,email:'',telephoneE164:'+447400123556',authorisation:{...input.authorisation,email:'',mobile:'+447400123556',submissionId:crypto.randomUUID()}}));
      assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM booker_verification_grants WHERE identifier='+447400123556' AND consumed_at IS NULL")).rows[0].n,1);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_accounts')).rows[0].n,count);
    });
    await t.test('E14 mobile management binds email and SMS proofs, preserves ownership and revokes replaced access',async()=>{
      const {beginMobileChange} = await import('../../src/lib/booker/mobile-management.ts');
      const owner=(await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const ownerEmail='mobile-owner@example.test';
      await db.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('email',$1,$2)",[ownerEmail,owner]);
      const token=accounts.randomToken();
      await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[accounts.hashToken(token),owner]);
      let context={accountId:owner,sessionHash:accounts.hashToken(token),browserHash:accounts.hashToken('management-browser')};
      const mobile='+447400123457',replacement='+447400123458';
      const sendStep=async(operationId:string,purpose:'account-email'|'account-sms',identifier:string)=>{
        await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[accounts.hashToken(`${purpose==='account-email'?'email':'sms'}:${identifier}`)]);
        return requestCode({identity:{channel:purpose==='account-email'?'email':'sms',identifier},purpose,browserHash:context.browserHash,ip:crypto.randomUUID(),operationId,management:context},provider);
      };
      const verifyStep=(operationId:string,purpose:'account-email'|'account-sms',id:string,identifier:string)=>checkCode({id,code:sent.get(identifier)!,browserHash:context.browserHash,purpose,operationId,management:context},provider);
      const {operationId}=await beginMobileChange(context,'add',mobile);
      await assert.rejects(()=>sendStep(operationId,'account-sms',mobile));
      const emailChallenge=await sendStep(operationId,'account-email',ownerEmail);
      await assert.rejects(()=>checkCode({id:emailChallenge.challengeId,code:sent.get(ownerEmail)!,browserHash:context.browserHash,purpose:'account-email',operationId,management:{...context,sessionHash:'wrong'}},provider));
      assert.equal((await verifyStep(operationId,'account-email',emailChallenge.challengeId,ownerEmail)).nextStep,'sms');
      const smsChallenge=await sendStep(operationId,'account-sms',mobile);
      const results=await Promise.allSettled([1,2].map(()=>verifyStep(operationId,'account-sms',smsChallenge.challengeId,mobile)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await db.query("SELECT account_id FROM booker_identities WHERE channel='sms' AND identifier=$1",[mobile])).rows[0].account_id,owner);
      assert.equal((await db.query('SELECT booker_account_id FROM provisional_bookings WHERE public_id=$1',[reference])).rows[0].booker_account_id,accountId);
      const expiredOperation=(await beginMobileChange(context,'replace',replacement)).operationId;
      const pending=await sendStep(expiredOperation,'account-email',ownerEmail);
      await db.query("UPDATE booker_mobile_operations SET expires_at=NOW()-INTERVAL '1 second' WHERE account_id=$1",[owner]);
      await assert.rejects(()=>verifyStep(expiredOperation,'account-email',pending.challengeId,ownerEmail));
      const replacementOperation=(await beginMobileChange(context,'replace',replacement)).operationId;
      const email2=await sendStep(replacementOperation,'account-email',ownerEmail);await verifyStep(replacementOperation,'account-email',email2.challengeId,ownerEmail);
      const sms2=await sendStep(replacementOperation,'account-sms',replacement);
      // A login issued to the previous number must no longer work after replacement.
      await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[accounts.hashToken(`sms:${mobile}`)]);
      const oldLogin=await request(accounts.normaliseIdentity('sms',mobile),'old-login-browser','login');
      const replaced=await verifyStep(replacementOperation,'account-sms',sms2.challengeId,replacement);
      assert.ok(replaced.sessionToken);assert.equal((await db.query('SELECT 1 FROM booker_sessions WHERE token_hash=$1',[context.sessionHash])).rowCount,0);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM booker_sessions WHERE account_id=$1',[owner])).rows[0].n,1);
      await assert.rejects(()=>checkCode({id:oldLogin.challengeId,code:sent.get(mobile)!,browserHash:'old-login-browser',purpose:'login'},provider));
      context={...context,sessionHash:accounts.hashToken(replaced.sessionToken!)};
      const remove=(await beginMobileChange(context,'remove',null)).operationId;
      const email3=await sendStep(remove,'account-email',ownerEmail);const removed=await verifyStep(remove,'account-email',email3.challengeId,ownerEmail);
      assert.ok(removed.sessionToken);assert.equal((await db.query("SELECT 1 FROM booker_identities WHERE account_id=$1 AND channel='sms'",[owner])).rowCount,0);
      assert.equal((await db.query("SELECT 1 FROM booker_identities WHERE account_id=$1 AND channel='email'",[owner])).rowCount,1);
    });
    await t.test('E14 SMS booking verification creates ownership and supports subsequent SMS sign-in',async()=>{
      const mobile='+447400123463',smsBrowser='sms-booking-browser';
      const contact=accounts.normaliseIdentity('sms',mobile);
      const issued=await request(contact,smsBrowser);
      await checkCode({id:issued.challengeId,code:sent.get(mobile)!,browserHash:smsBrowser,purpose:'booking'},provider);
      const saved=await createProvisionalBooking({...input,email:'',telephone:mobile,telephoneE164:mobile,authorisation:{...input.authorisation,browserHash:smsBrowser,email:'',mobile,submissionId:crypto.randomUUID()}});
      assert.ok(saved.sessionToken);
      const owner=(await db.query('SELECT booker_account_id FROM provisional_bookings WHERE public_id=$1',[saved.reference])).rows[0].booker_account_id;
      assert.equal((await db.query("SELECT account_id FROM booker_identities WHERE channel='sms' AND identifier=$1",[mobile])).rows[0].account_id,owner);
      await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[accounts.hashToken(`sms:${mobile}`)]);
      const login=await request(contact,'sms-return-browser','login');
      const signedIn=await checkCode({id:login.challengeId,code:sent.get(mobile)!,browserHash:'sms-return-browser',purpose:'login'},provider);
      assert.equal((await db.query('SELECT account_id FROM booker_sessions WHERE token_hash=$1',[accounts.hashToken(signedIn.sessionToken!)])).rows[0].account_id,owner);
    });
    await t.test('E14 concurrent sends and provider expiry remain bounded',async()=>{
      const identity={channel:'sms' as const,identifier:'+447400123461'};
      const results=await Promise.allSettled([1,2].map(index=>requestCode({identity,purpose:'booking',browserHash:`parallel-${index}`,ip:`parallel-${index}`},provider)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const expiresAt=Date.now()+120000;
      const issued=await requestCode({identity:{channel:'sms',identifier:'+447400123462'},purpose:'booking',browserHash:'provider-expiry',ip:'provider-expiry'},{...provider,send:async()=>({id:'provider-fixture',expiresAt})});
      assert.ok(issued.expiresIn<=120);
      assert.equal(new Date((await db.query('SELECT expires_at FROM booker_challenges WHERE id=$1',[issued.challengeId])).rows[0].expires_at).getTime(),expiresAt);
      await assert.rejects(()=>requestCode({identity:{channel:'sms',identifier:'+33123456789'},purpose:'booking',browserHash:'foreign',ip:'foreign'},provider));
    });
    await t.test('E14 conflicting mobile identities and SMS-only changes fail without losing identities',async()=>{
      const {beginMobileChange}=await import('../../src/lib/booker/mobile-management.ts');
      const owner=(await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const other=(await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      await db.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('email','conflict@example.test',$1),('sms','+447400123459',$2)",[owner,other]);
      const token=accounts.randomToken();await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[accounts.hashToken(token),owner]);
      const smsOnlyToken=accounts.randomToken();
      await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[accounts.hashToken(smsOnlyToken),other]);
      await assert.rejects(()=>beginMobileChange({accountId:other,sessionHash:accounts.hashToken(smsOnlyToken),browserHash:'sms-only'},'remove',null));
      const context={accountId:owner,sessionHash:accounts.hashToken(token),browserHash:'conflict'};
      const {operationId}=await beginMobileChange(context,'add','+447400123459');
      const email=await requestCode({identity:{channel:'email',identifier:'conflict@example.test'},purpose:'account-email',browserHash:context.browserHash,ip:'conflict-email',operationId,management:context},provider);
      await checkCode({id:email.challengeId,code:sent.get('conflict@example.test')!,purpose:'account-email',browserHash:context.browserHash,operationId,management:context},provider);
      const sms=await requestCode({identity:{channel:'sms',identifier:'+447400123459'},purpose:'account-sms',browserHash:context.browserHash,ip:'conflict-sms',operationId,management:context},provider);
      await assert.rejects(()=>checkCode({id:sms.challengeId,code:sent.get('+447400123459')!,purpose:'account-sms',browserHash:context.browserHash,operationId,management:context},provider),error=>error instanceof accounts.BookerError&&error.status===409);
      assert.equal((await db.query("SELECT account_id FROM booker_identities WHERE identifier='+447400123459'")).rows[0].account_id,other);
      assert.equal((await db.query('SELECT 1 FROM booker_sessions WHERE token_hash=$1',[context.sessionHash])).rowCount,1);
    });
  } finally { if(application)await application.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end(); }
});
