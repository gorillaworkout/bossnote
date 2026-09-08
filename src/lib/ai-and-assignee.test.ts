import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_MODELS,
  DEFAULT_AUDIO_MODEL,
  isRetryableModelError,
  normalizeAudioModel,
  withModelFallback,
} from './ai.ts';
import { resolveAssigneeFromHint } from './assignee.ts';

const MEMBERS = [
  { id: 'bayu-001', name: 'Bayu' },
  { id: 'sandra-001', name: 'Sandra' },
];

describe('normalizeAudioModel', () => {
  it('maps exact Gemini 3.5 and any *3.5* slug to 3.7', () => {
    assert.equal(normalizeAudioModel('ag/gemini-3.5-flash-high'), DEFAULT_AUDIO_MODEL);
    assert.equal(normalizeAudioModel('ag/gemini-3.5-pro'), DEFAULT_AUDIO_MODEL);
    assert.equal(normalizeAudioModel('cursor/gemini-3.5-flash-high'), DEFAULT_AUDIO_MODEL);
  });

  it('keeps known audio models and defaults unknown / empty values', () => {
    assert.equal(normalizeAudioModel('ag/gemini-3.7-flash-high'), 'ag/gemini-3.7-flash-high');
    assert.equal(normalizeAudioModel('ag/gemini-3.6-flash-medium'), 'ag/gemini-3.6-flash-medium');
    assert.equal(normalizeAudioModel('totally-unknown'), DEFAULT_AUDIO_MODEL);
    assert.equal(normalizeAudioModel(''), DEFAULT_AUDIO_MODEL);
    assert.equal(normalizeAudioModel(null), DEFAULT_AUDIO_MODEL);
    assert.ok((AUDIO_MODELS as readonly string[]).includes(DEFAULT_AUDIO_MODEL));
    assert.ok(!(AUDIO_MODELS as readonly string[]).includes('ag/gemini-3.5-flash-high'));
  });
});

describe('isRetryableModelError / withModelFallback', () => {
  it('retries once on unavailable / 3.5 / model 4xx, then uses the default', async () => {
    assert.equal(
      isRetryableModelError(new Error('Gemini 3.5 Flash is no longer available. Please switch to Gemini 3.7 Flash')),
      true,
    );
    assert.equal(isRetryableModelError(new Error('Gateway 400: {"error":"unknown model"}')), true);
    assert.equal(isRetryableModelError(new Error('Gateway 401: invalid api key')), false);

    const used: string[] = [];
    const result = await withModelFallback('ag/gemini-3.5-flash-high', async (model) => {
      used.push(model);
      if (model !== DEFAULT_AUDIO_MODEL) {
        throw new Error('Gemini 3.5 Flash is no longer available');
      }
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.deepEqual(used, [DEFAULT_AUDIO_MODEL]);
  });

  it('retries a live listed model once when the provider says it is gone', async () => {
    const used: string[] = [];
    const result = await withModelFallback('ag/gemini-3-flash', async (model) => {
      used.push(model);
      if (model === 'ag/gemini-3-flash') {
        throw new Error('Gateway 404: model is not available');
      }
      return 'recovered';
    });
    assert.equal(result, 'recovered');
    assert.deepEqual(used, ['ag/gemini-3-flash', DEFAULT_AUDIO_MODEL]);
  });
});

describe('resolveAssigneeFromHint', () => {
  it('matches spoken Indonesian / English hints to Bayu or Sandra', () => {
    assert.equal(resolveAssigneeFromHint('Sandra', MEMBERS)?.id, 'sandra-001');
    assert.equal(resolveAssigneeFromHint('untuk Sandra', MEMBERS)?.id, 'sandra-001');
    assert.equal(resolveAssigneeFromHint('SANDRA tolong', MEMBERS)?.id, 'sandra-001');
    assert.equal(resolveAssigneeFromHint('Bayu', MEMBERS)?.id, 'bayu-001');
    assert.equal(resolveAssigneeFromHint('untuk bayu', MEMBERS)?.id, 'bayu-001');
  });

  it('returns null when the speaker does not name a member', () => {
    assert.equal(resolveAssigneeFromHint(null, MEMBERS), null);
    assert.equal(resolveAssigneeFromHint('please handle this', MEMBERS), null);
    assert.equal(resolveAssigneeFromHint('Ian', MEMBERS), null);
  });
});
