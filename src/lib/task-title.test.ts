import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distinctSummary, presentTaskTitle, priorityLabel, taskTitles } from './task-title.ts';

describe('presentTaskTitle', () => {
  it('sentence-cases a lowercase title without rewriting the rest', () => {
    assert.equal(presentTaskTitle('need to send automatically to email'), 'Need to send automatically to email');
    assert.equal(presentTaskTitle('Follow up'), 'Follow up');
    assert.equal(presentTaskTitle('  CREATE FM ASSET REQUEST  '), 'Create fm asset request');
  });

  it('replaces a raw URL title with a short label', () => {
    assert.equal(
      presentTaskTitle('https://files.example.com/requests/fm-asset-request?dl=1'),
      'Fm Asset Request',
    );
    assert.equal(presentTaskTitle('https://docs.example.com/document/d/abc123xyz9876543210/edit'), 'docs.example.com');
    const long = `https://example.com/${'a'.repeat(180)}`;
    assert.ok(presentTaskTitle(long).length <= 140);
  });
});

describe('distinctSummary', () => {
  it('drops a summary that repeats the reminder text', () => {
    assert.deepEqual(distinctSummary({
      transcript: 'Remind Ian to review the proposal',
      summary: 'Remind Ian to review the proposal',
      transcript_id: 'Remind Ian to review the proposal',
      summary_id: 'Remind Ian to review the proposal',
    }), { en: '', id: '' });
    assert.deepEqual(distinctSummary({
      transcript: 'Call the vendor',
      summary: 'Call the vendor and confirm the price',
      summary_id: 'Hubungi vendor',
    }), { en: 'Call the vendor and confirm the price', id: 'Hubungi vendor' });
  });
});

describe('priorityLabel', () => {
  it('labels the stored priority instead of showing the raw word alone', () => {
    assert.equal(priorityLabel('high'), 'High');
    assert.equal(priorityLabel('medium'), 'Medium');
    assert.equal(priorityLabel('low'), 'Low');
  });
});

describe('taskTitles presentation', () => {
  it('applies the same title cleanup to the heading staff see', () => {
    assert.equal(
      taskTitles({ title: 'https://example.com/pre-boarding-intake', title_id: 'Intake' }, 'member').primary,
      'Pre Boarding Intake',
    );
  });
});
