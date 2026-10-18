# -*- coding: utf-8 -*-
"""静态版回归：检查生成的 index.html 结构与数据垫片逻辑"""
import io, json, os, re, subprocess, sys, tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(BASE, "index.html")
ok = True


def check(name, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + name + ("  " + str(extra) if extra else ""))
    if not cond:
        ok = False


html = io.open(HTML, "r", encoding="utf-8").read()

check("root index.html exists", os.path.exists(HTML), "%d bytes" % os.path.getsize(HTML))
check("has <style>", "<style>" in html)
check("no external css link", "/css/style.css" not in html)
check("no external js src", 'src="/js/' not in html)
check("assets copied", os.path.exists(os.path.join(BASE, "assets", "logo.png")))
check("favicon relative", 'href="assets/logo.png"' in html, re.findall(r'<link rel="icon"[^>]*>', html))
check("no admin credentials leaked",
      "adminPassHash" not in html and "adminSalt" not in html)
check("data embedded", 'window.__DATA__=' in html)

m = re.search(r"window\.__DATA__=(\{.*?\});</script>", html, re.S)
check("embedded JSON parseable", bool(m))
if m:
    raw = m.group(1).replace("<\\/", "</")
    d = json.loads(raw)
    check("embedded people", len(d["people"]) == 60, len(d["people"]))
    check("embedded entries", len(d["entries"]) == 1446, len(d["entries"]))
    check("feedback stripped", len(d.get("feedbacks", [])) == 0)

check("static notice present", "静态版" in html)

