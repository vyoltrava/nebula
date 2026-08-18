# smart_fix_imports.py
import ast
import os
from pathlib import Path

DEPENDENCIES_FILE = "dependencies.py"
ROUTERS_DIR = "routers"

# Имена, которые НЕ нужно импортировать (встроенные + стандартные)
BUILTINS = set(dir(__builtins__)) if isinstance(__builtins__, dict) else set(dir(__builtins__))
STANDARD_IMPORTS = {
    "os", "sys", "json", "re", "time", "uuid", "io", "base64", "subprocess",
    "tempfile", "asyncio", "hashlib", "threading",
    "datetime", "timedelta", "timezone",
    "typing", "Optional", "List", "Dict", "Any",
    "fastapi", "FastAPI", "APIRouter", "Depends", "HTTPException", "Request",
    "Form", "File", "UploadFile", "Header", "Query", "BackgroundTasks",
    "WebSocket", "WebSocketDisconnect", "Response", "JSONResponse",
    "sqlmodel", "Session", "select", "func", "col", "delete", "update",
    "sqlalchemy", "text",
    "pydantic", "BaseModel",
    "jwt", "bcrypt", "cloudinary", "pyotp", "qrcode",
    "imageio_ffmpeg", "get_ffmpeg_exe",
    "push_service", "send_push", "get_vapid",
    "websocket_manager", "manager",
    "performance", "PerfMiddleware", "get_perf_summary",
    "link_preview",
}

def get_exports_from_dependencies(filepath: str) -> set:
    """Парсит dependencies.py и возвращает все экспортируемые имена"""
    if not os.path.exists(filepath):
        return set()
    
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError:
            return set()
    
    exports = set()
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            exports.add(node.name)
        elif isinstance(node, ast.ClassDef):
            exports.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    exports.add(target.id)
                elif isinstance(target, ast.Tuple):
                    for elt in target.elts:
                        if isinstance(elt, ast.Name):
                            exports.add(elt.id)
    
    return exports

def get_file_imports(filepath: str) -> set:
    """Возвращает все имена, которые уже импортированы в файл"""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError:
            return set()
    
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.asname if alias.asname else alias.name)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imports.add(alias.asname if alias.asname else alias.name)
    return imports

def get_local_names(filepath: str) -> set:
    """Возвращает все имена, определённые локально в файле (аргументы функций, локальные переменные)"""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError:
            return set()
    
    local = set()
    
    # Собираем аргументы функций и локальные переменные
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Аргументы функции
            for arg in node.args.args:
                local.add(arg.arg)
            if node.args.vararg:
                local.add(node.args.vararg.arg)
            if node.args.kwarg:
                local.add(node.args.kwarg.arg)
            
            # Локальные переменные (присваивания внутри функции)
            for subnode in ast.walk(node):
                if isinstance(subnode, ast.Assign):
                    for target in subnode.targets:
                        if isinstance(target, ast.Name):
                            local.add(target.id)
                        elif isinstance(target, (ast.Tuple, ast.List)):
                            for elt in target.elts:
                                if isinstance(elt, ast.Name):
                                    local.add(elt.id)
                elif isinstance(subnode, ast.AnnAssign):
                    if isinstance(subnode.target, ast.Name):
                        local.add(subnode.target.id)
                elif isinstance(subnode, ast.AugAssign):
                    if isinstance(subnode.target, ast.Name):
                        local.add(subnode.target.id)
                elif isinstance(subnode, (ast.For, ast.AsyncFor)):
                    if isinstance(subnode.target, ast.Name):
                        local.add(subnode.target.id)
                    elif isinstance(subnode.target, (ast.Tuple, ast.List)):
                        for elt in subnode.target.elts:
                            if isinstance(elt, ast.Name):
                                local.add(elt.id)
                elif isinstance(subnode, ast.With):
                    for item in subnode.items:
                        if item.optional_vars and isinstance(item.optional_vars, ast.Name):
                            local.add(item.optional_vars.id)
                elif isinstance(subnode, ast.ExceptHandler):
                    if subnode.name:
                        local.add(subnode.name)
    
    return local

def get_used_names(filepath: str) -> set:
    """Возвращает все имена, которые используются в файле"""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError:
            return set()
    
    used = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            used.add(node.id)
    return used

def find_missing_imports(filepath: str, available_exports: set) -> list:
    """Находит имена, которые используются, но не импортированы и не определены локально"""
    imports = get_file_imports(filepath)
    local = get_local_names(filepath)
    used = get_used_names(filepath)
    
    # Все доступные имена
    available = imports | local | BUILTINS | STANDARD_IMPORTS
    
    missing = []
    for name in sorted(used):
        if name not in available and name in available_exports:
            missing.append(name)
    
    return missing

def add_imports_to_file(filepath: str, imports_to_add: list):
    """Добавляет импорты в начало файла"""
    if not imports_to_add:
        return
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Проверяем, есть ли уже импорт из dependencies
    if "from dependencies import" in content:
        # Находим существующий импорт и добавляем новые имена
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.startswith("from dependencies import"):
                # Извлекаем текущие импорты
                current_imports = line.replace("from dependencies import", "").strip()
                if current_imports.endswith("\\"):
                    # Многострочный импорт
                    all_imports = current_imports.rstrip("\\").strip()
                    j = i + 1
                    while j < len(lines) and lines[j].strip().endswith("\\"):
                        all_imports += " " + lines[j].strip().rstrip("\\").strip()
                        j += 1
                    if j < len(lines) and lines[j].strip():
                        all_imports += " " + lines[j].strip()
                    
                    # Добавляем новые импорты
                    existing_set = set(x.strip().rstrip(",") for x in all_imports.split(",") if x.strip())
                    new_imports = existing_set | set(imports_to_add)
                    
                    # Формируем новый импорт
                    new_line = "from dependencies import " + ", ".join(sorted(new_imports))
                    lines[i] = new_line
                    # Удаляем продолжения многострочного импорта
                    for k in range(i+1, j+1):
                        if k < len(lines) and (lines[k].strip().endswith("\\") or lines[k].strip().startswith("(")):
                            lines[k] = ""
                    
                    content = "\n".join(lines)
                    break
        else:
            # Не нашли импорт в цикле, добавляем новый
            import_line = "from dependencies import " + ", ".join(sorted(imports_to_add))
            content = import_line + "\n" + content
    else:
        # Нет импорта из dependencies, добавляем новый
        import_line = "from dependencies import " + ", ".join(sorted(imports_to_add))
        content = import_line + "\n" + content
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    print("🔍 Анализируем dependencies.py...")
    exports = get_exports_from_dependencies(DEPENDENCIES_FILE)
    print(f"   Найдено {len(exports)} экспортируемых имён")
    
    print("\n🔧 Сканируем роутеры...")
    total_fixed = 0
    
    for filename in sorted(os.listdir(ROUTERS_DIR)):
        if filename.endswith(".py") and filename != "__init__.py":
            filepath = os.path.join(ROUTERS_DIR, filename)
            missing = find_missing_imports(filepath, exports)
            
            if missing:
                print(f"\n❌ {filename}:")
                for name in missing:
                    print(f"   - {name}")
                
                add_imports_to_file(filepath, missing)
                total_fixed += len(missing)
                print(f"   ✅ Добавлено {len(missing)} импортов")
            else:
                print(f"✅ {filename}: всё ок")
    
    print(f"\n{'='*60}")
    print(f" Итого добавлено {total_fixed} импортов")
    print(f"\n🚀 Теперь запусти: python scan_errors.py")
    print(f"   (остались только локальные переменные, которые не нужно импортировать)")

if __name__ == "__main__":
    main()