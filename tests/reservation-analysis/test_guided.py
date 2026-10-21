"""Guided launcher tests; no network or private export is required."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('guided', ROOT / 'scripts/run_reservation_analysis.py')
guided = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guided)


class GuidedTests(unittest.TestCase):
    def test_paths_defaults_and_optional_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'export with spaces.zip'
            source.touch()
            output = Path(tmp) / 'result.xlsx'
            answers = iter([f'"{source}"', '', '', str(output), 'yes'])
            with contextlib.redirect_stdout(io.StringIO()):
                args = guided.collect_options(lambda _: next(answers))
            self.assertEqual(args, ['--source', str(source), '--output', str(output)])

    def test_invalid_inputs_and_existing_output_are_reprompted(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'export.zip'; source.touch()
            evidence = Path(tmp) / 'status.json'; evidence.touch()
            occupied = Path(tmp) / 'old.xlsx'; occupied.touch()
            result = Path(tmp) / 'new.xlsx'
            answers = iter(['/missing.zip', str(source), str(evidence), '2026-02-30', '2026-10-21', str(occupied), str(result), 'yes'])
            with contextlib.redirect_stdout(io.StringIO()):
                args = guided.collect_options(lambda _: next(answers))
            self.assertIn('--status-evidence', args)
            self.assertEqual(args[-2:], ['--as-of', '2026-10-21'])
            self.assertEqual(occupied.read_bytes(), b'')

    def test_cancellation_never_starts_setup_or_generator(self):
        with patch.object(guided, 'collect_options', return_value=None), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(guided.main([], run=lambda *a, **kw: self.fail('must not execute')), 0)
        with patch.object(guided, 'collect_options', side_effect=KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(guided.main([]), 130)

    def test_setup_requires_confirmation_and_uses_argument_arrays(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(guided, 'VENV', Path(tmp) / 'venv'), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError):
                guided.ensure_python(lambda _: 'no', lambda *a, **kw: self.fail('must not execute'))
            calls = []
            guided.ensure_python(lambda _: 'yes', lambda args, **kw: calls.append(args))
            self.assertEqual(len(calls), 2)
            self.assertIn('venv', calls[0])
            self.assertIn('install', calls[1])

    def test_generator_failure_redacts_output_and_success_reports_paths(self):
        for status in [0, 1]:
            capture = io.StringIO()
            result = SimpleNamespace(returncode=status, stdout=json.dumps({'output':'/tmp/result.xlsx','guide':'/tmp/result-guide.md'}) if not status else 'PRIVATE', stderr='PRIVATE')
            with patch.object(guided, 'collect_options', return_value=['--source','a file.zip']), patch.object(guided, 'ensure_python', return_value=Path('/python')), contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
                self.assertEqual(guided.main([], run=lambda *args, **kw: result), status)
            self.assertNotIn('PRIVATE', capture.getvalue())
            if not status:
                self.assertIn('/tmp/result.xlsx', capture.getvalue())


if __name__ == '__main__':
    unittest.main()
