// Run from the repository root:
// node --experimental-default-type=module --test tests/filesel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fileSel, setFileSource, setArchiveEntries, validFileKey, show,
  pick, clear, pickAll, step, fileSelectionKey, pickedFiles,
} from '../web/ui/filesel.js';

const a = { kind: 'model', id: 'm1', rel: 'Household/Kitchen/Tools' };
const b = { kind: 'model', id: 'm2', rel: 'Household/Kitchen/Other' };
const fixtures = [
  'Presupported/arm.stl', 'Presupported/leg.stl', 'Unsupported/arm.stl',
  'archive!set.zip', 'note.md',
].map((rel) => ({ rel }));
const reset = (src = a, initial = 'd:') => {
  setFileSource(b, fixtures);
  setFileSource(src, fixtures, initial);
};

test('shown, picked and anchor are separate; both views can subscribe', () => {
  reset(a, 'f:Presupported/arm.stl');
  const seen = [];
  const unsubscribe = fileSel.subscribe((s) => seen.push(s.shown));
  show('f:note.md');
  assert.equal(fileSel.get().shown, 'f:note.md');
  assert.deepEqual(fileSel.get().picked, ['f:Presupported/arm.stl']);
  pick('f:note.md');
  assert.deepEqual(fileSel.get().picked, ['f:note.md']);
  assert.equal(fileSel.get().anchor, 'f:note.md');
  clear();
  assert.deepEqual(fileSel.get().picked, []);
  assert.equal(fileSel.get().shown, 'f:note.md');
  assert.ok(seen.length >= 3);
  unsubscribe();
});

test('Ctrl/Cmd toggles and Shift ranges work forwards and backwards', () => {
  reset();
  const order = [
    'f:note.md', 'f:Presupported/arm.stl',
    'f:Presupported/leg.stl', 'f:Unsupported/arm.stl',
  ];
  pick(order[1]);
  pick(order[3], 'toggle');
  assert.deepEqual(fileSel.get().picked, [order[1], order[3]]);
  pick(order[3], 'toggle');
  assert.deepEqual(fileSel.get().picked, [order[1]]);
  pick(order[1]);
  pick(order[3], 'range', order);
  assert.deepEqual(fileSel.get().picked, order.slice(1, 4));
  assert.equal(fileSel.get().anchor, order[1]);
  pick(order[0], 'range', order);
  assert.deepEqual(fileSel.get().picked, order.slice(0, 2));
  pick(order[3], 'range', ['f:note.md']);
  assert.deepEqual(fileSel.get().picked, [order[3]]);
});

test('selected folders preserve their structure without duplicate children', () => {
  reset();
  pick('d:Presupported');
  pick('f:Presupported/arm.stl', 'toggle');
  pick('f:note.md', 'toggle');
  assert.deepEqual(pickedFiles(), { files: ['note.md', 'Presupported'], entries: [] });
  pick('d:');
  assert.deepEqual(pickedFiles(), {
    files: ['archive!set.zip', 'note.md', 'Presupported', 'Unsupported'], entries: [],
  });
});

test('ZIP selections can include entries or directories, leaving the ZIP intact', () => {
  reset();
  setArchiveEntries('archive!set.zip', [
    { name: 'parts/arm.stl' }, { name: 'parts/leg.stl' }, { name: 'docs/readme.md' },
  ]);
  pick('z:archive!set.zip!parts/');
  assert.deepEqual(pickedFiles(), {
    files: [],
    entries: [
      { file: 'archive!set.zip', entry: 'parts/arm.stl' },
      { file: 'archive!set.zip', entry: 'parts/leg.stl' },
    ],
  });
  pick('z:archive!set.zip!parts/arm.stl', 'toggle');
  assert.equal(pickedFiles().entries.length, 2);
  pick('f:archive!set.zip', 'toggle');
  assert.deepEqual(pickedFiles(), { files: ['archive!set.zip'], entries: [] });
});

test('unsafe or malformed paths cannot enter the selection', () => {
  reset();
  for (const key of [
    'f:../oops', 'd:/absolute', 'z:bad.zip!../../evil',
    'f:foo\\bar', 'z:archive!set.zip!', 'f:',
  ]) {
    assert.equal(validFileKey(key), false, key);
    pick(key);
  }
  assert.deepEqual(fileSel.get().picked, ['d:']);
});

test('a new model resets selection, while refreshing the same one preserves it', () => {
  reset(a);
  pick('f:note.md');
  setFileSource(a, fixtures);
  assert.deepEqual(fileSel.get().picked, ['f:note.md']);
  setFileSource(b, fixtures);
  assert.deepEqual(fileSel.get().picked, ['d:']);
  assert.equal(fileSel.get().src.id, 'm2');
});

test('keyboard arrows, Shift range, Ctrl+A and Escape share selection state', () => {
  reset();
  const order = ['f:note.md', 'f:Presupported/arm.stl', 'f:Unsupported/arm.stl'];
  pick(order[0]);
  assert.equal(fileSelectionKey({
    key: 'ArrowDown', shiftKey: false, ctrlKey: false, metaKey: false,
  }, order), true);
  assert.deepEqual(fileSel.get().picked, [order[1]]);
  assert.equal(fileSelectionKey({
    key: 'ArrowDown', shiftKey: true, ctrlKey: false, metaKey: false,
  }, order), true);
  assert.deepEqual(fileSel.get().picked, order.slice(1));
  pickAll(order);
  assert.deepEqual(fileSel.get().picked, order);
  assert.equal(fileSelectionKey({ key: 'Escape' }, order), true);
  assert.deepEqual(fileSel.get().picked, []);
  assert.equal(fileSelectionKey({ key: 'Enter' }, order), false);
  step(-1, order);
  assert.equal(fileSel.get().shown, order[1]);
});
