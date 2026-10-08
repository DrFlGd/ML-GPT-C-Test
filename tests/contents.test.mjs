// Run: node --experimental-default-type=module --test tests/contents.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { childrenOf, sortedChildren, childKey, parentKey } from "../web/ui/contents.js";
import { locationFor } from "../web/ui/stage.js";

const files = [
  { rel: "Presupported/Arms/left.stl", kind: "model", size: 8, modified: "2026-10-01T12:00:00Z" },
  { rel: "Presupported/Arms/right.stl", kind: "model", size: 12, modified: "2026-10-02T12:00:00Z" },
  { rel: "Presupported/Helmet.stl", kind: "model", size: 90, modified: "2026-10-03T12:00:00Z" },
  { rel: "Unsupported/head.stl", kind: "model", size: 30 },
  { rel: "photo.png", kind: "image", size: 100 },
  { rel: "readme.md", kind: "doc", size: 20 },
  { rel: "extras!box.zip", kind: "archive", size: 210 },
];

test("top folder shows direct children, folder sizes and file counts", () => {
  const root = childrenOf(files);
  assert.equal(root.length, 5);
  const pre = root.find((r) => r.rel === "Presupported");
  assert.deepEqual(
    { folder: pre.folder, count: pre.count, size: pre.size },
    { folder: true, count: 3, size: 110 },
  );
  const items = childrenOf(files, "Presupported");
  assert.deepEqual(items.map((r) => r.name), ["Arms", "Helmet.stl"]);
  assert.equal(items[0].count, 2);
  assert.equal(items[0].size, 20);
});

test("sort always puts directories first and supports numeric names", () => {
  const children = childrenOf([
    { rel: "A/file.stl", kind: "model", size: 1 },
    { rel: "Set 10/readme.md", kind: "doc", size: 1 },
    { rel: "Set 2/readme.md", kind: "doc", size: 1 },
    { rel: "big.zip", kind: "archive", size: 900 },
  ]);
  assert.deepEqual(sortedChildren(children, "name").map((x) => x.name),
    ["A", "Set 2", "Set 10", "big.zip"]);
  assert.equal(sortedChildren(children, "size")[0].folder, true);
  assert.equal(sortedChildren(children, "size").at(-1).name, "big.zip");
});

test("sort by size, type, and newest with supplied timestamps", () => {
  const rows = childrenOf(files, "Presupported");
  assert.equal(sortedChildren(rows, "size")[0].name, "Arms"); // folders before files
  assert.equal(sortedChildren(rows, "newest")[0].name, "Arms");
  const leaves = childrenOf([
    { rel: "a.txt", size: 3, kind: "doc", modified: "2026-10-01T00:00:00Z" },
    { rel: "b.png", size: 99, kind: "image", modified: "2026-10-03T00:00:00Z" },
    { rel: "c.stl", size: 20, kind: "model", modified: "2026-10-02T00:00:00Z" },
  ]);
  assert.deepEqual(sortedChildren(leaves, "size").map((x) => x.name), ["b.png", "c.stl", "a.txt"]);
  assert.deepEqual(sortedChildren(leaves, "newest").map((x) => x.name), ["b.png", "c.stl", "a.txt"]);
  assert.deepEqual(sortedChildren(leaves, "type").map((x) => x.name), ["a.txt", "b.png", "c.stl"]);
});

test("ZIP entry directories and direct entries retain nested paths", () => {
  const zip = [
    { rel: "Extras/shield.stl", kind: "model", size: 44 },
    { rel: "Extras/thumb.png", kind: "image", size: 20 },
    { rel: "Documentation/guide.md", kind: "doc", size: 9 },
  ];
  const dirs = sortedChildren(childrenOf(zip), "name");
  assert.deepEqual(dirs.map((d) => childKey(d, "extras!box.zip")),
    ["z:extras!box.zip!Documentation/", "z:extras!box.zip!Extras/"]);
  const files = childrenOf(zip, "Extras/");
  assert.deepEqual(files.map((d) => childKey(d, "extras!box.zip")),
    ["z:extras!box.zip!Extras/shield.stl", "z:extras!box.zip!Extras/thumb.png"]);
});

test("breadcrumbs/back navigation reaches model and archive root", () => {
  assert.equal(parentKey("d:Presupported/Arms"), "d:Presupported");
  assert.equal(parentKey("d:Presupported"), "d:");
  assert.equal(parentKey("f:Presupported/Helmet.stl"), "d:Presupported");
  assert.equal(parentKey("f:extras!box.zip"), "d:");
  assert.equal(parentKey("z:extras!box.zip!Extras/shield.stl", files), "z:extras!box.zip!Extras/");
  assert.equal(parentKey("z:extras!box.zip!Extras/", files), "f:extras!box.zip");
  assert.equal(parentKey("z:extras!box.zip!shield.stl", files), "f:extras!box.zip");
});

test("shown file or folder routes to the correct viewer", () => {
  assert.deepEqual(locationFor("d:", files), { type: "folder", folder: "" });
  assert.deepEqual(locationFor("d:Presupported/Arms", files), { type: "folder", folder: "Presupported/Arms" });
  assert.deepEqual(locationFor("f:Presupported/Helmet.stl", files), { type: "file", file: "Presupported/Helmet.stl" });
  assert.deepEqual(locationFor("f:extras!box.zip", files), { type: "zip", archive: "extras!box.zip", folder: "" });
  assert.deepEqual(locationFor("z:extras!box.zip!Extras/", files), { type: "zip", archive: "extras!box.zip", folder: "Extras/" });
  assert.deepEqual(locationFor("z:extras!box.zip!Extras/shield.stl", files), { type: "file", file: "extras!box.zip", entry: "Extras/shield.stl" });
  assert.deepEqual(locationFor("z:not-a.zip!x.stl", files), { type: "missing" });
});

test("explicit empty ZIP directories are visible and safe", () => {
  const zip = childrenOf([{ rel: "Empty/", size: 0 }, { rel: "../escape.stl", size: 1 }]);
  assert.ok(zip.some((r) => r.folder && r.name === "Empty" && r.count === 0));
});
