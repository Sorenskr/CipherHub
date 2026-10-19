# -*- coding: utf-8 -*-
"""
生成根目录的单页版 index.html（GitHub Pages / 任意静态托管）

一个页面同时包含：
  · 前台查询（默认显示）
  · 内置后台（连点 Logo 5 次 → 口令 → 打开，不跳转第二个页面）

后台改动会立刻在本页生效并存本机草稿；
通过后台「导出发布」下载新的 index.html / db.json，push 后对所有人生效。

用法:
    python tools/build_static.py
    python tools/build_static.py --admin-pass 你的口令
    python tools/build_static.py --no-pass          # 进后台不要口令
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


def compose(tpl, css, shim, app, admin_partial, admin_js, trigger, data_js, tpl_raw, admin_pass):
    """把模板组装成完整的单页 index.html"""
    scripts = (
        "<script>window.__DATA__=" + data_js + ";</script>\n"
        "<script>\n" + js_inline(shim) + "\n</script>\n"
        "<script>\n" + js_inline(app) + "\n</script>\n"
        "<script>window.__ADMIN_PASS__=" + json.dumps(admin_pass, ensure_ascii=False) + ";</script>\n"
        "<script>window.__TPL__=" + tpl_raw + ";</script>\n"
        "<script>\n" + js_inline(admin_js) + "\n</script>\n"
        "<script>\n" + js_inline(trigger) + "\n</script>"
    )

    html = tpl.replace(
        '<link rel="stylesheet" href="/css/style.css">', "<style>\n" + css + "\n</style>"
    ).replace(
        '<script src="/js/app.js"></script>', scripts
    )
    html = html.replace('"/assets/', '"assets/').replace("'/assets/", "'assets/")
    html = html.replace('<div id="toast"></div>', admin_partial + '\n<div id="toast"></div>', 1)
    html = html.replace('<div id="toast"></div>', NOTICE + '\n<div id="toast"></div>', 1)
    return html


def main():
    admin_pass = "admin123"
    args = sys.argv[1:]
    if "--admin-pass" in args:
        i = args.index("--admin-pass")
        if i + 1 < len(args):
            admin_pass = args[i + 1]
    if "--no-pass" in args:
        admin_pass = ""

    tpl = read(os.path.join(PUB, "index.html"))
    css = read(os.path.join(PUB, "css", "style.css"))
    shim = read(os.path.join(PUB, "js", "static-shim.js"))
    app = read(os.path.join(PUB, "js", "app.js"))
    admin_partial = read(os.path.join(PUB, "admin-partial.html"))
    admin_js = read(os.path.join(PUB, "js", "static-admin.js"))
    trigger = read(os.path.join(PUB, "js", "admin-trigger.js"))

    with io.open(os.path.join(BASE, "data", "db.json"), "r", encoding="utf-8") as f:
        db = json.load(f)

    front = json.loads(json.dumps(db))
    for k in ("adminUser", "adminSalt", "adminPassHash"):
        front.get("settings", {}).pop(k, None)
    front["feedbacks"] = []
    data_js = json.dumps(front, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    # 后台导出时用的模板包
    tpl_payload = json.dumps({
        "index": tpl, "css": css, "shim": shim, "app": app,
        "adminPartial": admin_partial, "adminJs": admin_js, "trigger": trigger,
    }, ensure_ascii=False).replace("</", "<\\/")

    html = compose(tpl, css, shim, app, admin_partial, admin_js, trigger,
                   data_js, tpl_payload, admin_pass)
    write(os.path.join(BASE, "index.html"), html)
    print("generated: index.html  %d bytes  (后台口令: %s)" % (
        os.path.getsize(os.path.join(BASE, "index.html")), admin_pass or "无"))

    src = os.path.join(PUB, "assets")
    if os.path.isdir(src):
        if os.path.isdir(OUT_ASSETS):
            shutil.rmtree(OUT_ASSETS)
        shutil.copytree(src, OUT_ASSETS)
    print("assets    :", OUT_ASSETS)


if __name__ == "__main__":
    main()
