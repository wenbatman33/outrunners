#!/usr/bin/env python3
# 本機開發伺服器：關閉瀏覽器快取，改完程式重新整理即生效
# 用法：python3 serve.py [port]   預設 8765
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128  # 預設只有 5，瀏覽器同時載入多個模組時會被拒絕連線


with Server(('', PORT), NoCacheHandler) as httpd:
    print(f'OutRunners 3D：http://localhost:{PORT}')
    httpd.serve_forever()
