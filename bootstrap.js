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
  const scope = { Zotero, Services, Cu, ...timers };
  marginNotesScope = scope;
  Services.scriptloader.loadSubScript(root + 'src/i18n.js', scope);
  Services.scriptloader.loadSubScript(root + 'src/layout.js', scope);
  Services.scriptloader.loadSubScript(root + 'src/overlay.js', scope);
  scope.MarginNotes.start();
}

function shutdown() {
  marginNotesStarting = null;
  marginNotesScope?.MarginNotes?.stop();
  marginNotesScope = null;
}

function install() {}
function uninstall() {}
