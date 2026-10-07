import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

describe('admin deploy notes', () => {
  it('tells Oracle to migrate then seed the admin without committing a password', () => {
    assert.match(readme, /migrations\/011_departments\.sql/);
    assert.match(readme, /node --experimental-strip-types scripts\/seed-admin\.mjs/);
    assert.match(readme, /ADMIN_PASSWORD/);
    assert.match(readme, /ADMIN_NAME/);
    assert.equal(readme.includes('admin@bossnote.id') || readme.includes('default `Admin`'), true);
    assert.equal(/\$2[aby]\$/.test(readme), false);
    assert.equal(/ADMIN_PASSWORD=\S+/.test(readme), false);
  });

  it('runs the digest with strip-types and limits who sees tasks', () => {
    assert.match(readme, /node --experimental-strip-types scripts\/daily-task-notify\.mjs/);
    const who = readme.slice(readme.indexOf('## Create tasks'), readme.indexOf('### Screenshots'));
    assert.match(who, /department/);
    assert.doesNotMatch(who, /members see every task they created/);
    assert.doesNotMatch(who, /members see tasks assigned to them or created by them/);
    assert.match(readme, /one group|Lark group/);
    assert.match(readme, /personal Lark DM/);
    assert.match(readme, /Manage Users is the admin page/);
  });
});
