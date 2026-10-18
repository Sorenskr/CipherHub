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

check("static notice present", "静态预览版" in html)

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

print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURE")
sys.exit(0 if ok else 1)
