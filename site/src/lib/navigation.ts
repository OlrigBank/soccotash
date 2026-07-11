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
  const projectRootPath = join(process.cwd(), 'src', 'data', 'navigation', 'main.yml');
  if (existsSync(projectRootPath)) return projectRootPath;
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

export function getChildCategories(parentId: string): NavItem[] {
  return getLocalGuideCategories().filter((category) => category.parent === parentId);
}

export function getDescendantCategoryIds(categoryId: string): string[] {
  const categories = getLocalGuideCategories();
  const result: string[] = [];

  function visit(parentId: string) {
    for (const category of categories.filter((item) => item.parent === parentId)) {
      result.push(category.id);
      visit(category.id);
    }
  }

  visit(categoryId);
  return result;
}

export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...flattenNavItems(item.children ?? [])]);
}
