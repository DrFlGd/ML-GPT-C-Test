// Selected file or folder in the model workspace. Existing 3D/picture/document/
// video viewers remain shared with Import; contents navigation is in contents.js.
import { html, useEffect, useState } from "../lib/html.js";
import { useStore } from "../lib/store.js";
import { fileSel, pick } from "./filesel.js";
import { ui } from "./state.js";
import { api, isDesktop, openModelFile } from "./library.js";
import { fileType, TypeTag } from "./filetypes.js";
import { size } from "./details.js";
import { Icon } from "./icons.js";
import { MESH, Stage3D, Pictures, Documents, Videos, inVariant, variantsIn } from "./parts.js";
import { Contents, Breadcrumbs, parentKey, archiveEntries } from "./contents.js";
import { typing } from "./actions.js";

const PICTURE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const DOC = /\.(pdf|md|markdown|txt|html|htm|rtf|doc|docx)$/i;
const VIDEO = /\.(mp4|webm|m4v|mov|mkv|avi)$/i;

export function locationFor(key, files) {
  if (!key || key === "d:") return { type: "folder", folder: "" };
  if (key.startsWith("d:")) return { type: "folder", folder: key.slice(2) };
  if (key.startsWith("f:")) {
    const file = key.slice(2);
    return /\.zip$/i.test(file) ? { type: "zip", archive: file, folder: "" } : { type: "file", file };
  }
  if (key.startsWith("z:")) {
    const value = key.slice(2);
    const archive = files.filter((f) => /\.zip$/i.test(f.rel) && value.startsWith(f.rel + "!"))
      .sort((a, b) => b.rel.length - a.rel.length)[0];
    if (!archive) return { type: "missing" };
    const entry = value.slice(archive.rel.length + 1);
    return entry.endsWith("/")
      ? { type: "zip", archive: archive.rel, folder: entry }
      : { type: "file", file: archive.rel, entry };
  }
  return { type: "missing" };
}

function siblingKeys(location, files, archives) {
  const siblingFolder = (path) => path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  if (location.entry) return (archives || [])
    .filter((f) => !f.rel.endsWith("/") && siblingFolder(f.rel) === siblingFolder(location.entry))
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((f) => `z:${location.file}!${f.rel}`);
  return files.filter((f) => siblingFolder(f.rel) === siblingFolder(location.file))
    .sort((a, b) => a.rel.localeCompare(b.rel)).map((f) => `f:${f.rel}`);
}

export function Stage({ src, files, model, names = [], variant }) {
  const selection = useStore(fileSel, (s) => ({ key: s.shown, id: s.src?.id }));
  const [inside, setInside] = useState(null);
  const shown = selection.id === src.id ? selection.key : null;
  const location = locationFor(shown, files);
  const chosen = variant === undefined ? variantsIn(files, names)[0] || null : variant;
  const visible = files.filter((f) => inVariant(f.rel, chosen, names));
  useEffect(() => {
    let live = true;
    setInside(null);
    if (location.entry) archiveEntries(src, location.file).then((list) => { if (live) setInside(list); }, () => {});
    return () => { live = false; };
  }, [src.id, location.file, !!location.entry]);
  useEffect(() => {
    const listener = (e) => {
      if (e.defaultPrevented || typing(e) || e.altKey || e.ctrlKey || e.metaKey || ui.get().dialog || ui.get().menu) return;
      if (e.target.closest?.("#model-file-panel, #contents-view, input, textarea, select, [contenteditable]")) return;
      if (e.key === "Backspace" && shown && shown !== "d:") {
        e.preventDefault();
        pick(parentKey(shown, files));
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && location.type === "file") {
        const siblings = siblingKeys(location, visible, inside);
        const i = siblings.indexOf(shown);
        const next = siblings[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) { e.preventDefault(); pick(next); }
      }
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [shown, src.id, inside, files, variant]);
  if (!shown) return html`<div class="workspace-stage-note">Choose a file or folder to view.</div>`;
  if (location.type === "folder")
    return html`<${Contents} key=${`${src.id}:${location.folder}`} src=${src} files=${visible} folder=${location.folder} />`;
  if (location.type === "zip")
    return html`<${Contents} key=${`${src.id}:${location.archive}:${location.folder}`} src=${src}
      files=${visible} archive=${location.archive} folder=${location.folder} />`;
  if (location.type !== "file")
    return html`<div class="workspace-stage-note">This file isn't available.</div>`;
  const { file, entry } = location;
  const original = files.find((f) => f.rel === file);
  if (!original || !inVariant(file, chosen, names))
    return html`<div class="workspace-stage-note">Choose a file in this variant.</div>`;
  const fileName = entry || file;
  const current = { file, entry: entry || null };
  const folder = entry ? (entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : "")
    : (file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "");
  const breadcrumbs = html`<${Breadcrumbs} src=${src} folder=${folder}
    archive=${entry ? file : null} navigate=${pick} />`;
  if (MESH.test(fileName)) return html`<section class="workspace-viewer">${breadcrumbs}
    <${Stage3D} key=${src.id} src=${src} model=${model} current=${current} /></section>`;
  if (PICTURE.test(fileName)) return html`<section class="workspace-viewer">${breadcrumbs}
    <${Pictures} src=${src} model=${model} pictures=${[current]} current=${current}
      setCurrent=${(v) => pick(entry ? `z:${file}!${v.entry}` : `f:${v.file}`)} />
  </section>`;
  if (!entry && DOC.test(fileName)) return html`<section class="workspace-viewer">${breadcrumbs}
    <${Documents} src=${src} model=${model} docs=${[current]} current=${current} setCurrent=${() => {}} />
  </section>`;
  if (!entry && VIDEO.test(fileName)) return html`<section class="workspace-viewer">${breadcrumbs}
    <${Videos} src=${src} model=${model} videos=${[current]} current=${current} setCurrent=${() => {}} />
  </section>`;
  return html`<section class="workspace-viewer">${breadcrumbs}
    <div class="workspace-stage-note" id="workspace-file-fallback">
      <span class="stage-note-title">${fileName}</span>
      <span><${TypeTag} name=${fileName} /> <span class="muted">${size(original.size)}</span></span>
      <p>There is no built-in viewer for this kind of file.</p>
      ${!entry && isDesktop() ? html`<button type="button" class="ghost"
        onClick=${() => openModelFile(model, file)}>${Icon.external(14)} Open in its own app</button>` : null}
    </div>
  </section>`;
}
