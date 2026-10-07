# Changelog

## 0.2.2 - 2026-10-07

- Replace Edit buttons with double-click editing in margin notes and the overflow list. Enter and F2 also start editing when the comment is focused.
- Keep double-click word selection inside an active editor and preserve drafts when entering edit mode again.
- Restore readable selected text in note editors and comments in both light and dark themes, overriding the PDF reader's transparent selection background only inside margin notes.
- Extend mandatory native Zotero tests to cover double-click editing, selected-text contrast, keyboard selection, drafts, read-only comments, and rich-text delegation.

## 0.2.1 - 2026-10-07

- Fix a Zotero 9 native reader regression where the privileged focus guard wrapped native handlers with `original.apply(this, args)` and passed a privileged rest-args array into the PDF content window. Content code could not read that array's `length`, so native `dragstart` and keyboard handlers threw `Permission denied`.
- Use Zotero's function export bridge and avoid passing the privileged args array across the boundary, so text-selection popups, native annotation tools, keyboard selection, search, zoom/navigation, deletion, undo/redo, and copy conversion handling keep working.
- Add native runtime CI on macOS with the official Zotero 9.0.6 app, an isolated profile, and `scripts/runtime-smoke.py --timeout 300`.

## 0.2.0 - 2026-10-07

- Add direct editing for plain-text highlight comments from margin note cards.
- Keep rich-text comments safe by opening Zotero's native editor instead of flattening formatting.
- Add English-default UI strings with automatic Korean localization.
- Add GitHub release metadata and update manifest generation.

## 0.1.0 - 2026-10-07

- Display highlight and underline comments as cards in the outer PDF margins.
- Choose left or right placement from annotation coordinates, available margin space, and nearby card congestion.
- Add a toolbar toggle and a fit-to-notes zoom helper for Zotero 9.0.x.
