const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function runtime(enabled = true) {
  const listeners = [{ type: 'renderToolbar', pluginID: 'another-plugin', handler() {} }];
  const intervals = new Set();
  const prefs = new Map([['extensions.margin-notes.enabled', enabled]]);
  const sandbox = {
    Zotero: {
      Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
      Reader: { _readers: [],
        registerEventListener: (type, handler, pluginID) => listeners.push({ type, handler, pluginID }),
        _unregisterEventListenerByPluginID(id) {
          for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].pluginID === id) listeners.splice(i, 1);
        } },
      logError(error) { throw error; },
    },
    setInterval(fn) { intervals.add(fn); return fn; },
    clearInterval(fn) { intervals.delete(fn); },
  };
  vm.createContext(sandbox);
  for (const name of ['i18n', 'settings', 'style', 'markdown', 'math', 'reader', 'overlay']) {
    vm.runInContext(fs.readFileSync(path.join(root, `src/${name}.js`), 'utf8'), sandbox);
  }
  return { plugin: sandbox.MarginNotes, sandbox, listeners, intervals, prefs };
}

test('start is idempotent, skips non-PDF readers, and preserves another plugin on shutdown', () => {
  const r = runtime();
  r.sandbox.Zotero.Reader._readers.push({ type: 'epub' }, { type: 'snapshot' });
  r.plugin.start(); r.plugin.start();
  assert.equal(r.intervals.size, 1);
  assert.equal(r.listeners.length, 2);
  assert.equal(r.plugin.controllers.size, 0);
  r.plugin.stop(); r.plugin.stop();
  assert.equal(r.intervals.size, 0);
  assert.deepEqual(r.listeners.map(x => x.pluginID), ['another-plugin']);
});

test('global toggle persists and disabled preference survives restart', () => {
  const r = runtime(false);
  r.plugin.start();
  assert.equal(r.plugin.enabled, false);
  r.plugin.setEnabled(true);
  assert.equal(r.prefs.get('extensions.margin-notes.enabled'), true);
  r.plugin.setEnabled(false);
  r.plugin.stop(); r.plugin.start();
  assert.equal(r.plugin.enabled, false);
  r.plugin.stop();
});

test('closing a reader removes its controller without disturbing another reader', () => {
  const r = runtime();
  const first = { type: 'pdf' }, second = { type: 'pdf' };
  r.sandbox.Zotero.Reader._readers.push(first, second);
  r.plugin.start();
  assert.equal(r.plugin.controllers.size, 2);
  r.sandbox.Zotero.Reader._readers.shift();
  r.plugin.sync();
  assert.equal(r.plugin.controllers.size, 1);
  assert.ok(r.plugin.controllers.has(second));
  r.plugin.stop();
});

test('Reading Mode skips each hidden PDF pane before dereferencing its iframe', () => {
  for (const [primaryEnabled, secondaryEnabled] of [[true, false], [false, true], [true, true]]) {
    const r = runtime();
    const state = { primaryReadingModeEnabled: primaryEnabled, secondaryReadingModeEnabled: secondaryEnabled };
    const reads = [0, 0];
    const views = [primaryEnabled, secondaryEnabled].map((readingMode, index) => ({
      get _iframeWindow() {
        reads[index]++;
        assert.equal(readingMode, false, 'A Reading Mode pane must not access its hidden PDF iframe');
        return undefined;
      },
    }));
    const reader = { type: 'pdf', _internalReader: { _state: state, _primaryView: views[0], _secondaryView: views[1] } };
    r.sandbox.Zotero.Reader._readers.push(reader);
    r.plugin.start();
    assert.deepEqual(reads, [primaryEnabled ? 0 : 1, secondaryEnabled ? 0 : 1]);
    const controller = r.plugin.controllers.get(reader);
    for (let index = 0; index < views.length; index++) {
      if (!(index === 0 ? primaryEnabled : secondaryEnabled)) continue;
      let destroyed = false;
      const edits = new Map([['annotation', { draft: 'An unsaved comment' }]]);
      controller.frames.set(views[index], { edits, destroy() { destroyed = true; } });
      r.plugin.sync();
      assert.equal(destroyed, true, 'Entering Reading Mode removes the old PDF overlay');
      assert.equal(controller.frames.has(views[index]), false);
      assert.equal(reads[index], 0);
      assert.equal(controller.suspendedDrafts.get(views[index]), edits, 'Suspension must retain the exact editor draft map');
    }
    r.plugin.stop();
    assert.equal(controller.suspendedDrafts.size, 0, 'Reader shutdown releases suspended drafts');
  }
});

