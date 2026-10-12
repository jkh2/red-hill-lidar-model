"""Build or verify two identical, deployable HTML viewers and data CSV exports.

Usage: python scripts/build_viewer.py [--check]
Python standard library only. No network or raw LiDAR required.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def csv_export(records, columns, provenance):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow([name for name, _ in columns] + ['survey_year', 'declared_horizontal_crs', 'limitations'])
    for record in records:
        writer.writerow([record[key] for _, key in columns] + [provenance['survey_year'],
            provenance['declared_payload_horizontal_crs'], 'historical_estimate_CRS_realization_unverified'])
    return stream.getvalue()

def outputs():
    payload = (ROOT / 'data/viewer_payload.json').read_text()
    provenance = json.loads((ROOT / 'data/provenance.json').read_text())
    if hashlib.sha256(payload.encode()).hexdigest() != provenance['payload_sha256']:
        raise ValueError('Survey payload changed: review provenance and update its checksum intentionally.')
    data = json.loads(payload)
    script = (ROOT / 'src/viewer.js').read_text()
    script = script.replace('__SURVEY_HELPERS__', (ROOT / 'src/survey-utils.mjs').read_text().replace('export function', 'function'))
    script = script.replace('__VIEWER_INTERACTIONS__', (ROOT / 'src/viewer-interactions.js').read_text())
    html = (ROOT / 'src/viewer-shell.html').read_text()
    replacements = {
        '__VIEWER_CSS__': 'viewer.css', '__VIEWER_BODY__': 'viewer-body.html',
        '__STARTUP_SCRIPT__': 'startup.js'
    }
    for token, filename in replacements.items():
        html = html.replace(token, (ROOT / 'src' / filename).read_text())
    html = html.replace('__VIEWER_SCRIPT__', script).replace('__SURVEY_PAYLOAD__', payload)
    if '__VIEWER_' in html or '__SURVEY_' in html:
        raise ValueError('Unresolved build token')
    pile_columns = [(k, k) for k in ['id','volume_m3','volume_yd3','area_m2','crest_above_pad_m','x','y','utm_e','utm_n']]
    structure_columns = [(k, k) for k in ['id','footprint_m2','height_m','top_elev_m_navd88','x','y','utm_e','utm_n']]
    return {'index.html': html, 'red_hill_site_viewer.html': html,
        'stockpiles.csv': csv_export(data['piles'], pile_columns, provenance),
        'structures.csv': csv_export(data['structures'], structure_columns, provenance)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, content in outputs().items():
        path = ROOT / name
        if args.check:
            if not path.exists() or path.read_bytes() != content.encode():
                raise SystemExit(f'{name} is stale; run python scripts/build_viewer.py')
        else:
            path.write_bytes(content.encode())
    print('PASS: survey checksum and identical generated viewers/CSV exports' if args.check else 'Built both viewers and CSV exports')

if __name__ == '__main__':
    main()
