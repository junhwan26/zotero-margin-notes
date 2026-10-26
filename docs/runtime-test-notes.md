# Isolated Zotero runtime smoke test

Run from the project directory:

```sh
python3 scripts/runtime-smoke.py --timeout 300
```

The harness uses the installed `/Applications/Zotero.app` by default (override with `--app`), a new temporary profile, a separate temporary data directory, and a test-only XPI containing the current production bootstrap and sources. In CI, `--expect-version` verifies that the launched Zotero app matches the matrix version. The harness generates a synthetic two-page, two-column PDF and creates annotations in that temporary library. It never opens the user's profile or existing PDFs. Temporary profile and library files are removed on completion. `--keep-profile` retains the synthetic test files for diagnosis; `--visible` opts into a visible test window. `--visible --visual-hold 60` pauses at the checked baseline for native app visual review, recording `visual-ready` and the isolated process ID in its live JSON report. It does not capture screenshots or inspect any other app window.

The JSON evidence is written to `dist/runtime-smoke-report.json`. Each geometry snapshot records the actual Zotero PDF viewport, page rectangles, card rectangles, and overflow count. The test checks:

- Production bootstrap loading and toolbar mounting.
- Left/right placement on a real two-column PDF, non-overlap, and blank comments.
- Comments from highlights, underlines, and native note annotations, including hidden quote areas for note annotations that do not have selected text.
- Markdown semantic display, raw-source double-click editing, native sidebar synchronization, Save/Cancel and reopen persistence, code containing literal HTML even when mixed with native rich text, inert images/HTML/unsafe links, and safe external-link dispatch without PDF navigation.
- A persisted Zotero comment edit appearing in its margin card, native sidebar text, Zotero item cache, and SQLite annotation row.
- Double-click margin card and overflow editing, Save/Cancel behavior, empty-comment removal, external conflict handling, read-only handling, rich-comment delegation, native undo/redo, and reopen persistence.
- Readable selected text in note comments and editors in light/dark themes, keyboard selection, and preservation of existing drafts when double-clicking inside an active editor.
- Native text-selection popups and annotation tools, including highlight, underline, note annotations, comment editing, deletion, and drag start.
- Keyboard selection, search, zoom, page navigation, and the native copy conversion handler. The copy check uses a synthetic copy event and does not touch the shared OS clipboard.
- Annotation preservation while Delete, Backspace, Shift+Arrow, and Command+Z are dispatched from a focused margin comment.
- Crowded comments, narrow viewport behavior, overflow controls, toggle behavior, overlay/toolbar removal, and restoring the keyboard guard.
- Zotero 10 Reading Mode suspension per PDF pane, including keeping margin cards out of Reading Mode, making Fit Notes ignore hidden PDF panes, and resuming cards after returning to PDF view.
- Unsaved draft preservation through temporary Reading Mode suspension, restored draft UI, including the overflow editor, and Cancel behavior that leaves the Zotero annotation database unchanged.

The disposable test XPI follows Zotero's installed extension loader; it does not run against a mocked reader. Production sources are loaded through their own bootstrap scope, preserving Zotero's cross-scope script-loader behavior.

On macOS, sandboxed process launching can terminate Zotero with signal 6 before extension startup. Run this isolated harness with the environment's approved application-launch permission when needed. A timeout, launch failure, or skipped assertion is not a successful runtime result.

Zotero 9.0.6 and 10.0.6 both require valid extension metadata, including `applications.zotero.id`, `applications.zotero.update_url`, and a compatible `applications.zotero.strict_max_version`; a missing update URL rejects the XPI before bootstrap startup. The runtime test deliberately uses the production manifest, so that this class of packaging problem is caught.

## Zotero 10 Reading Mode coverage

Zotero 10 keeps the PDF iframe alive underneath Reading Mode. Margin Notes treats each PDF pane independently: if a pane is in Reading Mode, that pane's margin notes are suspended; if another pane remains in PDF view, its margin notes can stay active. Fit Notes also skips hidden PDF panes so it cannot zoom a PDF view that the user is not seeing.

The automated regression drives Zotero's PDF-reader Reading Mode state and iframe visibility inside the real reader process. This covers the plugin logic that decides whether to render notes, resize the visible PDF pane, and restore notes when the pane exits Reading Mode. It is **not** a full end-to-end exercise of Zotero's separate Reading Mode UI controls.

## 0.2.1 focus-guard regression

The 0.2.1 native regression exists because the margin overlay extends Zotero's text-focus guard from privileged extension code into the PDF reader content window. The old wrapper called `original.apply(this, args)` and passed a privileged rest-args array into content code. Zotero content code could not read that array's `length`, then raised `Permission denied` during native `dragstart` and keyboard handling.

The fix exports the guard through Zotero's function bridge and avoids passing the privileged args array across the boundary. The runtime test keeps this covered by exercising text-selection popups, native annotation tools, keyboard selection, search, zoom/navigation, deletion, undo/redo, and copy conversion while the plugin is enabled.

## CI Zotero app source

The GitHub Actions runtime job downloads Zotero for macOS from Zotero's official release host. The matrix covers:

```text
https://download.zotero.org/client/release/9.0.6/Zotero-9.0.6.dmg
https://download.zotero.org/client/release/10.0.6/Zotero-10.0.6.dmg
```

Before mounting each DMG, CI verifies these SHA-256 hashes from the workflow matrix:

```text
7a9edba6b4a611f4f800ff3f159e67a62b403ceedd56bfdafc063f23e51c8db7
b8e43f4a13cc6bbd1a979380bededd7eb44e7611ea2501f8d1f0293fbc94731c
```

## 0.4.0 Markdown coverage

