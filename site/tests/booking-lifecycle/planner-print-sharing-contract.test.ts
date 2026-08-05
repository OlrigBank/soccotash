import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../../',import.meta.url);
test('print and sharing views preserve credential and itinerary privacy boundaries',async()=>{
  const [migration,access,repository,component,sharePage,bookerPrint,participantPrint,bookerPage,participantPage,api]=await Promise.all([
    readFile(new URL('db/028_planner_share_links.sql',root),'utf8'),readFile(new URL('src/lib/planner/share-access.ts',root),'utf8'),
    readFile(new URL('src/lib/planner/repository.ts',root),'utf8'),readFile(new URL('src/components/PlannerItinerary.astro',root),'utf8'),
    readFile(new URL('src/pages/planner/share/[token].astro',root),'utf8'),readFile(new URL('src/pages/booking/manage/[token]/planner/print/index.astro',root),'utf8'),
    readFile(new URL('src/pages/planner/invite/[token]/print/index.astro',root),'utf8'),readFile(new URL('src/pages/booking/manage/[token]/planner/index.astro',root),'utf8'),
    readFile(new URL('src/pages/planner/invite/[token].astro',root),'utf8'),readFile(new URL('src/pages/api/booking/planner/[token].ts',root),'utf8'),
  ]);
  assert.match(migration,/token_hash TEXT/,'share persistence must contain only a token hash');
  assert.doesNotMatch(migration,/access_token|guest_email|reservation_note/,'share records must exclude booking credentials and private content');
  assert.match(access,/createHash\('sha256'\)/,'share credentials must be hashed for lookup');
  assert.match(access,/bookingAccessState/,'share access must follow booking expiry and revocation policy');
  assert.match(repository,/token_hash=NULL/,'revocation must erase the usable share hash');
  assert.match(repository,/expiresDays<1\|\|input\.expiresDays>30/,'share lifetime must be bounded');
  assert.match(component,/item\.visibility!==\'private\'/,'external views must omit private items');
  assert.match(component,/includeReservationNotes&&item\.reservationNote/,'reservation notes must be opt-in for authenticated print views');
  assert.match(component,/@media print/,'the itinerary needs print-specific presentation');
  assert.match(sharePage,/Read-only shared itinerary/,'shared access must clearly be read-only');
  assert.match(sharePage,/private, no-store/,'shared credentials must never be publicly cached');
  assert.doesNotMatch(sharePage,/reservationNote|participants|bookingId|guest_email/,'the shared route must not render wider private data');
  for(const page of [bookerPrint,participantPrint]){assert.match(page,/includeReservationNotes=\{true\}/,'authenticated print views may include practical reservation notes');assert.match(page,/noindex,nofollow,noarchive/,'print views must not be indexed')}
  assert.match(bookerPage,/Create share link/,'the Booker needs an explicit share creation control');
  assert.doesNotMatch(participantPage,/Create share link/,'invited participants must not manage external sharing');
  assert.match(api,/createShareLink[\s\S]*revokeShareLink/,'share lifecycle must remain behind Booker authorization');
  assert.doesNotMatch(api,/console\.(?:error|warn)\([^\n]*token/,'share credentials must not enter logs');
});
