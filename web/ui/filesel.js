// Shared selection for a model's files. The file panel and contents view use
// the same store; the library browser's model selection remains separate.
//
// Keys relative to the model folder: d:<folder> (d: means the model's root),
// f:<file>, z:<zip file>!<entry inside ZIP>. ZIP folders end in /.
// The caller supplies the displayed row order for Shift selection.
import { createStore } from "../lib/store.js";

export const fileSel = createStore({ src: null, shown: null, picked: [], anchor: null });

let inventory = [];
const archives = new Map();
const unique = (xs) => [...new Set(xs)];

const safeRel = (rel, allowEmpty = false) => typeof rel === "string" &&
  (allowEmpty || rel.length > 0) && !rel.startsWith("/") && !rel.includes("\\") &&
  !rel.includes("\0") && rel.split("/").every((part, i, all) =>
    (allowEmpty && part === "" && all.length === 1) ||
    (part === "" && i === all.length - 1) || (part !== "" && part !== "." && part !== ".."));

/** Split an archive key using known archive paths, which may themselves contain !. */
function zipParts(key) {
  const rest = key.slice(2);
  const archive = inventory.map((f) => f.rel)
    .filter((rel) => /\.zip$/i.test(rel) && rest.startsWith(rel + "!"))
    .sort((a, b) => b.length - a.length)[0];
  const cut = archive ? archive.length : rest.indexOf("!");
  if (cut < 1) return null;
  const file = archive || rest.slice(0, cut);
  const entry = rest.slice(cut + 1);
  return safeRel(file) && /\.zip$/i.test(file) && safeRel(entry) ? { file, entry } : null;
}

/** Reject malformed or unsafe keys before they reach extraction. */
export function validFileKey(key) {
  if (typeof key !== "string") return false;
  if (key.startsWith("d:")) return safeRel(key.slice(2), true);
  if (key.startsWith("f:")) return safeRel(key.slice(2)) && !key.endsWith("/");
  return key.startsWith("z:") && !!zipParts(key);
}

/** Set up one model and its unfiltered file inventory. */
export function setFileSource(src, files = [], initial = "d:") {
  if (!src || src.kind !== "model" || !src.id || typeof src.rel !== "string") {
    throw new Error("File selection requires a model source");
  }
  const prev = fileSel.get();
  const changed = prev.src?.id !== src.id || prev.src?.rel !== src.rel;
  inventory = (files || []).filter((f) => f && safeRel(f.rel) && !f.rel.endsWith("/"));
  if (changed) archives.clear();
  const nextSrc = { kind: "model", id: src.id, rel: src.rel };
  if (changed) {
    const first = validFileKey(initial) ? initial : "d:";
    fileSel.set({ src: nextSrc, shown: first, picked: [first], anchor: first });
  } else {
    // A refresh of the same model must not reset its current selection.
    fileSel.set({ src: nextSrc });
  }
}

/** Cache the entries provided by model_zip when a ZIP is opened. */
export function setArchiveEntries(file, entries = []) {
  if (!safeRel(file) || !/\.zip$/i.test(file)) return;
  archives.set(file, unique((entries || [])
    .map((e) => typeof e === "string" ? e : e?.name)
    .filter((name) => safeRel(name) && !name.endsWith("/"))));
}

/** Change the viewer target, leaving action selection unchanged. */
export function show(key) {
  if (validFileKey(key) && fileSel.get().src) fileSel.set({ shown: key });
}

/** Selection click: one, Ctrl/Cmd toggle or Shift range over caller order. */
export function pick(key, how = "one", order = []) {
  if (!fileSel.get().src || !validFileKey(key)) return;
  const s = fileSel.get();
  if (how === "toggle") {
    const picked = s.picked.includes(key) ? s.picked.filter((k) => k !== key) : [...s.picked, key];
    fileSel.set({ shown: key, picked, anchor: key });
    return;
  }
  if (how === "range" && Array.isArray(order)) {
    const rows = unique(order.filter(validFileKey));
    const from = rows.indexOf(s.anchor), to = rows.indexOf(key);
    if (from >= 0 && to >= 0) {
      fileSel.set({
        shown: key,
        picked: rows.slice(Math.min(from, to), Math.max(from, to) + 1),
        anchor: s.anchor,
      });
      return;
    }
  }
  fileSel.set({ shown: key, picked: [key], anchor: key });
}

/** Escape clears highlights while leaving the currently shown file open. */
export function clear() {
  fileSel.set({ picked: [], anchor: null });
}

/** Ctrl+A selects visible rows (the panel and contents share the result). */
export function pickAll(order) {
  if (!fileSel.get().src || !Array.isArray(order)) return;
  const rows = unique(order.filter(validFileKey));
  const s = fileSel.get();
  fileSel.set({ picked: rows, anchor: rows[0] || null, shown: s.shown });
}

/** Navigate rows with arrows; Shift extends the anchored range. */
export function step(direction, order, extend = false) {
  if (!fileSel.get().src || !Array.isArray(order)) return;
  const rows = unique(order.filter(validFileKey));
  if (!rows.length) return;
  const s = fileSel.get();
  const current = rows.indexOf(s.shown);
  const delta = direction < 0 ? -1 : 1;
  const next = rows[Math.max(0, Math.min(rows.length - 1,
    current < 0 ? (delta > 0 ? 0 : rows.length - 1) : current + delta))];
  if (extend && current >= 0 && s.anchor == null) {
    fileSel.set({ anchor: s.shown });
  }
  pick(next, extend ? "range" : "one", rows);
}

/** Shared keyboard dispatcher. The UI handles preventDefault and focus. */
export function fileSelectionKey(e, order) {
  if (e.key === "Escape") { clear(); return true; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    pickAll(order); return true;
  }
  if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    step(-1, order, e.shiftKey); return true;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    step(1, order, e.shiftKey); return true;
  }
  return false;
}

/**
 * Convert selected keys to the extraction core's { files, entries } contract.
 * Selected folders stay folders, preserving their structure (and empty folders).
 * A selected root expands to its top-level children. Folder/child overlaps and
 * redundant ZIP entries are discarded.
 */
export function pickedFiles() {
  const selected = fileSel.get().picked.filter(validFileKey);
  const files = [];
  const entries = [];
  for (const key of selected) {
    if (key === "d:") {
      for (const f of inventory) files.push(f.rel.split("/")[0]);
    } else if (key.startsWith("d:") || key.startsWith("f:")) {
      files.push(key.slice(2));
    } else {
      const zip = zipParts(key);
      if (!zip) continue;
      if (zip.entry.endsWith("/")) {
        for (const entry of archives.get(zip.file) || []) {
          if (entry.startsWith(zip.entry)) entries.push({ file: zip.file, entry });
        }
      } else {
        entries.push(zip);
      }
    }
  }
  const paths = unique(files).sort((a, b) => a.localeCompare(b));
  const minimal = paths.filter((p) =>
    !paths.some((parent) => parent !== p && p.startsWith(parent + "/")));
  const seen = new Set();
  const cleanEntries = entries.filter(({ file, entry }) => {
    if (minimal.some((path) => path === file || file.startsWith(path + "/"))) return false;
    const id = file + "\0" + entry;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { files: minimal, entries: cleanEntries };
}
