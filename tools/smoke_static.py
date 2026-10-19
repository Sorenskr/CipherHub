# -*- coding: utf-8 -*-
"""单页静态版回归：结构、数据垫片逻辑、内置后台"""
import io, json, os, re, subprocess, sys, tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(BASE, "index.html")
NODE = os.path.join(os.path.expanduser("~"), ".workbuddy", "binaries", "node", "versions", "22.22.2-6", "node.exe")
if not os.path.exists(NODE):
    NODE = "node"

ok = True


def check(name, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + name + ("  " + str(extra) if extra else ""))
    if not cond:
        ok = False


html = io.open(HTML, "r", encoding="utf-8").read()

check("root index.html exists", os.path.exists(HTML), "%d bytes" % os.path.getsize(HTML))

# 去掉所有内联 <script> 后再检查页面骨架（模板 / 后台代码里的字符串不算真实引用）
shell = re.sub(r"<script>[\s\S]*?</script>", "", html)
check("has <style>", "<style>" in shell)
check("no external css link", "/css/style.css" not in shell)
check("no external js src", 'src="/js/' not in shell)
check("assets copied", os.path.exists(os.path.join(BASE, "assets", "logo.png")))
check("favicon relative", 'href="assets/logo.png"' in shell)
check("data embedded", "window.__DATA__=" in html)

_m = re.search(r"window\.__DATA__=(\{.*?\});</script>", html, re.S)
_d = json.loads(_m.group(1).replace("<\\/", "</")) if _m else {}
check("no admin credentials in data", "adminPassHash" not in _d.get("settings", {}) and "adminSalt" not in _d.get("settings", {}))

_stub = os.path.join(BASE, "admin.html")
if os.path.exists(_stub):
    _s = io.open(_stub, encoding="utf-8").read()
    check("old admin.html is a redirect stub", "index.html" in _s and len(_s) < 3000)

# 内置后台必须存在
check("admin gate embedded", 'id="admGate"' in html)
check("admin root embedded", 'id="admRoot"' in html)
check("admin tabs embedded", 'id="admTabs"' in html)
check("admin export btn embedded", 'id="admExpIndex"' in html)
check("trigger embedded", "CHAdmin.open" in html)
check("adm-on css rule", "body.adm-on" in html)

# 脚本块不能被截断
n_close = html.count("</script>")
check("script closing tags == 7", n_close == 7, "close=%d" % n_close)
blocks = re.findall(r"<script>([\s\S]*?)</script>", html)
check("all inline blocks extracted", len(blocks) == n_close, "%d blocks" % len(blocks))
bad = []
for i, b in enumerate(blocks):
    tmp = os.path.join(tempfile.gettempdir(), "_blk%d.js" % i)
    io.open(tmp, "w", encoding="utf-8").write(b)
    r = subprocess.run([NODE, "--check", tmp], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        bad.append("block %d: %s" % (i, (r.stderr or "").strip()[:120]))
check("all inline blocks valid JS", not bad, "; ".join(bad))

m = re.search(r"window\.__DATA__=(\{.*?\});</script>", html, re.S)
check("embedded JSON parseable", bool(m))
if m:
    d = json.loads(m.group(1).replace("<\\/", "</"))
    check("embedded people", len(d["people"]) == 60, len(d["people"]))
    check("embedded entries", len(d["entries"]) == 1446, len(d["entries"]))

# ---- 数据垫片逻辑 ----
js = r"""
const fs=require('fs'),path=require('path');
const base=process.argv[2];
const db=JSON.parse(fs.readFileSync(path.join(base,'data','db.json'),'utf8'));
const store={};
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}};
global.window={__DATA__:db,localStorage:global.localStorage};
require(path.join(base,'public','js','static-shim.js'));
const f=global.window.fetch;
(async()=>{
  const b=await (await f('/api/bootstrap')).json();
  console.log('BOOT', b.stats.people, b.stats.entries);
  const s1=await (await f('/api/search?q=3250')).json();
  console.log('SEARCH3250', s1.entriesTotal, s1.entries[0].person.name, s1.entries[0].platform.name);
  const sp=await (await f('/api/samples?n=3')).json();
  console.log('SAMPLES', sp.items.length, sp.items[0].maskedValue);
  // setData 同步
  global.window.__CH_SET_DATA__({platforms:db.platforms,people:[{id:1,name:'测试',group:'T'}],entries:[],groups:[],settings:{}});
  const b2=await (await f('/api/bootstrap')).json();
  console.log('SETDATA', b2.stats.people);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
"""
tmp = os.path.join(tempfile.gettempdir(), "_shim_check.js")
io.open(tmp, "w", encoding="utf-8").write(js)
r = subprocess.run([NODE, tmp, BASE], capture_output=True, text=True, encoding="utf-8", errors="replace")
out = (r.stdout or "") + (r.stderr or "")
print("  ---- shim ----")
for line in out.strip().splitlines():
    print("  " + line)
check("shim bootstrap", "BOOT 60 1446" in out)
check("shim search", "SEARCH3250 1 周政霖 Threads" in out)
check("shim samples", "SAMPLES 3" in out)
check("shim setData sync", "SETDATA 1" in out)

# ---- 后台导出：用内置模板重建，应与当前 index.html 一致 ----
m2 = re.search(r"window\.__TPL__=(\{.*?\});</script>", html, re.S)
check("TPL parseable", bool(m2))
if m2:
    tpl = json.loads(m2.group(1).replace("<\\/", "</"))
    check("tpl complete", all(k in tpl and tpl[k] for k in ("index", "css", "shim", "app", "adminPartial", "adminJs", "trigger")))
    m3 = re.search(r"window\.__DATA__=(\{.*?\});</script>", html, re.S)
    db2 = json.loads(m3.group(1).replace("<\\/", "</"))
    payload = json.dumps(db2, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    scripts = (
        "<script>window.__DATA__=" + payload + ";</script>\n"
        "<script>\n" + tpl["shim"] + "\n</script>\n"
        "<script>\n" + tpl["app"] + "\n</script>\n"
        '<script>window.__ADMIN_PASS__="admin123";</script>\n'
        "<script>window.__TPL__=" + m2.group(1) + ";</script>\n"
        "<script>\n" + tpl["adminJs"] + "\n</script>\n"
        "<script>\n" + tpl["trigger"] + "\n</script>"
    )
    rebuilt = tpl["index"].replace(
        '<link rel="stylesheet" href="/css/style.css">', "<style>\n" + tpl["css"] + "\n</style>", 1
    ).replace('<script src="/js/app.js"></script>', scripts, 1)
    rebuilt = rebuilt.replace('"/assets/', '"assets/').replace("'/assets/", "'assets/")
    rebuilt = rebuilt.replace('<div id="toast"></div>', tpl["adminPartial"] + '\n<div id="toast"></div>', 1)
    rebuilt = rebuilt.replace('<div id="toast"></div>',
                              '<div class="tip-bar" style="margin-top:16px">当前为<b>静态版</b>：'
                              '查询功能完整可用，数据快照由后台导出生成。</div>\n<div id="toast"></div>', 1)
    check("后台导出 == 构建产物", rebuilt.strip() == html.strip())

print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURE")
sys.exit(0 if ok else 1)
