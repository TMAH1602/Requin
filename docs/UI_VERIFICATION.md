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
The profile and measurement tables and fit residual chart mount only when expanded.
Native MathML avoids shipping unused KaTeX font assets; equation rendering is
lazy-loaded separately. The navigation uses 256 px Delta/Wedge/Chibi derivatives.
The initial application JS chunk is approximately 288 kB before compression;
equation and chart libraries load separately.

The workspace now follows Home → Projects/Device → Experiment → Studies/Data →
Results, with Quantum, Learn, and Settings available throughout. Expert numerical
controls are disclosed under Experiment. At minimum width, the inspector becomes
a dismissible drawer. Theme-aware portaled selects support outside dismissal,
Escape, Tab, arrow keys, Home/End, and typeahead.

First open offers a hands-on tutorial, quick start, or skip. Settings replays the
whole tutorial or one of twelve chapters. The tutorial works in an isolated
practice workspace; exit restores the device, measurements, studies, completed
study results, fit settings, selected page, and appearance. Practice exports do
not write files. Every navigation section is represented in the chapter registry.

Completed study arrays survive navigation within a session. Saved workspaces
persist the study inputs, not computed arrays; reopen and run a saved study to
regenerate output. Imported measurements and fit settings are embedded directly.

## Verification

Run `npm run test:ui` after `npx playwright install chromium`. Tests exercise the
real React UI with mocked Tauri IPC: menus, numeric drafts, save/export calls,
failure feedback, imports, templates, layer selection, stale results, serialized
solves, all themes/logo choices, measured import, workspace saves, complete
tutorial traversal/restoration, study navigation, and the minimum window size.
Pure analysis tests cover synthetic I–V/C–V recovery and optionally the private
Field measurement when present. `cargo test --workspace --locked` covers
the actual numerical core, including the MKC A1.4 regression.

`npm run tauri -- build --bundles app` verifies the macOS application bundle.
Browser tests mock native save/print dialogs; they do not automate the OS dialog
controls. Native dialogs still require a manual desktop smoke test.

Logo source and the exact generation prompt are documented in
[`src/assets/README.md`](../src/assets/README.md).
