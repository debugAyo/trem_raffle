import json
import urllib.request

try:
    with urllib.request.urlopen('http://localhost:5175/api/state', timeout=5) as r:
        data = json.loads(r.read().decode())
        print('status', r.status)
        print('ok', data.get('ok'))
        print('participants', len(data.get('state', {}).get('participants', [])))
except Exception as exc:
    print('ERROR', type(exc).__name__, exc)
