"""Runs the dashboard search-alert rule checks (test_search_alert.cjs) under Node."""
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(shutil.which('node') is None, reason='Node.js is not installed')
def test_search_alert_rules():
    script = Path(__file__).with_name('test_search_alert.cjs')
    result = subprocess.run(['node', str(script)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr or result.stdout
