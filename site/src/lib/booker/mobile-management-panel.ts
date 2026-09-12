export function initialiseMobileManagement(form: HTMLFormElement) {
  const fields = form.querySelector<HTMLFieldSetElement>('[data-change-fields]')!;
  const action = form.elements.namedItem('action') as HTMLInputElement | HTMLSelectElement;
  const number = form.elements.namedItem('mobile') as HTMLInputElement;
  const code = form.elements.namedItem('code') as HTMLInputElement;
  const step = form.querySelector<HTMLElement>('[data-code-step]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const send = form.querySelector<HTMLButtonElement>('[data-send]')!;
  const check = form.querySelector<HTMLButtonElement>('[data-check]')!;
  const restart = form.querySelector<HTMLButtonElement>('[data-restart]')!;
  let operationId = '', challengeId = '', channel = 'email', pending = false, retryAt = 0;
  function refresh() {
    fields.disabled = pending || Boolean(operationId);
    send.disabled = pending || Date.now()<retryAt;
    check.disabled = pending || !challengeId;
    restart.disabled = pending;
    send.textContent = Date.now()<retryAt ? `Resend in ${Math.ceil((retryAt-Date.now())/1000)} seconds` : `${challengeId ? 'Resend' : 'Send'} ${channel==='sms' ? 'SMS' : 'email'} code`;
    form.querySelector<HTMLElement>('[data-number-field]')!.hidden = action.value==='remove';
    form.querySelector<HTMLElement>('[data-number-help]')!.hidden = action.value==='remove';
  }
  async function post(payload: Record<string,unknown>) {
    const response = await fetch('/api/booker/mobile/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationId,...payload})});
    const body = await response.json();
    if (body.retryAfter) retryAt=Date.now()+body.retryAfter*1000;
    if (!response.ok) throw new Error(body.error || 'The change could not be completed. Try again.');
    return body;
  }
  async function run(task:()=>Promise<void>) {
    if (pending) return;
    pending=true;refresh();
    try { await task(); } catch(error) {status.textContent=error instanceof Error ? error.message : 'Try again shortly.';status.focus();}
    finally {pending=false;refresh();}
  }
  async function requestCode(start=false) {
    if (Date.now()<retryAt) return;
    await run(async()=>{
      status.textContent=`Sending your ${channel==='sms' ? 'SMS' : 'email'} code…`;
      const body=await post(start ? {step:'start',action:action.value,identifier:number.value} : {step:'send'});
      operationId=body.operationId;challengeId=body.challengeId;channel=body.channel;
      step.hidden=false;code.value='';form.querySelector<HTMLElement>('[data-code-label]')!.hidden=false;
      status.textContent=channel==='sms' ? 'Your SMS code has been sent. A resent code may be the same and expire sooner.' : 'Your email code has been sent. It expires in ten minutes.';
      code.focus();
    });
  }
  async function verify() {
    if (!challengeId) return;
    if (!/^\d{6}$/.test(code.value)) {status.textContent='Enter the six-digit code.';code.focus();return;}
    await run(async()=>{
      const body=await post({step:'check',challengeId,code:code.value});
      code.value='';
      if(body.nextStep==='complete') {location.assign('/booking/account/?updated=1');return;}
      channel='sms';challengeId='';retryAt=0;
      form.querySelector<HTMLElement>('[data-step-title]')!.textContent='Verify your mobile number';
      form.querySelector<HTMLElement>('[data-step-help]')!.textContent='Select Send SMS code to receive a code on your new mobile number.';
      form.querySelector<HTMLElement>('[data-code-label]')!.hidden=true;
      status.textContent='Email verified. Send an SMS code to continue.';
      send.disabled=false;send.focus();
    });
  }
  code.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void verify();}});
  form.addEventListener('submit',event=>{event.preventDefault();void (operationId ? verify() : requestCode(true));});
  send.addEventListener('click',()=>void requestCode());check.addEventListener('click',()=>void verify());
  restart.addEventListener('click',()=>location.assign('/booking/account/'));
  action.addEventListener('change',refresh);
  setInterval(refresh,1000);refresh();
}
