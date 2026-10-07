# Isolated Zotero runtime smoke test

Run from the project directory:

```sh
python3 scripts/runtime-smoke.py --timeout 300
```

The harness uses the installed `/Applications/Zotero.app` by default (override with `--app`), a new temporary profile, a separate temporary data directory, and a test-only XPI containing the current production bootstrap and sources. It generates a synthetic two-page, two-column PDF and creates annotations in that temporary library. It never opens the user's profile or existing PDFs. Temporary profile and library files are removed on completion. `--keep-profile` retains the synthetic test files for diagnosis; `--visible` opts into a visible test window. `--visible --visual-hold 60` pauses at the checked baseline for native app visual review, recording `visual-ready` and the isolated process ID in its live JSON report. It does not capture screenshots or inspect any other app window.

The JSON evidence is written to `dist/runtime-smoke-report.json`. Each geometry snapshot records the actual Zotero PDF viewport, page rectangles, card rectangles, and overflow count. The test checks:

- Production bootstrap loading and toolbar mounting.
- Left/right placement on a real two-column PDF, non-overlap, and blank comments.
- A persisted Zotero comment edit appearing in its margin card, native sidebar text, Zotero item cache, and SQLite annotation row.
- Double-click margin card and overflow editing, Save/Cancel behavior, empty-comment removal, external conflict handling, read-only handling, rich-comment delegation, native undo/redo, and reopen persistence.
- Readable selected text in note comments and editors in light/dark themes, keyboard selection, and preservation of existing drafts when double-clicking inside an active editor.
- Native text-selection popups and annotation tools, including highlight, underline, comment editing, deletion, and drag start.
- Keyboard selection, search, zoom, page navigation, and the native copy conversion handler. The copy check uses a synthetic copy event and does not touch the shared OS clipboard.
- Annotation preservation while Delete, Backspace, Shift+Arrow, and Command+Z are dispatched from a focused margin comment.
- Crowded comments, narrow viewport behavior, overflow controls, toggle behavior, overlay/toolbar removal, and restoring the keyboard guard.

The disposable test XPI follows Zotero's installed extension loader; it does not run against a mocked reader. Production sources are loaded through their own bootstrap scope, preserving Zotero's cross-scope script-loader behavior.

On macOS, sandboxed process launching can terminate Zotero with signal 6 before extension startup. Run this isolated harness with the environment's approved application-launch permission when needed. A timeout, launch failure, or skipped assertion is not a successful runtime result.

Zotero 9.0.6's installed `modules/Extension.sys.mjs` explicitly requires `applications.zotero.id`, `applications.zotero.update_url`, and `applications.zotero.strict_max_version`; a missing update URL rejects the XPI before bootstrap startup. The runtime test deliberately uses the production manifest, so that this class of packaging problem is caught.

## 0.2.1 focus-guard regression

The 0.2.1 native regression exists because the margin overlay extends Zotero's text-focus guard from privileged extension code into the PDF reader content window. The old wrapper called `original.apply(this, args)` and passed a privileged rest-args array into content code. Zotero content code could not read that array's `length`, then raised `Permission denied` during native `dragstart` and keyboard handling.

The fix exports the guard through Zotero's function bridge and avoids passing the privileged args array across the boundary. The runtime test keeps this covered by exercising text-selection popups, native annotation tools, keyboard selection, search, zoom/navigation, deletion, undo/redo, and copy conversion while the plugin is enabled.

## CI Zotero app source

The GitHub Actions runtime job downloads Zotero 9.0.6 for macOS from Zotero's official release host:

```text
https://download.zotero.org/client/release/9.0.6/Zotero-9.0.6.dmg
```

Before mounting the DMG, CI verifies this SHA-256, computed from that official DMG on 2026-10-07:

```text
7a9edba6b4a611f4f800ff3f159e67a62b403ceedd56bfdafc063f23e51c8db7
```

## Verified coverage

Release candidate `0.2.2` passed **212/212** isolated Zotero 9.0.6 runtime checks and **23/23** Node tests on macOS on 2026-10-07. Syntax checks and the reproducible XPI build also passed. The new checks cover double-click editing in margin cards and overflow entries, Enter/F2 access, native header navigation, word selection inside an active editor, draft/selection preservation during rerender, and readable selection colors in both themes.

Release candidate `0.2.1` passed **196/196** isolated Zotero 9.0.6 runtime checks and **23/23** Node tests on macOS on 2026-10-07. Syntax checks and the reproducible XPI build also passed. The runtime run verified restoration of the exact native focus guard, then repeated trusted PDF selection after plugin shutdown and reopened the PDF to verify persisted comments.

The current native regression baseline and enabled-mode pass exercise text-selection popups, native annotation tools, highlights, underlines, comment editing, deletion, undo/redo, keyboard selection, search, zoom/navigation, and the copy conversion handler. The copy check verifies Zotero's PDF text conversion path without reading or writing the operating-system clipboard.

Final local check totals are intentionally taken from the JSON report produced by the exact release candidate being tested. Do not update this note with a count unless it comes from a completed `scripts/runtime-smoke.py --timeout 300` run for that candidate.
