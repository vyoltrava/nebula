# backend/check_routers.py
import os
import re

def check_routers():
    routers_dir = "routers"
    issues = []
    
    if not os.path.exists(routers_dir):
        print(f"❌ Папка {routers_dir} не найдена!")
        return
    
    for filename in os.listdir(routers_dir):
        if not filename.endswith('.py') or filename == '__init__.py':
            continue
        
        filepath = os.path.join(routers_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Проверяем импорт APIRouter
        if 'from fastapi import APIRouter' not in content:
            issues.append(f"{filename}: нет импорта APIRouter")
        
        # Проверяем создание router
        if 'router = APIRouter()' not in content:
            issues.append(f"{filename}: нет router = APIRouter()")
    
    if issues:
        print("❌ Найдены проблемы:")
        for issue in issues:
            print(f"   {issue}")
    else:
        print("✅ Все роутеры в порядке!")

if __name__ == "__main__":
    check_routers()