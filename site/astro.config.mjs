import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://olrigbank.co.uk',
  trailingSlash: 'always',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
