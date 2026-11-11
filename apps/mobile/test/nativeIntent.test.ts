// Links that open the app: the email sign-in return and the bare app address are not pages (Android "Unmatched
// Route", 5 Nov 2026). Synthetic codes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAppOnlyPath, redirectSystemPath } from '../src/app/+native-intent.ts';

test('the sign-in return keeps the app where it is, or starts it at the beginning', () => {
  for (const path of ['/auth', 'preconnix:///', 'preconnix://']) {
    assert.equal(isAppOnlyPath(path), true, path);
    assert.equal(redirectSystemPath({ path, initial: false }), null, path);
    assert.equal(redirectSystemPath({ path, initial: true }), '/', path);
  }
});

test('a sign-in return with a code opens the page that finishes sign-in', () => {
  for (const initial of [true, false]) {
    assert.equal(redirectSystemPath({ path: 'preconnix:///auth?code=SYNTHETIC&state=s1', initial }), '/auth?code=SYNTHETIC&state=s1');
    assert.equal(redirectSystemPath({ path: 'preconnix://auth/?code=x', initial }), '/auth?code=x');
  }
});

test('real pages are left alone', () => {
  for (const path of ['/plan', 'preconnix:///plan/goal/123', '/authors', '/learn/folic-acid-before-pregnancy']) {
    assert.equal(isAppOnlyPath(path), false, path);
    assert.equal(redirectSystemPath({ path, initial: false }), path);
  }
});
