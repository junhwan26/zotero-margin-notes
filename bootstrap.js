/* global Zotero, Services, ChromeUtils, Cu */
var marginNotesScope;
var marginNotesStarting;

async function startup(data) {
  const token = {};
  marginNotesStarting = token;
  await Zotero.initializationPromise;
  if (marginNotesStarting !== token) return;
  const timers = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const root = data.rootURI || data.resourceURI.spec;
  const scope = { Zotero, Services, Cu, ...timers, MarginNotesRoot: root, MarginNotesVendor: {} };
  marginNotesScope = scope;
  // KaTeX is optional: if it cannot load, formulas stay visible as TeX source.
  try {
    // Its UMD wrapper exports to `self`, which resolves to this holder object.
    scope.MarginNotesVendor.self = scope.MarginNotesVendor;
    Services.scriptloader.loadSubScript(root + 'vendor/katex.min.js', scope.MarginNotesVendor);
  } catch (error) {
    Zotero.debug('Margin Notes: formula rendering unavailable: ' + error);
  }
  for (const name of ['i18n', 'settings', 'style', 'layout', 'markdown', 'math', 'reader', 'overlay']) {
    Services.scriptloader.loadSubScript(root + 'src/' + name + '.js', scope);
  }
  scope.MarginNotes.start();
}

function shutdown() {
  marginNotesStarting = null;
  marginNotesScope?.MarginNotes?.stop();
  marginNotesScope = null;
}

function install() {}
function uninstall() {}
