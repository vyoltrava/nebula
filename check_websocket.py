#!/usr/bin/env python3
"""
WebSocket Diagnostic Script for Trelod Project
Проверяет WebSocket реализацию и генерирует подробный отчёт
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime

class WebSocketChecker:
    def __init__(self, project_root):
        self.project_root = Path(project_root)
        self.backend_dir = self.project_root / "backend"
        self.frontend_dir = self.project_root / "frontend"
        self.issues = []
        self.warnings = []
        self.info = []
        
    def read_file_safe(self, path):
        """Безопасное чтение файла с обработкой кодировки"""
        try:
            return path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            try:
                return path.read_text(encoding='cp1251')
            except:
                return ""
        except Exception as e:
            print(f"️ Не удалось прочитать {path}: {e}")
            return ""
    
    def check_file_exists(self, path, description):
        """Проверка существования файла"""
        if path.exists():
            self.info.append(f"✓ {description}: {path}")
            return True
        else:
            self.issues.append(f"✗ {description} NOT FOUND: {path}")
            return False
    
    def check_websocket_manager(self):
        """Проверка websocket_manager.py"""
        manager_file = self.backend_dir / "websocket_manager.py"
        self.check_file_exists(manager_file, "WebSocket Manager")
        
        if manager_file.exists():
            content = self.read_file_safe(manager_file)
            if "class ConnectionManager" in content:
                self.info.append("✓ ConnectionManager class found")
            else:
                self.issues.append("✗ ConnectionManager class NOT found in websocket_manager.py")
            
            if "manager = ConnectionManager()" in content:
                self.info.append("✓ Global manager instance found")
            else:
                self.issues.append("✗ Global manager instance NOT found")
    
    def check_router_imports(self):
        """Проверка импортов manager в роутерах"""
        routers_dir = self.backend_dir / "routers"
        if not routers_dir.exists():
            self.issues.append("✗ Routers directory NOT found")
            return
        
        router_files = list(routers_dir.glob("*.py"))
        self.info.append(f"Found {len(router_files)} router files")
        
        for router_file in router_files:
            content = self.read_file_safe(router_file)
            if not content:
                continue
                
            if "from websocket_manager import manager" in content:
                self.info.append(f"✓ {router_file.name} imports manager correctly")
            elif "import manager" in content:
                self.warnings.append(f"⚠ {router_file.name} might have incorrect manager import")
            elif "@router.websocket" in content or "@app.websocket" in content:
                self.warnings.append(f"⚠ {router_file.name} has websocket but might not import manager")
    
    def check_websocket_endpoint(self):
        """Проверка регистрации WebSocket эндпоинта"""
        main_files = [
            self.backend_dir / "main.py",
            self.backend_dir / "main_new.py",
        ]
        
        found_endpoint = False
        for main_file in main_files:
            if main_file.exists():
                content = self.read_file_safe(main_file)
                if "@app.websocket" in content or 'router.websocket("/ws"' in content:
                    self.info.append(f"✓ WebSocket endpoint found in {main_file.name}")
                    found_endpoint = True
                if "manager.connect" in content:
                    self.info.append(f"✓ manager.connect found in {main_file.name}")
        
        if not found_endpoint:
            routers_dir = self.backend_dir / "routers"
            if routers_dir.exists():
                for router_file in routers_dir.glob("*.py"):
                    content = self.read_file_safe(router_file)
                    if "@router.websocket" in content:
                        self.info.append(f"✓ WebSocket endpoint found in routers/{router_file.name}")
                        found_endpoint = True
        
        if not found_endpoint:
            self.issues.append("✗ WebSocket endpoint NOT found anywhere")
    
    def check_frontend_websocket(self):
        """Проверка фронтенд WebSocket клиента"""
        ws_file = self.frontend_dir / "lib" / "websocket.ts"
        if not ws_file.exists():
            ws_file = self.frontend_dir / "lib" / "websocket.js"
        
        self.check_file_exists(ws_file, "Frontend WebSocket client")
        
        if ws_file.exists():
            content = self.read_file_safe(ws_file)
            checks = {
                "class.*WebSocket": "WebSocket class",
                "connect.*token": "Token authentication",
                "onmessage": "Message handler",
                "onopen": "Connection handler",
                "onclose": "Disconnect handler",
            }
            
            import re
            for pattern, desc in checks.items():
                if re.search(pattern, content):
                    self.info.append(f"✓ {desc} found")
                else:
                    self.warnings.append(f"⚠ {desc} might be missing")
    
    def check_useWebSocket_hook(self):
        """Проверка хука useWebSocket"""
        hook_file = self.frontend_dir / "src" / "hooks" / "useWebSocket.ts"
        if not hook_file.exists():
            hook_file = self.frontend_dir / "src" / "hooks" / "useWebSocket.tsx"
        
        if self.check_file_exists(hook_file, "useWebSocket hook"):
            content = self.read_file_safe(hook_file)
            if "socket.on" in content and "useEffect" in content:
                self.info.append("✓ useWebSocket hook properly implemented")
            else:
                self.warnings.append("⚠ useWebSocket hook might have issues")
    
    def check_component_usage(self):
        """Проверка использования WebSocket в компонентах"""
        components_with_ws = []
        
        if self.frontend_dir.exists():
            for file in self.frontend_dir.rglob("*.tsx"):
                if "components" in str(file) or "pages" in str(file) or "app" in str(file):
                    try:
                        content = self.read_file_safe(file)
                        if "useWebSocket" in content:
                            components_with_ws.append(file.relative_to(self.frontend_dir))
                    except:
                        pass
        
        if components_with_ws:
            self.info.append(f"✓ Found {len(components_with_ws)} components using useWebSocket:")
            for comp in components_with_ws[:5]:
                self.info.append(f"  - {comp}")
            if len(components_with_ws) > 5:
                self.info.append(f"  ... and {len(components_with_ws) - 5} more")
        else:
            self.warnings.append("⚠ No components found using useWebSocket")
    
    def check_package_json(self):
        """Проверка зависимостей"""
        pkg_file = self.frontend_dir / "package.json"
        if pkg_file.exists():
            content = json.loads(self.read_file_safe(pkg_file))
            deps = content.get("dependencies", {})
            
            if "next" in deps:
                self.info.append(f"✓ Next.js {deps['next']} installed")
            else:
                self.issues.append("✗ Next.js NOT found in dependencies")
    
    def generate_report(self):
        """Генерация подробного отчёта"""
        report = []
        report.append("=" * 70)
        report.append("WEBSOCKET DIAGNOSTIC REPORT")
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"Project Root: {self.project_root}")
        report.append("=" * 70)
        report.append("")
        
        report.append("ISSUES FOUND:")
        report.append("-" * 70)
        if self.issues:
            for issue in self.issues:
                report.append(f"  {issue}")
        else:
            report.append("  No critical issues found ✓")
        report.append("")
        
        report.append("WARNINGS:")
        report.append("-" * 70)
        if self.warnings:
            for warning in self.warnings:
                report.append(f"  {warning}")
        else:
            report.append("  No warnings ✓")
        report.append("")
        
        report.append("INFO:")
        report.append("-" * 70)
        for info in self.info:
            report.append(f"  {info}")
        report.append("")
        
        report.append("=" * 70)
        report.append("SUMMARY:")
        report.append(f"  Issues: {len(self.issues)}")
        report.append(f"  Warnings: {len(self.warnings)}")
        report.append(f"  Info: {len(self.info)}")
        report.append("=" * 70)
        
        return "\n".join(report)
    
    def run_all_checks(self):
        """Запуск всех диагностических проверок"""
        print("Starting WebSocket diagnostic...")
        print(f"Project root: {self.project_root}")
        print("")
        
        self.check_websocket_manager()
        self.check_router_imports()
        self.check_websocket_endpoint()
        self.check_frontend_websocket()
        self.check_useWebSocket_hook()
        self.check_component_usage()
        self.check_package_json()
        
        report = self.generate_report()
        
        report_file = self.project_root / "websocket_diagnostic_report.txt"
        report_file.write_text(report, encoding='utf-8')
        
        print(report)
        print(f"\nReport saved to: {report_file}")
        
        return len(self.issues) == 0

def main():
    """Главная точка входа"""
    current_dir = Path.cwd()
    
    if (current_dir / "backend").exists() and (current_dir / "frontend").exists():
        project_root = current_dir
    elif (current_dir.parent / "backend").exists() and (current_dir.parent / "frontend").exists():
        project_root = current_dir.parent
    else:
        print("ERROR: Cannot find backend and frontend directories")
        print("Please run this script from the project root directory")
        sys.exit(1)
    
    checker = WebSocketChecker(project_root)
    success = checker.run_all_checks()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()