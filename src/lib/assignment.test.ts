import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ASSIGNEE_REQUIRED_ERROR } from './assignee.ts';
import {
  canReassign,
  candidateListQuery,
  candidatesFor,
  decideCreateAssignee,
  decideReassign,
  isValidAssignmentPair,
  type Party,
} from './assignment.ts';

const general = 'dept-general';
const other = 'dept-other';
const ian = party('boss-001', 'Ian', 'boss', general);
const prista = party('prista-001', 'Prista', 'boss', other);
const bayu = party('bayu-001', 'Bayu', 'member', general);
const sandra = party('sandra-001', 'Sandra', 'member', general);
const nia = party('nia-001', 'Nia', 'member', other);
const admin = party('admin-001', 'Admin', 'admin', null);

function party(id: string, name: string, role: string, department_id: string | null): Party {
  return { id, name, role, department_id, email: `${id}@bossnote.id`, lark_open_id: null };
}

describe('assignment pairs', () => {
  it('allows only a boss and a member in the same department', () => {
    assert.equal(isValidAssignmentPair(ian, bayu), true);
    assert.equal(isValidAssignmentPair(bayu, ian), true);
    assert.equal(isValidAssignmentPair(ian, nia), false);
    assert.equal(isValidAssignmentPair(nia, ian), false);
    assert.equal(isValidAssignmentPair(ian, prista), false);
    assert.equal(isValidAssignmentPair(bayu, sandra), false);
    assert.equal(isValidAssignmentPair(admin, bayu), false);
    assert.equal(isValidAssignmentPair(bayu, admin), false);
    assert.equal(isValidAssignmentPair(ian, { ...ian, id: 'boss-002' }), false);
    assert.equal(isValidAssignmentPair(ian, ian), false);
  });

  it('lists only the opposite role in the creator department', () => {
    assert.deepEqual(candidatesFor(ian, [ian, prista, bayu, sandra, nia, admin]), [bayu, sandra]);
    assert.deepEqual(candidatesFor(bayu, [ian, prista, bayu, sandra, admin]), [ian]);
    const withNia = [ian, prista, bayu, sandra, nia, admin];
    assert.deepEqual(
      candidatesFor(prista, withNia).map((person) => person.id),
      candidatesFor(prista, withNia).map((person) => person.id),
    );
    assert.deepEqual(candidatesFor(prista, withNia), [nia]);

    const listed = candidateListQuery(ian);
    assert.ok(listed);
    assert.match(listed.sql, /role = \?/);
    assert.match(listed.sql, /department_id = \?/);
    assert.deepEqual(listed.values, ['member', general]);
    assert.equal(candidateListQuery(admin), null);
  });
});

describe('decideCreateAssignee', () => {
  it('rejects an empty candidate set', () => {
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'member',
        candidates: [],
        knownUserIds: [],
        formAssigneeId: '',
        hint: 'Ian',
        typed: false,
      }),
      {
        ok: false,
        status: 400,
        code: 'no_assignee_available',
        error: 'No boss in your department can take this task.',
      },
    );
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'boss',
        candidates: [],
        knownUserIds: [],
        formAssigneeId: '',
        hint: null,
        typed: true,
      }),
      {
        ok: false,
        status: 400,
        code: 'no_assignee_available',
        error: 'No staff in your department to assign.',
      },
    );
  });

  it('classifies a form id before any hint fallback', () => {
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'boss',
        candidates: [bayu],
        knownUserIds: ['bayu-001'],
        formAssigneeId: 'missing',
        hint: 'Bayu',
        typed: false,
      }),
      { ok: false, status: 400, error: 'Assignee not found' },
    );
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'boss',
        candidates: [bayu],
        knownUserIds: ['bayu-001', 'sandra-001'],
        formAssigneeId: 'sandra-001',
        hint: 'Bayu',
        typed: false,
      }),
      { ok: false, status: 400, code: 'assignee_not_allowed', error: 'That assignee is not allowed.' },
    );
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'boss',
        candidates: [bayu],
        knownUserIds: ['bayu-001'],
        formAssigneeId: 'bayu-001',
        hint: 'Sandra',
        typed: false,
      }),
      { ok: true, user: bayu },
    );
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'boss',
        candidates: [bayu],
        knownUserIds: [],
        formAssigneeId: '',
        hint: 'Sandra',
        typed: false,
      }),
      { ok: false, status: 400, code: 'assignee_required', error: ASSIGNEE_REQUIRED_ERROR },
    );
    assert.deepEqual(
      decideCreateAssignee({
        creatorRole: 'boss',
        candidates: [bayu],
        knownUserIds: [],
        formAssigneeId: '',
        hint: null,
        typed: true,
      }),
      { ok: false, status: 400, error: 'Assignee is required' },
    );
  });
});

describe('reassign', () => {
  it('lets a boss or the involved member reassign inside the creator pair', () => {
    assert.equal(
      canReassign({ id: 'boss-001', role: 'boss' }, { created_by: 'prista-001', assignee_id: 'nia-001' }, true),
      true,
    );
    assert.equal(
      canReassign({ id: 'bayu-001', role: 'member' }, { created_by: 'bayu-001', assignee_id: 'sandra-001' }, false),
      false,
    );
    assert.equal(
      canReassign({ id: 'bayu-001', role: 'member' }, { created_by: 'boss-001', assignee_id: 'bayu-001' }, true),
      true,
    );

    assert.deepEqual(
      decideReassign({
        viewer: { id: 'bayu-001', role: 'member' },
        creator: ian,
        nextAssignee: sandra,
        task: { created_by: 'boss-001', assignee_id: 'bayu-001' },
        canView: true,
      }),
      { ok: true },
    );
    assert.deepEqual(
      decideReassign({
        viewer: { id: 'boss-001', role: 'boss' },
        creator: prista,
        nextAssignee: nia,
        task: { created_by: 'prista-001', assignee_id: 'bayu-001' },
        canView: true,
      }),
      { ok: true },
    );
    assert.deepEqual(
      decideReassign({
        viewer: { id: 'boss-001', role: 'boss' },
        creator: prista,
        nextAssignee: bayu,
        task: { created_by: 'prista-001', assignee_id: 'nia-001' },
        canView: true,
      }),
      { ok: false, status: 400, code: 'assignee_not_allowed', error: 'That assignee is not allowed.' },
    );
    assert.deepEqual(
      decideReassign({
        viewer: { id: 'bayu-001', role: 'member' },
        creator: ian,
        nextAssignee: sandra,
        task: { created_by: 'boss-001', assignee_id: 'bayu-001' },
        canView: false,
      }),
      { ok: false, status: 403, error: 'Forbidden' },
    );
  });
});
