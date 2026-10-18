# -*- coding: utf-8 -*-
"""
生成根目录的静态版页面（用于 GitHub Pages / 任意静态托管）

  index.html  —— 前台查询页（CSS / JS / 数据全部内联，无需 Node 服务）
  admin.html  —— 离线后台（可在网页里增删改数据，再导出新的 index.html / db.json）

管理员凭据（adminUser / adminSalt / adminPassHash）不会写入 index.html。

用法:
    python tools/build_static.py
    python tools/build_static.py --admin-pass 你的口令
"""
import os
import io
import json
import shutil
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")
OUT_ASSETS = os.path.join(BASE, "assets")

NOTICE = (
    '<div class="tip-bar" style="margin-top:16px">'
    "当前为<b>静态版</b>：查询功能完整可用，数据快照由后台导出生成。"
    "</div>"
)


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8") as f:
        f.write(s)


def js_inline(s):
    """内联 JS 前转义 </script，避免提前截断 HTML 脚本块（JS 中 \\/ 等价于 /）"""
    return s.replace("</script", "<\\/script")


def main():
    admin_pass = "admin123"
    args = sys.argv[1:]
    if "--admin-pass" in args:
        i = args.index("--admin-pass")
        if i + 1 < len(args):
            admin_pass = args[i + 1]
    # --no-pass：直接进后台，不要口令
    if "--no-pass" in args:
        admin_pass = ""

    tpl_index = read(os.path.join(PUB, "index.html"))
    css = read(os.path.join(PUB, "css", "style.css"))
    shim = read(os.path.join(PUB, "js", "static-shim.js"))
    app = read(os.path.join(PUB, "js", "app.js"))
    tpl_admin = read(os.path.join(PUB, "admin-static.html"))
    admin_js = read(os.path.join(PUB, "js", "static-admin.js"))

    with io.open(os.path.join(BASE, "data", "db.json"), "r", encoding="utf-8") as f:
        db = json.load(f)

    # ---------- index.html ----------
    front = json.loads(json.dumps(db))
    for k in ("adminUser", "adminSalt", "adminPassHash"):
        front.get("settings", {}).pop(k, None)
    front["feedbacks"] = []
    data_js = json.dumps(front, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    html = tpl_index.replace(
        '<link rel="stylesheet" href="/css/style.css">',
        "<style>\n" + css + "\n</style>",
    ).replace(
        '<script src="/js/app.js"></script>',
        "<script>window.__DATA__=" + data_js + ";</script>\n"
        "<script>\n" + js_inline(shim) + "\n</script>\n"
        "<script>\n" + js_inline(app) + "\n</script>",
    )
    html = html.replace('"/assets/', '"assets/').replace("'/assets/", "'assets/")
    html = html.replace('<div id="toast"></div>', NOTICE + '\n<div id="toast"></div>')
    write(os.path.join(BASE, "index.html"), html)
    print("generated: index.html  %d bytes" % os.path.getsize(os.path.join(BASE, "index.html")))

    # ---------- admin.html ----------
    # 后台内置完整模板，便于在浏览器里重新生成 index.html
    tpl_payload = json.dumps({
        "index": tpl_index, "css": css, "shim": shim, "app": app,
    }, ensure_ascii=False).replace("</", "<\\/")

    admin_db = json.loads(json.dumps(db))
    admin_data = json.dumps(admin_db, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    ahtml = tpl_admin.replace(
        '<link rel="stylesheet" href="/css/style.css">',
        "<style>\n" + css + "\n</style>",
    ).replace(
        '<script src="/js/static-admin.js"></script>',
        "<script>window.__ADMIN_PASS__=" + json.dumps(admin_pass, ensure_ascii=False) + ";</script>\n"
        "<script>window.__DATA__=" + admin_data + ";</script>\n"
        "<script>window.__TPL__=" + tpl_payload + ";</script>\n"
        "<script>\n" + js_inline(admin_js) + "\n</script>",
    )
    ahtml = ahtml.replace('"/assets/', '"assets/').replace("'/assets/", "'assets/")
    write(os.path.join(BASE, "admin.html"), ahtml)
    print("generated: admin.html  %d bytes  (口令: %s)" % (
        os.path.getsize(os.path.join(BASE, "admin.html")), admin_pass or "无，直接打开"))

    # ---------- assets ----------
    src = os.path.join(PUB, "assets")
    if os.path.isdir(src):
        if os.path.isdir(OUT_ASSETS):
            shutil.rmtree(OUT_ASSETS)
        shutil.copytree(src, OUT_ASSETS)
    print("assets    :", OUT_ASSETS)


if __name__ == "__main__":
    main()
