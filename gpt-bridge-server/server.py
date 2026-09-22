#!/usr/bin/env python3
"""
GPT Bridge MCP Server — HERMES-JEV-ROUTER 작업공간 expose
원본: https://github.com/ndyadav8797-art/mcp
간단한 HTTP 서버로 파일/명령어 도구 노출
"""

import os, sys, json, subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

WORKSPACE = Path(os.environ.get('WORKSPACE', r'C:\Users\User\HERMES-JEV-ROUTER')).resolve()

def safe_path(filepath):
    p = Path(filepath).resolve()
    try:
        p.relative_to(WORKSPACE)
        return p
    except ValueError:
        return None

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_json({
                'status': 'running',
                'workspace': str(WORKSPACE),
                'tools': ['read_file','write_file','edit_file','delete_file','list_directory','search_files','create_directory','run_command','git_status']
            })
        elif self.path == '/tools':
            self.send_json([
                {'name':'read_file','description':'Read a file'},
                {'name':'write_file','description':'Create/overwrite a file'},
                {'name':'edit_file','description':'Edit specific lines'},
                {'name':'delete_file','description':'Delete a file'},
                {'name':'list_directory','description':'List directory'},
                {'name':'search_files','description':'Search files by name'},
                {'name':'create_directory','description':'Create directory'},
                {'name':'run_command','description':'Run shell command'},
                {'name':'git_status','description':'Git status'},
            ])
        else:
            self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b'{}'
        try:
            data = json.loads(body)
        except:
            self.send_error(400, 'Invalid JSON')
            return

        tool = data.get('tool') or data.get('name')
        params = data.get('params', {})

        result = self.execute_tool(tool, params)
        self.send_json(result)

    def execute_tool(self, tool, params):
        if tool == 'read_file':
            fp = params.get('path') or params.get('file')
            p = safe_path(fp)
            if not p: return {'error':'Path outside workspace','code':403}
            if not p.exists(): return {'error':f'Not found: {fp}','code':404}
            return {'content': p.read_text(encoding='utf-8', errors='replace')}

        elif tool == 'write_file':
            fp = params.get('path') or params.get('file')
            content = params.get('content','')
            p = safe_path(fp)
            if not p: return {'error':'Path outside workspace','code':403}
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding='utf-8')
            return {'success':True, 'path':str(p)}

        elif tool == 'edit_file':
            fp = params.get('path') or params.get('file')
            edits = params.get('edits', [])
            p = safe_path(fp)
            if not p or not p.exists(): return {'error':f'Not found: {fp}','code':404}
            lines = p.read_text(encoding='utf-8').splitlines(True)
            for edit in edits:
                start = max(0, (edit.get('start') or 0) - 1)
                end = min(len(lines), (edit.get('end') or start+1))
                new_text = edit.get('newText','')
                lines[start:end] = [new_text]
            p.write_text(''.join(lines), encoding='utf-8')
            return {'success':True, 'path':str(p)}

        elif tool == 'delete_file':
            fp = params.get('path') or params.get('file')
            p = safe_path(fp)
            if not p: return {'error':'Path outside workspace','code':403}
            if not p.exists(): return {'error':f'Not found: {fp}','code':404}
            p.unlink()
            return {'success':True, 'path':str(p)}

        elif tool == 'list_directory':
            dp = params.get('path') or params.get('dir') or '.'
            p = safe_path(dp).resolve()
            if not p: return {'error':'Path outside workspace','code':403}
            if not p.exists(): return {'error':f'Not found: {dp}','code':404}
            items = [{'name':i.name, 'type':'directory' if i.is_dir() else 'file', 'size':i.stat().st_size if i.is_file() else None} for i in p.iterdir()]
            return {'entries':items, 'path':str(p)}

        elif tool == 'search_files':
            pattern = params.get('pattern','*')
            dp = safe_path(params.get('path') or params.get('dir') or '.')
            if not dp: return {'error':'Path outside workspace','code':403}
            matches = [str(f.relative_to(WORKSPACE)) for f in dp.rglob(pattern) if f.is_file()]
            return {'matches':matches}

        elif tool == 'create_directory':
            dp = params.get('path') or params.get('dir')
            p = safe_path(dp)
            if not p: return {'error':'Path outside workspace','code':403}
            p.mkdir(parents=True, exist_ok=True)
            return {'success':True, 'path':str(p)}

        elif tool == 'run_command':
            cmd = params.get('command','')
            if not cmd: return {'error':'No command','code':400}
            try:
                r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30, cwd=str(WORKSPACE))
                return {'stdout':r.stdout,'stderr':r.stderr,'returncode':r.returncode}
            except subprocess.TimeoutExpired:
                return {'error':'Timeout','code':408}

        elif tool == 'git_status':
            try:
                r = subprocess.run(['git','status','--short'], capture_output=True, text=True, cwd=str(WORKSPACE))
                return {'status':r.stdout,'returncode':r.returncode}
            except Exception as e:
                return {'error':str(e),'code':500}

        else:
            return {'error':f'Unknown tool: {tool}','code':400}

    def send_json(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # 조용함

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f'GPT Bridge 서버: {WORKSPACE}', flush=True)
    print(f'http://localhost:{port}/', flush=True)
    server = HTTPServer(('127.0.0.1', port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