# ---- 用 node 直接验证垫片逻辑 ----
node = os.path.join(os.path.expanduser("~"), ".workbuddy", "binaries", "node", "versions", "22.22.2-6", "node.exe")
if not os.path.exists(node):
    node = "node"

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
  console.log('BOOT', b.stats.people, b.stats.entries, b.settings.logos.join('|'));
  const s1=await (await f('/api/search?q=3250')).json();
  console.log('SEARCH3250', s1.entriesTotal, s1.entries[0].person.name, s1.entries[0].platform.name, s1.people[0].entries.length);
  const s2=await (await f('/api/search?q='+encodeURIComponent('周政霖'))).json();
  console.log('SEARCHNAME', s2.peopleTotal, s2.people[0].name);
  const sp=await (await f('/api/samples?n=3')).json();
  console.log('SAMPLES', sp.items.length, sp.items[0].maskedValue, sp.items[0].maskedName);
  const sg=await (await f('/api/suggest?q='+encodeURIComponent('周'))).json();
  console.log('SUGGEST', sg.people.length, sg.codes.length);
  const fb=await f('/api/feedback',{body:JSON.stringify({message:'静态反馈测试'})});
  console.log('FEEDBACK', fb.status, JSON.stringify(store.ch_feedbacks||'[]').slice(0,60));
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
"""

tmp = os.path.join(tempfile.gettempdir(), "_shim_check.js")
io.open(tmp, "w", encoding="utf-8").write(js)
r = subprocess.run([node, tmp, BASE], capture_output=True, text=True, encoding="utf-8", errors="replace")
out = (r.stdout or "") + (r.stderr or "")
print("  ---- shim ----")
for line in out.strip().splitlines():
    print("  " + line)

check("shim bootstrap", "BOOT 60 1446" in out, )
check("shim search by code", "SEARCH3250 1 周政霖 Threads" in out)
check("shim search by name", "SEARCHNAME 1 周政霖" in out)
check("shim samples masked", "SAMPLES 3" in out and "*" in out)
check("shim suggest", "SUGGEST" in out)
check("shim feedback local", "FEEDBACK 200" in out)

# ---- admin.html（离线后台）----
ADMIN = os.path.join(BASE, "admin.html")
ah = io.open(ADMIN, "r", encoding="utf-8").read()
check("admin.html exists", os.path.exists(ADMIN), "%d bytes" % os.path.getsize(ADMIN))
check("admin has <style>", "<style>" in ah)
# 去掉所有内联 <script> 块后，检查页面骨架是否还引用外部资源
# （模板与导出逻辑里出现的 "/css/style.css" 只是字符串，不是真实加载）
ah_shell = re.sub(r"<script[\s\S]*?</script>", "", ah)
check("admin no external css", "/css/style.css" not in ah_shell)
check("admin no external js", "<script src=" not in ah_shell)
check("admin favicon relative", 'href="assets/logo.png"' in ah)
check("admin has __TPL__", "window.__TPL__=" in ah)
check("admin has __ADMIN_PASS__", "window.__ADMIN_PASS__=" in ah)
check("admin has __DATA__", "window.__DATA__=" in ah)
check("admin has export btn", "下载 index.html" in ah)
check("admin noindex", 'name="robots"' in ah)

# 模拟浏览器内的「下载 index.html」：用 admin.html 内置模板重建，应与生成的 index.html 一致
m2 = re.search(r"window\.__TPL__=(\{.*?\});</script>", ah, re.S)
check("admin TPL parseable", bool(m2))
if m2:
    tpl = json.loads(m2.group(1).replace("<\\/", "</"))
    check("tpl complete", all(k in tpl and tpl[k] for k in ("index", "css", "shim", "app")))
    m3 = re.search(r"window\.__DATA__=(\{.*?\});</script>", ah, re.S)
    db_admin = json.loads(m3.group(1).replace("<\\/", "</"))
    st = db_admin.get("settings", {})
    for k in ("adminUser", "adminSalt", "adminPassHash"):
        st.pop(k, None)
    db_admin["feedbacks"] = []
    payload = json.dumps(db_admin, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    rebuilt = tpl["index"].replace(
        '<link rel="stylesheet" href="/css/style.css">', "<style>\n" + tpl["css"] + "\n</style>", 1
    ).replace(
        '<script src="/js/app.js"></script>',
        "<script>window.__DATA__=" + payload + ";</script>\n"
        "<script>\n" + tpl["shim"] + "\n</script>\n"
        "<script>\n" + tpl["app"] + "\n</script>", 1
    )
    rebuilt = rebuilt.replace('"/assets/', '"assets/').replace("'/assets/", "'assets/")
    notice = ('<div class="tip-bar" style="margin-top:16px">当前为<b>静态版</b>：'
              '查询功能完整可用，数据快照由后台导出生成。</div>')
    rebuilt = rebuilt.replace('<div id="toast"></div>', notice + '\n<div id="toast"></div>', 1)

    check("rebuilt == index.html", rebuilt.strip() == html.strip(),
          "differs" if rebuilt.strip() != html.strip() else "identical")
    check("rebuilt has data", 'window.__DATA__=' in rebuilt)
    check("rebuilt no creds", "adminPassHash" not in rebuilt)

# ---- 关键：内联的 JS 块不能被提前截断（</script 必须已转义）----
node = os.path.join(os.path.expanduser("~"), ".workbuddy", "binaries", "node", "versions", "22.22.2-6", "node.exe")
if not os.path.exists(node):
    node = "node"

blocks = re.findall(r"<script>\n([\s\S]*?)\n</script>", ah)
check("admin script blocks balanced", ah.count("</script>") == len(re.findall(r"<script[ >]", ah)) - 5,
      "closing=%d opening=%d" % (ah.count("</script>"), len(re.findall(r"<script[ >]", ah))))

target = None
for b in blocks:
    if "CipherHub 离线后台" in b:
        target = b
        break
check("admin js block extracted", bool(target))
if target:
    tmp = os.path.join(tempfile.gettempdir(), "_admin_block.js")
    io.open(tmp, "w", encoding="utf-8").write(target)
    r = subprocess.run([node, "--check", tmp], capture_output=True, text=True, encoding="utf-8", errors="replace")
    check("shipped admin JS syntax valid", r.returncode == 0, (r.stderr or "").strip()[:120])
    check("admin JS ends with bootstrap call", target.rstrip().endswith("})();") or "initGate();" in target[-200:])
    # 导出用的模板字符串必须已转义，否则会截断 HTML
    check("export strings escaped", "<\\/script>" in target)

print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURE")
sys.exit(0 if ok else 1)
