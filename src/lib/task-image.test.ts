import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendTaskImage, deleteTaskImage, readTaskImage, readTaskImageAt, saveTaskImage } from './image-storage.ts';
import { deleteTaskImageFiles, doneTaskPurgeSql, isOwnedTaskImage, RETENTION_MONTHS } from '../../scripts/cleanup-old-tasks.mjs';
import {
  DONE_TASK_RETENTION_MONTHS,
  imageIndexFromFilename,
  isTaskImageFilename,
  nextImageIndex,
  sniffImageExt,
  taskImageCompressSteps,
  taskImagePaths,
  taskImageSources,
  taskImageSrc,
  validateTaskImageBuffer,
  validateTaskImageInput,
} from './task-image.ts';
import { assignmentPushUrl, canViewTask } from './task-access.ts';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
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
    assert.equal(validateTaskImageInput({ size: 12 * 1024 * 1024, type: 'image/jpeg', name: 'IMG_9.JPG' }), null);
  });

  it('compresses oversized photos and leaves sharp screenshots alone', () => {
    assert.equal(taskImageCompressSteps({ size: 1200, heic: false }), null);
    const medium = taskImageCompressSteps({ size: 4_000_000, heic: false });
    assert.equal(medium?.[0]?.maxSide, 2000);
    assert.equal(medium?.[0]?.quality, 0.85);
    assert.equal(medium?.length, 1);
    const huge = taskImageCompressSteps({ size: 12 * 1024 * 1024, heic: false });
    assert.deepEqual(huge?.map((step) => step.maxSide), [2000, 1600, 1280]);
    assert.equal(taskImageCompressSteps({ size: 800_000, heic: true })?.length, 1);
    assert.equal(taskImageCompressSteps({ size: 9 * 1024 * 1024, heic: true })?.length, 3);
  });

  it('stores several screenshots and still reads a legacy single file', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bossnote-img-'));
    process.env.IMAGE_UPLOAD_DIR = tmpDir;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    fs.writeFileSync(path.join(tmpDir, `${TASK_ID}.jpg`), jpeg);
    assert.equal(readTaskImage(TASK_ID)?.ext, 'jpg');

    const first = appendTaskImage(TASK_ID, png, [`/api/tasks/${TASK_ID}/image`]);
    const second = appendTaskImage(TASK_ID, jpeg, [`/api/tasks/${TASK_ID}/image`, first.publicPath]);
    assert.equal(first.publicPath, `/api/tasks/${TASK_ID}/image/1`);
    assert.equal(second.publicPath, `/api/tasks/${TASK_ID}/image/2`);
    assert.equal(fs.existsSync(path.join(tmpDir, `${TASK_ID}.jpg`)), true);
    assert.equal(readTaskImageAt(TASK_ID, 1)?.ext, 'png');
    assert.equal(readTaskImageAt(TASK_ID, 2)?.ext, 'jpg');

    saveTaskImage(TASK_ID, png, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, `${TASK_ID}.jpg`)), false);
    assert.equal(fs.existsSync(path.join(tmpDir, `${TASK_ID}-0.png`)), true);
    assert.equal(readTaskImage(TASK_ID)?.ext, 'png');

    deleteTaskImage(TASK_ID);
    assert.equal(readTaskImage(TASK_ID), null);
    assert.equal(readTaskImageAt(TASK_ID, 1), null);
    assert.equal(fs.existsSync(path.join(tmpDir, `${TASK_ID}-2.jpg`)), false);
    assert.equal(fs.readdirSync(tmpDir).length, 0);
  });

  it('refuses a ninth screenshot and leaves the eight files in place', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bossnote-img-cap-'));
    process.env.IMAGE_UPLOAD_DIR = tmpDir;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00]);
    let paths: string[] = [];
    for (let i = 0; i < 8; i++) {
      const saved = appendTaskImage(TASK_ID, jpeg, paths);
      paths = [...paths, saved.publicPath];
    }
    assert.equal(paths.length, 8);
    assert.equal(fs.readdirSync(tmpDir).length, 8);
    assert.throws(() => appendTaskImage(TASK_ID, jpeg, paths), /8 screenshots/);
    assert.equal(fs.readdirSync(tmpDir).length, 8);
  });

  it('keeps the first photo and a count for the gallery', () => {
    const paths = [`/api/tasks/${TASK_ID}/image`, `/api/tasks/${TASK_ID}/image/1`];
    assert.deepEqual(taskImagePaths({ image_paths: paths, image_path: paths[0] }), paths);
    assert.deepEqual(taskImagePaths({ image_path: paths[0], image_paths: [] }), [paths[0]]);
    assert.deepEqual(taskImagePaths({ image_paths: JSON.stringify(paths) }), paths);
    const sources = taskImageSources({ id: TASK_ID, image_paths: paths, updated_at: '2026-10-05T00:00:00.000Z' });
    assert.equal(sources.length, 2);
    assert.match(sources[0], /^\/api\/tasks\/.+\/image\?v=/);
    assert.match(sources[1], /\/image\/1\?v=/);
    assert.equal(
      taskImageSrc({ id: TASK_ID, image_path: `/api/tasks/${TASK_ID}/image`, updated_at: '2026-10-05T00:00:00.000Z' }),
      `/api/tasks/${TASK_ID}/image?v=2026-10-05T00%3A00%3A00.000Z`,
    );
    assert.equal(taskImageSrc({ id: TASK_ID, image_path: null }), '');
    assert.equal(nextImageIndex(TASK_ID, paths, [`${TASK_ID}.jpg`, `${TASK_ID}-1.png`]), 2);
  });
});

