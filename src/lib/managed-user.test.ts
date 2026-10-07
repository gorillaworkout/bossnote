import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_USER_ID } from './roles.ts';
import {
  DEPARTMENT_IN_USE_ERROR,
  deleteUserBlock,
  normalizeDepartmentName,
  validateCreateUser,
  validateUpdateUser,
} from './managed-user.ts';

const admin = { id: ADMIN_USER_ID, name: 'Admin', role: 'admin', department_id: null };
const bayu = { id: 'bayu-001', name: 'Bayu', role: 'member', department_id: 'dept-general' };

describe('normalizeDepartmentName', () => {
  it('trims and keeps 1 to 60 characters', () => {
    assert.deepEqual(normalizeDepartmentName('  Sales '), { ok: true, name: 'Sales' });
    assert.deepEqual(normalizeDepartmentName('   '), { ok: false, error: 'Name is required' });
    assert.deepEqual(normalizeDepartmentName('x'.repeat(61)), { ok: false, error: 'Name is too long' });
  });
});

describe('validateCreateUser', () => {
  it('requires boss or staff and a department id', () => {
    assert.deepEqual(
      validateCreateUser({ name: 'Rina', password: 'secret1', role: 'member', department_id: 'dept-sales' }),
      { ok: true, name: 'Rina', password: 'secret1', role: 'member', department_id: 'dept-sales' },
    );
    assert.equal(validateCreateUser({ name: 'Rina', password: 'secret1', role: 'admin', department_id: 'dept-sales' }).ok, false);
    assert.equal(validateCreateUser({ name: 'Rina', password: 'secret1', role: 'boss', department_id: '' }).ok, false);
    assert.equal(validateCreateUser({ name: 'Rina', password: '12345', role: 'member', department_id: 'dept-sales' }).ok, false);
  });
});

describe('validateUpdateUser', () => {
  it('keeps the admin out of a department and requires one for everyone else', () => {
    const adminEdit = validateUpdateUser({
      actorId: ADMIN_USER_ID,
      target: admin,
      body: { name: 'Admin', role: 'member', department_id: 'dept-general' },
    });
    assert.equal(adminEdit.ok, false);

    const cleared = validateUpdateUser({
      actorId: ADMIN_USER_ID,
      target: bayu,
      body: { name: 'Bayu', role: 'member', department_id: '' },
    });
    assert.equal(cleared.ok, false);

    const moved = validateUpdateUser({
      actorId: ADMIN_USER_ID,
      target: bayu,
      body: { name: 'Bayu', role: 'boss', department_id: 'dept-sales' },
    });
    assert.deepEqual(moved, {
      ok: true,
      name: 'Bayu',
      role: 'boss',
      department_id: 'dept-sales',
      lark_open_id: undefined,
    });
  });
});

describe('deleteUserBlock', () => {
  it('blocks self, the admin row, and users who still have tasks or replies', () => {
    assert.equal(DEPARTMENT_IN_USE_ERROR.includes('Move the people'), true);
    assert.deepEqual(deleteUserBlock({ actorId: ADMIN_USER_ID, targetId: ADMIN_USER_ID, taskCount: 0, replyCount: 0 }), {
      status: 400,
      error: 'You cannot delete yourself',
    });
    assert.equal(deleteUserBlock({ actorId: 'other', targetId: ADMIN_USER_ID, taskCount: 0, replyCount: 0 })?.error, 'The admin account cannot be deleted.');
    assert.equal(deleteUserBlock({ actorId: ADMIN_USER_ID, targetId: 'bayu-001', taskCount: 1, replyCount: 0 })?.status, 409);
    assert.equal(deleteUserBlock({ actorId: ADMIN_USER_ID, targetId: 'boss-001', taskCount: 0, replyCount: 0 }), null);
  });
});
