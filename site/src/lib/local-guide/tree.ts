import type { NavItem } from '../navigation.ts';

export type LocalGuideTreeEntry = {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
};

export type LocalGuideTreeNode = {
  id: string;
  label: string;
  description: string;
  entries: LocalGuideTreeEntry[];
  children: LocalGuideTreeNode[];
  recommendationCount: number;
};

export function buildLocalGuideTree(
  categories: NavItem[],
  entries: LocalGuideTreeEntry[],
  rootId = 'home',
): LocalGuideTreeNode[] {
  const entriesByCategory = new Map<string, LocalGuideTreeEntry[]>();
  for (const entry of entries) {
    const grouped = entriesByCategory.get(entry.categoryId) ?? [];
    grouped.push(entry);
    entriesByCategory.set(entry.categoryId, grouped);
  }

  const childrenByParent = new Map<string, NavItem[]>();
  for (const category of categories) {
    const grouped = childrenByParent.get(category.parent ?? '') ?? [];
    grouped.push(category);
    childrenByParent.set(category.parent ?? '', grouped);
  }

  function visit(parentId: string, ancestors: Set<string>): LocalGuideTreeNode[] {
    return (childrenByParent.get(parentId) ?? []).flatMap((category) => {
      if (category.id === rootId || ancestors.has(category.id)) return [];
      const nextAncestors = new Set(ancestors).add(category.id);
      const children = visit(category.id, nextAncestors);
      const directEntries = entriesByCategory.get(category.id) ?? [];
      const recommendationCount = directEntries.length
        + children.reduce((total, child) => total + child.recommendationCount, 0);
      if (recommendationCount === 0) return [];
      return [{
        id: category.id,
        label: category.label,
        description: category.description ?? '',
        entries: directEntries,
        children,
        recommendationCount,
      }];
    });
  }

  return visit(rootId, new Set([rootId]));
}
