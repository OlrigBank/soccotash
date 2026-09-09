type Contact = { channel: string; identifier: string; expires_at?: string };
export function initialiseVerification(root: HTMLElement) {
  const form = root.closest('form')!;
  const email = form.querySelector<HTMLInputElement>('[name=email]')!;
  const mobile = form.querySelector<HTMLInputElement>('[name=telephone]')!;
  const channel = root.querySelector<HTMLSelectElement>('[data-verification-channel]')!;
  const status = root.querySelector<HTMLElement>('[data-verification-status]')!;
  const code = root.querySelector<HTMLInputElement>('[data-verification-code]')!;
  const entry = root.querySelector<HTMLElement>('[data-code-entry]')!;
  const send = root.querySelector<HTMLButtonElement>('[data-send-code]')!;
  const verify = root.querySelector<HTMLButtonElement>('[data-verify-code]')!;
  const purpose = root.dataset.purpose || 'booking';
  let identities: Contact[] = [], grants: Contact[] = [];
  let challengeId = '', challengeKey = '', verifiedKey = '', attemptedKey = '';
  let lastContactKey = '';
  let expires = 0, retryAt = 0, pending = false, revision = 0, chosen = false;
  const telephone = () => {
    let value = mobile.value.trim().replace(/[\s().-]/g, '');
    if (value.startsWith('00')) value = '+' + value.slice(2);
    if (value.startsWith('0')) value = '+44' + value.slice(1);
    return /^\+[1-9]\d{7,14}$/.test(value) ? value : '';
  };
  function contact(): Contact {
    if (!chosen) {
      const emailKey = `email:${email.value.trim().toLowerCase()}`;
      const mobileKey = `sms:${telephone()}`;
      const known = [...identities, ...grants.filter(item => Date.parse(item.expires_at || '') > Date.now())].map(item => `${item.channel}:${item.identifier}`);
      if (expires > Date.now()) known.push(verifiedKey);
      channel.value = known.includes(emailKey) ? 'email' : known.includes(mobileKey) ? 'sms' : email.value.trim() || !mobile.value.trim() ? 'email' : 'sms';
    }
    return { channel: channel.value, identifier: channel.value === 'email' ? email.value.trim().toLowerCase() : telephone() };
  }
  const key = (value: Contact) => `${value.channel}:${value.identifier}`;
  const valid = (value: Contact) => value.channel === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.identifier) : Boolean(value.identifier);
  function setVerified(value: boolean) {
    const changed = root.dataset.verified !== String(value);
    root.dataset.verified = String(value);
    if (changed) root.dispatchEvent(new CustomEvent('booker-verification-change', { bubbles: true }));
  }
  function refresh() {
    const value = contact(), selected = key(value);
    const trusted = purpose === 'booking' && [...identities, ...grants.filter(item => Date.parse(item.expires_at || '') > Date.now())].some(item => key(item) === selected);
    const verified = trusted || (verifiedKey === selected && expires > Date.now());
    setVerified(verified);
    if (verified) {
      const moveFocus = entry.contains(document.activeElement);
      status.textContent = 'Contact verified. You can continue.'; entry.hidden = true;
      if (moveFocus) {
        const next = form.querySelector<HTMLButtonElement>('[data-continue-review]:not(:disabled)');
        if (next) next.focus(); else { status.tabIndex = -1; status.focus(); }
      }
    }
    else if (verifiedKey && expires <= Date.now()) { verifiedKey = ''; status.textContent = 'Verification has expired. Request a new code.'; }
    send.disabled = pending || verified || Date.now() < retryAt || !valid(value);
    send.textContent = Date.now() < retryAt ? `Resend in ${Math.ceil((retryAt - Date.now()) / 1000)} seconds` : challengeId ? 'Resend verification code' : 'Send verification code';
    verify.disabled = pending || !challengeId;
  }
  async function post(action: string, payload: Record<string, unknown>) {
    const response = await fetch(`/api/booker/${action}/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose, ...payload }) });
    const body = await response.json();
    if (body.retryAfter) retryAt = Date.now() + body.retryAfter * 1000;
    if (!response.ok) throw new Error(body.error || 'Verification is temporarily unavailable.');
    return body;
  }
  async function sendCode(automatic = false) {
    refresh();
    const value = contact(), selected = key(value);
    if (pending || send.disabled || (automatic && attemptedKey === selected)) return;
    const currentRevision = revision;
    attemptedKey = selected; pending = true; status.textContent = 'Sending your code…'; refresh();
    try {
      await readiness;
      if (currentRevision !== revision || root.dataset.verified === 'true') return;
      const body = await post('request-code', value);
      if (currentRevision !== revision) return;
      challengeId = body.challengeId; challengeKey = selected; code.value = ''; entry.hidden = false;
      const masked = value.channel === 'email' ? value.identifier.replace(/^(.).*(@.*)$/, '$1•••$2') : `•••${value.identifier.slice(-4)}`;
      status.textContent = `${body.message} ${purpose === 'booking' ? `Check ${masked}. ` : ''}The code expires in 10 minutes.`;
    } catch (error) { if (currentRevision === revision) status.textContent = error instanceof Error ? error.message : 'The code could not be sent. Try again.'; }
    finally { pending = false; refresh(); }
  }
  async function verifyCode() {
    if (pending || !challengeId || key(contact()) !== challengeKey) return;
    if (!/^\d{6}$/.test(code.value)) { status.textContent = 'Enter the six-digit code.'; code.focus(); return; }
    const currentRevision = revision;
    pending = true; refresh();
    try {
      const body = await post('verify-code', { challengeId, code: code.value });
      if (currentRevision !== revision) return;
      verifiedKey = challengeKey; expires = Date.now() + body.expiresIn * 1000;
      if (purpose === 'login') {
        const returnTo = new URL(location.href).searchParams.get('returnTo');
        location.assign(returnTo && /^\/booking\/manage\/[0-9a-f-]{36}\/(?:[a-z/-]*)?$/.test(returnTo) ? returnTo : '/booking/');
      }
    } catch (error) { if (currentRevision === revision) status.textContent = error instanceof Error ? error.message : 'Verification failed. Try again.'; }
    finally { pending = false; refresh(); }
  }
  function edited() {
    const selected = key(contact());
    if (selected === lastContactKey) { refresh(); return; }
    lastContactKey = selected;
    revision++; challengeId = ''; challengeKey = ''; verifiedKey = ''; attemptedKey = ''; entry.hidden = true;
    status.textContent = 'Verify this contact to continue.'; refresh();
  }
  for (const input of [email, mobile]) {
    input.addEventListener('input', edited);
    input.addEventListener('focusout', event => {
      if (event.relatedTarget === email || event.relatedTarget === mobile) return;
      void sendCode(true);
    });
  }
  root.addEventListener('booker-verification-required', () => { identities = []; grants = []; verifiedKey = ''; attemptedKey = ''; expires = 0; status.textContent = 'Verification has expired. Request a new code.'; refresh(); });
  channel.addEventListener('change', () => { chosen = true; edited(); void sendCode(true); });
  send.addEventListener('click', () => void sendCode());
  verify.addEventListener('click', () => void verifyCode());
  code.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void verifyCode(); } });
  if (purpose === 'login') form.addEventListener('submit', event => { event.preventDefault(); void (challengeId ? verifyCode() : sendCode()); });
  const readiness = fetch('/api/booker/session/').then(response => response.json()).then(body => { identities = body.identities || []; grants = body.grants || []; refresh(); }).catch(() => refresh());
  setInterval(refresh, 1000); refresh();
}
