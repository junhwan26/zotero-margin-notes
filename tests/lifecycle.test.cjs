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

test('manifest constrains compatibility to the installed Zotero 9 API family', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.applications.zotero.id, 'margin-notes@local');
  assert.equal(manifest.applications.zotero.strict_min_version, '9.0');
  assert.equal(manifest.applications.zotero.strict_max_version, '9.0.*');
  assert.ok(manifest.applications.zotero.update_url, 'Zotero 9 requires an update URL even for manual distributions');
});

test('layout export follows the loadSubScript target rather than a different globalThis', () => {
  const target = {};
  const context = vm.createContext({});
  const loader = vm.compileFunction(fs.readFileSync(path.join(root, 'src/layout.js'), 'utf8'), [], { parsingContext: context });
  loader.call(target);
  assert.equal(typeof target.MarginNotesLayout?.layoutPage, 'function');
  assert.equal(context.MarginNotesLayout, undefined);
});
