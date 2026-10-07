import assert from 'node:assert/strict';
import test from 'node:test';
import { isLocalGuideImage, isLocalGuideImagePath } from '../../src/lib/local-guide/validation.ts';

test('accepts bundled images and HTTPS images without allowing traversal or other schemes', () => {
  assert.ok(isLocalGuideImage('/media/images/local-guide/ruskins.png'));
  assert.ok(isLocalGuideImage('https://example.test/image.jpg'));
  for (const path of ['//example.test/image.jpg','/media/images/../secret','/media/images/%2e%2e/secret','/media/images/%2f..%2fsecret','/media/images/\\secret','/media/images/image.png?query','/other/image.png','http://example.test/image.jpg','https://','javascript:alert(1)']) assert.equal(isLocalGuideImage(path),false,path);
  assert.equal(isLocalGuideImagePath('https://example.test/image.jpg'),false);
});
