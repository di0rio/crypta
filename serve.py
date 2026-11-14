"""Static server for local play that never lets the browser cache files,
so a reload always runs the current code.  Usage: python serve.py [port]"""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
    print('ERMO em http://localhost:%d' % port)
    http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
