// The model page's file navigator. Import keeps its compact PartsViews layout.
// Folder and file rows use the same tree helpers and type tags as PartsViews.
import { html, useEffect, useRef, useState } from "../lib/html.js";
import { useStore } from "../lib/store.js";
import { ui, setPref } from "./state.js";
import { Icon } from "./icons.js";
import { PartsViews, variantsIn, inVariant } from "./parts.js";
import { ViewSwitch } from "./layout.js";
import { size } from "./details.js";
import { fileSel, pick, fileSelectionKey } from "./filesel.js";

const PANEL_VIEWS = [["folders", "Folders", "folder"], ["all", "List", "list"], ["type", "By type", "grouped"]];
const clamp = (n) => Math.min(480, Math.max(220, n));

export function FilePanel({ src, files, names, variant, onVariant, open, onOpen, drawerOpen, onDrawerOpen, onPick }) {
  const s = useStore(ui, (st) => ({ width: st.filePanelWidth, view: st.filePanelView }));
  const selected = useStore(fileSel, (st) => ({ shown: st.shown, picked: st.picked }));
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => { setQ(""); }, [src.id]);
  const variants = variantsIn(files, names);
  const chosen = variant === undefined ? variants[0] || null : variant;
  const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visible = files.filter((f) => inVariant(f.rel, chosen, names) &&
    words.every((word) => f.rel.split("/").pop().toLocaleLowerCase().includes(word)));
  const bytes = visible.reduce((n, f) => n + f.size, 0);
  const order = () => [...(ref.current?.querySelectorAll("[data-filekey]") || [])]
    .filter((el) => el.getClientRects().length).map((el) => el.dataset.filekey);
  const select = (e, key) => {
    pick(key, e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "one", order());
    onPick?.();
  };
  const keys = (e) => {
    if (e.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
    if (["Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a")) {
      if (fileSelectionKey(e, order())) { e.preventDefault(); e.stopPropagation(); }
    }
  };
  const resize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = e.clientX, initial = ui.get().filePanelWidth;
    const move = (event) => ui.set({ filePanelWidth: clamp(initial + event.clientX - start) });
    const finish = (event) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", finish);
      removeEventListener("pointercancel", finish);
      setPref({ filePanelWidth: clamp(initial + event.clientX - start) });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", finish);
    addEventListener("pointercancel", finish);
  };
  const panel = html`<aside id="model-file-panel" class=${`file-panel${open ? "" : " collapsed"}${drawerOpen ? " drawer-open" : ""}`}
      style=${`--file-panel-width:${clamp(s.width)}px`} aria-label="Model files" ref=${ref} onKeyDown=${keys}>
    ${!open && !drawerOpen ? html`<div class="file-panel-rail"><button type="button" title="Open files ([)" aria-label="Open files" id="file-panel-expand"
      onClick=${() => onOpen(true)}>${Icon.panel(18)}</button></div>` : html`
      <div class="file-panel-inner">
        <div class="file-panel-head">
          <div class="file-panel-title"><strong>Files</strong><span class="muted">${files.length} · ${size(files.reduce((n, f) => n + f.size, 0))}</span></div>
          <button type="button" class="ghost file-panel-collapse" title="Collapse files ([)" aria-label="Collapse files" id="file-panel-collapse"
            onClick=${() => { onOpen(false); onDrawerOpen(false); }}>${Icon.chevronsLeft(17)}</button>
          <button type="button" class="ghost file-panel-drawer-close" aria-label="Close files" title="Close files"
            onClick=${() => onDrawerOpen(false)}>${Icon.close(17)}</button>
        </div>
        ${variants.length ? html`<div class="file-panel-variants" role="group" aria-label="Variant" id="variants">
          ${variants.map((name) => html`<button type="button" key=${name} aria-pressed=${chosen === name ? "true" : "false"}
            onClick=${() => onVariant(name)}>${name}</button>`)}
          <button type="button" aria-pressed=${chosen === null ? "true" : "false"} onClick=${() => onVariant(null)}>All</button>
        </div>` : null}
        <input type="search" id="file-panel-search" aria-label="Search files" placeholder="Search file names"
          value=${q} onInput=${(e) => setQ(e.currentTarget.value)} />
        <${ViewSwitch} id="file-panel-views" label="Files view" views=${PANEL_VIEWS} value=${s.view}
          onChange=${(view) => setPref({ filePanelView: view })} />
        <div class="file-panel-scroll" id="file-panel-scroll">
          <${PartsViews} src=${src} files=${visible} names=${names} view=${s.view}
            panel=${true} selected=${selected} select=${select} current=${null} />
          ${!visible.length ? html`<p class="tree-note muted">No files match.</p>` : null}
        </div>
        <div class="file-panel-foot muted">${visible.length} files · ${size(bytes)}</div>
      </div>
    `}
    ${open && !drawerOpen ? html`<div class="file-panel-resizer" role="separator" aria-orientation="vertical"
      aria-label="Resize file panel" title="Drag to resize" onPointerDown=${resize}></div>` : null}
  </aside>`;
  return html`<div class="file-panel-holder">
    ${drawerOpen ? html`<button type="button" class="file-panel-backdrop" aria-label="Close files" onClick=${() => onDrawerOpen(false)}></button>` : null}
    ${panel}
  </div>`;
}
