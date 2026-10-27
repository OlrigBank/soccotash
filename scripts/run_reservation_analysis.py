#!/usr/bin/env python3
"""Guided local reservation analysis; no database connection or credentials needed."""
from __future__ import annotations

import argparse
from datetime import date, datetime
import json
import os
from pathlib import Path
import subprocess
import sys

from reservation_analysis.reconciliation import DEFAULT_CSV_DIRECTORY, discover_csv_files

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / 'scripts/.venv-reservation-analysis'


def local_path(value):
    # Accept a path pasted from a terminal with surrounding quotes, including spaces.
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    path = Path(value).expanduser()
    return (path if path.is_absolute() else ROOT / path).resolve()


def ask_file(prompt, suffix, ask, optional=False):
    while True:
        value = ask(prompt).strip()
        if optional and not value:
            return None
        path = local_path(value)
        if value and path.is_file() and path.suffix.lower() == suffix:
            return path
        print(f'Enter an existing {suffix} file path. Relative paths start at the repository root.')


def collect_options(ask=input):
    print('Reservation analysis — generate a workbook from an exported ZIP.')
    print('No database URL, encryption key or development/production connection is required.')
    print('Export the detailed reservation evidence ZIP from Admin → Historical pricing in the environment you want to analyse.')
    print('Keep it zipped. It may remain in Downloads or be placed in docs/source-material/airbnb/.')
    source = ask_file('Export ZIP path: ', '.zip', ask)
    print('Optional status evidence is a separately reviewed JSON file tied to this exact ZIP.')
    print('Leave blank for a new export unless you have matching evidence; do not reuse an older export’s corrections.')
    evidence = ask_file('Status evidence JSON path [none]: ', '.json', ask, optional=True)
    while True:
        cutoff = ask('Analysis cutoff YYYY-MM-DD [use export date]: ').strip()
        try:
            if cutoff:
                if date.fromisoformat(cutoff).isoformat() != cutoff:
                    raise ValueError()
            break
        except ValueError:
            print('Enter a valid date in YYYY-MM-DD format, or leave blank.')
    stamp = datetime.now().strftime('%Y-%m-%d-%H%M%S')
    default = f'outputs/reservation-analysis-{stamp}/reservation-analysis.xlsx'
    while True:
        output = local_path(ask(f'Output workbook path [{default}]: ').strip() or default)
        guide = output.with_name(output.stem + '-guide.md')
        if output.suffix.lower() != '.xlsx':
            print('The output must end in .xlsx.')
        elif output.exists() or guide.exists():
            print('That workbook or guide already exists. Choose a new output path; existing results are preserved.')
        else:
            break
    args = ['--source', str(source), '--output', str(output)]
    if evidence:
        args += ['--status-evidence', str(evidence)]
    if cutoff:
        args += ['--as-of', cutoff]
    csv_files = discover_csv_files(DEFAULT_CSV_DIRECTORY)
    print('\nReservation CSV reconciliation: ' + (', '.join(p.name for p in csv_files) if csv_files else 'none (13-tab workbook)'))
    if csv_files:
        print('Adds Review, Comparisons, CSV reservations and Extract reservations. Pricing calculations remain unchanged.')
        args += ['--reservation-csv-dir', str(DEFAULT_CSV_DIRECTORY)]
    print(f'\nSource: {source}\nStatus evidence: {evidence or "none"}\nCutoff: {cutoff or "export date (Europe/London)"}\nWorkbook: {output}\nGuide: {guide}')
    return args if ask('Generate these files? Type yes to continue: ').strip().lower() == 'yes' else None


def ensure_python(ask=input, run=subprocess.run):
    python = VENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    # Check installed versions without importing the generator or changing files.
    check = 'import importlib.metadata as m; assert m.version("XlsxWriter")=="3.2.9"; assert m.version("tzdata")=="2025.2"'
    if python.is_file() and run([str(python), '-c', check], capture_output=True).returncode == 0:
        return python
    print('The local Python environment needs setup. This installs the pinned dependencies from scripts/requirements-reservation-analysis.txt.')
    print(f'Environment: {VENV}. Installation may require internet access; the export ZIP is not sent anywhere.')
    if ask('Create/update this environment? Type yes to install: ').strip().lower() != 'yes':
        raise ValueError('Setup cancelled; no analysis generated.')
    run([sys.executable, '-m', 'venv', str(VENV)], check=True)
    run([str(python), '-m', 'pip', 'install', '-r', str(ROOT / 'scripts/requirements-reservation-analysis.txt')], check=True)
    return python


def main(argv=None, ask=input, run=subprocess.run):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)
    if sys.version_info < (3, 10):
        print('Python 3.10 or newer is required.', file=sys.stderr)
        return 1
    try:
        args = collect_options(ask)
        if args is None:
            print('Cancelled; no analysis generated.')
            return 0
        python = ensure_python(ask, run)
        result = run([str(python), str(ROOT / 'scripts/reservation_analysis.py'), *args], cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            print('Analysis failed; no successful result is claimed. Check that the ZIP is a compatible reservation-evidence export and any status evidence matches this ZIP.', file=sys.stderr)
            print('Detailed generator output was suppressed because validation errors can contain private identifiers. Use the documented direct command for private diagnosis.', file=sys.stderr)
            return result.returncode
        summary = json.loads(result.stdout)
        print(f'\nAnalysis completed.\nWorkbook: {summary["output"]}\nGuide: {summary["guide"]}')
        if 'reconciliation' in summary:
            reconciled = summary['reconciliation']
            print(f'Reconciliation: {reconciled["confirmed_matches"]} confirmed, {reconciled["provisional_matches"]} provisional, {reconciled["unmatched_csv"]} without an extract counterpart, {reconciled["ambiguous_csv"]} ambiguous.')
        return 0
    except (EOFError, KeyboardInterrupt):
        print('\nCancelled.')
        return 130
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Unable to complete analysis setup ({type(error).__name__}). Check Python, file permissions and dependency installation.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
