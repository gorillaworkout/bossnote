import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOW_VOICE_CONFIDENCE,
  VOICE_UNCLEAR_CODE,
  VOICE_UNCLEAR_ERROR,
  assessVoiceClarity,
  hasUsableTaskText,
  isPlaceholderTitle,
  isUnclearTranscript,
  isVoiceUnclearError,
  parseConfirmUnclearFlag,
  resolveVoiceCreateTitles,
  shouldInsertVoiceTask,
  voiceUnclearPayload,
} from './voice-clarity.ts';

describe('isPlaceholderTitle', () => {
  it('flags the fallbacks the create API used to insert', () => {
    assert.equal(isPlaceholderTitle('Voice note — not transcribed yet'), true);
    assert.equal(isPlaceholderTitle('Voice note unclear'), true);
    assert.equal(isPlaceholderTitle('New task: voice note unclear'), true);
    assert.equal(isPlaceholderTitle('Voice Task'), true);
    assert.equal(isPlaceholderTitle('untitled'), true);
    assert.equal(isPlaceholderTitle(''), true);
    assert.equal(isPlaceholderTitle('   '), true);
  });

  it('does not flag a real imperative title', () => {
    assert.equal(isPlaceholderTitle('Review the Q3 proposal'), false);
    assert.equal(isPlaceholderTitle('Tolong follow up vendor'), false);
    assert.equal(isPlaceholderTitle('Clarify the requirements doc'), false);
  });
});

describe('isUnclearTranscript / hasUsableTaskText', () => {
  it('treats empty and [unclear audio] as unusable', () => {
    assert.equal(isUnclearTranscript(''), true);
    assert.equal(isUnclearTranscript('[unclear audio]'), true);
    assert.equal(isUnclearTranscript('[unclear]'), true);
    assert.equal(isUnclearTranscript('unclear audio'), true);
    assert.equal(hasUsableTaskText('[unclear audio]'), false);
    assert.equal(hasUsableTaskText('ok'), false);
  });

  it('accepts a real spoken line in English or Indonesian', () => {
    assert.equal(isUnclearTranscript('Please review the proposal tomorrow'), false);
    assert.equal(hasUsableTaskText('Please review the proposal tomorrow'), true);
    assert.equal(hasUsableTaskText('Tolong review proposal'), true);
  });
});

describe('assessVoiceClarity', () => {
  it('rejects AI failures with no confirm option', () => {
    const failed = assessVoiceClarity(null, 'Gateway 500: timeout');
    assert.equal(failed.unclear, true);
    assert.equal(failed.confirmable, false);
    assert.equal(failed.reason, 'ai_failed');
    assert.equal(shouldInsertVoiceTask(failed, false), false);
    assert.equal(shouldInsertVoiceTask(failed, true), false);
  });

  it('rejects empty transcript / placeholder titles without auto-insert', () => {
    const empty = assessVoiceClarity({ title: 'Voice note — not transcribed yet', transcript: '' });
    assert.equal(empty.unclear, true);
    assert.equal(empty.confirmable, false);
    assert.equal(shouldInsertVoiceTask(empty, false), false);
    assert.equal(shouldInsertVoiceTask(empty, true), false);

    const modelUnclear = assessVoiceClarity({
      title: 'Voice note unclear',
      transcript: '[unclear audio]',
    });
    assert.equal(modelUnclear.unclear, true);
    assert.equal(modelUnclear.confirmable, false);
    assert.equal(shouldInsertVoiceTask(modelUnclear, true), false);
  });

  it('allows confirm only when a usable transcript or title exists', () => {
    const weak = assessVoiceClarity({
      title: 'Voice note unclear',
      transcript: 'Remind Bayu about the vendor meeting tomorrow',
    });
    assert.equal(weak.unclear, true);
    assert.equal(weak.confirmable, true);
    assert.equal(shouldInsertVoiceTask(weak, false), false);
    assert.equal(shouldInsertVoiceTask(weak, true), true);
  });

  it('lets a clear bilingual result through without confirm', () => {
    const clear = assessVoiceClarity({
      title: 'Review the Q3 proposal',
      title_id: 'Review proposal Q3',
      transcript: 'Please review the Q3 proposal by tomorrow',
      transcript_id: 'Tolong review proposal Q3 besok',
    });
    assert.equal(clear.unclear, false);
    assert.equal(clear.confirmable, false);
    assert.equal(shouldInsertVoiceTask(clear, false), true);
  });

  it('treats an explicit low confidence score as unclear but confirmable when text is usable', () => {
    const low = assessVoiceClarity({
      title: 'Maybe follow up later',
      transcript: 'Maybe follow up later with the vendor',
      confidence: LOW_VOICE_CONFIDENCE - 0.1,
    });
    assert.equal(low.unclear, true);
    assert.equal(low.reason, 'low_confidence');
    assert.equal(low.confirmable, true);
    assert.equal(shouldInsertVoiceTask(low, false), false);
    assert.equal(shouldInsertVoiceTask(low, true), true);
  });
});

describe('voiceUnclearPayload / isVoiceUnclearError', () => {
  it('builds the machine-readable 400 and detects it', () => {
    const clarity = assessVoiceClarity(null, 'Gateway 502');
    const payload = voiceUnclearPayload(clarity, 'Gateway 502');
    assert.equal(payload.code, VOICE_UNCLEAR_CODE);
    assert.equal(payload.error, VOICE_UNCLEAR_ERROR);
    assert.equal(payload.confirmable, false);
    assert.equal(payload.ai_error, 'Gateway 502');
    assert.equal(isVoiceUnclearError(payload), true);
    assert.equal(isVoiceUnclearError({ error: VOICE_UNCLEAR_ERROR }), true);
    assert.equal(isVoiceUnclearError({ code: 'assignee_required' }), false);
    assert.equal(isVoiceUnclearError(null), false);
  });
});

describe('parseConfirmUnclearFlag / resolveVoiceCreateTitles', () => {
  it('parses form and JSON confirm flags', () => {
    assert.equal(parseConfirmUnclearFlag('1'), true);
    assert.equal(parseConfirmUnclearFlag('true'), true);
    assert.equal(parseConfirmUnclearFlag(true), true);
    assert.equal(parseConfirmUnclearFlag(''), false);
    assert.equal(parseConfirmUnclearFlag('0'), false);
  });

  it('replaces a placeholder title with the transcript when keeping a draft', () => {
    const resolved = resolveVoiceCreateTitles(
      {
        title: 'Voice note unclear',
        title_id: 'Voice note unclear',
        transcript: 'Remind Bayu about the vendor meeting tomorrow',
        transcript_id: 'Ingatkan Bayu soal meeting vendor besok',
      },
      true,
    );
    assert.equal(resolved.title, 'Remind Bayu about the vendor meeting tomorrow');
    assert.equal(resolved.titleId, 'Ingatkan Bayu soal meeting vendor besok');
  });

  it('keeps a real AI title when not confirming a draft', () => {
    const resolved = resolveVoiceCreateTitles(
      { title: 'Review the Q3 proposal', title_id: 'Review proposal Q3' },
      false,
    );
    assert.equal(resolved.title, 'Review the Q3 proposal');
    assert.equal(resolved.titleId, 'Review proposal Q3');
  });
});
