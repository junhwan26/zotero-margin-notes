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
    report.checks.push({ name, passed: !!condition, ...(details === undefined ? {} : { details }) });
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
    const attachment = await Zotero.Attachments.importFromFile({ file: PathUtils.join(directory, 'two-column.pdf'), libraryID: Zotero.Libraries.userLibraryID });
    const createAnnotation = async (comment, x, y, pageIndex = 0) => {
      const item = new Zotero.Item('annotation');
      item.libraryID = attachment.libraryID;
      item.parentID = attachment.id;
      item.annotationType = 'highlight';
      item.annotationText = 'Synthetic highlighted text';
      item.annotationComment = comment;
      item.annotationColor = x < 300 ? '#ffd400' : '#ff6666';
      item.annotationPageLabel = String(pageIndex + 1);
      item.annotationSortIndex = `${String(pageIndex).padStart(5, '0')}|${String(Math.round((792 - y) * 100)).padStart(6, '0')}|00000`;
      item.annotationPosition = JSON.stringify({ pageIndex, rects: [[x, y, x + 190, y + 12]] });
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

    await mark('editing a persisted annotation comment');
    left.annotationComment = 'EDITED: updated in the Zotero database.';
    await left.saveTx();
    await waitFor('edited comment propagation', () => card(left.key)?.textContent.includes('EDITED:'));
    check('persisted comment edits update the card', true);
    await snapshot('edited comment', true);
    await mark('guarding annotation keyboard shortcuts');
    internal._updateState({ selectedAnnotationIDs: [left.key] });
    await settle();
    const beforeKeyboard = JSON.stringify(internal._state.annotations.map(a => ({ id: a.id, comment: a.comment, position: a.position })));
    const commentElement = card(left.key).querySelector('.mn-comment');
    commentElement.focus();
    check('margin comment receives keyboard focus', doc.activeElement === commentElement);
    const textFocusedGuard = view._textAnnotationFocused;
    for (const options of [{ key: 'Delete', code: 'Delete' }, { key: 'Backspace', code: 'Backspace' }, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true }, { key: 'z', code: 'KeyZ', metaKey: true }]) {
      commentElement.dispatchEvent(new pdfWindow.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }));
      commentElement.dispatchEvent(new pdfWindow.KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...options }));
    }
    await settle();
    check('margin keyboard shortcuts preserve annotations', beforeKeyboard === JSON.stringify(internal._state.annotations.map(a => ({ id: a.id, comment: a.comment, position: a.position }))));
    commentElement.blur();

    await mark('editing from the margin card');
    const readerWindow = reader._iframeWindow.wrappedJSObject || reader._iframeWindow;
    const readerDoc = readerWindow.document;
    const currentAnnotation = id => internal._state.annotations.find(a => a.id === id);
    const input = id => card(id)?.querySelector('textarea');
    const beginEdit = async id => {
      const edit = await waitFor('margin Edit button', () => card(id)?.querySelector('.mn-edit'));
      check('editable margin card offers enabled Edit button', !edit.disabled);
      edit.click();
      return waitFor('margin textarea', () => input(id) && !input(id).closest('.mn-editor').hidden && input(id));
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
    const savedComment = 'MARGIN SAVED: a < b & c\n한글 코멘트도 유지됩니다.';
    const commentBeforeSave = currentAnnotation(left.key).comment;
    const preservedFields = annotation => JSON.stringify({
      type: annotation.type, text: annotation.text, color: annotation.color,
      tags: annotation.tags, position: annotation.position, sortIndex: annotation.sortIndex,
    });
    const fieldsBeforeSave = preservedFields(currentAnnotation(left.key));
    await beginEdit(left.key);
    const editor = typeDraft(left.key, savedComment);
    editor.focus();
    const beforeDraftKeyboard = JSON.stringify(internal._state.annotations);
    for (const options of [{ key: 'Delete', code: 'Delete' }, { key: 'Backspace', code: 'Backspace' }, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true }, { key: 'z', code: 'KeyZ', metaKey: true }]) {
      editor.dispatchEvent(new pdfWindow.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }));
      editor.dispatchEvent(new pdfWindow.KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...options }));
    }
    await settle();
    check('textarea keyboard shortcuts preserve original annotations', beforeDraftKeyboard === JSON.stringify(internal._state.annotations));
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
    check('annotation read-only state disables margin editing', !!card(left.key)?.querySelector('.mn-edit')?.disabled);
    readonlyAnnotation.readOnly = false;
    internal.setAnnotations(Cu.cloneInto([readonlyAnnotation], reader._iframeWindow));
    await settle();

    await mark('preserving rich comment formatting');
    const richComment = '<b>Rich text stays bold</b> and H<sub>2</sub>O';
    internal._annotationManager.updateAnnotations(Cu.cloneInto([{ id: lowerRight.key, comment: richComment }], reader._iframeWindow));
    await waitFor('rich comment margin card', () => card(lowerRight.key)?.textContent.includes('Rich text stays bold'));
    card(lowerRight.key).querySelector('.mn-edit').click();
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
    check('overflow tray exposes an annotation with an Edit action', !!overflowItem && !!overflowRow.querySelector('.mn-edit'));
    overflowRow.querySelector('.mn-edit').click();
    const activeOverflowRow = () => overlay.layer.querySelector(`.mn-tray-row[data-annotation-id="${overflowID}"]`);
    const overflowInput = await waitFor('overflow comment editor', () => {
      const row = activeOverflowRow();
      return row && !row.querySelector('.mn-editor').hidden && row.querySelector('textarea');
    });
    const overflowValue = 'OVERFLOW SAVED: this hidden comment can be edited in the tray.';
    overflowInput.value = overflowValue;
    overflowInput.dispatchEvent(new pdfWindow.Event('input', { bubbles: true }));
    activeOverflowRow().querySelector('.mn-save').click();
    await waitFor('overflow edit in reader state', () => currentAnnotation(overflowID)?.comment === overflowValue);
    await waitForPersistedComment(overflowItem, overflowValue);
    check('overflow tray Save updates the native annotation and SQLite', true);
    await waitFor('saved overflow comment is displayed', () => {
      return activeOverflowRow()?.querySelector('.mn-open-tray')?.textContent === overflowValue ||
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
    smokeProduction.shutdown();
    await settle();
    check('shutdown removes card overlays', !doc.querySelector('.mn-layer'));
    check('shutdown removes reader toolbar', !reader._iframeWindow.document.querySelector('.mn-toolbar'));
    check('shutdown clears reader controllers', plugin.controllers.size === 0);
    check('shutdown restores keyboard guard', view._textAnnotationFocused !== textFocusedGuard);
    await mark('reopening the PDF to verify persisted edits');
    reader.close();
    await waitFor('original reader closed', () => !Zotero.Reader._readers.includes(reader));
    const reopened = await Zotero.Reader.open(attachment.id);
    await bounded('reopened reader initialization', reopened._initPromise);
    const restored = await waitFor('reopened annotation state', () => reopened._internalReader?._state.annotations.find(a => a.id === left.key));
    check('comment edits survive closing and reopening the PDF', restored.comment === finalComment);
    check('rich formatting survives closing and reopening the PDF', reopened._internalReader._state.annotations.find(a => a.id === lowerRight.key)?.comment === richComment);
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
