# Margin Notes for Zotero

[Korean README](README.ko.md)

Margin Notes for Zotero shows PDF highlight and underline comments as note cards in the outer margins of the paper. It is built for Zotero 9.0.x and chooses the left or right margin from the annotation position, available space, and nearby note congestion, so two-column papers stay readable.

## Features

- Shows commented highlights and underlines as margin cards outside the PDF page.
- Places cards on the best left or right margin using annotation coordinates, margin width, distance, and collision cost.
- Lets you edit plain-text comments directly from the margin card with explicit Save and Cancel controls.
- Opens rich-text comments in Zotero's native editor so formatting is not flattened.
- Uses English by default and switches to Korean automatically for Korean Zotero locales.
- Stores comments in Zotero annotations. It does not send data to an external service.

## Install

1. Download `zotero-margin-notes-0.2.0.xpi` from the [latest GitHub release](https://github.com/junhwan26/zotero-margin-notes/releases/latest).
2. In Zotero, open **Tools -> Plugins**.
3. Choose the gear menu, then **Install Plugin From File...**.
4. Select the XPI and open a PDF.

The old `v0.1.0` build used a placeholder update URL, so upgrading to `v0.2.0` requires one manual install. Future versions can use the GitHub-backed `updates.json` endpoint.

## Use

Open a PDF and add a comment to a highlight or underline. The note appears in the left or right outer margin. Use the toolbar button **Margin Notes** to toggle the overlay, and **Fit Notes** to adjust PDF zoom when the window is too narrow.

Click **Edit** on a card to edit a plain-text comment in place. **Save** writes the change back to the Zotero annotation; **Cancel** keeps the existing comment. Saving an empty comment removes that card from the margin view because the plugin only displays annotations with comments.

If a comment contains rich text, the edit action opens the native Zotero annotation editor. This keeps formatting such as bold, italics, subscript, and superscript intact.

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

The optional Zotero smoke test uses a temporary profile and a synthetic PDF:

```sh
python3 scripts/runtime-smoke.py
```