describe('done-task purge deletes image files', () => {
  it('matches the 6 month done-task rule and the filename check', () => {
    assert.equal(RETENTION_MONTHS, 6);
    assert.equal(DONE_TASK_RETENTION_MONTHS, 6);
    assert.match(doneTaskPurgeSql(), /status = 'done'/);
    assert.match(doneTaskPurgeSql(), /INTERVAL '6 months'/);
    const names = [
      `${TASK_ID}.jpg`,
      `${TASK_ID}-0.png`,
      `${TASK_ID}-1.jpeg`,
      `${TASK_ID}-12.webp`,
      `${TASK_ID}.heic`,
      `${TASK_ID}-2.gif`,
      `${OTHER_ID}.jpg`,
      `${TASK_ID}-notes.txt`,
      `${TASK_ID}-1.jpg.exe`,
      `${TASK_ID}-100.jpg`,
    ];
    for (const name of names) {
      assert.equal(isOwnedTaskImage(TASK_ID, name), isTaskImageFilename(TASK_ID, name), name);
    }
    assert.equal(imageIndexFromFilename(TASK_ID, `${TASK_ID}.jpg`), 0);
    assert.equal(imageIndexFromFilename(TASK_ID, `${TASK_ID}-1.png`), 1);
  });

  it('removes every screenshot for the purged task and leaves other files', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bossnote-purge-'));
    const keep = [
      `${OTHER_ID}.jpg`,
      `${OTHER_ID}-1.png`,
      `${TASK_ID}-notes.txt`,
      'readme.txt',
    ];
    const drop = [
      `${TASK_ID}.jpg`,
      `${TASK_ID}-0.png`,
      `${TASK_ID}-1.jpg`,
      `${TASK_ID}-2.webp`,
    ];
    for (const name of [...keep, ...drop]) fs.writeFileSync(path.join(tmpDir, name), Buffer.from([0xff, 0xd8, 0xff]));

    const removed = deleteTaskImageFiles(tmpDir, TASK_ID);
    assert.deepEqual(removed.sort(), drop.sort());
    for (const name of drop) assert.equal(fs.existsSync(path.join(tmpDir, name)), false);
    for (const name of keep) assert.equal(fs.existsSync(path.join(tmpDir, name)), true);

    process.env.IMAGE_UPLOAD_DIR = tmpDir;
    fs.writeFileSync(path.join(tmpDir, `${OTHER_ID}-3.gif`), Buffer.from([0x47, 0x49, 0x46]));
    deleteTaskImage(OTHER_ID);
    assert.equal(fs.existsSync(path.join(tmpDir, `${OTHER_ID}.jpg`)), false);
    assert.equal(fs.existsSync(path.join(tmpDir, `${OTHER_ID}-1.png`)), false);
    assert.equal(fs.existsSync(path.join(tmpDir, `${OTHER_ID}-3.gif`)), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'readme.txt')), true);
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
