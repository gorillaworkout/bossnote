// Self-check for the voice→task parsing logic. Run: node tests/parse-task.test.mjs
// Mirrors parseTask() in src/lib/ai.ts — the part most likely to break on model drift.

import assert from 'node:assert';

function parseTask(raw, fallbackTranscript = '') {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const strArray = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim() !== '') : [];

  try {
    const p = JSON.parse(slice);
    const transcript = typeof p.transcript === 'string' && p.transcript.trim() ? p.transcript.trim() : fallbackTranscript;
    return {
      transcript,
      title: (typeof p.title === 'string' && p.title.trim() ? p.title : transcript).slice(0, 120) || 'Voice Task',
      priority: p.priority === 'high' || p.priority === 'low' ? p.priority : 'medium',
      deadline: typeof p.deadline === 'string' && p.deadline.trim() ? p.deadline : null,
      summary: typeof p.summary === 'string' ? p.summary.trim() : '',
      steps: strArray(p.steps),
      deliverables: strArray(p.deliverables),
      questions: strArray(p.questions),
    };
  } catch {
    const body = cleaned || fallbackTranscript;
    return { transcript: body, title: body.slice(0, 120) || 'Voice Task', priority: 'medium',
             deadline: null, summary: '', steps: [], deliverables: [], questions: [] };
  }
}

// 1. Clean JSON
{
  const r = parseTask(JSON.stringify({
    transcript: 'Bayu tolong bikin konten IG', title: 'Bikin konten IG promo',
    priority: 'high', deadline: '2026-08-12T17:00:00+07:00', summary: 'Tiga konten.',
    steps: ['Riset', 'Desain'], deliverables: ['3 post'], questions: ['Budget?'],
  }));
  assert.equal(r.title, 'Bikin konten IG promo');
  assert.equal(r.priority, 'high');
  assert.deepEqual(r.steps, ['Riset', 'Desain']);
  assert.equal(r.questions.length, 1);
}

// 2. Markdown-fenced JSON (very common model behaviour)
{
  const r = parseTask('```json\n{"transcript":"tes","title":"Tes task","priority":"low"}\n```');
  assert.equal(r.title, 'Tes task');
  assert.equal(r.priority, 'low');
  assert.deepEqual(r.steps, []);
}

// 3. Prose leaking around the JSON object
{
  const r = parseTask('Tentu! Ini hasilnya:\n{"transcript":"a","title":"B"}\nSemoga membantu.');
  assert.equal(r.title, 'B');
}

// 4. Invalid priority falls back to medium; nulls tolerated
{
  const r = parseTask('{"transcript":"x","title":"T","priority":"URGENT!!","deadline":"","steps":null}');
  assert.equal(r.priority, 'medium');
  assert.equal(r.deadline, null);
  assert.deepEqual(r.steps, []);
}

// 5. Non-JSON prose is preserved as transcript, never lost
{
  const r = parseTask('Boss minta bikin laporan penjualan bulan ini.');
  assert.match(r.transcript, /laporan penjualan/);
  assert.match(r.title, /laporan penjualan/);
}

// 6. Junk entries filtered out of arrays
{
  const r = parseTask('{"transcript":"x","title":"T","steps":["ok","","  ",5,null]}');
  assert.deepEqual(r.steps, ['ok']);
}

// 7. Long titles clamped to the DB-safe length
{
  const r = parseTask(JSON.stringify({ transcript: 'x', title: 'A'.repeat(300) }));
  assert.equal(r.title.length, 120);
}

// 8. mimeType -> gateway format normalisation
{
  const fmt = (m) => (m.split(';')[0].split('/')[1] || 'webm').toLowerCase();
  assert.equal(fmt('audio/webm;codecs=opus'), 'webm');
  assert.equal(fmt('audio/mp4'), 'mp4');
  assert.equal(fmt(''), 'webm');
}

console.log('parse-task: all assertions passed');