test('suspended Reading Mode drafts are released when their PDF pane closes', () => {
  const r = runtime();
  const primary = {}, secondary = {};
  const reader = { type: 'pdf', _internalReader: {
    _state: { primaryReadingModeEnabled: true, secondaryReadingModeEnabled: true },
    _primaryView: primary, _secondaryView: secondary,
  } };
  r.sandbox.Zotero.Reader._readers.push(reader);
  r.plugin.start();
  const controller = r.plugin.controllers.get(reader);
  const primaryEdits = new Map([['primary', { draft: 'Still open' }]]);
  controller.suspendedDrafts.set(primary, primaryEdits);
  controller.suspendedDrafts.set(secondary, new Map([['secondary', { draft: 'Closed pane' }]]));
  reader._internalReader._secondaryView = null;
  r.plugin.sync();
  assert.equal(controller.suspendedDrafts.has(secondary), false);
  assert.equal(controller.suspendedDrafts.get(primary), primaryEdits);
  r.sandbox.Zotero.Reader._readers.length = 0;
  r.plugin.sync();
  assert.equal(controller.suspendedDrafts.size, 0);
  assert.equal(r.plugin.controllers.has(reader), false);
  r.plugin.stop();
});

function commentRuntime(cloneInto) {
  const r = runtime();
  const calls = { updates: [], selections: [], sidebar: [] };
  const errors = [];
  const readerWindow = {};
  const reader = { type: 'pdf', _iframeWindow: readerWindow,
    navigate() {},
    _internalReader: {
      _state: { annotations: [{ id: 'A', comment: 'before' }] },
      _annotationManager: { updateAnnotations: changes => calls.updates.push(changes) },
      toggleSidebar: open => calls.sidebar.push(open),
      setSidebarView: view => calls.sidebar.push(view),
      setSelectedAnnotations: ids => calls.selections.push(ids),
    },
  };
  r.sandbox.Zotero.logError = error => errors.push(error);
  if (cloneInto) r.sandbox.Cu = { cloneInto };
  r.plugin.start();
  return { ...r, controller: r.plugin.ensure(reader), reader, readerWindow, calls, errors };
}

test('comment saves clone their payload into the reader window before native dispatch', () => {
  const clones = [];
  const r = commentRuntime((payload, target) => {
    const cloned = JSON.parse(JSON.stringify(payload));
    clones.push({ payload, target, cloned });
    return cloned;
  });
  assert.equal(r.controller.updateComment('A', 'before', 'after').ok, true);
  assert.equal(clones.length, 1);
  assert.equal(clones[0].target, r.readerWindow);
  assert.notEqual(clones[0].payload, clones[0].cloned);
  assert.equal(r.calls.updates[0], clones[0].cloned);
  assert.deepEqual(r.calls.updates[0], [{ id: 'A', comment: 'after' }]);
  assert.equal(r.errors.length, 0);
  r.plugin.stop();
});

test('rich-comment delegation clones selection IDs into the reader window', () => {
  const clones = [];
  const r = commentRuntime((payload, target) => {
    const cloned = JSON.parse(JSON.stringify(payload));
    clones.push({ payload, target, cloned });
    return cloned;
  });
  r.controller.openAnnotationEditor('A');
  assert.equal(clones.length, 1);
  assert.equal(clones[0].target, r.readerWindow);
  assert.notEqual(clones[0].payload, clones[0].cloned);
  assert.equal(r.calls.selections[0], clones[0].cloned);
  assert.deepEqual(r.calls.selections[0], ['A']);
  assert.deepEqual(r.calls.sidebar, [true, 'annotations']);
  assert.equal(r.errors.length, 0);
  r.plugin.stop();
});

