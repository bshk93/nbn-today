#!/usr/bin/env python3
"""Preview this checkout on your own computer, against the live site's data.

    python3 build/preview_live.py [--port 8099] [--allow-writes]

Then open http://127.0.0.1:8099.

Pages, scripts and styles come from this checkout; anything it doesn't have —
the CSVs, /api, the per-item pages nginx routes elsewhere — is fetched from
https://nbn.today. So it works anywhere with Python 3, no server access, no
data directory, and no dev.nbn.today password. (build/preview.sh is the
server-side cousin: it reads the data off the box's disk and has no /api.)

Signing in: the .nbn.today session cookie can't reach 127.0.0.1, so sign in
with your member token (the Sign in button). It's stored in this origin's
localStorage and sent as a header, which this forwards.

**Read-only by default.** /api is the LIVE API, so a POST/PUT/DELETE here is
a real write — a theme bought from the account menu really spends NB¥. Writes
are refused with a 403 unless you pass --allow-writes. Sign-in still works:
it reads /api/me, and the session/signal calls it also makes fail quietly.
"""
import argparse
import http.server
import pathlib
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIVE = 'https://nbn.today'
# Request headers worth passing upstream; everything else (Host, cookies for
# 127.0.0.1, …) stays here.
FORWARD = ('authorization', 'content-type', 'accept', 'if-none-match', 'if-modified-since')
# Response headers worth passing back. Not Set-Cookie: it's for .nbn.today.
RETURN = ('content-type', 'cache-control', 'etag', 'last-modified', 'location')


class Handler(http.server.SimpleHTTPRequestHandler):
    allow_writes = False

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _local(self):
        """The checkout's own file for this path, if it has one."""
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        if path.startswith('/api/') or path.endswith('.csv'):
            return None
        target = (ROOT / path.lstrip('/')).resolve()
        if ROOT not in target.parents and target != ROOT:
            return None
        if target.is_file() or (target.is_dir() and (target / 'index.html').is_file()):
            return target
        return None

    def end_headers(self):
        # Always fresh: the point is to see edits on reload.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self._local():
            return super().do_GET()
        self._proxy()

    def do_HEAD(self):
        if self._local():
            return super().do_HEAD()
        self._proxy()

    def _write(self):
        if not self.allow_writes:
            body = b'{"detail": "preview_live.py is read-only; pass --allow-writes to send writes to the live API"}'
            self.send_response(403)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._proxy()

    do_POST = do_PUT = do_PATCH = do_DELETE = _write

    def _proxy(self):
        length = int(self.headers.get('Content-Length') or 0)
        data = self.rfile.read(length) if length else None
        req = urllib.request.Request(LIVE + self.path, data=data, method=self.command)
        for k, v in self.headers.items():
            if k.lower() in FORWARD:
                req.add_header(k, v)
        req.add_header('User-Agent', 'nbn-preview-live')
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                status, headers, body = res.status, res.headers, res.read()
        except urllib.error.HTTPError as e:
            status, headers, body = e.code, e.headers, e.read()
        except (urllib.error.URLError, TimeoutError) as e:
            status, headers, body = 502, {}, f'upstream error: {e}'.encode()
        self.send_response(status)
        for k in RETURN:
            v = headers.get(k) if headers else None
            if v:
                self.send_header(k, v.replace(LIVE, '') if k == 'location' else v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        if not self.path.startswith('/api/'):
            return  # pages and assets are noise; API calls are worth seeing
        super().log_message(fmt, *args)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--port', type=int, default=8099)
    ap.add_argument('--allow-writes', action='store_true',
                    help='forward POST/PUT/PATCH/DELETE to the LIVE API (real writes)')
    args = ap.parse_args()
    Handler.allow_writes = args.allow_writes
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    mode = 'WRITES GO TO THE LIVE API' if args.allow_writes else 'read-only'
    print(f'serving {ROOT} + {LIVE} data on http://127.0.0.1:{args.port}  ({mode}; ctrl-c to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
