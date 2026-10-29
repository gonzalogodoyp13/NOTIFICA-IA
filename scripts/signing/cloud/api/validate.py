"""Vercel entrypoint; package with the existing isolated validation worker."""
import json
import sys
import tempfile
from importlib.metadata import distribution
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import validator_service

# Only public, operator-approved trust roots are included in the deployment.
# Configuration is generated in ephemeral storage, never from a request.
with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as config:
    json.dump({'python': sys.executable,
               # Vercel vendors wheels outside the interpreter's normal site
               # directory. The isolated child must use this trusted bundle.
               'dependencies': str(distribution('pyHanko').locate_file('')),
               'roots': [str(ROOT / 'trust' / 'ecert-root.pem'),
                         str(ROOT / 'trust' / 'freetsa-root.pem')]}, config)
    CONFIG_PATH = config.name

validator_service.configure(CONFIG_PATH)
class handler(validator_service.Handler):
    pass