test('unavailable reader bridges fail visibly without passing raw privileged arrays', () => {
  for (const operation of ['save', 'rich editor']) {
    for (const failure of ['missing Cu', 'missing cloneInto', 'clone error', 'missing reader window']) {
      const expected = new Error(failure);
      const missingBridge = failure === 'missing Cu' || failure === 'missing cloneInto';
      const r = commentRuntime(missingBridge ? undefined : (_payload, target) => {
        if (failure === 'clone error' || !target) throw expected;
        throw new Error('An unavailable target must never be dispatched');
      });
      if (failure === 'missing cloneInto') r.sandbox.Cu = {};
      if (failure === 'missing reader window') delete r.reader._iframeWindow;
      if (operation === 'save') {
        const result = r.controller.updateComment('A', 'before', 'after');
        assert.equal(result.ok, false, failure);
        assert.equal(result.message, 'Could not save', failure);
      } else r.controller.openAnnotationEditor('A');
      assert.equal(r.calls.updates.length, 0, `${operation}: ${failure}`);
      assert.equal(r.calls.selections.length, 0, `${operation}: ${failure}`);
      assert.equal(r.errors.length, 1, `${operation}: ${failure}`);
      if (failure === 'clone error' || failure === 'missing reader window') assert.equal(r.errors[0], expected);
      r.plugin.stop();
    }
  }
});

test('a reader without the internal annotation manager saves through the item API', async () => {
  const r = commentRuntime(payload => JSON.parse(JSON.stringify(payload)));
  delete r.reader._internalReader._annotationManager;
  r.reader.itemID = 7;
  const saved = [];
  let rejectSave = false;
  const item = { isAnnotation: () => true,
    saveTx() { saved.push(this.annotationComment); return rejectSave ? Promise.reject(new Error('disk full')) : Promise.resolve(); } };
  r.sandbox.Zotero.Items = {
    get: id => ({ libraryID: id === 7 ? 3 : -1 }),
    getByLibraryAndKey: (libraryID, key) => libraryID === 3 && key === 'A' ? item : null,
  };
  assert.equal(r.controller.updateComment('A', 'before', 'after').ok, true);
  assert.deepEqual(saved, ['after']);
  assert.equal(r.errors.length, 0);
  rejectSave = true;
  assert.equal(r.controller.updateComment('A', 'before', 'again').ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.errors.length, 1, 'A late save failure must be reported');
  r.sandbox.Zotero.Items.getByLibraryAndKey = () => null;
  const missing = r.controller.updateComment('A', 'before', 'lost');
  assert.equal(missing.ok, false);
  assert.equal(missing.message, 'Could not save');
  r.plugin.stop();
});

