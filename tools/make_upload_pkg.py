# -*- coding: utf-8 -*-
"""
生成 CloudBase 云托管上传包（zip）

只打包容器运行必需的文件，避免把源码仓库的其它内容传上去。

用法: python tools/make_upload_pkg.py
输出: cipherhub-cloudbase.zip（仓库根目录，已被 .gitignore 忽略）
"""
import io
import os
import shutil
import zipfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGE = os.path.join(BASE, "_cloudbase_upload")
ZIP = os.path.join(BASE, "cipherhub-cloudbase.zip")

# 需要上传的文件 / 目录（相对仓库根目录）
INCLUDE = [
    "Dockerfile",
    ".dockerignore",
    "main.js",
    "package.json",
    "lib",
    "public",
    "data/db.json",
]

# public 下不需要的文件（本地生成物 / 废弃模板）
PUBLIC_EXCLUDE = {"admin-static.html"}


def clean_public(dst_public):
    for name in PUBLIC_EXCLUDE:
        p = os.path.join(dst_public, name)
        if os.path.isfile(p):
            os.remove(p)
            print("  - removed public/" + name)


def main():
    if os.path.isdir(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE)

    print("打包以下内容:")
    for rel in INCLUDE:
        src = os.path.join(BASE, rel)
        dst = os.path.join(STAGE, rel)
        if not os.path.exists(src):
            raise SystemExit("缺少文件: " + rel)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
        print("  + " + rel)

    clean_public(os.path.join(STAGE, "public"))

    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(STAGE):
            dirs[:] = [d for d in dirs if d not in ("__pycache__",)]
            for f in files:
                full = os.path.join(root, f)
                arc = os.path.relpath(full, STAGE)
                z.write(full, arc)

    shutil.rmtree(STAGE)

    size_kb = round(os.path.getsize(ZIP) / 1024, 1)
    print("")
    print("已生成: cipherhub-cloudbase.zip (%s KB)" % size_kb)
    print("在 CloudBase 云托管新建服务时上传这个 zip 即可（端口填 80）。")


if __name__ == "__main__":
    main()
