import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beginCreateClaim,
  completeCreateClaim,
  releaseCreateClaim,
  resetCreateClaimsForTests,
} from './create-idempotency.ts';

describe('create idempotency', () => {
  it('lets the first claim insert and returns the same task for a replay', () => {
    resetCreateClaimsForTests();
    assert.equal(beginCreateClaim('boss-001', '').status, 'skip');
    assert.deepEqual(beginCreateClaim('boss-001', 'token-1', 1_000), { status: 'fresh' });
    assert.deepEqual(beginCreateClaim('boss-001', 'token-1', 1_100), { status: 'in_flight' });
    completeCreateClaim('boss-001', 'token-1', 'task-9', 1_200);
    assert.deepEqual(beginCreateClaim('boss-001', 'token-1', 1_300), { status: 'replay', taskId: 'task-9' });
  });

  it('releases a failed attempt so the same token can create later', () => {
    resetCreateClaimsForTests();
    beginCreateClaim('boss-001', 'token-2', 1_000);
    releaseCreateClaim('boss-001', 'token-2');
    assert.deepEqual(beginCreateClaim('boss-001', 'token-2', 1_100), { status: 'fresh' });
  });

  it('does not treat another user token as the same create', () => {
    resetCreateClaimsForTests();
    beginCreateClaim('boss-001', 'token-3', 1_000);
    completeCreateClaim('boss-001', 'token-3', 'task-3', 1_100);
    assert.deepEqual(beginCreateClaim('bayu-001', 'token-3', 1_200), { status: 'fresh' });
  });
});
