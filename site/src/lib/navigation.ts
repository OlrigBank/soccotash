import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export type NavItem = {
  id: string;
  label: string;
  description?: string;
  href: string;
  children?: NavItem[];
  hasOfferings?: boolean;
  offeringCount?: number;
  parent?: string;
};

export type NavigationData = {
  items: NavItem[];
  localGuideCategories: NavItem[];
};

function getNavigationPath() {
  // During `astro build`, Astro bundles server-side code into `dist/chunks` before
  // prerendering pages. Paths based on `import.meta.url` can therefore point at
  // `site/dist/data/...`, which does not exist. The project root is the stable
  // location for both `astro dev` and `astro build`.
  const projectRootPath = join(process.cwd(), 'src', 'data', 'navigation', 'main.yml');
  if (existsSync(projectRootPath)) return projectRootPath;

  // Fallback for unusual execution contexts, for example direct tests from this file.
  return fileURLToPath(new URL('../data/navigation/main.yml', import.meta.url));
}

export function getNavigation(): NavigationData {
  const source = readFileSync(getNavigationPath(), 'utf8');
  return parse(source) as NavigationData;
}

export function getLocalGuideCategories(): NavItem[] {
  return getNavigation().localGuideCategories ?? [];
}

export function getCategoryById(id: string): NavItem | undefined {
  return getLocalGuideCategories().find((category) => category.id === id);
}

export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...flattenNavItems(item.children ?? [])]);
}
