import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deleteTaskImage, readTaskImage, saveTaskImage } from './image-storage.ts';
import {
  sniffImageExt,
  taskImageSrc,
  validateTaskImageBuffer,
  validateTaskImageInput,
} from './task-image.ts';
import { assignmentPushUrl, canViewTask } from './task-access.ts';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
let tmpDir = '';

afterEach(() => {
  delete process.env.IMAGE_UPLOAD_DIR;
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = '';
});

describe('task screenshots', () => {
  it('sniffs real image bytes and rejects html renamed as jpg', () => {
    assert.equal(sniffImageExt(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), 'jpg');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(sniffImageExt(png), 'png');
    assert.equal(sniffImageExt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.throws(() => validateTaskImageBuffer(Buffer.from('not-an-image')), /JPEG, PNG/);
    assert.throws(() => validateTaskImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), 4), /too large/);
  });

  it('accepts a jpeg or png chosen from the phone library', () => {
    assert.equal(validateTaskImageInput({ size: 1200, type: 'image/jpeg', name: 'IMG_2048.JPG' }), null);
    assert.equal(validateTaskImageInput({ size: 10, type: 'image/svg+xml', name: 'x.svg' }), 'Use a JPEG, PNG, or WebP screenshot.');
    assert.match(validateTaskImageInput({ size: 0, type: 'image/png', name: 'a.png' }) || '', /empty/);
  });

  it('stores one screenshot per task and replaces the previous file', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bossnote-img-'));
    process.env.IMAGE_UPLOAD_DIR = tmpDir;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00]);
    const saved = saveTaskImage(TASK_ID, jpeg);
    assert.equal(saved.publicPath, `/api/tasks/${TASK_ID}/image`);
    assert.equal(fs.existsSync(path.join(tmpDir, `${TASK_ID}.jpg`)), true);

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    saveTaskImage(TASK_ID, png);
    assert.equal(fs.existsSync(path.join(tmpDir, `${TASK_ID}.jpg`)), false);
    const read = readTaskImage(TASK_ID);
    assert.equal(read?.ext, 'png');
    assert.equal(read?.contentType, 'image/png');
    deleteTaskImage(TASK_ID);
    assert.equal(readTaskImage(TASK_ID), null);
  });

  it('cache-busts the boss preview when the photo is replaced', () => {
    assert.equal(
      taskImageSrc({ id: TASK_ID, image_path: `/api/tasks/${TASK_ID}/image`, updated_at: '2026-10-05T00:00:00.000Z' }),
      `/api/tasks/${TASK_ID}/image?v=2026-10-05T00%3A00%3A00.000Z`,
    );
    assert.equal(taskImageSrc({ id: TASK_ID, image_path: null }), '');
  });
});

describe('task visibility and push link', () => {
  const task = { assignee_id: 'boss-001', created_by: 'bayu-001' };

  it('lets the boss and the creator open an assigned task', () => {
    assert.equal(canViewTask({ id: 'boss-001', role: 'boss' }, task), true);
    assert.equal(canViewTask({ id: 'prista-001', role: 'boss' }, task), true);
    assert.equal(canViewTask({ id: 'bayu-001', role: 'member' }, task), true);
    assert.equal(canViewTask({ id: 'sandra-001', role: 'member' }, task), false);
  });

  it('opens the assigned task from a phone notification', () => {
    assert.equal(assignmentPushUrl(TASK_ID), `/dashboard?task=${TASK_ID}`);
    assert.equal(assignmentPushUrl(''), '/dashboard');
  });
});
