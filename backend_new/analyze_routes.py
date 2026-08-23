#!/usr/bin/env python3
"""Analyze main.py and group routes into router files."""
import ast
import re
from collections import Counter, defaultdict

with open('main.py', 'r', encoding='utf-8') as f:
    source = f.read()

tree = ast.parse(source)

route_methods = ['get', 'post', 'put', 'delete', 'patch', 'websocket']

# Extract all top-level nodes
nodes = list(ast.iter_child_nodes(tree))

# --- Classification ---
def classify_node(node):
    """Return ('ROUTE'|'APP_LEVEL'|'SHARED', route_path, route_method)"""
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        is_route = False
        is_app = False
        route_path = None
        route_method = None
        for dec in node.decorator_list:
            dec_src = ast.get_source_segment(source, dec)
            if dec_src:
                if any(f'app.{m}(' in dec_src for m in route_methods):
                    is_route = True
                    for m in route_methods:
                        if f'app.{m}(' in dec_src:
                            mm = re.search(r'[' + chr(39) + chr(34) + r']([^' + chr(39) + chr(34) + r']*)[' + chr(39) + chr(34) + r']', dec_src)
                            route_path = mm.group(1) if mm else '?'
                            route_method = m
                            break
                elif 'on_event' in dec_src or 'exception_handler' in dec_src or 'middleware' in dec_src:
                    is_app = True
        if is_route:
            return ('ROUTE', route_path, route_method)
        elif is_app:
            return ('APP_LEVEL', None, None)
        else:
            return ('SHARED', None, None)
    elif isinstance(node, ast.Assign):
        # app.state.limiter = limiter → APP_LEVEL (references app)
        target = node.targets[0] if node.targets else None
        if target and isinstance(target, ast.Attribute):
            # Check if it's app.something
            src = ast.get_source_segment(source, target)
            if src and src.startswith('app.'):
                return ('APP_LEVEL', None, None)
        return ('SHARED', None, None)
    elif isinstance(node, ast.Expr):
        val = ast.get_source_segment(source, node.value)
        if val:
            if val.startswith('app.'):
                return ('APP_LEVEL', None, None)
            if val.startswith('os.makedirs'):
                return ('APP_LEVEL', None, None)
            if val.startswith('sentry_sdk'):
                return ('SHARED', None, None)  # sentry init → shared
        return ('SHARED', None, None)
    else:
        return ('SHARED', None, None)

# URL to router mapping
def url_to_router(path):
    if path in ('/debug/perf', '/health', '/api/online-count'):
        return 'system'
    if path == '/ws':
        return 'chats'
    if path.startswith('/api/2fa') or path.startswith('/api/login') or path == '/api/register' or path.startswith('/api/keys') or path == '/api/me/logout-all':
        return 'auth'
    if path == '/api/users/{user_id}/role':
        return 'roles'
    if path.startswith('/api/roles') or path.startswith('/api/role-categories') or path == '/api/permissions' or path == '/api/team':
        return 'roles'
    if path.startswith('/api/badges') or path == '/api/me/badge' or path.startswith('/api/me/custom-badge'):
        return 'badges'
    if path.startswith('/api/admin/'):
        return 'admin'
    if path.startswith('/api/search') or path.startswith('/api/tags'):
        return 'search'
    if path.startswith('/api/chats') or path == '/api/sticker-packs' or path.startswith('/api/me/last-read') or path.startswith('/api/media/'):
        return 'chats'
    if path.startswith('/api/posts') or path == '/api/bookmarks' or path == '/api/counts' or path == '/api/video-note' or path.startswith('/api/rules'):
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

# Classify all nodes
route_nodes = []
shared_nodes = []
app_nodes = []

for node in nodes:
    cls, rpath, rmethod = classify_node(node)
    if cls == 'ROUTE':
        node._router = url_to_router(rpath)
        node._route_path = rpath
        node._route_method = rmethod
        route_nodes.append(node)
    elif cls == 'APP_LEVEL':
        app_nodes.append(node)
    else:
        shared_nodes.append(node)

# Print summary
router_names = sorted(set(n._router for n in route_nodes))
print(f"Total top-level nodes: {len(nodes)}")
print(f"Routes: {len(route_nodes)}, Shared: {len(shared_nodes)}, App-level: {len(app_nodes)}")
print(f"Router files: {len(router_names)}")
print()

counts = Counter()
for node in route_nodes:
    counts[node._router] += 1

for r in sorted(counts.keys()):
    print(f"  {r}.py: {counts[r]} routes")
print(f"  Total routes: {sum(counts.values())}")