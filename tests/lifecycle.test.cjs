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
  vm.runInContext(fs.readFileSync(path.join(root, 'src/i18n.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/overlay.js'), 'utf8'), sandbox);
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
