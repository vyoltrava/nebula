#!/usr/bin/env python3
"""
Refactor main.py: split into core.py + routers/ + cleaned main.py
"""
import ast
import re
import os

SOURCE = 'main.py'
ROUTERS_DIR = 'routers'

with open(SOURCE, 'r', encoding='utf-8') as f:
    source = f.read()
lines = source.split('\n')
tree = ast.parse(source)
nodes = list(ast.iter_child_nodes(tree))
route_methods = ['get', 'post', 'put', 'delete', 'patch', 'websocket']

def node_source(node):
    start = node.lineno
    if node.decorator_list:
        start = min(d.lineno for d in node.decorator_list)
    end = node.end_lineno
    return '\n'.join(lines[start - 1:end])

def classify_node(node):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for dec in node.decorator_list:
            dec_src = ast.get_source_segment(source, dec)
            if dec_src:
                if any(f'app.{m}(' in dec_src for m in route_methods):
                    for m in route_methods:
                        if f'app.{m}(' in dec_src:
                            mm = re.search(r'['+chr(39)+chr(34)+r']([^'+chr(39)+chr(34)+r']*)['+chr(39)+chr(34)+r']', dec_src)
                            path = mm.group(1) if mm else '?'
                            return ('ROUTE', path, m)
                    return ('ROUTE', '?', route_methods[0])
                elif 'on_event' in dec_src or 'exception_handler' in dec_src or 'middleware' in dec_src:
                    return ('APP_LEVEL', None, None)
        return ('SHARED', None, None)
    if isinstance(node, ast.Assign):
        target = node.targets[0] if node.targets else None
        if isinstance(target, ast.Name) and target.id == 'app':
            return ('APP_LEVEL', None, None)
        if isinstance(target, ast.Attribute):
            src = ast.get_source_segment(source, target)
            if src and src.startswith('app.'):
                return ('APP_LEVEL', None, None)
        return ('SHARED', None, None)
    if isinstance(node, ast.Expr):
        val = ast.get_source_segment(source, node.value)
        if val:
            if val.startswith('app.') or val.startswith('os.makedirs') or val.startswith('app.mount'):
                return ('APP_LEVEL', None, None)
        return ('SHARED', None, None)
    return ('SHARED', None, None)

def url_to_router(path):
    if path in ('/debug/perf', '/health', '/api/online-count'):
        return 'system'
    if path == '/ws':
        return 'chats'
    if path.startswith('/api/2fa') or path.startswith('/api/login') or path == '/api/register' \
            or path.startswith('/api/keys') or path == '/api/me/logout-all':
        return 'auth'
    if path == '/api/users/{user_id}/role':
        return 'roles'
    if path.startswith('/api/roles') or path.startswith('/api/role-categories') \
            or path == '/api/permissions' or path == '/api/team':
        return 'roles'
    if path.startswith('/api/badges') or path == '/api/me/badge' or path.startswith('/api/me/custom-badge'):
        return 'badges'
    if path.startswith('/api/admin/'):
        return 'admin'
    if path.startswith('/api/search') or path.startswith('/api/tags'):
        return 'search'
    if path.startswith('/api/chats') or path == '/api/sticker-packs' \
            or path.startswith('/api/me/last-read') or path.startswith('/api/media/'):
        return 'chats'
    if path.startswith('/api/posts') or path == '/api/bookmarks' or path == '/api/counts' \
            or path == '/api/video-note' or path.startswith('/api/rules'):
        return 'posts'
    if path.startswith('/api/notifications'):
        return 'notifications'
    if path.startswith('/api/push'):
        return 'push'
    if path.startswith('/api/reports'):
        return 'reports'
    if path.startswith('/api/support'):
        return 'support'
    if path.startswith('/api/suggestions'):
        return 'suggestions'
    if path.startswith('/api/themes'):
        return 'themes'
    if path.startswith('/api/updates'):
        return 'updates'
    if path.startswith('/api/bugs'):
        return 'bugs'
    if path.startswith('/api/users') or path.startswith('/api/me'):
        return 'users'
    return 'system'