import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTypedTaskFields } from './typed-task.ts';
import {
  buildMonthGrid,
  formatDeadlineLabel,
  formatMonthTitle,
  parseIsoDate,
  popupPosition,
  shiftMonth,
  toIsoDate,
} from './deadline-calendar.ts';

describe('deadline calendar', () => {
  it('parses and formats YYYY-MM-DD without shifting the day', () => {
    assert.deepEqual(parseIsoDate('2026-10-06'), { year: 2026, month: 10, day: 6 });
    assert.deepEqual(parseIsoDate(' 2026-10-06 '), { year: 2026, month: 10, day: 6 });
    assert.equal(parseIsoDate(''), null);
    assert.equal(parseIsoDate('06/10/2026'), null);
    assert.equal(parseIsoDate('2026-02-31'), null);
    assert.equal(toIsoDate({ year: 2026, month: 10, day: 6 }), '2026-10-06');
    assert.equal(toIsoDate({ year: 2026, month: 1, day: 9 }), '2026-01-09');
    assert.equal(formatDeadlineLabel('2026-10-06'), '6 Oct 2026');
    assert.equal(formatDeadlineLabel(''), '');
    assert.equal(formatMonthTitle(2026, 10), 'October 2026');
  });

  it('builds a Monday-start month grid that includes leading and trailing days', () => {
    const october = buildMonthGrid(2026, 10);
    assert.equal(october.length, 42);
    assert.deepEqual(october[0], { iso: '2026-09-28', day: 28, inMonth: false });
    const first = october.find((cell) => cell.iso === '2026-10-01');
    assert.deepEqual(first, { iso: '2026-10-01', day: 1, inMonth: true });
    const last = october.find((cell) => cell.iso === '2026-10-31');
    assert.deepEqual(last, { iso: '2026-10-31', day: 31, inMonth: true });
    assert.equal(october.filter((cell) => cell.inMonth).length, 31);

    const leap = buildMonthGrid(2024, 2);
    assert.equal(leap.some((cell) => cell.iso === '2024-02-29' && cell.inMonth), true);
    const nonLeap = buildMonthGrid(2023, 2);
    assert.equal(nonLeap.some((cell) => cell.inMonth && cell.day === 29), false);
  });

  it('places the calendar popup below the field, or above when the sheet is short', () => {
    const below = popupPosition({
      trigger: { top: 120, bottom: 164, left: 180, right: 340 },
      viewport: { width: 390, height: 844 },
    });
    assert.equal(below.top, 172);
    assert.ok(below.left >= 8);
    assert.ok(below.left + below.width <= 382);

    const above = popupPosition({
      trigger: { top: 700, bottom: 744, left: 40, right: 200 },
      viewport: { width: 390, height: 844 },
      popupHeight: 420,
    });
    assert.ok(above.top < 700);
    assert.ok(above.top >= 8);
  });

  it('steps across year boundaries', () => {
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  });

  it('keeps picked days as YYYY-MM-DD and still allows an empty deadline', () => {
    const picked = buildMonthGrid(2026, 10).find((cell) => cell.iso === '2026-10-06');
    assert.ok(picked);
    const saved = buildTypedTaskFields({ text: 'Review the proposal', deadline: picked.iso });
    assert.equal(saved?.deadline, '2026-10-06');
    const cleared = buildTypedTaskFields({ text: 'Review the proposal', deadline: '' });
    assert.equal(cleared?.deadline, null);
  });
});
