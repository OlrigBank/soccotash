import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('customer-facing layouts opt into one public theme without changing administration', async () => {
  const [baseLayout, bookerLayout, adminLayout] = await Promise.all([
    source('src/layouts/BaseLayout.astro'),
    source('src/layouts/BookerLayout.astro'),
    source('src/layouts/AdminLayout.astro'),
  ]);

  assert.match(baseLayout, /<body class="public-ui">/);
  assert.match(bookerLayout, /import '\.\.\/styles\/green-theme\.css'/);
  assert.match(bookerLayout, /<body class="public-ui booker-area">/);
  assert.doesNotMatch(adminLayout, /green-theme\.css/);
  assert.doesNotMatch(adminLayout, /class="public-ui/);
});

test('the public foundation defines reusable layout, control and feedback contracts', async () => {
  const styles = await source('src/styles/global.css');

  for (const token of [
    '--content-width',
    '--reading-width',
    '--control-height',
    '--control-radius',
    '--surface-radius',
    '--focus-ring',
    '--focus-offset',
  ]) assert.match(styles, new RegExp(`${token}:`));

  assert.match(styles, /\.public-ui :where\(a, button, input, select, textarea, summary\):focus-visible/);
  assert.match(styles, /\.visually-hidden\s*{/);
  assert.match(styles, /\.public-surface,/);
  assert.match(styles, /\.public-notice--success/);
  assert.match(styles, /\.public-notice--warning/);
  assert.match(styles, /\.public-notice--error/);
  assert.match(styles, /\.button-secondary,\s*\.button--secondary/);
  assert.match(styles, /\.button\s*{[^}]*min-height:\s*var\(--control-height\)/s);
});

test('public review ratings expose valid accessible text', async () => {
  const reviews = await source('src/components/PublicReviewCarousel.astro');

  assert.doesNotMatch(reviews, /review-carousel__rating--below-five'\]\}\s+aria-label=/);
  assert.match(reviews, /review-carousel__filled-stars" aria-hidden="true"/);
  assert.match(reviews, /class="visually-hidden">\{review\.rating\} out of 5 stars/);
});