Margin Notes 0.4.0 displays headings, emphasis, lists, task markers, blockquotes, tables, code, and safe links in both margin cards and overflow comments. The 18 Markdown unit tests cover parser output, safe URL protocols, inert HTML and images, literal code, legacy Zotero rich tags, bounded input handling, and script-loader scope. Together with existing tests, the Node suite contains 44 passing tests.

Native runtime coverage verifies formatted display, exact raw-source double-click editing, Save/Cancel, selection retention across unchanged rerenders, native sidebar/cache/SQLite synchronization, and raw Markdown after reopening the PDF. A mixed fixture confirms that native rich text decodes text entities while preserving literal HTML inside Markdown code. Existing rich comments retain native-editor delegation; recognized native markup is converted for display without executing arbitrary HTML. Image syntax remains literal, and links allow only `http`, `https`, and `mailto` through Zotero's external URL launcher without navigating the PDF frame. No Markdown runtime package was added.

The parser implements a compact subset rather than full CommonMark or mathematical notation. The native results use the isolated synthetic library on macOS; they do not by themselves claim a screenshot review of the user's installed Markdown UI or an integration retest of named third-party add-ons.

## Historical 0.3.1 note annotation coverage

Margin Notes 0.3.1 expands the displayed annotation types from highlights and underlines to Zotero note annotations. Native note annotations do not have selected-text quotes, so the margin card hides the empty quote area and shows the annotation comment.

The completed 0.3.1 runtime reports cover note visibility, double-click editing, white surfaces and selected-text contrast, Save/Cancel behavior, sidebar/cache/SQLite persistence, hidden unsupported annotations, persistence after reopening the PDF, and native PDF text-selection preservation. A local Zotero 10.0.6 UI check also showed Margin Notes 0.3.1 enabled in Plugin Manager, and page 7 of an actual PDF with existing native note annotations exposed two note cards through macOS accessibility state. The screenshot tool was unavailable, so this is not a screenshot or pixel-level visual certification.

## Verified coverage

| Build | Checked on | Zotero 9.0.6 | Zotero 10.0.6 | Node tests |
| --- | --- | --- | --- | --- |
| **0.4.0** | **2026-10-26** | **271/271 passed** | **288/288 passed** | **44/44 passed** |

JavaScript syntax checks, diff whitespace checks, and the 0.4.0 XPI build also passed. The artifact SHA-256 is `9282e7e44152982c840f4132cc1de747e93e662ac6756f8f17f7025b88419d8c`. The [public 0.4.0 evidence](evidence/compatibility-0.4.0.json) includes normalized version metadata and every completed native check name/result, omitting private paths, library content, and logs.

The 0.4.0 Zotero 10.0.6 run includes 17 additional Reading Mode assertions compared with the Zotero 9.0.6 baseline. These assertions cover controlled Reading Mode flags and iframe visibility in the real PDF reader, not the full separate Reading Mode UI. These runs used temporary profiles and separate libraries, without the named third-party add-ons recorded in earlier installed-state observations.

## Historical verified coverage

The historical `0.3.1` build passed **246/246** isolated Zotero 9.0.6 runtime checks, **263/263** isolated Zotero 10.0.6 runtime checks, and **26/26** Node tests on macOS on 2026-10-08. Update metadata verification, syntax checks, diff checks, and the reproducible XPI build also passed. The 0.3.1 artifact and the XPI installed during that check in actual Zotero 10.0.6 UI both had SHA-256 `9648934bc1566ac7557bd6701ec54288c786a6ec02aa2752e749ecfc7db6922f`. See the [historical 0.3.1 evidence](evidence/compatibility-0.3.1.json).

The Zotero 10.0.6 run includes 17 additional Reading Mode assertions compared with the Zotero 9.0.6 baseline. These assertions cover controlled Reading Mode flags and iframe visibility in the real PDF reader, not the full separate Reading Mode UI.

The historical `0.3.0` build passed **219/219** isolated Zotero 9.0.6 runtime checks, **236/236** isolated Zotero 10.0.6 runtime checks, and **26/26** Node tests on macOS on 2026-10-08. Update metadata verification, syntax checks, and the reproducible XPI build also passed. The 0.3.0 build and the XPI installed in actual Zotero 10.0.6 UI both had SHA-256 `a9a6ef4e1017c3a862c402a0be6995a86dac2b3a935d8c48bc791096e27e7449`.

Release candidate `0.2.3` passed **218/218** isolated Zotero 9.0.6 runtime checks and **23/23** Node tests on macOS on 2026-10-07. Syntax checks and the reproducible XPI build also passed. Six additional native checks verify opaque white card, overflow tray, and editor surfaces with readable text in both PDF themes.

Release candidate `0.2.2` passed **212/212** isolated Zotero 9.0.6 runtime checks and **23/23** Node tests on macOS on 2026-10-07. Syntax checks and the reproducible XPI build also passed. The new checks cover double-click editing in margin cards and overflow entries, Enter/F2 access, native header navigation, word selection inside an active editor, draft/selection preservation during rerender, and readable selection colors in both themes.

Release candidate `0.2.1` passed **196/196** isolated Zotero 9.0.6 runtime checks and **23/23** Node tests on macOS on 2026-10-07. Syntax checks and the reproducible XPI build also passed. The runtime run verified restoration of the exact native focus guard, then repeated trusted PDF selection after plugin shutdown and reopened the PDF to verify persisted comments.

The current native regression baseline and enabled-mode pass exercise text-selection popups, native annotation tools, highlights, underlines, native note annotations, comment editing, deletion, undo/redo, keyboard selection, search, zoom/navigation, and the copy conversion handler. The copy check verifies Zotero's PDF text conversion path without reading or writing the operating-system clipboard.

Check totals come from completed native reports for the exact build under test; timeouts, launch failures, and skipped checks are failures.
