// This source is served by /analytics.js with validated runtime configuration.
(() => {
  if (window.olrigAnalytics) return;
  const configuration = __OLRIG_ANALYTICS_CONFIGURATION__;
  const queue = [];
  const pendingKey = 'olrig:analytics-pending';
  const expiryMs = 30 * 60 * 1000;
  const storageKey = 'olrig:plaque-entry';
  let plaqueUntil = 0;
  let ready = false;
  const events = new Set(['listing_viewed', 'availability_started', 'availability_result', 'booking_requested', 'manage_booking_opened', 'message_sent', 'offer_accepted', 'offer_declined', 'payment_started', 'payment_reported', 'booking_confirmed', 'compact_booking_started', 'compact_booking_result', 'compact_booking_continued', 'plaque_link_clicked']);
  const allowed = {
    property: ['main-house', 'whole-property', 'cottage', 'bespoke-arrangement', 'none'],
    listing: ['olrig-bank', 'event', 'cottage', 'bespoke', 'main-house', 'whole-property'],
    source: ['homepage', 'public', 'booking', 'listing', 'unknown'],
    result: ['available', 'unavailable', 'host_priced', 'bespoke', 'error'],
    method: ['bank_transfer', 'card'],
    destination: ['stays', 'availability', 'main-house', 'whole-property', 'cottage', 'bespoke', 'contact', 'reviews', 'local-guide', 'welcome'],
    placement: ['opening', 'reviews', 'stays', 'closing'],
  };
  // Only known public routes may reach the collector; never forward arbitrary paths.
  const cleanPath = (path) => {
    if (path.startsWith('/booking/manage/')) return '/booking/manage';
    if (path.startsWith('/planner/')) return '/planner/private';
    if (/^\/(?:plaque|book|booking|welcome(?:\/print)?|listings(?:\/(?:olrig-bank|event|cottage|bespoke|main-house))?|local-guide(?:\/[a-z0-9-]+)?|holiday-plans\/[a-z0-9-]+|guest-information|enjoy-the-garden|house-essentials|contact)\/?$/.test(path) || path === '/') return path;
    return '/other';
  };
  const attribution = () => {
    const now = Date.now();
    try { plaqueUntil = Math.max(plaqueUntil, Number(sessionStorage.getItem(storageKey)) || 0); } catch {}
    if (location.pathname === '/plaque/' || plaqueUntil > now) {
      plaqueUntil = now + expiryMs;
      try { sessionStorage.setItem(storageKey, String(plaqueUntil)); } catch {}
      return { entry_source: 'plaque' };
    }
    return {};
  };
  const payload = (name, data = {}) => {
    const url = cleanPath(location.pathname);
    let referrer = '';
    try {
      const previous = new URL(document.referrer);
      // External origins only; same-site paths pass through the same sanitiser.
      referrer = previous.origin === location.origin ? previous.origin + cleanPath(previous.pathname) : previous.origin;
    } catch {}
    const safeData = attribution();
    for (const [key, value] of Object.entries(data)) {
      if (allowed[key]?.includes(value) || (key === 'pricing_available' && typeof value === 'boolean')) safeData[key] = value;
    }
    return { website: configuration.websiteId, hostname: location.hostname, language: navigator.language,
      screen: `${screen.width}x${screen.height}`, url, referrer,
      title: url === '/booking/manage' || url === '/planner/private' ? 'Private guest page | Olrig Bank' : (url === '/other' ? 'Olrig Bank' : document.title),
      ...(name ? { name } : {}), data: safeData };
  };
  const persist = () => {
    try {
      if (queue.length) sessionStorage.setItem(pendingKey, JSON.stringify(queue));
      else sessionStorage.removeItem(pendingKey);
    } catch {}
  };
  const flush = () => {
    if (!ready || !window.umami) return;
    while (queue.length) {
      const item = queue.shift();
      // Explicit payload: no default URL, title or referrer can leak into events.
      try { window.umami.track(item.payload)?.catch?.(() => {}); } catch {}
    }
    persist();
  };
  const deliver = (item) => {
    if (queue.length < 100) queue.push({ savedAt: Date.now(), payload: item });
    persist();
    flush();
  };
  // Preserve sanitised, unsent hits if someone follows a link before Umami loads.
  // Storage is tab-scoped, bounded and short-lived; no identifier is introduced.
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) || '[]');
    if (Array.isArray(pending)) for (const item of pending.slice(-99)) {
      if (item?.savedAt > Date.now() - expiryMs && item?.payload?.website === configuration.websiteId) queue.push(item);
    }
  } catch {}
  attribution();
  window.olrigAnalytics = {
    track(name, data = {}) { if (events.has(name)) deliver(payload(name, data)); },
    ready() {
      ready = Boolean(window.umami);
      if (!ready) return;
      flush();
    },
  };
  deliver(payload());
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-plaque-destination]') : null;
    if (link) window.olrigAnalytics.track('plaque_link_clicked', { destination: link.dataset.plaqueDestination, placement: link.dataset.plaquePlacement });
  });
  // bfcache restoration is not a new page load; don't duplicate the pageview.
  document.addEventListener('pointerdown', attribution, { passive: true });
  document.addEventListener('keydown', attribution, { passive: true });
  const script = document.createElement('script');
  script.defer = true;
  script.src = configuration.scriptUrl;
  script.dataset.websiteId = configuration.websiteId;
  script.dataset.autoTrack = 'false';
  script.dataset.autoPageview = 'false';
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  script.onload = () => window.olrigAnalytics.ready();
  document.head.appendChild(script);
})();
