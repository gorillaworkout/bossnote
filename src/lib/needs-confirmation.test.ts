import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { confirmationAction, needsConfirmation, unansweredCount } from './needs-confirmation.ts';

describe('needs confirmation', () => {
  it('counts unanswered questions and ignores tasks that are caught up', () => {
    assert.equal(unansweredCount({ questions: ['A?', 'B?'], answered_questions: [0] }), 1);
    assert.equal(needsConfirmation({ questions: ['A?'], answered_questions: [] }), true);
    assert.equal(needsConfirmation({ questions: ['A?'], answered_questions: [0] }), false);
    assert.equal(needsConfirmation({ questions: [], answered_questions: [] }), false);
    assert.equal(needsConfirmation({}), false);
  });

  it('opens the only pending task and filters when several still need confirmation', () => {
    assert.deepEqual(confirmationAction([]), { kind: 'none' });
    assert.deepEqual(
      confirmationAction([
        { id: 'done', questions: ['A?'], answered_questions: [0] },
        { id: 'open', questions: ['Budget?'], answered_questions: [] },
      ]),
      { kind: 'open', id: 'open' },
    );
    assert.deepEqual(
      confirmationAction([
        { id: 'a', questions: ['A?'], answered_questions: [] },
        { id: 'b', questions: ['B?', 'C?'], answered_questions: [0] },
      ]),
      { kind: 'filter' },
    );
  });
});
