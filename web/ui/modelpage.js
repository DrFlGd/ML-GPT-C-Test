// A model's own page (docs/PLAN.md, "Phase 3 design"): its name, place and
// actions, and its files to look at (parts.js: the 3D view, pictures, documents
// and videos, and its files as folders, one list, by type or as a grid, with a
// switch between variant folders).
import { html, useState, useEffect, useLayoutEffect } from "../lib/html.js";
import { useStore } from "../lib/store.js";
import { ui, setPref } from "./state.js";
import { routeHash } from "./context.js";
import { api, toast } from "./library.js";
import { WorkspaceStage, variantsIn, inVariant } from "./parts.js";
import { FilePanel } from "./filepanel.js";
import { setFileSource, pick, clear } from "./filesel.js";
import { ActionRow, MODEL_ACTIONS, usePageKeys, runKey, letter, editDetails, writable } from "./actions.js";
import { PageHead } from "./layout.js";
import { PlaceLinks } from "./details.js";

const CTX = { page: "model" };

export function ModelPage({ id }) {
  const s = useStore(ui, (st) => ({ rev: st.catalogRev, favs: st.favs, overview: st.overview, readOnly: !!st.library?.read_only, names: st.library?.variant_folders || [] }));
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelOpen = useStore(ui, (st) => st.filePanelOpen);
  const selection = useStore(ui, (st) => st.selection);
  useEffect(() => { ui.set({ selection: id, anchor: id, picked: [id] }); }, [id]);
  useLayoutEffect(() => { setVariant(undefined); setDrawerOpen(false); }, [id]);
  useLayoutEffect(() => {
    if (!m || m.id !== id) return;
    const src = { kind: "model", id: m.id, rel: m.rel };
    const initial = m.main?.entry ? `z:${m.main.file}!${m.main.entry}` : m.main?.file ? `f:${m.main.file}` : "d:";
    setFileSource(src, m.files_list, initial);
  }, [m, id]);
  useEffect(() => {
    // saving or moving a model can give it a new id: follow it
    if (selection && selection !== id && m) location.replace(routeHash(`model:${selection}`));
  }, [selection]);
  useEffect(() => {
    let live = true;
    api("model_get", { id }).then((v) => { if (live) { setM(v); setError(""); } }, (e) => { if (live) setError(e.message || String(e)); });
    return () => { live = false; };
  }, [id, s.rev]);
  usePageKeys((e) => {
    if (!m) return;
    const l = letter(e);
    if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); setPref({ filePanelOpen: !ui.get().filePanelOpen }); return;
    }
    if (e.key === "Escape" && drawerOpen) { e.preventDefault(); setDrawerOpen(false); clear(); return; }
    if (e.key === "F2") { e.preventDefault(); const ok = writable(); if (ok === true) editDetails([m], true); else toast(ok); }
    else if (l === "e" || l === "m" || l === "s") { e.preventDefault(); runKey(MODEL_ACTIONS, l.toUpperCase(), [m], CTX); }
  });
  if (error) return html`<div class="pages"><p class="warn-note" role="alert">${error}</p></div>`;
  if (!m) return html`<div class="pages"></div>`;
  const back = () => (history.length > 1 ? history.back() : (location.hash = routeHash("browse:all")));
  const src = { kind: "model", id: m.id, rel: m.rel };
  const changeVariant = (v) => {
    setVariant(v);
    const filtered = m.files_list.filter((f) => inVariant(f.rel, v, s.names));
    const first = filtered.find((f) => /\.(stl|obj|3mf)$/i.test(f.rel)) || filtered[0];
    pick(first ? `f:${first.rel}` : "d:");
  };
  return html`<div class="model-page workspace-model-page" id="model-page" data-model=${m.id}>
    <${PageHead} id="mp-head" title=${html`<button type="button" class="ghost back-btn" id="mp-back" onClick=${back} title="Back (Alt+←)">‹ Back</button><h1 id="mp-name">${m.name}</h1>`}
      sub=${html`${m.authors.length ? `by ${m.authors.join(", ")} · ` : ""}<${PlaceLinks} m=${m} overview=${s.overview} />`}>
      <button type="button" class="ghost workspace-files-button" id="workspace-files-button"
        onClick=${() => setDrawerOpen(true)}>Files</button>
      <${ActionRow} targets=${[m]} ctx=${CTX} idPrefix="mp" />
    </${PageHead}>
    <div class="model-workspace" id="model-workspace">
      <${FilePanel} src=${src} files=${m.files_list} names=${s.names} variant=${variant}
        onVariant=${changeVariant} open=${panelOpen} onOpen=${(value) => setPref({ filePanelOpen: value })}
        drawerOpen=${drawerOpen} onDrawerOpen=${setDrawerOpen} onPick=${() => setDrawerOpen(false)} />
      <main class="workspace-stage" id="workspace-stage">
        <${WorkspaceStage} src=${src} files=${m.files_list} model=${m} names=${s.names} variant=${variant} />
        ${m.details?.notes ? html`<div class="insp-section"><h3>Notes</h3><p class="insp-note">${m.details.notes}</p></div>` : null}
      </main>
    </div>
  </div>`;
}
