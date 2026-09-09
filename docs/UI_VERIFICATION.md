# UI refinements

Menus now dismiss on outside pointer events, focus leaving the menu, window
blur, Escape, Tab, and item selection. Only one menu is open at a time; arrow
keys and Home/End navigate items. Numeric fields keep partial scientific
notation while editing and apply values on Enter or blur. Invalid entries
restore the previous value and show a field error.

Save/export uses native save dialogs in the desktop app and downloads in the
browser. SVG exports embed computed colors and typography. Sweep CSV is
separate from spatial profile CSV. PDF uses the native webview print command.
Failed and cancelled actions provide feedback. Repeated imports/templates work;
adding a layer selects it, and empty charts link to the appropriate settings.

Simulation requests are debounced and serialized; obsolete queued requests are
skipped and completed obsolete results are ignored. Fixed-charge projects go
straight to the full linear solve. Metadata edits do not trigger a solve. Old
results remain visibly marked as outdated and cannot be exported until current
full results arrive. Chart data uses the solved device's geometry.

Charts load separately, avoid animated redraws, retain profile endpoints and
material/charge discontinuities when downsampling, and memoize data preparation.
The data table mounts only when expanded. Native MathML avoids shipping unused
KaTeX font assets. The sidebar loads a small derived 128 px Wedge logo PNG.

## Verification

Run `npm run test:ui` after `npx playwright install chromium`. Tests exercise the
real React UI with mocked Tauri IPC: menus, numeric drafts, save/export calls,
failure feedback, imports, templates, layer selection, stale results, serialized
solves, and the minimum window size. `cargo test --workspace --locked` covers
the actual numerical core, including the MKC A1.4 regression.

`npm run tauri -- build --bundles app` verifies the macOS application bundle.
Browser tests mock native save/print dialogs; they do not automate the OS dialog
controls. Native dialogs still require a manual desktop smoke test.

Logo source and the exact generation prompt are documented in
[`src/assets/README.md`](../src/assets/README.md).
