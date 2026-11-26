// The small pure parts of the sidebar: names, addresses and what a sign-in leaves in the link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { slugOf, usernameProblem, readAuthHash, isStored, uuidOf, RESERVED } from '../site/account.js';

test('a title becomes a plain address', () => {
  assert.equal(slugOf('My Dinosaurs'), 'my-dinosaurs');
  assert.equal(slugOf('  Nepal’s road — to a republic!  '), 'nepal-s-road-to-a-republic');
  assert.equal(slugOf('Café Société'), 'cafe-societe');
  assert.equal(slugOf('नेपाल'), 'timeline');
  assert.ok(slugOf('x'.repeat(200)).length <= 60);
  assert.match(slugOf('a'.repeat(59) + ' b c'), /^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
});

test('a username is short, plain and not a reserved word', () => {
  assert.equal(usernameProblem('shrawan'), '');
  assert.equal(usernameProblem('a-b-3'), '');
  assert.ok(usernameProblem('ab'));
  assert.ok(usernameProblem('x'.repeat(31)));
  assert.ok(usernameProblem('Shrawan'));
  assert.ok(usernameProblem('-abc'));
  assert.ok(usernameProblem('abc-'));
  assert.ok(usernameProblem('a b c'));
  for (const name of ['wiki', 'classical', 't', 'data']) assert.ok(RESERVED.includes(name));
  assert.ok(usernameProblem('wiki'));
});

test('a returning sign-in is read from the link, and nothing else is', () => {
  const got = readAuthHash('#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer');
  assert.equal(got.session.access_token, 'aaa');
  assert.equal(got.session.refresh_token, 'bbb');
  assert.ok(got.session.expires_at > Date.now() / 1000);
  assert.equal(readAuthHash('#error=access_denied&error_description=Email+link+is+invalid').error, 'Email link is invalid');
  assert.equal(readAuthHash('#apollo-11'), null);
  assert.equal(readAuthHash(''), null);
});

test('a stored timeline is told from a built view by its id', () => {
  const id = 't/d99c734a-7c1b-45ee-868f-0223aca7496e';
  assert.ok(isStored(id));
  assert.equal(uuidOf(id), 'd99c734a-7c1b-45ee-868f-0223aca7496e');
  assert.ok(!isStored('wiki/dinosaurs'));
  assert.ok(!isStored('t/short'));
  assert.ok(!isStored('everything'));
});
