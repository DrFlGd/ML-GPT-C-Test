// Interface state shared by the islands (sidebar, main view, status bar).
// Preferences persist through the platform's store (the app keeps them on this
// computer; favourites go with the library).
import { createStore } from "../lib/store.js";

export const ui = createStore({
  ready: false,
  route: "home",           // home | browse:<all|unsorted|favs|schema:<id>/<value>…> | settings | import
  library: null,           // the open library's info (path, name, format, read_only)
  libraryError: null,
  recent: [],              // libraries opened before (paths), newest first
  firstRun: false,         // no library was ever opened: ask where it goes
  overview: null,          // library_overview: schemas (with category trees and counts), all, unsorted
  q: "",                   // search text in the browse view (words and typed filters)
  sort: "name",            // name | added | size
  layout: "grid",          // grid | list
  selection: null,         // the model last clicked or moved to (its id): Shift selects from `anchor` to it
  anchor: null,            // where a Shift-click or Shift+arrow run starts
  picked: [],              // the selected models (ids); the details panel shows one, or what several share
  catalogRev: 0,           // bumps when models change (the browse view asks again)
  dialog: null,            // { type: "new-schema" | "edit-model" | "move-models", ... }
  menu: null,              // a right-click or More menu: { x, y, items, from }
  dragging: false,         // files are being dragged over the window from outside
  open: {},                // sidebar tree rows unfolded: { "<schema>/<value>…": true }
  favs: [],
  jobs: [],                // [{ id, label, started, cancel }]
  theme: "system",
  navOpen: false,          // sidebar drawer on small screens
  filePanelOpen: true,     // model file panel collapsed or expanded
  filePanelWidth: 300,     // width in pixels (220..480)
  filePanelView: "folders",// folders | all | type (Grid belongs to the viewer)
  contentsView: "grid",    // grid | list in the viewing area
  contentsSort: "name",    // name | type | size | newest
  partsView: "folders",    // Import's compact file views remain unchanged
  sortView: "folders",     // the sorting workspace: folders | list | grid | category
});

let prefs = null;
const LAYOUT_KEY = "ml-ui";

/** Load saved preferences (call once the platform store exists). */
export function initState(store) {
  prefs = store.prefs;
  const saved = prefs.get(LAYOUT_KEY, {}) || {};
  ui.set({ favs: prefs.get("ml-favs", []) || [], theme: saved.theme || "system", sort: saved.sort || "name", layout: saved.layout || "grid", open: saved.open || {}, filePanelOpen: saved.filePanelOpen !== false, filePanelWidth: Math.max(220, Math.min(480, Number(saved.filePanelWidth) || 300)), filePanelView: ["folders", "all", "type"].includes(saved.filePanelView) ? saved.filePanelView : "folders", contentsView: saved.contentsView === "list" ? "list" : "grid", contentsSort: ["name", "type", "size", "newest"].includes(saved.contentsSort) ? saved.contentsSort : "name", partsView: saved.partsView || "folders", sortView: saved.sortView || "folders" });
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
}

function savePrefs() {
  const s = ui.get();
  prefs?.set(LAYOUT_KEY, { theme: s.theme, sort: s.sort, layout: s.layout, open: s.open, filePanelOpen: s.filePanelOpen, filePanelWidth: s.filePanelWidth, filePanelView: s.filePanelView, contentsView: s.contentsView, contentsSort: s.contentsSort, partsView: s.partsView, sortView: s.sortView });
}

export function setPref(patch) {
  ui.set(patch);
  savePrefs();
}

export const THEMES = [["system", "Follow the system"], ["light", "Light"], ["dark", "Dark"], ["night", "Night (dim, warm, for a dark workshop)"]];

/** The theme in use: light, dark or night ("system" resolves to light or dark). */
export function resolvedTheme() {
  const t = ui.get().theme;
  if (t === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return t;
}
export function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  window.dispatchEvent(new CustomEvent("ml-theme"));
}
/** The top bar's button goes through the same choices as Settings, in order. */
export const nextTheme = (theme) => THEMES[(THEMES.findIndex(([v]) => v === theme) + 1) % THEMES.length][0];
export function cycleTheme() {
  setTheme(nextTheme(ui.get().theme));
}
export function setTheme(theme) {
  setPref({ theme });
  applyTheme();
}

let jobSeq = 0;
/** Background work shown in the status bar. Returns a function that removes it;
 *  its .update(label) changes the text shown. */
export function addJob(label, cancel) {
  const job = { id: ++jobSeq, label, started: Date.now(), cancel };
  ui.set((s) => ({ jobs: [...s.jobs, job] }));
  const done = () => ui.set((s) => ({ jobs: s.jobs.filter((j) => j.id !== job.id) }));
  done.update = (text) => ui.set((s) => ({ jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, label: text } : j)) }));
  return done;
}
