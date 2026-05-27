"""Mini servidor HTTP local para la herramienta de alineamiento.

Sirve scripts/recinto-expansion/aligner/ en http://127.0.0.1:5800/
"""
import http.server, socketserver, os, webbrowser

PORT = 5800
DIR = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    def log_message(self, fmt, *args):
        pass  # silencio en consola

with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Aligner sirviendo en {url}")
    print(f"Carpeta: {DIR}")
    print("Ctrl+C para parar.")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    httpd.serve_forever()
