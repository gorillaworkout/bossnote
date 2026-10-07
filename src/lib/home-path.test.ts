import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homePathForRole } from './home-path.ts';

describe('homePathForRole', () => {
  it('sends admin to departments and everyone else to the board', () => {
    assert.equal(homePathForRole('admin'), '/dashboard/departments');
    assert.equal(homePathForRole('boss'), '/dashboard');
    assert.equal(homePathForRole('member'), '/dashboard');
    assert.equal(homePathForRole(null), '/dashboard');
  });
});
