import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestPayload, groupOpenTasksByAssignee } from './push-digest.ts';
import { buildTypedTaskFields } from './typed-task.ts';

describe('groupOpenTasksByAssignee / buildDigestPayload', () => {
  it('groups tasks per assignee and skips empty digests', () => {
    const groups = groupOpenTasksByAssignee([
      { assignee_id: 'bayu-001', title: 'Konten IG', title_id: 'Konten IG' },
      { assignee_id: 'bayu-001', title: 'Laporan', title_id: 'Laporan' },
      { assignee_id: 'ian-001', title: 'Review deck', title_id: 'Review deck' },
    ]);
    assert.equal(groups.get('bayu-001')?.length, 2);
    assert.equal(groups.get('ian-001')?.length, 1);
    assert.equal(buildDigestPayload([]), null);
  });

  it('summarizes count + top titles in Indonesian', () => {
    const payload = buildDigestPayload([
      { assignee_id: 'sandra-001', title: 'A', title_id: 'Cek stok' },
      { assignee_id: 'sandra-001', title: 'B', title_id: 'Follow up vendor' },
      { assignee_id: 'sandra-001', title: 'C', title_id: 'Update harga' },
      { assignee_id: 'sandra-001', title: 'D', title_id: 'Extra' },
    ]);
    assert.ok(payload);
    assert.equal(payload.title, '4 tugas terbuka');
    assert.match(payload.body, /Kamu punya 4 tugas/);
    assert.match(payload.body, /Cek stok/);
    assert.match(payload.body, /\(\+1 lagi\)/);
    assert.equal(payload.url, '/dashboard');
  });
});

describe('buildTypedTaskFields', () => {
  it('uses the same text for title/summary/transcript when bilingual is unavailable', () => {
    const fields = buildTypedTaskFields({ text: 'Ingatkan Ian review proposal' });
    assert.ok(fields);
    assert.equal(fields.title, 'Ingatkan Ian review proposal');
    assert.equal(fields.title_id, fields.title);
    assert.equal(fields.summary, 'Ingatkan Ian review proposal');
    assert.equal(fields.transcript, 'Ingatkan Ian review proposal');
    assert.equal(fields.priority, 'medium');
    assert.equal(fields.deadline, null);
  });

  it('returns null for empty input and accepts optional priority/deadline', () => {
    assert.equal(buildTypedTaskFields({ text: '   ' }), null);
    const fields = buildTypedTaskFields({
      title: 'Follow up',
      text: 'Follow up vendor besok',
      priority: 'high',
      deadline: '2026-09-09',
    });
    assert.ok(fields);
    assert.equal(fields.title, 'Follow up');
    assert.equal(fields.summary, 'Follow up vendor besok');
    assert.equal(fields.priority, 'high');
    assert.equal(fields.deadline, '2026-09-09');
  });
});
