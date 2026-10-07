"""Build a reproducible XPI using only the Python standard library."""
import json
import hashlib
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
assert json.loads((root / 'package.json').read_text())['version'] == manifest['version'], 'Package and extension versions must match'
out = root / 'dist' / f"zotero-margin-notes-{manifest['version']}.xpi"
out.parent.mkdir(exist_ok=True)
files = ['manifest.json', 'bootstrap.js', 'src/i18n.js', 'src/layout.js', 'src/overlay.js', 'LICENSE']
# These small sources use stored entries so hashes also match across zlib versions.
with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as archive:
    for name in files:
        entry = zipfile.ZipInfo(name, (2026, 10, 7, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_STORED
        entry.external_attr = 0o644 << 16
        archive.writestr(entry, (root / name).read_bytes())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
compatibility = manifest['applications']['zotero']
update = {
    'version': manifest['version'],
    'update_link': f"https://github.com/junhwan26/zotero-margin-notes/releases/download/v{manifest['version']}/{out.name}",
    'update_hash': 'sha256:' + hashlib.sha256(out.read_bytes()).hexdigest(),
    'applications': {'zotero': {key: compatibility[key] for key in ('strict_min_version', 'strict_max_version')}},
}
(root / 'updates.json').write_text(json.dumps({'addons': {compatibility['id']: {'updates': [update]}}}, indent=2) + '\n')
print(out)
