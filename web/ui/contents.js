// Folder and archive contents in the model workspace (Package B).
// Uses the same file keys and selection as the left file panel.
import { html, useEffect, useState } from "../lib/html.js";
import { useStore } from "../lib/store.js";
import { ui, setPref } from "./state.js";
import { fileSel, pick, pickAll, clear, fileSelectionKey, setArchiveEntries, validFileKey } from "./filesel.js";
import { Icon } from "./icons.js";
import { TypeTag, fileType } from "./filetypes.js";
import { SortMenu, ViewSwitch } from "./layout.js";
import { api, isDesktop, openModelFile } from "./library.js";
import { fileUrl, srcArgs, LazyPreview, MESH, fileMenu } from "./parts.js";
import { size } from "./details.js";
import { openMenu, typing } from "./actions.js";

const VIEWS = [["grid", "Grid", "grid"], ["list", "List", "list"]];
const SORTS = [["name", "Name"], ["type", "Type"], ["size", "Largest first"], ["newest", "Newest"]];
const archiveCache = new Map();

export function archiveEntries(src, archive) {
  const key = `${src.id}:${archive}`;
  if (!archiveCache.has(key)) {
    const request = api("model_zip", { ...srcArgs(src), file: archive }).then((entries) => {
      const safe = (entries || []).filter((e) => validFileKey(`z:${archive}!${e.name}`));
      setArchiveEntries(archive, safe);
      return safe.map((e) => ({ ...e, rel: e.name }));
    }).catch((err) => { archiveCache.delete(key); throw err; });
    archiveCache.set(key, request);
  }
  return archiveCache.get(key);
}

/** Direct children only. Folder counts include nested descendants. */
export function childrenOf(files, folder = "") {
  const prefix = folder ? (folder.endsWith("/") ? folder : folder + "/") : "";
  const directories = new Map();
  const leaves = [];
  for (const f of files || []) {
    if (!f?.rel || (prefix && !f.rel.startsWith(prefix))) continue;
    const remaining = f.rel.slice(prefix.length);
    if (!remaining) continue;
    const slash = remaining.indexOf("/");
    if (slash >= 0) {
      const name = remaining.slice(0, slash);
      if (!name) continue;
      if (!directories.has(name)) directories.set(name, {
        name, rel: prefix + name, folder: true, count: 0, size: 0, newest: 0,
      });
      const dir = directories.get(name);
      if (remaining.slice(slash + 1)) dir.count++;
      dir.size += Number(f.size || 0);
      dir.newest = Math.max(dir.newest, stamp(f));
    } else {
      leaves.push({ ...f, name: remaining, folder: false, size: Number(f.size || 0) });
    }
  }
  return [...directories.values(), ...leaves];
}

function stamp(f) {
  const value = f.modified ?? f.modified_at ?? f.mtime ?? f.added;
  if (typeof value === "number") return value;
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? date : 0;
}

