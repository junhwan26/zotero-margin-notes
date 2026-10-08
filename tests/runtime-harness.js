/* global Zotero, Services, ChromeUtils, Cu, IOUtils, PathUtils */
// This bootstrap is packed only into the disposable test extension.
var smokeProduction;
var smokeRoot;

function startup(data) {
  smokeRoot = data.rootURI || data.resourceURI.spec;
  const timers = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  timers.setTimeout(() => runSmoke(timers), 0);
}
function install() {}
function uninstall() {}
function shutdown() {
  try { smokeProduction?.shutdown(); } catch (_) {}
}

async function runSmoke(timers) {
  const directory = Services.prefs.getStringPref('extensions.zotero.marginSmoke.path');
  const output = PathUtils.join(directory, 'result.json');
  const report = { complete: false, passed: false, checks: [], snapshots: [], version: Zotero.version };
  const sleep = ms => new Promise(resolve => timers.setTimeout(resolve, ms));
  const write = () => IOUtils.writeJSON(output, report, { tmpPath: output + '.tmp' });
  const check = (name, condition, details) => {
    // Keep evidence in this scope; reader-owned objects die when the PDF closes.
    report.checks.push({ name, passed: !!condition, ...(details === undefined ? {} : { details: JSON.parse(JSON.stringify(details)) }) });
    if (!condition) throw new Error(name + (details ? ': ' + JSON.stringify(details) : ''));
  };
  const waitFor = async (name, predicate, timeout = 15000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const value = predicate();
      if (value) return value;
      await sleep(100);
    }
    throw new Error('Timed out waiting for ' + name);
  };
  const waitForPersistedComment = async (item, expected) => {
    const until = Date.now() + 15000;
    let actual;
    while (Date.now() < until) {
      const rows = await Zotero.DB.queryAsync(
        'SELECT itemID, comment FROM itemAnnotations WHERE itemID = ?', [item.id]);
      const row = rows[0];
      actual = row ? { itemID: row.itemID, comment: row.comment } : { missing: true };
      // Zotero item.js writes `comment || null`; a missing row must never pass.
      if (row && (row.comment ?? '') === expected) return;
      await sleep(150);
    }
    throw new Error('Timed out waiting for annotation comment to reach SQLite: ' +
      JSON.stringify({ itemID: item.id, expected, actual }));
  };
  const bounded = (name, promise, ms = 20000) => Promise.race([promise, sleep(ms).then(() => { throw new Error('Timed out waiting for ' + name); })]);
  const mark = async name => { report.stage = name; await write(); };
  const rectangle = element => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const overlaps = (a, b) => a.left < b.right - 0.75 && a.right > b.left + 0.75 && a.top < b.bottom - 0.75 && a.bottom > b.top + 0.75;
  try {
    const expectedVersion = Services.prefs.getStringPref('extensions.zotero.marginSmoke.expectedVersion', '');
    if (expectedVersion) {
      report.expectedVersion = expectedVersion;
      await mark('checking Zotero version');
      check('launched Zotero version matches the requested test version',
        Zotero.version === expectedVersion, { expected: expectedVersion, actual: Zotero.version });
    }
    await mark('initializing Zotero');
    await bounded('Zotero initialization', Zotero.initializationPromise);
    await bounded('Zotero UI', Zotero.uiReadyPromise);
    const mainWindow = await waitFor('main window', () => Zotero.getMainWindow());
    await mark('waiting for the fresh library item cache');
    await bounded('library items', Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad('item'));
    mainWindow.resizeTo(1600, 1100);
    if (mainWindow.ZoteroContextPane) mainWindow.ZoteroContextPane.collapsed = true;
    await mark('loading production bootstrap');
    smokeProduction = { Zotero, Services, ChromeUtils, Cu, ...timers };
    Services.scriptloader.loadSubScript(smokeRoot + 'production/bootstrap.js', smokeProduction);
    await smokeProduction.startup({ rootURI: smokeRoot + 'production/' });
    const plugin = smokeProduction.marginNotesScope.MarginNotes;
    check('production bootstrap started', !!plugin && plugin.controllers instanceof Map);
    const localized = language => {
      const scope = { Zotero: { locale: language } };
      Services.scriptloader.loadSubScript(smokeRoot + 'production/src/i18n.js', scope);
      return scope.MarginNotesI18n.create();
    };
    const english = localized('en-US');
    const korean = localized('ko-KR');
    check('English is the default language and fallback', english.t('toggle') === 'Margin Notes' && localized('fr-FR').t('save') === 'Save');
    check('Korean localization includes editing controls', korean.t('toggle') === '여백 노트' && korean.t('save') === '저장' && korean.t('cancel') === '취소');
    // Open the fixture with no plugin hooks or overlay so the same trusted UI
    // operations establish native behavior before the plugin touches this reader.
    plugin.stop();
    const attachment = await Zotero.Attachments.importFromFile({ file: PathUtils.join(directory, 'two-column.pdf'), libraryID: Zotero.Libraries.userLibraryID });
    const createAnnotation = async (comment, x, y, pageIndex = 0, type = 'highlight') => {
      const item = new Zotero.Item('annotation');
      item.libraryID = attachment.libraryID;
      item.parentID = attachment.id;
      item.annotationType = type;
      item.annotationText = type === 'note' ? '' : 'Synthetic highlighted text';
      item.annotationComment = comment;
      item.annotationColor = x < 300 ? '#ffd400' : '#ff6666';
      item.annotationPageLabel = String(pageIndex + 1);
      item.annotationSortIndex = `${String(pageIndex).padStart(5, '0')}|${String(Math.round((792 - y) * 100)).padStart(6, '0')}|00000`;
      item.annotationPosition = JSON.stringify({ pageIndex,
        rects: [[x, y, x + (type === 'note' ? 22 : 190), y + (type === 'note' ? 22 : 12)]] });
      await item.saveTx();
      return item;
    };
    const left = await createAnnotation('왼쪽 열 · 핵심 가정은 무엇인가? 실험 조건을 다시 확인해야 한다.', 50, 700);
    const right = await createAnnotation('오른쪽 열 · 실제 스트리밍 환경에서도 같은 성능을 보이는지 확인.', 330, 700);
    const lowerLeft = await createAnnotation('이전 연구와 비교할 때 평가 지표가 달라 직접 비교에 주의.', 50, 580);
    const lowerRight = await createAnnotation('후속 실험: 지연 시간과 정확도의 관계를 별도로 측정해 보자.', 330, 560);
    const blank = await createAnnotation('', 50, 640);
    const second = await createAnnotation('PAGE TWO: the next page has its own margin note.', 330, 680, 1);
    await mark('opening PDF reader');
    const reader = await Zotero.Reader.open(attachment.id);
    await mark('waiting for PDF reader initialization');
    await bounded('reader host initialization', reader._initPromise);
    const internal = await waitFor('internal PDF reader', () => reader._internalReader);
    const view = internal._primaryView;
    await waitFor('PDF iframe window', () => view._iframeWindow);
    const pdfWindow = view._iframeWindow.wrappedJSObject || view._iframeWindow;
    await mark('waiting for PDF page viewport');
    await waitFor('PDF page viewport', () => pdfWindow?.PDFViewerApplication?.pdfViewer?.getPageView(0)?.viewport);
    internal.toggleSidebar(false);
    const pdf = pdfWindow.PDFViewerApplication.pdfViewer;
    pdf.currentScaleValue = '0.85';
    const nativeScope = { Components };
    Services.scriptloader.loadSubScript(smokeRoot + 'native-regression.js', nativeScope);
    const native = nativeScope.NativeRegression.create({ reader, pdfWindow, check, waitFor, sleep, mark, Zotero });
    await native.runCore('native baseline without plugin');
    const originalTextFocusedGuard = view._textAnnotationFocused;
    plugin.start();
    const controller = await waitFor('plugin reader controller', () => plugin.controllers.get(reader));
    const overlay = await waitFor('primary overlay frame', () => controller.frames.get(view));
    const doc = pdfWindow.document;
    const card = id => overlay.layer.querySelector(`.mn-card[data-annotation-id="${id}"]`);
    const settle = async () => { await sleep(700); await new Promise(resolve => pdfWindow.requestAnimationFrame(() => pdfWindow.requestAnimationFrame(resolve))); };
    const snapshot = async (name, expectCards = false) => {
      await settle();
      const cards = Array.from(overlay.layer.querySelectorAll('.mn-card')).filter(el => el.getBoundingClientRect().height > 0 && pdfWindow.getComputedStyle(el).display !== 'none');
      const pageRects = Array.from(doc.querySelectorAll('.page')).map(rectangle).filter(r => r.bottom > 0 && r.top < pdfWindow.innerHeight);
      const geometries = cards.map(el => ({ id: el.dataset.annotationId, text: el.textContent, ...rectangle(el) }));
      const state = { name, noSpace: overlay.noSpace, crowded: overlay.crowded, viewport: { width: pdfWindow.innerWidth, height: pdfWindow.innerHeight }, cards: geometries, pages: pageRects, overflowButtons: overlay.layer.querySelectorAll('.mn-overflow').length };
      report.snapshots.push(state);
      if (expectCards) check(name + ': cards are visible', cards.length > 0);
      check(name + ': cards avoid PDF pages', !geometries.some(a => pageRects.some(b => overlaps(a, b))), state);
      check(name + ': cards avoid each other', !geometries.some((a, i) => geometries.slice(i + 1).some(b => overlaps(a, b))), state);
      check(name + ': cards stay inside horizontal viewport', geometries.every(r => r.left >= -1 && r.right <= state.viewport.width + 1), state);
      await write();
      return state;
    };
    await snapshot('before fit');
    await waitFor('fit toolbar', () => reader._iframeWindow.document.querySelector('.mn-fit'));
    reader._iframeWindow.document.querySelector('.mn-fit').click();
    await mark('waiting for initial margin cards');
    await waitFor('initial margin cards', () => card(left.key) && card(right.key));
    const baseline = await snapshot('two-column baseline', true);
    const page = rectangle(doc.querySelector('.page'));
    check('left-column comment uses left outer margin', rectangle(card(left.key)).right <= page.left + 1);
    check('right-column comment uses right outer margin', rectangle(card(right.key)).left >= page.right - 1);
    check('blank highlight comments are omitted', !card(blank.key));
    check('all four first-page comments appear', [left, right, lowerLeft, lowerRight].every(item => card(item.key)));
    check('inactive margin editors are hidden by computed style', [left, right, lowerLeft, lowerRight].every(item => {
      const editor = card(item.key).querySelector('.mn-editor');
      return editor?.hidden && pdfWindow.getComputedStyle(editor).display === 'none';
    }));
    check('toolbar is mounted', !!reader._iframeWindow.document.querySelector('.mn-toolbar'));
    const visualHold = Services.prefs.getIntPref('extensions.zotero.marginSmoke.visualHold', 0);
    if (visualHold > 0) {
      mainWindow.focus();
      report.processID = Services.appinfo.processID;
      await mark('visual-ready: synthetic two-column fixture');
      await sleep(visualHold * 1000);
    }

    await native.runCore('native with margin notes enabled');
    await native.runFocusTransitions({ card, id: left.key, toggle: reader._iframeWindow.document.querySelector('.mn-toggle') });
    reader._iframeWindow.document.querySelector('.mn-fit').click();
    await waitFor('margin cards after native regression checks', () => card(left.key) && card(right.key));

    await mark('editing a persisted annotation comment');
    left.annotationComment = 'EDITED: updated in the Zotero database.';
    await left.saveTx();
    await waitFor('edited comment propagation', () => card(left.key)?.textContent.includes('EDITED:'));
    check('persisted comment edits update the card', true);
    await snapshot('edited comment', true);
    await mark('editing from the margin card');
    const readerWindow = reader._iframeWindow.wrappedJSObject || reader._iframeWindow;
    const readerDoc = readerWindow.document;
    const currentAnnotation = id => internal._state.annotations.find(a => a.id === id);
    const input = id => card(id)?.querySelector('textarea');
    const visibleInput = id => {
      const element = input(id);
      return element && !element.closest('.mn-editor').hidden && element;
    };
    const beginEditFrom = async (id, target, label) => {
      await native.doubleClick(target);
      return waitFor(label + ' opens a margin textarea', () => visibleInput(id));
    };
    const beginEdit = async id => beginEditFrom(id, card(id)?.querySelector('.mn-comment'), 'double-clicking a margin comment');
    const beginEditWithKey = async (id, keyName) => {
      const comment = card(id)?.querySelector('.mn-comment');
      comment.focus();
      await native.pressKey(pdfWindow, keyName);
      return waitFor(keyName + ' on a focused margin comment opens a textarea', () => visibleInput(id));
    };
    const typeDraft = (id, value) => {
      const editor = input(id);
      editor.value = value;
      editor.dispatchEvent(new pdfWindow.Event('input', { bubbles: true }));
      return editor;
    };
    const clickAction = (id, action) => {
      const button = card(id)?.querySelector('.mn-' + action);
      check('margin ' + action + ' button is present', !!button);
      button.click();
    };
    const parseColor = value => {
      const text = String(value || '').trim();
      if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0, raw: value };
      const parts = text.match(/[\d.]+/g)?.map(Number) || [];
      if (parts.length < 3) return { r: 0, g: 0, b: 0, a: 0, raw: value };
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1, raw: value };
    };
    const relativeLuminance = ({ r, g, b }) => {
      const convert = channel => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
    };
    const contrast = (a, b) => {
      const light = Math.max(relativeLuminance(a), relativeLuminance(b));
      const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
      return (light + 0.05) / (dark + 0.05);
    };
    const checkSelectionPalette = (label, element, frame = overlay) => {
      const original = frame.layer.dataset.theme;
      for (const theme of ['light', 'dark']) {
        frame.layer.dataset.theme = theme;
        const style = pdfWindow.getComputedStyle(element, '::selection');
        const fg = parseColor(style.color);
        const bg = parseColor(style.backgroundColor);
        check(label + ' ' + theme + ' selection remains readable',
          fg.a >= 0.99 && bg.a >= 0.99 && contrast(fg, bg) >= 4.5,
          { color: fg.raw, backgroundColor: bg.raw, contrast: contrast(fg, bg) });
      }
      frame.layer.dataset.theme = original;
    };
    const checkWhiteNoteSurface = (label, element, frame = overlay) => {
      const original = frame.layer.dataset.theme;
      for (const theme of ['light', 'dark']) {
        frame.layer.dataset.theme = theme;
        const style = pdfWindow.getComputedStyle(element);
        const fg = parseColor(style.color);
        const bg = parseColor(style.backgroundColor);
        check(label + ' ' + theme + ' surface stays opaque white and readable',
          bg.a >= 0.99 && bg.r >= 250 && bg.g >= 250 && bg.b >= 250 && contrast(fg, bg) >= 4.5,
          { color: fg.raw, backgroundColor: bg.raw, contrast: contrast(fg, bg) });
      }
      frame.layer.dataset.theme = original;
    };
    const selectedDraft = editor => editor.selectionEnd > editor.selectionStart;
    const selectionRange = editor => ({
      start: editor.selectionStart,
      end: editor.selectionEnd,
      text: editor.value.slice(editor.selectionStart, editor.selectionEnd),
    });
    check('margin notes expose no Edit buttons', !overlay.layer.querySelector('.mn-edit'));
    checkWhiteNoteSurface('margin note card', card(right.key));
    checkSelectionPalette('card comment', card(right.key).querySelector('.mn-comment'));
    await native.clickElement(card(right.key).querySelector('.mn-comment'));
    await settle();
    check('single-clicking a margin comment does not enter edit mode', !visibleInput(right.key));
    await beginEditWithKey(right.key, 'Enter');
    check('Enter is an accessible edit shortcut for focused comments', !!visibleInput(right.key));
    clickAction(right.key, 'cancel');
    await settle();
    await beginEditWithKey(right.key, 'F2');
    check('F2 is an accessible edit shortcut for focused comments', !!visibleInput(right.key));
    clickAction(right.key, 'cancel');
    await settle();
    await beginEditFrom(lowerLeft.key, card(lowerLeft.key).querySelector('.mn-quote'), 'double-clicking a margin quote');
    check('double-clicking highlighted quote text starts editing the note', !!visibleInput(lowerLeft.key));
    clickAction(lowerLeft.key, 'cancel');
    await settle();
    const savedComment = 'MARGIN SAVED: a < b & c\n한글 코멘트도 유지됩니다.';
    const commentBeforeSave = currentAnnotation(left.key).comment;
    const preservedFields = annotation => JSON.stringify({
      type: annotation.type, text: annotation.text, color: annotation.color,
      tags: annotation.tags, position: annotation.position, sortIndex: annotation.sortIndex,
    });
    const fieldsBeforeSave = preservedFields(currentAnnotation(left.key));
    const firstEditor = await beginEdit(left.key);
    await waitFor('double-clicked margin textarea focus and draft selection', () =>
      pdfWindow.document.activeElement?.isSameNode(firstEditor) && selectedDraft(firstEditor));
    check('double-clicking a margin comment focuses and selects the textarea draft',
      pdfWindow.document.activeElement?.isSameNode(firstEditor) && selectedDraft(firstEditor));
    checkWhiteNoteSurface('margin note textarea', firstEditor);
    checkSelectionPalette('card textarea', firstEditor);
    const fullDraftSelection = selectionRange(firstEditor);
    overlay.schedule();
    await settle();
    check('selected textarea draft range remains exact through a margin rerender',
      JSON.stringify(selectionRange(input(left.key))) === JSON.stringify(fullDraftSelection), {
        before: fullDraftSelection, after: selectionRange(input(left.key)),
      });
    typeDraft(left.key, savedComment).focus();
    input(left.key).setSelectionRange(0, 0);
    await native.doubleClick(input(left.key), { offsetX: 24, offsetY: 14 });
    await settle();
    const wordSelection = selectionRange(input(left.key));
    check('trusted double-click inside an active textarea selects a non-empty word without resetting the draft',
      input(left.key)?.value === savedComment && wordSelection.text.trim().length > 0, wordSelection);
    overlay.schedule();
    await settle();
    check('active textarea word selection range remains exact through a margin rerender',
      JSON.stringify(selectionRange(input(left.key))) === JSON.stringify(wordSelection), {
        before: wordSelection, after: selectionRange(input(left.key)),
      });
    await reader.navigate({ pageIndex: 1 });
    await settle();
    await reader.navigate({ pageIndex: 0 });
    await waitFor('draft restored after page navigation', () => input(left.key)?.value === savedComment);
    check('unsaved margin draft survives page navigation', true);
    clickAction(left.key, 'save');
    await waitFor('margin save reaches native reader state', () => currentAnnotation(left.key)?.comment === savedComment);
    check('margin Save updates the native annotation without escaping literal text', true);
    check('margin Save preserves highlight geometry, text, color, and tags', preservedFields(currentAnnotation(left.key)) === fieldsBeforeSave);
    await waitForPersistedComment(left, savedComment);
    check('margin Save reaches Zotero SQLite and item cache', Zotero.Items.get(left.id).annotationComment === savedComment);
    internal._annotationManager.undo();
    await waitFor('native undo of margin edit', () => currentAnnotation(left.key)?.comment === commentBeforeSave);
    await waitForPersistedComment(left, commentBeforeSave);
    check('margin edits participate in native undo and persistence', true);
    internal._annotationManager.redo();
    await waitFor('native redo of margin edit', () => currentAnnotation(left.key)?.comment === savedComment);
    await waitForPersistedComment(left, savedComment);
    check('margin edits participate in native redo and persistence', true);
    internal.toggleSidebar(true);
    internal.setSidebarView('annotations');
    internal.setSelectedAnnotations(Cu.cloneInto([left.key], reader._iframeWindow));
    const sidebarComment = await waitFor('native sidebar reflects margin edit', () => {
      const node = readerDoc.querySelector(`[data-sidebar-annotation-id="${left.key}"] .comment .content`);
      return node?.textContent.includes('MARGIN SAVED: a < b & c') && node;
    });
    check('margin Save updates Zotero native sidebar text', sidebarComment.textContent.includes('한글 코멘트도 유지됩니다.'));
    const sidebarValue = 'SIDEBAR SAVED: synchronized back to the margin.';
    sidebarComment.closest('.comment').dispatchEvent(new readerWindow.MouseEvent('click', {
      bubbles: true, cancelable: true, view: readerWindow
    }));
    await waitFor('native sidebar comment is editable', () =>
      readerDoc.querySelector(`[data-sidebar-annotation-id="${left.key}"] .comment .content`)?.isContentEditable);
    sidebarComment.focus();
    const sidebarRange = readerWindow.document.createRange();
    sidebarRange.selectNodeContents(sidebarComment);
    const sidebarSelection = readerWindow.getSelection();
    sidebarSelection.removeAllRanges();
    sidebarSelection.addRange(sidebarRange);
    readerDoc.execCommand('insertText', false, sidebarValue);
    sidebarComment.dispatchEvent(new readerWindow.InputEvent('input', { bubbles: true,
      inputType: 'insertText', data: sidebarValue }));
    await waitFor('native sidebar edit reaches annotation state', () => currentAnnotation(left.key)?.comment === sidebarValue);
    await waitForPersistedComment(left, sidebarValue);
    internal.toggleSidebar(false);
    readerDoc.querySelector('.mn-fit').click();
    await waitFor('native sidebar edit reaches margin card', () => card(left.key)?.querySelector('.mn-comment')?.textContent === sidebarValue);
    check('native sidebar edits synchronize back to margin cards and database', true);

    await mark('cancelling and rejecting conflicting drafts');
    await beginEdit(left.key);
    typeDraft(left.key, 'CANCELLED: must not be saved');
    clickAction(left.key, 'cancel');
    await settle();
    check('Cancel preserves the native comment', currentAnnotation(left.key).comment === sidebarValue);
    check('Cancel preserves the persisted comment', await Zotero.DB.valueQueryAsync('SELECT comment FROM itemAnnotations WHERE itemID = ?', [left.id]) === sidebarValue);
    await beginEdit(left.key);
    const conflictDraft = 'DRAFT: retain this after an external edit';
    typeDraft(left.key, conflictDraft);
    const externalValue = 'EXTERNAL: another editor changed this comment';
    internal._annotationManager.updateAnnotations(Cu.cloneInto([{ id: left.key, comment: externalValue }], reader._iframeWindow));
    await settle();
    clickAction(left.key, 'save');
    await settle();
    check('conflict leaves the external annotation value intact', currentAnnotation(left.key).comment === externalValue);
    check('conflict retains the unsaved textarea draft', input(left.key)?.value === conflictDraft);
    check('conflict is explained beside the editor', !!card(left.key)?.querySelector('.mn-error')?.textContent.trim());
    clickAction(left.key, 'cancel');
    await waitForPersistedComment(left, externalValue);

    await mark('retaining a draft when its comment is cleared elsewhere');
    const beforeClear = currentAnnotation(lowerLeft.key).comment;
    const clearedCommentDraft = 'DRAFT: keep this even when another editor clears the comment';
    await beginEdit(lowerLeft.key);
    typeDraft(lowerLeft.key, clearedCommentDraft);
    internal._annotationManager._skipAnnotationSavingDebounce = true;
    internal._annotationManager.updateAnnotations(Cu.cloneInto([{ id: lowerLeft.key, comment: '' }], reader._iframeWindow));
    await settle();
    const retainedEditor = input(lowerLeft.key)?.closest('.mn-editor');
    check('external clearing retains the visible margin draft',
      input(lowerLeft.key)?.value === clearedCommentDraft && retainedEditor &&
      !retainedEditor.hidden && pdfWindow.getComputedStyle(retainedEditor).display !== 'none');
    clickAction(lowerLeft.key, 'save');
    await settle();
    check('saving a draft after external clearing rejects the conflict',
      currentAnnotation(lowerLeft.key).comment === '' && input(lowerLeft.key)?.value === clearedCommentDraft &&
      !!card(lowerLeft.key)?.querySelector('.mn-error')?.textContent.trim());
    await waitForPersistedComment(lowerLeft, '');
    check('external clearing stays persisted after rejected Save', true);
    clickAction(lowerLeft.key, 'cancel');
    await waitFor('cleared comment card removed after Cancel', () => !card(lowerLeft.key));
    check('Cancel dismisses the retained draft of an empty comment', true);
    internal._annotationManager.updateAnnotations(Cu.cloneInto([{ id: lowerLeft.key, comment: beforeClear }], reader._iframeWindow));
    await waitFor('restored lower-left comment card', () => card(lowerLeft.key));
    await waitForPersistedComment(lowerLeft, beforeClear);

    await mark('respecting read-only state');
    await beginEdit(left.key);
    typeDraft(left.key, 'READONLY: must not be saved');
    internal.setReadOnly(true);
    await settle();
    clickAction(left.key, 'save');
    await settle();
    check('file read-only state prevents saving an existing draft', currentAnnotation(left.key).comment === externalValue);
    internal.setReadOnly(false);
    await settle();
    clickAction(left.key, 'cancel');
    const readonlyAnnotation = JSON.parse(JSON.stringify(currentAnnotation(left.key)));
    readonlyAnnotation.readOnly = true;
    internal.setAnnotations(Cu.cloneInto([readonlyAnnotation], reader._iframeWindow));
    await settle();
    await native.doubleClick(card(left.key).querySelector('.mn-comment'));
    await settle();
    check('read-only annotations refuse double-click margin editing',
      !visibleInput(left.key) && card(left.key)?.querySelector('.mn-comment')?.getAttribute('aria-readonly') === 'true');
    readonlyAnnotation.readOnly = false;
    internal.setAnnotations(Cu.cloneInto([readonlyAnnotation], reader._iframeWindow));
    await settle();

    await mark('preserving rich comment formatting');
    const richComment = '<b>Rich text stays bold</b> and H<sub>2</sub>O';
    internal._annotationManager.updateAnnotations(Cu.cloneInto([{ id: lowerRight.key, comment: richComment }], reader._iframeWindow));
    await waitFor('rich comment margin card', () => card(lowerRight.key)?.textContent.includes('Rich text stays bold'));
    await native.doubleClick(card(lowerRight.key).querySelector('.mn-comment'));
    await waitFor('rich comment opened in native sidebar', () => internal._state.sidebarOpen && readerDoc.querySelector(`[data-sidebar-annotation-id="${lowerRight.key}"] .comment .content`));
    const richSidebar = readerDoc.querySelector(`[data-sidebar-annotation-id="${lowerRight.key}"] .comment .content`);
    check('rich comment editing delegates to native sidebar', !!richSidebar.querySelector('b') && (!input(lowerRight.key) || input(lowerRight.key).closest('.mn-editor').hidden));
    check('rich comment markup is preserved', currentAnnotation(lowerRight.key).comment === richComment);
    await waitForPersistedComment(lowerRight, richComment);
    internal.toggleSidebar(false);
    readerDoc.querySelector('.mn-fit').click();
    await settle();
    const finalComment = currentAnnotation(left.key).comment;
    await waitForPersistedComment(left, finalComment);

    await mark('zooming and rotating');
    pdf.currentScaleValue = '1.15';
    await snapshot('zoom 115%');
    pdf.pagesRotation = 90;
    await snapshot('rotation 90 degrees');
    pdf.pagesRotation = 0;
    pdf.currentScaleValue = '0.85';
    await settle();
    await reader.navigate({ pageIndex: 1 });
    await waitFor('second-page card', () => card(second.key));
    await snapshot('scrolled to page two', true);
    check('second-page comment is visible after navigation', !!card(second.key));
    await reader.navigate({ pageIndex: 0 });
    await mark('dense annotations');
    for (let i = 0; i < 18; i++) await createAnnotation(`DENSE ${i}: collision handling with a longer comment that occupies more than one line.`, i % 2 ? 330 : 50, 700 - i * 10);
    await snapshot('dense comments', true);
    await mark('editing an overflow comment');
    const overflow = await waitFor('dense comment overflow button', () => overlay.layer.querySelector('.mn-overflow'));
    overflow.click();
    const overflowRow = await waitFor('overflow comment row', () =>
      Array.from(overlay.layer.querySelectorAll('.mn-tray-row[data-annotation-id]'))
        .find(row => currentAnnotation(row.dataset.annotationId)?.comment.startsWith('DENSE ')));
    const overflowID = overflowRow.dataset.annotationId;
    const overflowItem = Zotero.Items.getByLibraryAndKey(attachment.libraryID, overflowID);
    const activeOverflowRow = () => overlay.layer.querySelector(`.mn-tray-row[data-annotation-id="${overflowID}"]`);
    const reopenOverflowRow = async () => {
      const row = activeOverflowRow();
      if (row) return row;
      await waitFor('dense comment overflow button after tray navigation', () => overlay.layer.querySelector('.mn-overflow')).click();
      return waitFor('overflow comment row after tray navigation', activeOverflowRow);
    };
    check('overflow tray exposes a separate Open header and editable comment body',
      !!overflowItem && !!overflowRow.querySelector('.mn-open-tray') && !!overflowRow.querySelector('.mn-comment') &&
      !overflowRow.querySelector('.mn-edit'));
    checkWhiteNoteSurface('overflow tray', overflowRow.closest('.mn-tray'));
    checkSelectionPalette('overflow comment', overflowRow.querySelector('.mn-comment'));
    await native.doubleClick(overflowRow.querySelector('.mn-open-tray'));
    await settle();
    const rowAfterHeaderDblClick = await reopenOverflowRow();
    check('double-clicking the overflow Open header does not enter edit mode',
      !rowAfterHeaderDblClick.querySelector('textarea') || rowAfterHeaderDblClick.querySelector('.mn-editor')?.hidden);
    await native.doubleClick(rowAfterHeaderDblClick.querySelector('.mn-comment'));
    const overflowInput = await waitFor('overflow comment editor', () => {
      const row = activeOverflowRow();
      return row && !row.querySelector('.mn-editor').hidden && row.querySelector('textarea');
    });
    checkSelectionPalette('overflow textarea', overflowInput);
    const overflowValue = 'OVERFLOW SAVED: this hidden comment can be edited in the tray.';
    overflowInput.value = overflowValue;
    overflowInput.dispatchEvent(new pdfWindow.Event('input', { bubbles: true }));
    activeOverflowRow().querySelector('.mn-save').click();
    await waitFor('overflow edit in reader state', () => currentAnnotation(overflowID)?.comment === overflowValue);
    await waitForPersistedComment(overflowItem, overflowValue);
    check('overflow tray Save updates the native annotation and SQLite', true);
    await waitFor('saved overflow comment is displayed', () => {
      return activeOverflowRow()?.querySelector('.mn-comment')?.textContent === overflowValue ||
        card(overflowID)?.querySelector('.mn-comment')?.textContent === overflowValue;
    });
    check('overflow tray shows the saved comment', true);
    overlay.layer.querySelector('.mn-tray-heading button')?.click();
    await settle();
    await mark('narrow viewport');
    const iframe = pdfWindow.frameElement;
    const oldStyle = iframe.getAttribute('style');
    iframe.style.setProperty('width', '620px', 'important');
    iframe.style.setProperty('max-width', '620px', 'important');
    await settle();
    const narrow = await snapshot('narrow viewport');
    check('narrow test actually reduced the viewport', narrow.viewport.width < baseline.viewport.width && narrow.viewport.width <= 640);
    check('narrow viewport keeps cards safe or reports insufficient space', narrow.cards.length > 0 || overlay.noSpace > 0);
    reader._iframeWindow.document.querySelector('.mn-fit').click();
    await snapshot('narrow viewport after fit', true);
    if (oldStyle === null) iframe.removeAttribute('style'); else iframe.setAttribute('style', oldStyle);
    await settle();
    await mark('checking toggle and cleanup');
    const toggle = reader._iframeWindow.document.querySelector('.mn-toolbar button');
    toggle.click();
    await settle();
    check('toolbar toggle hides cards', !overlay.layer.querySelector('.mn-card') || overlay.layer.hidden || pdfWindow.getComputedStyle(overlay.layer).display === 'none');
    toggle.click();
    await waitFor('toggle re-enabled cards', () => overlay.layer.querySelector('.mn-card'));
    check('toolbar toggle restores cards', true);
    if (typeof internal._setReadingMode === 'function') {
      await mark('checking Zotero 10 Reading Mode flag suspension and resume');
      // The synthetic PDF has no SDT pack. Exercise the real PDF pane using the
      // state/visibility contract of Reading Mode without claiming SDT UI tests.
      report.readingModeCoverage = { controlledPrimaryFlag: true, fullSDTViewTested: false };
      const draftCard = await waitFor('editable card before Reading Mode flag transition', () =>
        Array.from(overlay.layer.querySelectorAll('.mn-card')).find(node => {
          const annotation = currentAnnotation(node.dataset.annotationId);
          const rect = node.getBoundingClientRect();
          return annotation && !/<\/?(?:i|b|sub|sup)\b/i.test(annotation.comment || '') && rect.width > 0 && rect.height > 0;
        }));
      const draftID = draftCard.dataset.annotationId;
      const commentBeforeReadingMode = currentAnnotation(draftID).comment || '';
      const unsavedReadingModeDraft = 'UNSAVED Reading Mode draft: preserve this comment without saving it.';
      await native.doubleClick(draftCard.querySelector('.mn-comment'));
      const draftInput = await waitFor('draft editor before Reading Mode flag transition', () =>
        !draftCard.querySelector('.mn-editor').hidden && draftCard.querySelector('textarea'));
      draftInput.value = unsavedReadingModeDraft;
      draftInput.dispatchEvent(new pdfWindow.Event('input', { bubbles: true }));
      const editsBeforeReadingMode = overlay.edits;
      const previousReadingMode = internal._state.primaryReadingModeEnabled;
      const previousPDFStyle = iframe.getAttribute('style');
      const scaleBeforeReadingMode = pdf.currentScale;
      try {
        internal._state.primaryReadingModeEnabled = true;
        iframe.style.visibility = 'hidden';
        iframe.style.position = 'absolute';
        // Click before the polling interval: stale frames must not zoom a PDF
        // pane that has already become hidden underneath Reading Mode.
        reader._iframeWindow.document.querySelector('.mn-fit').click();
        check('Reading Mode flag: immediate Fit Notes leaves hidden PDF scale unchanged', pdf.currentScale === scaleBeforeReadingMode);
        controller.sync();
        check('Reading Mode flag: primary PDF overlay is suspended', !controller.frames.has(view));
        check('Reading Mode flag: suspension retains the exact unsaved comment draft',
          controller.suspendedDrafts.get(view) === editsBeforeReadingMode &&
          controller.suspendedDrafts.get(view)?.get(draftID)?.draft === unsavedReadingModeDraft);
        check('Reading Mode flag: hidden PDF has no note layer', !doc.querySelector('.mn-layer'));
        check('Reading Mode flag: suspension restores the exact native focus guard', view._textAnnotationFocused === originalTextFocusedGuard);
        check('Reading Mode flag: toolbar explains why PDF notes are paused', controller.status.textContent === plugin.i18n.t('readingMode'));
        reader._iframeWindow.document.querySelector('.mn-fit').click();
        await settle();
        check('Reading Mode flag: Fit Notes after suspension preserves hidden PDF scale', pdf.currentScale === scaleBeforeReadingMode);
      } finally {
        internal._state.primaryReadingModeEnabled = previousReadingMode;
        if (previousPDFStyle === null) iframe.removeAttribute('style'); else iframe.setAttribute('style', previousPDFStyle);
        controller.sync();
      }
      await waitFor('PDF notes resume after Reading Mode flag clears', () =>
        controller.frames.get(view)?.layer.querySelector('.mn-card'));
      check('Reading Mode flag: returning to PDF resumes margin cards', controller.frames.has(view));
      check('Reading Mode flag: resumed cards reinstall the text-focus guard', view._textAnnotationFocused !== originalTextFocusedGuard);
      const resumedFrame = controller.frames.get(view);
      check('Reading Mode flag: resumed pane owns the retained draft map',
        resumedFrame.edits === editsBeforeReadingMode && !controller.suspendedDrafts.has(view) &&
        resumedFrame.edits.get(draftID)?.draft === unsavedReadingModeDraft);
      // A restored editor is taller than its comment, so this deliberately
      // crowded fixture may place it in the overflow tray instead of a card.
      const resumedDraftRow = () => resumedFrame.layer.querySelector(
        `.mn-card[data-annotation-id="${draftID}"],.mn-tray-row[data-annotation-id="${draftID}"]`);
      let restoredDraftRow = resumedDraftRow();
      const overflowCount = resumedFrame.layer.querySelectorAll('.mn-overflow').length;
      for (let index = 0; !restoredDraftRow && index < overflowCount; index++) {
        const button = resumedFrame.layer.querySelectorAll('.mn-overflow')[index];
        if (!button) continue;
        await native.clickElement(button);
        await settle();
        restoredDraftRow = resumedDraftRow();
      }
      const draftResumeDetails = {
        draftID, cards: resumedFrame.cards.size, overflowButtons: overflowCount,
        draftRetained: resumedFrame.edits.get(draftID)?.draft === unsavedReadingModeDraft,
        ui: restoredDraftRow?.classList.contains('mn-tray-row') ? 'overflow' : restoredDraftRow ? 'card' : 'missing',
      };
      report.readingModeCoverage.restoredDraftUI = draftResumeDetails.ui;
      check('Reading Mode flag: returning to PDF restores the unsaved textarea draft',
        restoredDraftRow && !restoredDraftRow.querySelector('.mn-editor').hidden &&
        restoredDraftRow.querySelector('textarea').value === unsavedReadingModeDraft, draftResumeDetails);
      restoredDraftRow.querySelector('.mn-cancel').click();
      await waitFor('restored unsaved draft is cancelled', () => !resumedFrame.edits.has(draftID));
      const draftItem = Zotero.Items.getByLibraryAndKey(attachment.libraryID, draftID);
      await waitForPersistedComment(draftItem, commentBeforeReadingMode);
      check('Reading Mode flag: cancelling the restored draft preserves native and persisted comments',
        (currentAnnotation(draftID).comment || '') === commentBeforeReadingMode);
      await native.runSelection('native text selection after Reading Mode flag resume', 24);
    }

    // Add sticky notes only after the original placement/congestion assertions.
    // Page two has room for actual cards, so a missing note cannot pass by
    // falling back to the overflow tray or merely existing in the library.
    await mark('rendering and editing native sticky-note comments');
    const sticky = await createAnnotation('STICKY NOTE: a native note needs a side memo.', 50, 600, 1, 'note');
    const blankSticky = await createAnnotation('   \n  ', 50, 480, 1, 'note');
    // navigate() initiates scrolling but does not await PDF.js layout. Finish
    // the Fit scale change first, then navigate at that settled scale.
    readerDoc.querySelector('.mn-fit').click();
    await settle();
    await reader.navigate({ pageIndex: 1 });
    const stickyFrame = await waitFor('current PDF overlay for sticky notes', () => controller.frames.get(view));
    const stickyCard = () => stickyFrame.layer.querySelector(`.mn-card[data-annotation-id="${sticky.key}"]`);
    const stickyEditor = () => {
      const node = stickyCard();
      return node && !node.querySelector('.mn-editor').hidden && node.querySelector('textarea');
    };
    const waitForStickyPage = () => waitFor('sticky-note page and anchor inside the PDF viewport', () => {
      const pageView = pdf.getPageView(1);
      const pageDiv = doc.querySelector('.page[data-page-number="2"]');
      const anchorRect = currentAnnotation(sticky.key)?.position?.rects?.[0];
      if (!pageDiv || !pageView?.viewport || !anchorRect || view._scrolling) return false;
      const point = pageView.viewport.convertToViewportPoint(
        (anchorRect[0] + anchorRect[2]) / 2, (anchorRect[1] + anchorRect[3]) / 2);
      const pageBox = rectangle(pageDiv);
      const bounds = rectangle(stickyFrame.container);
      const anchorY = pageBox.top + pageDiv.clientTop + point[1] * pageDiv.clientHeight / pageView.viewport.height;
      return pdf.currentPageNumber === 2 && pageBox.top < bounds.bottom && pageBox.bottom > bounds.top &&
        anchorY >= Math.max(0, bounds.top) && anchorY <= Math.min(pdfWindow.innerHeight, bounds.bottom);
    });
    const stickyDiagnostics = () => {
      const describeAnnotation = annotation => annotation ? {
        id: annotation.id, type: annotation.type, comment: annotation.comment,
        text: annotation.text, hidden: annotation._hidden, position: annotation.position,
      } : null;
      const pageView = pdf.getPageView(1);
      const pageDiv = doc.querySelector('.page[data-page-number="2"]');
      const position = currentAnnotation(sticky.key)?.position;
      const anchorRect = position?.rects?.[0];
      const viewportPoint = anchorRect && pageView?.viewport?.convertToViewportPoint(
        (anchorRect[0] + anchorRect[2]) / 2, (anchorRect[1] + anchorRect[3]) / 2);
      return {
        createdItem: { key: sticky.key, type: sticky.annotationType, position: JSON.parse(sticky.annotationPosition) },
        nativeNote: describeAnnotation(currentAnnotation(sticky.key)),
        overlayNote: describeAnnotation(stickyFrame.annotations?.find(annotation => annotation.id === sticky.key)),
        viewport: { width: pdfWindow.innerWidth, height: pdfWindow.innerHeight,
          scale: pdf.currentScale, currentPage: pdf.currentPageNumber },
        page: pageDiv ? { ...rectangle(pageDiv), clientWidth: pageDiv.clientWidth,
          clientHeight: pageDiv.clientHeight, viewport: { width: pageView?.viewport?.width,
            height: pageView?.viewport?.height }, viewportPoint } : null,
        container: { ...rectangle(stickyFrame.container), clientWidth: stickyFrame.container.clientWidth,
          clientHeight: stickyFrame.container.clientHeight, scrollTop: stickyFrame.container.scrollTop },
        overlay: { enabled: controller.enabled, destroyed: stickyFrame.destroyed,
          hidden: stickyFrame.layer.hidden, show: stickyFrame.show,
          noSpace: stickyFrame.noSpace, crowded: stickyFrame.crowded,
          annotationCount: stickyFrame.annotations?.length,
          cards: Array.from(stickyFrame.layer.querySelectorAll('.mn-card')).map(node => ({
            id: node.dataset.annotationId, ...rectangle(node)
          })) },
      };
    };
    try {
      await waitForStickyPage();
      await waitFor('native sticky note comment appears as a visible side memo', () => {
        const node = stickyCard();
        const r = node?.getBoundingClientRect();
        return r?.width > 0 && r.height > 0 && node.querySelector('.mn-comment')?.textContent.includes('STICKY NOTE:');
      });
    } catch (error) {
      check('native sticky-note comments render as visible margin cards', false, stickyDiagnostics());
      throw error;
    }
    check('native sticky-note comments render as visible margin cards', currentAnnotation(sticky.key)?.type === 'note');
    checkWhiteNoteSurface('sticky-note card', stickyCard(), stickyFrame);
    check('sticky-note cards omit an empty highlighted-text quote',
      stickyCard().querySelector('.mn-quote').hidden && !stickyCard().querySelector('.mn-quote').textContent);
    check('blank sticky-note comments are omitted',
      !stickyFrame.layer.querySelector(`[data-annotation-id="${blankSticky.key}"]`));
    const stickyFieldsBeforeSave = preservedFields(currentAnnotation(sticky.key));
    await native.doubleClick(stickyCard().querySelector('.mn-comment'));
    const firstStickyEditor = await waitFor('double-click opens the sticky-note margin editor', stickyEditor);
    check('double-clicking a sticky-note comment opens its margin textarea',
      firstStickyEditor.value === currentAnnotation(sticky.key).comment);
    checkWhiteNoteSurface('sticky-note textarea', firstStickyEditor, stickyFrame);
    checkSelectionPalette('sticky-note textarea', firstStickyEditor, stickyFrame);
    const stickySavedValue = 'STICKY SAVED: a < b & c\n여백 메모와 기본 사이드바가 함께 갱신됩니다.';
    firstStickyEditor.value = stickySavedValue;
    firstStickyEditor.dispatchEvent(new pdfWindow.Event('input', { bubbles: true }));
    stickyCard().querySelector('.mn-save').click();
    await waitFor('sticky-note Save reaches native reader state', () => currentAnnotation(sticky.key)?.comment === stickySavedValue);
    await waitForPersistedComment(sticky, stickySavedValue);
    check('sticky-note Save preserves literal plain text in native state, SQLite, and item cache',
      Zotero.Items.get(sticky.id).annotationComment === stickySavedValue);
    check('sticky-note Save preserves note type, anchor geometry, color, and tags',
      preservedFields(currentAnnotation(sticky.key)) === stickyFieldsBeforeSave);
    internal.toggleSidebar(true);
    internal.setSidebarView('annotations');
    internal.setSelectedAnnotations(Cu.cloneInto([sticky.key], reader._iframeWindow));
    const stickySidebar = await waitFor('native sidebar reflects saved sticky note', () => {
      const node = readerDoc.querySelector(`[data-sidebar-annotation-id="${sticky.key}"] .comment .content`);
      return node?.textContent.includes('STICKY SAVED: a < b & c') && node;
    });
    check('sticky-note margin Save updates Zotero native sidebar text',
      stickySidebar.textContent.includes('여백 메모와 기본 사이드바가 함께 갱신됩니다.'));
    stickySidebar.closest('.comment').dispatchEvent(new readerWindow.MouseEvent('click', {
      bubbles: true, cancelable: true, view: readerWindow
    }));
    await waitFor('native sticky-note sidebar comment is editable', () => stickySidebar.isContentEditable);
    stickySidebar.focus();
    const stickySidebarRange = readerDoc.createRange();
    stickySidebarRange.selectNodeContents(stickySidebar);
    const stickySidebarSelection = readerWindow.getSelection();
    stickySidebarSelection.removeAllRanges();
    stickySidebarSelection.addRange(stickySidebarRange);
    const stickySidebarValue = 'STICKY SIDEBAR SAVED: synchronized back to the side memo.';
    readerDoc.execCommand('insertText', false, stickySidebarValue);
    stickySidebar.dispatchEvent(new readerWindow.InputEvent('input', { bubbles: true,
      inputType: 'insertText', data: stickySidebarValue }));
    await waitFor('sticky-note sidebar edit reaches native state', () => currentAnnotation(sticky.key)?.comment === stickySidebarValue);
    await waitForPersistedComment(sticky, stickySidebarValue);
    internal.toggleSidebar(false);
    readerDoc.querySelector('.mn-fit').click();
    await settle();
    await reader.navigate({ pageIndex: 1 });
    await waitForStickyPage();
    await waitFor('sticky-note sidebar edit reaches the margin card', () =>
      stickyCard()?.querySelector('.mn-comment')?.textContent === stickySidebarValue);
    check('sticky-note sidebar edits synchronize to margin cards, SQLite, and item cache',
      Zotero.Items.get(sticky.id).annotationComment === stickySidebarValue);
    await native.doubleClick(stickyCard().querySelector('.mn-comment'));
    const cancelStickyEditor = await waitFor('sticky-note editor before Cancel', stickyEditor);
    cancelStickyEditor.value = 'CANCELLED STICKY DRAFT: must not reach the database';
    cancelStickyEditor.dispatchEvent(new pdfWindow.Event('input', { bubbles: true }));
    stickyCard().querySelector('.mn-cancel').click();
    await settle();
    check('sticky-note Cancel preserves the native comment and item cache',
      currentAnnotation(sticky.key).comment === stickySidebarValue &&
      Zotero.Items.get(sticky.id).annotationComment === stickySidebarValue);
    check('sticky-note Cancel preserves the persisted SQLite comment',
      await Zotero.DB.valueQueryAsync('SELECT comment FROM itemAnnotations WHERE itemID = ?', [sticky.id]) === stickySidebarValue);
    const hiddenSticky = JSON.parse(JSON.stringify(currentAnnotation(sticky.key)));
    hiddenSticky._hidden = true;
    internal.setAnnotations(Cu.cloneInto([hiddenSticky], reader._iframeWindow));
    await waitFor('hidden native sticky note omitted from side memos', () =>
      !stickyFrame.layer.querySelector(`[data-annotation-id="${sticky.key}"]`));
    check('hidden sticky-note annotations are excluded from margin cards and overflow rows', true);
    hiddenSticky._hidden = false;
    internal.setAnnotations(Cu.cloneInto([hiddenSticky], reader._iframeWindow));
    await waitFor('unhidden native sticky-note card restored', stickyCard);
    check('unhiding a sticky note restores its current saved side memo',
      stickyCard().querySelector('.mn-comment').textContent === stickySidebarValue);
    // Probe unsupported types in the overlay only. Do not send invalid image,
    // ink, or text geometry to Zotero's native annotation manager.
    const originalFrameAnnotations = stickyFrame.annotations;
    try {
      // The original array belongs to the content reader compartment. Build
      // the probe in this scope, then clone it back rather than letting a
      // content Array.concat inspect privileged argument-array symbols.
      const unsupportedAnnotations = JSON.parse(JSON.stringify(originalFrameAnnotations));
      for (const type of ['image', 'ink', 'text']) {
        unsupportedAnnotations.push({ ...hiddenSticky, id: `unsupported-${type}`, type, _hidden: false,
          comment: `UNSUPPORTED ${type}: must not become a margin memo` });
      }
      stickyFrame.annotations = Cu.cloneInto(unsupportedAnnotations, reader._iframeWindow);
      stickyFrame.render();
      for (const type of ['image', 'ink', 'text']) {
        check(`unsupported ${type} annotations remain excluded from margin notes`,
          !stickyFrame.layer.querySelector(`[data-annotation-id="unsupported-${type}"]`));
      }
    } finally {
      stickyFrame.annotations = originalFrameAnnotations;
      stickyFrame.render();
    }
    await reader.navigate({ pageIndex: 0 });
    await native.runSelection('native text selection after sticky-note editing', 26);
    smokeProduction.shutdown();
    await settle();
    check('shutdown removes card overlays', !doc.querySelector('.mn-layer'));
    check('shutdown removes reader toolbar', !reader._iframeWindow.document.querySelector('.mn-toolbar'));
    check('shutdown clears reader controllers', plugin.controllers.size === 0);
    check('shutdown restores the exact native keyboard guard', view._textAnnotationFocused === originalTextFocusedGuard);
    await native.runSelection('native text selection after plugin shutdown', 25);
    await mark('reopening the PDF to verify persisted edits');
    reader.close();
    await waitFor('original reader closed', () => !Zotero.Reader._readers.includes(reader));
    const reopened = await Zotero.Reader.open(attachment.id);
    await bounded('reopened reader initialization', reopened._initPromise);
    const restored = await waitFor('reopened annotation state', () => reopened._internalReader?._state.annotations.find(a => a.id === left.key));
    check('comment edits survive closing and reopening the PDF', restored.comment === finalComment);
    check('rich formatting survives closing and reopening the PDF', reopened._internalReader._state.annotations.find(a => a.id === lowerRight.key)?.comment === richComment);
    check('sticky-note edits survive closing and reopening the PDF',
      reopened._internalReader._state.annotations.find(a => a.id === sticky.key)?.comment === stickySidebarValue);
    report.passed = true;
  } catch (error) {
    report.error = String(error);
    report.stack = error?.stack;
  } finally {
    try { smokeProduction?.shutdown(); } catch (error) { report.cleanupError = String(error); report.passed = false; }
    report.complete = true;
    await write();
    timers.setTimeout(() => Services.startup.quit(Services.startup.eForceQuit), 250);
  }
}
