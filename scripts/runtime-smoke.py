#!/usr/bin/env python3
"""Exercise the packaged plugin in an isolated, disposable local Zotero profile.

No libraries, credentials, preferences, or databases from the user's profile are
read or changed. The test add-on and a synthetic PDF live in a temporary tree.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def make_pdf(path):
    """Create a two-page/two-column fixture using the PDF standard library format."""
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>']
    for page in (1, 2):
        commands = [f'BT /F1 18 Tf 60 745 Td (Two-column margin notes fixture - page {page}) Tj ET']
        for x, column in ((50, 'LEFT'), (330, 'RIGHT')):
            for line in range(30):
                commands.append(f'BT /F1 10 Tf {x} {710-line*20} Td ({column} column: synthetic research text line {line+1:02}.) Tj ET')
        stream = '\n'.join(commands).encode('ascii')
        contents_id = len(objects) + 2
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents {contents_id} 0 R >>'.encode())
        objects.append(b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream')
    objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    pdf = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref = len(pdf)
    pdf.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        pdf.extend(f'{offset:010} 00000 n \n'.encode())
    pdf.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    path.write_bytes(pdf)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', default='/Applications/Zotero.app/Contents/MacOS/zotero')
    parser.add_argument('--expect-version', help='Fail before reader tests if the launched Zotero version differs from this exact version')
    parser.add_argument('--timeout', type=int, default=150)
    parser.add_argument('--report', type=Path, default=ROOT / 'dist/runtime-smoke-report.json')
    parser.add_argument('--visual-hold', type=int, default=0, help='Pause at the baseline for this many seconds for native app visual review')
    parser.add_argument('--keep-profile', action='store_true', help='Retain only this synthetic profile for diagnosis')
    parser.add_argument('--visible', action='store_true', help='Use a visible isolated Zotero window instead of headless mode')
    args = parser.parse_args()
    if not Path(args.app).is_file():
        parser.error(f'Zotero executable not found: {args.app}')
    for name in ('bootstrap.js', 'src/i18n.js', 'src/layout.js', 'src/overlay.js', 'tests/runtime-harness.js', 'tests/native-regression.js'):
        if not (ROOT / name).is_file():
            parser.error(f'Required build input is missing: {name}')
    temp = Path(tempfile.mkdtemp(prefix='zotero-margin-smoke-'))
    profile = temp / 'profile'
    data = temp / 'data'
    profile.mkdir()
    data.mkdir()
    (profile / 'extensions').mkdir()
    make_pdf(temp / 'two-column.pdf')
    prefs = {
        'extensions.zotero.useDataDir': True,
        'extensions.zotero.dataDir': str(data),
        'extensions.zotero.firstRun2': False,
        'extensions.zotero.firstRunGuidance': False,
        'extensions.zotero.automaticScraperUpdates': False,
        'extensions.zotero.httpServer.enabled': False,
        'extensions.zotero.httpServer.port': 0,
        'extensions.zotero.retractions.enabled': False,
        'extensions.zotero.sync.autoSync': False,
        'extensions.zotero.retrievePDFs': False,
        'extensions.zotero.reader.sidebarOpen': False,
        'extensions.autoDisableScopes': 0,
        'extensions.autoDisableScope': 0,
        'extensions.enabledScopes': 15,
        'extensions.logging.enabled': True,
        'browser.dom.window.dump.enabled': True,
        'extensions.sideloadScopes': 15,
        'extensions.update.enabled': False,
        'app.update.enabled': False,
        'toolkit.telemetry.enabled': False,
        'browser.shell.checkDefaultBrowser': False,
        'extensions.zotero.marginSmoke.path': str(temp),
        'extensions.zotero.marginSmoke.visualHold': args.visual_hold,
        'extensions.zotero.marginSmoke.expectedVersion': args.expect_version or '',
    }
    (profile / 'user.js').write_text(''.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});\n' for k, v in prefs.items()))
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    manifest['name'] = 'Margin Notes isolated runtime smoke harness'
    manifest['applications']['zotero']['id'] = 'margin-notes-runtime-smoke@local'
    addon = profile / 'extensions/margin-notes-runtime-smoke@local.xpi'
    with zipfile.ZipFile(addon, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json', json.dumps(manifest))
        archive.write(ROOT / 'tests/runtime-harness.js', 'bootstrap.js')
        archive.write(ROOT / 'tests/native-regression.js', 'native-regression.js')
        archive.write(ROOT / 'bootstrap.js', 'production/bootstrap.js')
        archive.write(ROOT / 'src/i18n.js', 'production/src/i18n.js')
        archive.write(ROOT / 'src/layout.js', 'production/src/layout.js')
        archive.write(ROOT / 'src/overlay.js', 'production/src/overlay.js')
    command = [args.app, '-no-remote', '-profile', str(profile), '-ZoteroDebugText']
    if not args.visible:
        command.append('-headless')
    env = dict(os.environ, MOZ_HEADLESS_WIDTH='1700', MOZ_HEADLESS_HEIGHT='1200')
    report = None
    process = None
    try:
        with (temp / 'process.log').open('w') as log:
            process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + args.timeout + args.visual_hold
            while time.monotonic() < deadline:
                if (temp / 'result.json').is_file():
                    candidate = json.loads((temp / 'result.json').read_text())
                    if candidate.get('complete'):
                        report = candidate
                        break
                if process.poll() is not None:
                    break
                time.sleep(0.25)
            if report is None:
                progress = json.loads((temp / 'result.json').read_text()) if (temp / 'result.json').exists() else None
                report = {'complete': False, 'passed': False, 'error': 'Runtime harness did not complete before process exit or timeout', 'progress': progress, 'processExit': process.poll()}
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        report['profileIsolation'] = {'temporaryProfile': True, 'separateDataDirectory': True, 'userProfileTouched': False}
        report['logTail'] = (temp / 'process.log').read_text(errors='replace')[-6000:]
        if args.keep_profile:
            report['retainedTemporaryDirectory'] = str(temp)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps({key: report[key] for key in ('complete', 'passed', 'version', 'expectedVersion', 'error', 'stage', 'retainedTemporaryDirectory') if key in report}, indent=2, ensure_ascii=False))
        print(f"Checks: {sum(check['passed'] for check in report.get('checks', []))}/{len(report.get('checks', []))} passed")
        print(f'Report: {args.report}')
        return 0 if report.get('passed') and report.get('complete') else 1
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        if not args.keep_profile:
            shutil.rmtree(temp)


if __name__ == '__main__':
    raise SystemExit(main())
