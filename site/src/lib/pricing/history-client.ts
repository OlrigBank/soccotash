import type { HistoryException, HistoryReport, HistoryStatistics } from './history';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
const table = (name: string, headings: string[], rows: string) => `<div class="admin-table-wrap history-table" role="region" aria-label="${escape(name)}" tabindex="0"><table><caption>${escape(name)}</caption><thead><tr>${headings.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
const statCells = (s: HistoryStatistics) => `<td>${s.reservations}</td><td>${s.nights}<small>${s.estimatedPercent.toFixed(0)}% estimated allocation</small></td><td>${escape(s.years.join(', ') || '—')}</td><td>${money(s.medianPence)}</td><td>${money(s.lowerPence)} – ${money(s.upperPence)}</td><td>${money(s.revenuePerNightPence)}</td>`;

export function historyReportHtml(report: HistoryReport, listing: string): string {
  const rows = report.rows.map(r => `<tr><th scope="row">${escape(r.period)}<small>${escape(r.target.start)} – ${escape(r.target.end)}</small></th><td>${escape(r.dayType)}</td>${statCells(r.statistics)}<td><strong>${money(r.suggestedPence)}</strong><small>Baseline ${money(r.baselinePence)}</small></td><td><span class="history-evidence${r.evidence === 'Supported historical baseline' ? '' : ' is-limited'}">${escape(r.evidence)}</span>${r.referencePence !== null ? `<small>${escape(r.referenceLabel)}: ${money(r.referencePence)}</small>` : ''}</td></tr>`).join('');
  const profile = report.profile.map(p => `<tr><th scope="row">${escape(p.propertyId)}</th><td>${p.year}</td><td>${p.reservations}</td><td>${p.nights}</td><td>${escape(Object.entries(p.currencies).map(([k, n]) => `${k}: ${n}`).join(', '))}</td><td>${escape(Object.entries(p.statuses).map(([k, n]) => `${k}: ${n}`).join(', '))}</td><td>${p.missingFinancials}</td><td>${p.discrepancies}</td><td>${p.datedNightlyLines}</td></tr>`).join('');
  const headings = ['Bookings', 'Nights', 'Years', 'Median', '25th–75th percentile', 'Revenue / night'];
  return `<section class="admin-panel"><div class="history-actions"><h2>${escape(listing)} · ${report.input.targetYear}</h2><a class="admin-button admin-button--secondary admin-button-link" id="history-download" download="historical-pricing-${escape(report.input.propertyId)}-${report.input.targetYear}.csv">Download CSV</a></div>
    <p>History: ${escape(report.input.startDate)} to ${escape(report.input.endDate)} (inclusive). Owner uplift: ${report.input.upliftPercent}%. Calculated ${escape(report.calculatedAt)} · Method ${escape(report.methodVersion)}.</p>
    <div class="history-summary"><p><strong>${report.includedReservations}</strong>Eligible reservations</p><p><strong>${report.consideredReservations - report.includedReservations}</strong>Excluded reservations</p><p><strong>${report.rows.filter(r => r.suggestedPence !== null).length}</strong>Supported or fallback rate rows</p></div>
    ${report.includedReservations === 0 ? '<p>No eligible historical reservations were found for this listing and range. Review the source profile and exclusions below.</p>' : ''}
    <p>Friday/Saturday weekends. Monthly fallback rows repeat pooled monthly counts and rates; they do not demonstrate a weekend premium. Exception rows take precedence over their monthly dates.</p>
    ${table('Historical rate table', ['Period', 'Day type', ...headings, 'Suggested nightly rate', 'Evidence / fallback'], rows)}</section>
    <section class="admin-panel"><h2>Yearly comparison</h2><p>Includes exception nights. Accommodation revenue excludes all fees and taxes.</p>${report.yearly.length ? table('Yearly accommodation evidence', ['Year', ...headings, 'Accommodation revenue'], report.yearly.map(y => `<tr><th scope="row">${y.year}</th>${statCells(y.statistics)}<td>${money(y.statistics.accommodationRevenuePence)}</td></tr>`).join('')) : '<p>No eligible yearly evidence.</p>'}</section>
    <section class="admin-panel"><h2>Exclusions and fees</h2>${Object.keys(report.exclusions).length ? `<ul>${Object.entries(report.exclusions).map(([reason, n]) => `<li>${escape(reason)}: ${n}</li>`).join('')}</ul>` : '<p>No selected-listing reservations were excluded.</p>'}
    <p>Fee figures describe whole reservations overlapping the selected range, from one financial perspective per reservation. Host service fees normally appear as negative deductions; guest-paid fees depend on the source panel.</p>
    ${report.fees.length ? table('Separately identifiable fees', ['Fee type', 'Reservations', 'Total', 'Median per reservation'], report.fees.map(f => `<tr><th scope="row">${escape(f.type.replaceAll('_', ' '))}</th><td>${f.reservations}</td><td>${money(f.totalPence)}</td><td>${money(f.medianPence)}</td></tr>`).join('')) : '<p>No separately identifiable fees in the eligible records.</p>'}</section>
    <section class="admin-panel"><h2>Source coverage and quality</h2><p>Whole stays grouped by arrival year, across all imported listings in this range. Dated line counts can include both financial perspectives. Missing records in the archive are not measured.</p>
    <p>Included evidence captured: ${escape(report.sourceCapturedFrom ?? '—')} to ${escape(report.sourceCapturedTo ?? '—')}. Recorded confirmation is not proof of a completed stay.</p>
    ${report.profile.length ? table('Reservation source profile', ['Listing', 'Arrival year', 'Bookings', 'Stay nights', 'Currencies', 'Statuses', 'Missing financials', 'Recorded discrepancies', 'Dated nightly lines'], profile) : '<p>No imported reservations overlap this historical range.</p>'}</section>`;
}

export function initialiseHistoryPage(): void {
  const form = document.querySelector<HTMLFormElement>('#history-form');
  const results = document.querySelector<HTMLElement>('#history-results');
  const message = document.querySelector<HTMLElement>('#history-message');
  const exceptions = document.querySelector<HTMLElement>('#history-exceptions');
  const add = document.querySelector<HTMLButtonElement>('#history-add-exception');
  if (!form || !results || !message || !exceptions || !add) return;
  let downloadUrl: string | null = null;
  let requestNumber = 0;
  let exceptionNumber = 0;
  let periodNumber = 0;
  const removeDownload = () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrl = null; };
  const invalidate = () => {
    const wasCalculating = results.getAttribute('aria-busy') === 'true';
    requestNumber++; removeDownload();
    const download = document.querySelector('#history-download');
    download?.remove();
    results.setAttribute('aria-busy', 'false');
    if (results.dataset.generated || wasCalculating) {
      results.hidden = true;
      message.textContent = 'Settings changed. Generate a new report for these settings.';
    }
  };
  form.addEventListener('input', invalidate);
  form.addEventListener('change', invalidate);
  function addPeriod(container: Element, exceptionName: string) {
    periodNumber++;
    const period = document.createElement('fieldset');
    period.className = 'history-historical-period';
    period.innerHTML = `<legend>Historical comparison ${periodNumber} for ${escape(exceptionName)}</legend><div class="history-date-fields"><label>Historical period start<input type="date" data-field="start" required /></label><label>Historical period end<input type="date" data-field="end" required /></label></div><button type="button" class="admin-button admin-button--secondary" data-remove-period>Remove historical period</button>`;
    period.querySelector('[data-remove-period]')!.addEventListener('click', () => {
      const next = period.closest('.history-exception')?.querySelector<HTMLButtonElement>('[data-add-period]');
      period.remove(); invalidate(); next?.focus();
    });
    container.append(period);
    return period;
  }
  add.addEventListener('click', () => {
    if (exceptions.children.length >= 20) { message.textContent = 'Add at most 20 exception periods.'; return; }
    exceptionNumber++;
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'history-exception';
    fieldset.innerHTML = `<legend>Exception ${exceptionNumber}</legend><div class="history-date-fields"><label>Exception name<input data-field="name" maxlength="80" required /></label><label>Target period start<input data-field="target-start" type="date" required /></label><label>Target period end<input data-field="target-end" type="date" required /></label></div><div data-periods></div><div class="history-actions"><button type="button" class="admin-button admin-button--secondary" data-add-period>Add historical period</button><button type="button" class="admin-button admin-button--secondary" data-remove-exception>Remove exception ${exceptionNumber}</button></div>`;
    const periods = fieldset.querySelector('[data-periods]')!;
    addPeriod(periods, `exception ${exceptionNumber}`);
    fieldset.querySelector('[data-add-period]')!.addEventListener('click', () => {
      if (periods.children.length >= 20) { message.textContent = 'Add at most 20 historical periods per exception.'; return; }
      const period = addPeriod(periods, fieldset.querySelector<HTMLInputElement>('[data-field="name"]')!.value || 'this exception');
      invalidate(); period.querySelector<HTMLInputElement>('input')!.focus();
    });
    fieldset.querySelector('[data-remove-exception]')!.addEventListener('click', () => { fieldset.remove(); invalidate(); add.focus(); });
    exceptions.append(fieldset); invalidate();
    fieldset.querySelector<HTMLInputElement>('input')!.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const number = ++requestNumber;
    removeDownload();
    document.querySelector('#history-download')?.remove();
    results.hidden = true;
    results.setAttribute('aria-busy', 'true');
    message.className = '';
    message.textContent = 'Reading reservation evidence and calculating rates…';
    const values = new FormData(form);
    const exceptionValues: HistoryException[] = [...exceptions.querySelectorAll('.history-exception')].map(e => {
      const value = (key: string) => e.querySelector<HTMLInputElement>(`[data-field="${key}"]`)!.value;
      return { name: value('name'), target: { start: value('target-start'), end: value('target-end') }, historical: [...e.querySelectorAll('.history-historical-period')].map(p => ({ start: p.querySelector<HTMLInputElement>('[data-field="start"]')!.value, end: p.querySelector<HTMLInputElement>('[data-field="end"]')!.value })) };
    });
    try {
      const response = await fetch('/api/admin/pricing/history/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ propertyId: values.get('propertyId'), startDate: values.get('startDate'), endDate: values.get('endDate'), targetYear: Number(values.get('targetYear')), upliftPercent: Number(values.get('upliftPercent')), exceptions: exceptionValues }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The report could not be calculated.');
      if (number !== requestNumber) return;
      const listing = form.querySelector<HTMLSelectElement>('[name="propertyId"]')!.selectedOptions[0].textContent || body.report.input.propertyId;
      results.innerHTML = historyReportHtml(body.report, listing);
      downloadUrl = URL.createObjectURL(new Blob([body.csv], { type: 'text/csv;charset=utf-8' }));
      results.querySelector<HTMLAnchorElement>('#history-download')!.href = downloadUrl;
      results.dataset.generated = 'true';
      results.hidden = false;
      message.textContent = 'Report generated. Review the rates and evidence below, or download this exact report as CSV.';
    } catch (error) {
      if (number !== requestNumber) return;
      message.className = 'history-error';
      message.textContent = error instanceof Error ? error.message : 'The report could not be calculated.';
    } finally { if (number === requestNumber) results.setAttribute('aria-busy', 'false'); }
  });
  window.addEventListener('pagehide', removeDownload);
}
