import type { APIRoute } from 'astro';

export const prerender = false;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: APIRoute = () => {
  const websiteId = String(process.env.UMAMI_WEBSITE_ID || '').trim();
  const configuredScriptUrl = String(process.env.UMAMI_SCRIPT_URL || '').trim();
  const scriptUrl = configuredScriptUrl || 'https://cloud.umami.is/script.js';

  let enabled = uuidPattern.test(websiteId);
  try {
    enabled = enabled && new URL(scriptUrl).protocol === 'https:';
  } catch {
    enabled = false;
  }

  const body = enabled
    ? `(() => {
  if (window.olrigAnalytics) return;

  const queue = [];
  const cleanPage = () => {
    const privateBookingPage = /^\\/booking\\/manage\\/[^/]+\\/?$/.test(location.pathname);
    return privateBookingPage
      ? { url: '/booking/manage', title: 'Private booking page | Olrig Bank' }
      : { url: location.pathname, title: document.title };
  };
  const send = (name, data) => {
    if (!window.umami) {
      queue.push([name, data]);
      return;
    }
    if (name) window.umami.track(name, data);
    else window.umami.track((properties) => ({ ...properties, ...cleanPage() }));
  };

  window.olrigAnalytics = {
    track(name, data = {}) {
      send(name, data);
    },
    ready() {
      send();
      while (queue.length) {
        const [name, data] = queue.shift();
        send(name, data);
      }
    },
  };

  const script = document.createElement('script');
  script.defer = true;
  script.src = ${JSON.stringify(scriptUrl)};
  script.dataset.websiteId = ${JSON.stringify(websiteId)};
  script.dataset.autoTrack = 'false';
  script.onload = () => window.olrigAnalytics?.ready();
  document.head.appendChild(script);
})();`
    : '';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