export function sortedChildren(children, by = "name") {
  return [...children].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder ? -1 : 1;
    let diff = 0;
    if (by === "size") diff = b.size - a.size;
    else if (by === "newest") diff = (b.newest || stamp(b)) - (a.newest || stamp(a));
    else if (by === "type") diff = (a.folder ? "" : fileType(a.name).group)
      .localeCompare(b.folder ? "" : fileType(b.name).group);
    return diff || a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/** The model's root is d:, its descendant d:folder; archives use f:zip and z:. */
export function childKey(item, archive = null) {
  return archive
    ? `z:${archive}!${item.rel}${item.folder ? "/" : ""}`
    : `${item.folder ? "d:" : "f:"}${item.rel}`;
}

export function parentKey(key, files = []) {
  if (!key || key === "d:") return "d:";
  if (key.startsWith("d:")) {
    const folder = key.slice(2), cut = folder.lastIndexOf("/");
    return cut < 0 ? "d:" : `d:${folder.slice(0, cut)}`;
  }
  if (key.startsWith("f:")) {
    const file = key.slice(2), cut = file.lastIndexOf("/");
    return cut < 0 ? "d:" : `d:${file.slice(0, cut)}`;
  }
  const value = key.slice(2);
  const zip = (files || []).filter((f) => /\.zip$/i.test(f.rel) && value.startsWith(f.rel + "!"))
    .sort((a, b) => b.rel.length - a.rel.length)[0];
  if (!zip) return "d:";
  const entry = value.slice(zip.rel.length + 1).replace(/\/$/, "");
  const cut = entry.lastIndexOf("/");
  return cut < 0 ? `f:${zip.rel}` : `z:${zip.rel}!${entry.slice(0, cut + 1)}`;
}

export function Breadcrumbs({ src, folder = "", archive = null, navigate }) {
  const crumbs = [{ label: src.rel.split("/").pop(), key: "d:" }];
  if (archive) {
    crumbs.push({ label: archive.split("/").pop(), key: `f:${archive}` });
    let acc = "";
    for (const segment of folder.replace(/\/$/, "").split("/").filter(Boolean)) {
      acc += segment + "/";
      crumbs.push({ label: segment, key: `z:${archive}!${acc}` });
    }
  } else {
    let acc = "";
    for (const segment of folder.split("/").filter(Boolean)) {
      acc = acc ? acc + "/" + segment : segment;
      crumbs.push({ label: segment, key: `d:${acc}` });
    }
  }
  return html`<nav class="contents-crumbs" aria-label="File path" id="contents-breadcrumb">
    ${crumbs.map((c, i) => html`<span key=${c.key}>
      ${i ? html`<span class="crumb-separator">›</span>` : null}
      <button type="button" class="ghost" data-filekey=${c.key} aria-current=${i === crumbs.length - 1 ? "location" : null}
        onClick=${() => navigate(c.key)}>${c.label}</button>
    </span>`)}
  </nav>`;
}

function tileMenu(e, src, item, key, archive) {
  if (!archive && !item.folder) {
    fileMenu(e, src, item, () => pick(key));
    return;
  }
  const items = [{ id: "view", label: "Show here", icon: "eye", run: () => pick(key) }];
  if (!archive && !item.folder && isDesktop()) items.push({
    id: "open-own", label: "Open in its own app", icon: "external", run: () => openModelFile({ rel: src.rel }, item.rel),
  });
  openMenu(e, items);
}

function ContentsRow({ src, item, archive, selected, onSelect, view }) {
  const key = childKey(item, archive);
  const selectedRow = selected.includes(key);
  const image = !item.folder && !archive && item.kind === "image";
  const preview = !item.folder && !archive && MESH.test(item.rel);
  const mark = item.folder ? Icon.folder(28)
    : image ? html`<img src=${fileUrl(src, item.rel)} alt="" loading="lazy" />`
      : preview ? html`<${LazyPreview} cacheKey=${`${src.id}:${item.rel}:${item.size}`}
        ask=${() => api("file_preview", { ...srcArgs(src), file: item.rel })}
        fallback=${Icon.box(28)} />`
        : (Icon[fileType(item.rel).group === "archive" ? "archive" : "file"] || Icon.file)(28);
  const pickRow = (e) => onSelect(e, key);
  const activate = () => {
    if (!item.folder && !archive && !(/\.(stl|obj|3mf|png|jpe?g|webp|gif|bmp|avif|pdf|md|markdown|txt|mp4|webm|m4v|mov|zip)$/i.test(item.rel))
      && isDesktop()) openModelFile({ rel: src.rel }, item.rel);
    else pick(key);
  };
  return html`<button type="button" class=${`contents-item ${view === "list" ? "contents-list-row" : "contents-tile"}${selectedRow ? " selected" : ""}`}
      key=${key} data-filekey=${key} aria-selected=${selectedRow}
      title=${item.rel} onClick=${pickRow} onDblClick=${activate}
      onContextMenu=${(e) => { if (!selectedRow) pick(key); tileMenu(e, src, item, key, archive); }}>
    <span class="contents-icon">${mark}</span>
    <span class="contents-name">${item.name}</span>
    <span class="contents-kind">${item.folder ? `${item.count} files` : html`<${TypeTag} name=${item.rel} />`}</span>
    <span class="contents-size muted">${size(item.size)}</span>
  </button>`;
}

/** Grid/list explorer for ordinary folders and the inside of ZIP archives. */
export function Contents({ src, files, folder = "", archive = null }) {
  const prefs = useStore(ui, (s) => ({ view: s.contentsView, sort: s.contentsSort }));
  const selected = useStore(fileSel, (s) => s.picked);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(500);
  useEffect(() => { setLimit(500); }, [src.id, archive, folder]);
  useEffect(() => {
    let live = true;
    setError("");
    setData(null);
    if (archive) archiveEntries(src, archive).then((value) => { if (live) setData(value); },
      (err) => { if (live) setError(err.message || String(err)); });
    return () => { live = false; };
  }, [src.id, archive]);
  const entries = archive ? data : files;
  const children = sortedChildren(childrenOf(entries || [], folder), prefs.sort);
  const visible = children.slice(0, limit);
  const order = visible.map((item) => childKey(item, archive));
  const navigate = (key) => pick(key);
  const choose = (e, key) => pick(key, e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "one", order);
  const onKey = (e) => {
    if (typing(e) || e.altKey || (e.target.closest?.("input, textarea, select"))) return;
    if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); navigate(parentKey(archive
      ? `z:${archive}!${folder || ""}` : `d:${folder}`, files)); return; }
    if (e.key === "Enter") {
      const key = fileSel.get().shown;
      if (order.includes(key)) { e.preventDefault(); navigate(key); }
      return;
    }
    if (fileSelectionKey(e, order)) { e.preventDefault(); e.stopPropagation(); }
  };
  return html`<section class="contents-view" id="contents-view" onKeyDown=${onKey}>
    <${Breadcrumbs} src=${src} folder=${folder} archive=${archive} navigate=${navigate} />
    <div class="contents-toolbar">
      <${SortMenu} id="contents-sort" options=${SORTS} value=${prefs.sort}
        onChange=${(sort) => setPref({ contentsSort: sort })} />
      <${ViewSwitch} id="contents-views" views=${VIEWS} value=${prefs.view} label="Contents view"
        onChange=${(view) => setPref({ contentsView: view })} />
    </div>
    ${error ? html`<p class="form-error" role="alert">${error}</p>` : null}
    ${archive && !data && !error ? html`<p class="muted">Reading archive…</p>` : null}
    ${!error && entries && !children.length ? html`<p class="contents-empty">Nothing in this folder.</p>` : null}
    ${prefs.view === "list" && visible.length ? html`<div class="contents-list-head">
      <button type="button" onClick=${() => setPref({ contentsSort: "name" })}>Name</button>
      <button type="button" onClick=${() => setPref({ contentsSort: "type" })}>Type</button>
      <button type="button" onClick=${() => setPref({ contentsSort: "size" })}>Size</button>
    </div>` : null}
    <div class=${prefs.view === "list" ? "contents-list" : "contents-grid"} id="contents-items">
      ${visible.map((item) => html`<${ContentsRow} key=${childKey(item, archive)} item=${item} src=${src} archive=${archive}
        selected=${selected} onSelect=${choose} view=${prefs.view} />`)}
    </div>
    ${children.length > visible.length ? html`<button type="button" class="ghost contents-more"
      onClick=${() => setLimit(limit + 500)}>Show more (${children.length - visible.length} left)</button>` : null}
  </section>`;
}
