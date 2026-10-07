import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGithubStore, encode, decode } from '../docs/github-store.mjs';

test('UTF-8 album content round-trips, including Hindi and emoji', () => {
  const text = 'Thank you राहुल 💚';
  assert.equal(decode(encode(text)), text);
});

test('GitHub admin loads, creates, edits and deletes notes using safe versioned writes', async () => {
  let persisted = { intro: { title: 'Goodbye', letter: 'Thank you', signature: 'Rahul' }, entries: [] };
  let revision = 'version-1', writes = 0;
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (url.endsWith('/farewell-album')) return Response.json({ permissions: { push: true } });
    if (options.method === 'PUT') {
      const request = JSON.parse(options.body);
      if (request.sha !== revision) return Response.json({}, { status: 409 });
      persisted = JSON.parse(decode(request.content));
      assert.equal(JSON.stringify(persisted).includes('test-token'), false);
      revision = 'version-' + (++writes + 1);
      return Response.json({ content: { sha: revision } });
    }
    return Response.json({ sha: revision, encoding: 'base64', content: encode(JSON.stringify(persisted)) });
  };
  const store = createGithubStore(mockFetch);
  const initial = await store.signIn('test-token');
  assert.equal(initial.entries.length, 0);
  initial.entries.push({ id: 'a', name: 'A colleague', message: 'Thank you 💚', photo: '' });
  let next = await store.save(initial, 'Add note');
  assert.equal(persisted.entries.length, 1);
  next.entries[0].message = 'Updated note';
  next = await store.save(next, 'Edit note');
  assert.equal(persisted.entries[0].message, 'Updated note');
  next.entries = [];
  await store.save(next, 'Remove note');
  assert.equal(persisted.entries.length, 0);
  assert.equal(writes, 3);
  assert.ok(calls.every(call => call.url.startsWith('https://api.github.com/repos/Rahulmehtaa/farewell-album')));
  revision = 'another-tab';
  await assert.rejects(store.save(next, 'Stale change'), /another tab/);
  store.signOut();
  await assert.rejects(store.save(next, 'After sign out'), /Sign in/);
});

test('loads album files above the contents API inline size limit', async () => {
  const album = { intro: {}, entries: [] };
  const store = createGithubStore(async url => {
    if (url.endsWith('/farewell-album')) return Response.json({ permissions: { push: true } });
    if (url.includes('/git/blobs/large-sha')) return Response.json({ content: encode(JSON.stringify(album)) });
    return Response.json({ sha: 'large-sha', encoding: 'none', content: '' });
  });
  assert.deepEqual(await store.signIn('test-token'), album);
});

test('rejects invalid tokens and accounts without repository edit access', async () => {
  const invalid = createGithubStore(async () => Response.json({}, { status: 401 }));
  await assert.rejects(invalid.signIn('invalid'), /invalid or expired/);
  await assert.rejects(invalid.save({}, 'No access'), /Sign in/);
  const readOnly = createGithubStore(async () => Response.json({ permissions: { push: false } }));
  await assert.rejects(readOnly.signIn('read-only'), /cannot edit/);
});