test('Alt+M toggles notes but leaves text fields and other chords alone', () => {
  const r = runtime();
  r.plugin.start();
  const press = (overrides = {}, editable = false) => {
    const event = { code: 'KeyM', altKey: true, prevented: false, stopped: false,
      target: { closest: () => editable ? {} : null },
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
    r.plugin.handleShortcut(event);
    return event;
  };
  assert.equal(press().prevented, true);
  assert.equal(r.plugin.enabled, false);
  assert.equal(r.prefs.get('extensions.margin-notes.enabled'), false);
  for (const ignored of [press({}, true), press({ metaKey: true }), press({ ctrlKey: true }),
    press({ shiftKey: true }), press({ altKey: false }), press({ code: 'KeyN' })]) {
    assert.equal(ignored.prevented, false);
    assert.equal(ignored.stopped, false);
  }
  assert.equal(r.plugin.enabled, false);
  r.prefs.set('extensions.margin-notes.shortcut', false);
  r.plugin.applySettings();
  assert.equal(press().prevented, false);
  assert.equal(r.plugin.enabled, false);
  r.plugin.stop();
});

test('settings changes reach open readers and item notifications refresh them', () => {
  const r = runtime();
  const timeouts = [];
  let observer;
  let released;
  r.sandbox.setTimeout = fn => { timeouts.push(fn); return timeouts.length; };
  r.sandbox.clearTimeout = () => {};
  r.sandbox.Zotero.Notifier = {
    registerObserver(target, types, id) { observer = { target, types, id }; return 'notifier-id'; },
    unregisterObserver(id) { released = id; },
  };
  const reader = { type: 'pdf' };
  r.sandbox.Zotero.Reader._readers.push(reader);
  r.plugin.start();
  assert.deepEqual([...observer.types], ['item']);
  const controller = r.plugin.controllers.get(reader);
  let applied = 0;
  controller.frames.set({}, { applySettings() { applied++; }, destroy() {} });
  r.prefs.set('extensions.margin-notes.fontSize', 16);
  r.plugin.applySettings();
  assert.equal(r.plugin.config.fontSize, 16);
  assert.equal(applied, 1);
  let synced = 0;
  controller.sync = () => { synced++; };
  observer.target.notify();
  observer.target.notify();
  assert.equal(timeouts.length, 1, 'Bursts of notifications share one refresh');
  timeouts[0]();
  assert.equal(synced, 1);
  r.plugin.stop();
  assert.equal(released, 'notifier-id');
});

test('the native comment popup hides only while a margin card shows the same annotation', () => {
  const r = runtime();
  const state = { primaryViewAnnotationPopup: null, secondaryViewAnnotationPopup: null };
  const reader = { type: 'pdf', _internalReader: { _state: state } };
  r.plugin.start();
  const controller = r.plugin.ensure(reader);
  const attributes = new Map();
  controller.toggle = { setAttribute() {} };
  controller.status = {};
  controller.toolbar = { remove() {}, ownerDocument: { documentElement: {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  } } };
  const card = (id, extra = {}) => ({ dataset: { annotationId: id }, isConnected: true, hidden: false, ...extra });
  controller.frames.set({}, { applySettings() {}, destroy() {}, cards: new Map([['0:A', card('A')], ['0:B', card('B', { hidden: true })]]) });
  const popup = () => attributes.get('data-mn-native-popup');

  controller.updateNativePopup();
  assert.equal(popup(), 'hide', 'With no popup open, the next popup starts hidden');
  state.primaryViewAnnotationPopup = { annotation: { id: 'A' } };
  controller.updateNativePopup();
  assert.equal(popup(), 'hide');
  for (const id of ['B', 'image-without-card']) {
    state.primaryViewAnnotationPopup = { annotation: { id } };
    controller.updateNativePopup();
    assert.equal(popup(), undefined, `${id}: an annotation without a visible card keeps Zotero's popup`);
  }
  state.primaryViewAnnotationPopup = { annotation: { id: 'A' } };
  state.secondaryViewAnnotationPopup = { annotation: { id: 'image-without-card' } };
  controller.updateNativePopup();
  assert.equal(popup(), undefined, 'Any open popup without a card keeps the popups visible');
  state.secondaryViewAnnotationPopup = null;
  controller.enabled = false;
  controller.updateNativePopup();
  assert.equal(popup(), undefined, 'Turning margin notes off restores the popup');
  controller.enabled = true;
  r.prefs.set('extensions.margin-notes.hideNativePopup', false);
  r.plugin.applySettings();
  controller.updateNativePopup();
  assert.equal(popup(), undefined, 'The setting can keep the popup');
  r.prefs.set('extensions.margin-notes.hideNativePopup', true);
  r.plugin.applySettings();
  controller.updateNativePopup();
  assert.equal(popup(), 'hide');
  controller.unmountToolbar();
  assert.equal(popup(), undefined, 'Removing the toolbar clears the attribute');
  r.plugin.stop();
});

test('the packaged XPI and the runtime harness ship every file the bootstrap loads', () => {
  const bootstrap = fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8');
  const names = /for \(const name of \[([^\]]+)\]\)/.exec(bootstrap)[1].match(/\w+/g);
  const loaded = names.map(name => `src/${name}.js`).concat('vendor/katex.min.js', 'prefs/preferences.xhtml');
  for (const script of ['scripts/build.py', 'scripts/runtime-smoke.py']) {
    const source = fs.readFileSync(path.join(root, script), 'utf8');
    for (const file of loaded) assert.ok(source.includes(`'${file}'`), `${script} must pack ${file}`);
  }
  for (const file of loaded) assert.ok(fs.existsSync(path.join(root, file)), file);
});

