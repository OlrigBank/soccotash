export function initialiseReservationExport(): void {
  const form = document.querySelector<HTMLFormElement>('#reservation-export-form');
  const button = form?.querySelector<HTMLButtonElement>('button');
  const message = document.querySelector<HTMLElement>('#reservation-export-message');
  if (!form || !button || !message) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.className = '';
    message.textContent = 'Preparing all imported reservation files…';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(form.action, { method: 'POST', signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'The reservation export could not be created. Please try again.');
      }
      if (!response.headers.get('content-type')?.startsWith('application/zip')) throw new Error('The reservation export could not be downloaded. Please try again.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.headers.get('content-disposition')?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] ?? 'airbnb-reservation-evidence.zip';
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const count = Number(response.headers.get('x-reservation-count'));
      message.textContent = `Download started${Number.isSafeInteger(count) && count > 0 ? `: ${count} reservation files` : ''}, combined financial data, reservation index and column guide.`;
    } catch (error) {
      message.className = 'history-error';
      message.textContent = error instanceof DOMException && error.name === 'AbortError'
        ? 'The reservation export took too long. Please try again.'
        : error instanceof Error ? error.message : 'The reservation export could not be created. Please try again.';
    } finally {
      window.clearTimeout(timeout);
      button.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  });
}
