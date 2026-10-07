import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('task visibility routes', () => {
  it('returns 403 for admin on the task list and create', () => {
    const route = read('src/app/api/tasks/route.ts');
    const get = route.slice(route.indexOf('export async function GET'), route.indexOf('type CreateInput'));
    const post = route.slice(route.indexOf('export async function POST'));
    for (const body of [get, post]) {
      assert.match(body, /user\.role === 'admin'/);
      assert.match(body, /403/);
    }
  });

  it('returns 403 when an admin opens the task event stream', () => {
    const events = read('src/app/api/tasks/events/route.ts');
    assert.match(events, /user\.role === 'admin'/);
    assert.match(events, /403/);
  });

  it('checks visibility before status changes and returns 404 before the boss delete gate', () => {
    const route = read('src/app/api/tasks/[id]/route.ts');
    const put = route.slice(route.indexOf('export async function PUT'), route.indexOf('export async function DELETE'));
    const statusUpdate = put.indexOf('SET status');
    const view = put.indexOf('canViewTask');
    assert.ok(view >= 0 && view < statusUpdate);
    const del = route.slice(route.indexOf('export async function DELETE'));
    const notFound = del.indexOf("'Not found'");
    const missing = del.indexOf('status: 404');
    const boss = del.indexOf("user.role !== 'boss'");
    assert.ok(notFound >= 0 && missing >= 0 && notFound < boss && missing < boss);
    assert.match(del, /canViewTask/);
  });

  it('loads creator role before deciding who can see replies, images, and retranscribe', () => {
    for (const rel of [
      'src/app/api/tasks/[id]/reply/route.ts',
      'src/app/api/tasks/[id]/retranscribe/route.ts',
      'src/app/api/tasks/[id]/image/route.ts',
      'src/app/api/tasks/[id]/image/[index]/route.ts',
      'src/lib/task-gallery.ts',
    ]) {
      const source = read(rel);
      assert.match(source, /creator_role/, rel);
      assert.match(source, /canViewTask/, rel);
    }
  });
});