test('shutdown cancels startup that is awaiting Zotero initialization', async () => {
  let resolveInitialization;
  const sandbox = {
    Zotero: { initializationPromise: new Promise(resolve => { resolveInitialization = resolve; }) },
    ChromeUtils: { importESModule() { throw new Error('A cancelled startup must not load timers'); } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8'), sandbox);
  const starting = sandbox.startup({ rootURI: 'file:///unused/' });
  sandbox.shutdown();
  resolveInitialization();
  await starting;
  assert.equal(sandbox.marginNotesScope, null);
});

test('manifest and update metadata support only the verified Zotero 9 and 10 API families', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const updates = JSON.parse(fs.readFileSync(path.join(root, 'updates.json')));
  assert.equal(manifest.applications.zotero.id, 'margin-notes@local');
  assert.equal(manifest.applications.zotero.strict_min_version, '9.0');
  assert.equal(manifest.applications.zotero.strict_max_version, '10.0.*');
  assert.ok(manifest.applications.zotero.update_url, 'Zotero requires an update URL even for manual distributions');
  const update = updates.addons[manifest.applications.zotero.id].updates[0];
  assert.equal(update.version, manifest.version);
  assert.deepEqual(update.applications.zotero, {
    strict_min_version: manifest.applications.zotero.strict_min_version,
    strict_max_version: manifest.applications.zotero.strict_max_version,
  }, 'Automatic updates must advertise the same tested Zotero versions as the installed XPI');
});

test('native harness rejects the wrong Zotero version before touching the test library', async () => {
  for (const [actual, expected] of [['9.0.6', '10.0.6'], ['10.0.6', '9.0.6']]) {
    let lastReport;
    let initialized = false;
    const sandbox = {
      Zotero: {
        version: actual,
        get initializationPromise() { initialized = true; throw new Error('Wrong-version tests must stop before initialization'); },
      },
      Services: {
        prefs: { getStringPref: key => key.endsWith('expectedVersion') ? expected : '/unused-synthetic-profile' },
        startup: { quit() { throw new Error('The unit test must not quit the host'); } },
      },
      IOUtils: { async writeJSON(_path, report) { lastReport = JSON.parse(JSON.stringify(report)); } },
      PathUtils: { join: (...parts) => parts.join('/') },
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'tests/runtime-harness.js'), 'utf8'), sandbox);
    await sandbox.runSmoke({ setTimeout() {} });
    assert.equal(initialized, false);
    assert.equal(lastReport.complete, true);
    assert.equal(lastReport.passed, false);
    assert.equal(lastReport.version, actual);
    assert.equal(lastReport.expectedVersion, expected);
    assert.equal(lastReport.checks.length, 1);
    assert.equal(lastReport.checks[0].passed, false);
    assert.match(lastReport.error, /launched Zotero version matches the requested test version/);
  }
});

test('layout export follows the loadSubScript target rather than a different globalThis', () => {
  const target = {};
  const context = vm.createContext({});
  const loader = vm.compileFunction(fs.readFileSync(path.join(root, 'src/layout.js'), 'utf8'), [], { parsingContext: context });
  loader.call(target);
  assert.equal(typeof target.MarginNotesLayout?.layoutPage, 'function');
  assert.equal(context.MarginNotesLayout, undefined);
});


test('late preference pane registration cannot outlive shutdown or replace a restarted pane', async () => {
  for (const restart of [false, true]) {
    const r = runtime();
    const pending = [];
    const panes = new Set();
    r.sandbox.MarginNotesRoot = 'file:///isolated-plugin/';
    r.sandbox.Zotero.PreferencePanes = {
      register: () => new Promise(resolve => pending.push(id => { panes.add(id); resolve(id); })),
      unregister: id => panes.delete(id),
    };
    const flushRegistration = () => new Promise(resolve => setImmediate(resolve));
    r.plugin.start();
    assert.equal(pending.length, 1);
    r.plugin.stop();
    if (restart) {
      r.plugin.start();
      pending[1]('current-pane');
      await flushRegistration();
      assert.equal(r.plugin.pane, 'current-pane');
    }
    pending[0]('obsolete-pane');
    await flushRegistration();
    assert.deepEqual([...panes], restart ? ['current-pane'] : [],
      'A registration completed after shutdown must unregister its own pane');
    assert.equal(r.plugin.pane ?? null, restart ? 'current-pane' : null,
      'An old startup cannot replace the active pane handle');
    r.plugin.stop();
    assert.equal(panes.size, 0);
  }
});
