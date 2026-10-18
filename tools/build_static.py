# -*- coding: utf-8 -*-
"""
生成根目录的静态版 index.html（用于 GitHub Pages / 任意静态托管）

会把 CSS、JS、数据全部内联进单个 HTML，无需 Node 服务即可查询。
管理员凭据（adminUser / adminSalt / adminPassHash）不会写入。

用法: python tools/build_static.py
输出: ./index.html   ./assets/
"""
import os
import re
import io
import json
import shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")
OUT_HTML = os.path.join(BASE, "index.html")
OUT_ASSETS = os.path.join(BASE, "assets")


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def main():
    html = read(os.path.join(PUB, "index.html"))
    css = read(os.path.join(PUB, "css", "style.css"))
    shim = read(os.path.join(PUB, "js", "static-shim.js"))
    app = read(os.path.join(PUB, "js", "app.js"))

    with io.open(os.path.join(BASE, "data", "db.json"), "r", encoding="utf-8") as f:
        db = json.load(f)

    # 去掉管理员凭据，避免公开仓库泄露
    st = db.get("settings", {})
    for k in ("adminUser", "adminSalt", "adminPassHash"):
        st.pop(k, None)
    db["feedbacks"] = []

    data_js = json.dumps(db, ensure_ascii=False, separators=(",", ":"))
    # 防止 </script> 提前闭合
    data_js = data_js.replace("</", "<\\/")

    # 1) CSS 内联
    html = html.replace(
        '<link rel="stylesheet" href="/css/style.css">',
        "<style>\n" + css + "\n</style>",
    )

    # 2) JS 内联（数据 -> 垫片 -> app）
    html = html.replace(
        '<script src="/js/app.js"></script>',
        "<script>window.__DATA__=" + data_js + ";</script>\n"
        "<script>\n" + shim + "\n</script>\n"
        "<script>\n" + app + "\n</script>",
    )

    # 3) 资源路径改为相对路径（兼容 GitHub Pages 子路径）
    html = html.replace('"/assets/', '"assets/').replace("'/assets/", "'assets/")

    # 4) 静态模式提示
    notice = (
        '<div class="tip-bar" style="margin-top:16px">'
        "当前为<b>静态预览版</b>：查询功能完整可用，数据快照自 <code>data/db.json</code>；"
        "新增 / 修改请在后台进行后重新执行 <code>python tools/build_static.py</code> 生成。"
        "</div>"
    )
    html = html.replace('<div id="toast"></div>', notice + "\n<div id=\"toast\"></div>")

    with io.open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    # 5) 复制图片资源到根目录 assets/
    src_assets = os.path.join(PUB, "assets")
    if os.path.isdir(src_assets):
        if os.path.isdir(OUT_ASSETS):
            shutil.rmtree(OUT_ASSETS)
        shutil.copytree(src_assets, OUT_ASSETS)

    print("generated:", OUT_HTML, os.path.getsize(OUT_HTML), "bytes")
    print("assets    :", OUT_ASSETS)


if __name__ == "__main__":
    main()
