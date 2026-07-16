import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

const allowedDomains = [
  { hostname: 'olrigbank.co.uk', protocol: 'https' },
  { hostname: 'www.olrigbank.co.uk', protocol: 'https' },
];

// Render terminates HTTPS at its proxy and forwards the public hostname in
// X-Forwarded-Host. Trust only this service's Render hostname so Astro can
// reconstruct the public request URL for its same-origin CSRF check.
if (process.env.RENDER_EXTERNAL_HOSTNAME) {
  allowedDomains.push({
    hostname: process.env.RENDER_EXTERNAL_HOSTNAME,
    protocol: 'https',
  });
}

export default defineConfig({
  site: 'https://olrigbank.co.uk',
  trailingSlash: 'always',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: {
    checkOrigin: true,
    allowedDomains,
  },
});
