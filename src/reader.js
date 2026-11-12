/* global Zotero */
// Every use of Zotero's unpublished reader internals lives in this file, so a
// reader change in a later Zotero release has a single place to be repaired.
(function (root) {
  'use strict';

  const inner = reader => reader?._internalReader;
  const state = reader => inner(reader)?._state;

  function readers() {
    return root.Zotero.Reader._readers || [];
  }

  // Zotero 10 keeps a PDF iframe alive underneath Reading Mode, so each pane
  // reports that mode before a caller may touch its window.
  function panes(reader) {
    const current = state(reader);
    return [
      { view: inner(reader)?._primaryView, readingMode: !!current?.primaryReadingModeEnabled },
      { view: inner(reader)?._secondaryView, readingMode: !!current?.secondaryReadingModeEnabled },
    ];
  }

  function pdfWindow(view) {
    const raw = view?._iframeWindow;
    const win = raw?.wrappedJSObject || raw;
    const app = win?.PDFViewerApplication;
    if (!win || win.closed || !app?.pdfViewer || !app.eventBus?.on ||
      !win.document?.getElementById('viewerContainer')) return null;
    return { win, app };
  }

  function snapshot(reader) {
    const current = state(reader);
    return {
      annotations: current?.annotations,
      selected: current?.selectedAnnotationIDs,
      show: current?.showAnnotations,
      theme: current?.colorScheme,
      readOnly: isReadOnly(reader),
    };
  }

  function isReadOnly(reader) {
    return !!(state(reader)?.readOnly || inner(reader)?._readOnly);
  }

  function annotation(reader, id) {
    return (state(reader)?.annotations || []).find(item => item.id === id);
  }

  // IDs of the annotations whose native comment popup is open in either pane.
  function annotationPopups(reader) {
    const current = state(reader);
    return [current?.primaryViewAnnotationPopup, current?.secondaryViewAnnotationPopup]
      .map(popup => popup?.annotation?.id).filter(Boolean);
  }

  function outerWindow(reader) {
    return reader?._iframeWindow;
  }

  // Privileged arrays are unreadable in the reader's content compartment;
  // cloneInto throws when the bridge or the target window is unavailable.
  function clone(reader, payload) {
    return root.Cu.cloneInto(payload, outerWindow(reader));
  }

  // The reader's annotation manager keeps the change in Zotero's undo history.
  // If a later Zotero drops it, the documented item API still saves the comment.
  function updateComment(reader, id, comment) {
    const manager = inner(reader)?._annotationManager;
    if (typeof manager?.updateAnnotations === 'function') {
      manager.updateAnnotations(clone(reader, [{ id, comment }]));
      return null;
    }
    const attachment = root.Zotero.Items.get(reader.itemID);
    const item = root.Zotero.Items.getByLibraryAndKey(attachment.libraryID, id);
    if (!item?.isAnnotation?.()) throw new Error('Margin Notes: annotation item ' + id + ' was not found');
    item.annotationComment = comment;
    return item.saveTx();
  }

  function openInSidebar(reader, id) {
    const target = inner(reader);
    target?.toggleSidebar?.(true);
    target?.setSidebarView?.('annotations');
    target?.setSelectedAnnotations?.(clone(reader, [id]));
  }

  // PDFView listens to keydown in window capture, before card handlers.
  // Extend its existing text-focus exemption so reading/copying a comment
  // cannot delete, resize, or undo a selected Zotero annotation.
  function guardTextFocus(view, layer) {
    const original = view._textAnnotationFocused;
    if (typeof original !== 'function') return null;
    const guard = function () {
      return layer.contains(layer.ownerDocument.activeElement) || original.call(view);
    };
    // PDFView runs in the reader's content compartment. Export the hook and
    // call the original without a privileged argument array: Function.apply
    // in content cannot read that array's length, breaking native drag/keys.
    view._textAnnotationFocused = root.Cu.exportFunction(guard, view);
    // Read back through the same wrapper used by cleanup for identity checks.
    const installed = view._textAnnotationFocused;
    return () => {
      if (view._textAnnotationFocused === installed) view._textAnnotationFocused = original;
    };
  }

  function removeListeners(pluginID) {
    // Zotero 9.0.6's public unregisterEventListener has an inverted filter.
    // Plugin-ID cleanup works in both Zotero 9 and 10 and is also used by
    // Zotero's own plugin shutdown path.
    root.Zotero.Reader._unregisterEventListenerByPluginID?.(pluginID);
  }

  root.MarginNotesReader = { readers, panes, pdfWindow, snapshot, isReadOnly, annotation,
    annotationPopups, outerWindow, updateComment, openInSidebar, guardTextFocus, removeListeners };
})(this);
