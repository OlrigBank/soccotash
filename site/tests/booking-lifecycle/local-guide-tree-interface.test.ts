import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildLocalGuideTree } from '../../src/lib/local-guide/tree.ts';

const categories = [
  { id:'home',label:'Home',href:'/',parent:'' },
  { id:'outdoors',label:'Outdoors',href:'/local-guide/outdoors/',parent:'home' },
  { id:'walks',label:'Walks',href:'/local-guide/walks/',parent:'outdoors' },
  { id:'empty',label:'Empty',href:'/local-guide/empty/',parent:'home' },
  { id:'cycle',label:'Cycle',href:'/local-guide/cycle/',parent:'outdoors' },
];
const entries = [
  { id:'1',slug:'one',title:'One',categoryId:'walks' },
  { id:'2',slug:'two',title:'Two',categoryId:'outdoors' },
  { id:'3',slug:'three',title:'Three',categoryId:'walks' },
  { id:'4',slug:'orphan',title:'Orphan',categoryId:'missing' },
];

test('builds a recursive published tree with deterministic ordering, descendant counts and empty pruning', () => {
  const tree = buildLocalGuideTree(categories,entries);
  assert.equal(tree.length,1);
  assert.equal(tree[0].id,'outdoors');
  assert.equal(tree[0].recommendationCount,3);
  assert.deepEqual(tree[0].entries.map(entry=>entry.slug),['two']);
  assert.deepEqual(tree[0].children.map(child=>child.id),['walks']);
  assert.deepEqual(tree[0].children[0].entries.map(entry=>entry.slug),['one','three']);
  assert.equal(tree[0].children[0].recommendationCount,2);
});

test('public Local Guide uses native nested disclosures and retains stable leaf links', async () => {
  const [page,tree,branch,styles] = await Promise.all([
    readFile(new URL('../../src/pages/local-guide/index.astro',import.meta.url),'utf8'),
    readFile(new URL('../../src/components/LocalGuideTree.astro',import.meta.url),'utf8'),
    readFile(new URL('../../src/components/LocalGuideTreeBranch.astro',import.meta.url),'utf8'),
    readFile(new URL('../../src/styles/global.css',import.meta.url),'utf8'),
  ]);
  assert.match(page,/buildLocalGuideTree/);
  assert.match(page,/<LocalGuideTree nodes=\{tree\}/);
  assert.doesNotMatch(page,/All recommendations/);
  assert.match(branch,/<details data-local-guide-category=\{node\.id\}>/);
  assert.match(branch,/<summary>/);
  assert.match(branch,/href=\{`\/local-guide\/\$\{entry\.slug\}\//);
  assert.doesNotMatch(tree+branch,/role=["'](?:tree|treeitem)/);
  assert.match(tree,/sessionStorage/);
  assert.match(tree,/olrig-bank:local-guide:disclosures:v1/);
  assert.match(styles,/@media\(max-width:430px\)/);
  assert.match(styles,/min-height:46px/);
});
