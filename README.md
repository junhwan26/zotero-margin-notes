# Margin Notes for Zotero

[Korean README](README.ko.md)

Margin Notes for Zotero shows PDF highlight and underline comments as note cards in the outer margins of the paper. It is built for Zotero 9.0.x and chooses the left or right margin from the annotation position, available space, and nearby note congestion, so two-column papers stay readable.

## Features

- Shows commented highlights and underlines as white note cards outside the PDF page, with dark text in both PDF themes.
- Places cards on the best left or right margin using annotation coordinates, margin width, distance, and collision cost.
- Double-click a margin note or overflow comment to edit plain text, with explicit Save and Cancel controls.
- Opens rich-text comments in Zotero's native editor so formatting is not flattened.
- Preserves native PDF interactions, including text-selection popups, native annotation tools, keyboard selection, search, zoom, navigation, undo/redo, and annotation deletion.
- Uses English by default and switches to Korean automatically for Korean Zotero locales.
- Stores comments in Zotero annotations. It does not send data to an external service.

## Install

1. Download `zotero-margin-notes-0.2.3.xpi` from the [latest GitHub release](https://github.com/junhwan26/zotero-margin-notes/releases/latest).
2. In Zotero, open **Tools -> Plugins**.
3. Choose the gear menu, then **Install Plugin From File...**.
4. Select the XPI and open a PDF.

The old `v0.1.0` build used a placeholder update URL, so upgrading to `v0.2.0` or later requires one manual install. Future versions can use the GitHub-backed `updates.json` endpoint.

## Use

Open a PDF and add a comment to a highlight or underline. The note appears in the left or right outer margin. Use the toolbar button **Margin Notes** to toggle the overlay, and **Fit Notes** to adjust PDF zoom when the window is too narrow.

Double-click the body of a note to edit a plain-text comment in place. You can also focus the comment with Tab and press **Enter** or **F2**. **Save** writes the change back to the Zotero annotation; **Cancel** keeps the existing comment. Saving an empty comment removes that card from the margin view because the plugin only displays annotations with comments.

Double-clicking a comment containing rich text opens the native Zotero annotation editor. This keeps formatting such as bold, italics, subscript, and superscript intact.

Text selected while editing stays readable in both light and dark themes. The page header on each note opens the original annotation in Zotero; double-clicking inside an active editor retains normal word selection.

## Compatibility

- Target: Zotero `9.0` through `9.0.*`.
- Validated baseline: Zotero `9.0.6`.
- Reader type: PDF only. EPUB and web snapshots are ignored.
- Implementation note: this plugin uses Zotero's toolbar extension event plus internal PDF reader annotation and viewport APIs. Zotero changes to those internals may require an update.

## Development

No runtime package dependencies are required. Use Node.js and Python 3:

```sh
npm test
npm run check
npm run build
```

The build script creates a reproducible XPI under `dist/` and regenerates `updates.json` with the matching SHA-256 hash.

The Zotero runtime smoke test uses a temporary profile, a synthetic PDF, and an installed Zotero 9.0.6 app:

```sh
python3 scripts/runtime-smoke.py --timeout 300
```

Continuous integration also runs this native smoke test on a macOS runner after downloading Zotero 9.0.6 from the official Zotero release host and verifying the DMG SHA-256 before launch.
