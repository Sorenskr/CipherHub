# -*- coding: utf-8 -*-
import json, os, urllib.request, urllib.parse, sys

BASE = os.environ.get("CH_BASE", "http://127.0.0.1:3000")


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            return r.status, r.read()
    except Exception as e:
        return 0, str(e).encode()


def js(path):
    st, body = get(path)
    if st != 200:
        return st, body[:200].decode('utf-8', 'replace')
    return st, json.loads(body.decode('utf-8'))


ok = True


def check(name, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + name + ("  " + str(extra) if extra else ""))
    if not cond:
        ok = False


for p in ["/", "/admin", "/css/style.css", "/js/app.js", "/js/admin.js"]:
    st, b = get(p)
    check("GET " + p, st == 200 and len(b) > 100, "status=%s len=%s" % (st, len(b) if isinstance(b, bytes) else b))

st, d = js("/api/bootstrap")
check("bootstrap", st == 200 and d["stats"]["entries"] > 1000, d.get("stats") if st == 200 else d)

st, d = js("/api/search?q=" + urllib.parse.quote("周政霖"))
if st == 200:
    check("search by name", len(d["people"]) >= 1 and d["people"][0]["name"] == "周政霖",
          "people=%s entries=%s" % (len(d["people"]), len(d["people"][0]["entries"]) if d["people"] else 0))
    plats = sorted(set(e["platform"]["name"] for e in d["people"][0]["entries"]))
    check("name -> all platforms", len(plats) >= 6, plats)
else:
    check("search by name", False, d)

st, d = js("/api/search?q=3250")
if st == 200:
    check("search by code", d["entriesTotal"] >= 1 and d["entries"][0]["value"] == "3250",
          "owner=%s platform=%s" % (d["entries"][0]["person"]["name"], d["entries"][0]["platform"]["name"]))
    check("code -> owner's other codes", len(d["people"]) >= 1 and len(d["people"][0]["entries"]) > 1,
          "count=%s" % (len(d["people"][0]["entries"]) if d["people"] else 0))
else:
    check("search by code", False, d)

st, d = js("/api/search?q=11826054")
if st == 200:
    check("duplicate code multi-owner", len(set(e["person"]["name"] for e in d["entries"])) >= 2,
          sorted(set(e["person"]["name"] for e in d["entries"])))
else:
    check("duplicate code multi-owner", False, d)

st, d = js("/api/search?q=laya-zzl-tw")
check("search short link", st == 200 and d["entriesTotal"] == 1 and d["entries"][0]["kind"] == "link",
      d["entries"][0]["url"] if st == 200 and d["entries"] else d)

st, d = js("/api/search?q=" + urllib.parse.quote("长沙"))
check("search group/team", st == 200 and d["peopleTotal"] >= 1,
      [p["name"] for p in d["people"]] if st == 200 else d)

st, d = js("/api/search?q=10247")
check("public changsha code", st == 200 and d["entriesTotal"] >= 1,
      [(e["value"], e["person"]["name"] if e["person"] else None) for e in d["entries"]] if st == 200 else d)

st, d = js("/api/suggest?q=" + urllib.parse.quote("周"))
check("suggest", st == 200 and len(d["people"]) > 0, d.get("people")[:3] if st == 200 else d)

# 登录
def post(path, data):
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode()), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode()), dict(e.headers)
        except Exception:
            return e.code, {}, {}
    except Exception as e:
        return 0, str(e), {}


st, d, h = post("/api/login", {"username": "admin", "password": "admin123"})
check("login", st == 200 and d.get("ok"), d)
cookie = h.get("Set-Cookie", "").split(";")[0] if st == 200 else ""

st, d, _ = post("/api/login", {"username": "admin", "password": "wrong"})
check("login reject", st == 401, d)


def auth_get(path):
    req = urllib.request.Request(BASE + path, headers={"Cookie": cookie})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except Exception as e:
        return 0, str(e)


st, d = auth_get("/api/admin/people?q=")
check("admin people", st == 200 and len(d["items"]) == 60, "%s people" % (len(d["items"]) if st == 200 else d))

st, d = auth_get("/api/admin/entries?platform=link")
check("admin entries filter", st == 200 and len(d["items"]) == 120, len(d["items"]) if st == 200 else d)

# 未登录访问管理接口
req = urllib.request.Request(BASE + "/api/admin/people")
try:
    urllib.request.urlopen(req, timeout=10)
    check("admin auth guard", False, "should be 401")
except urllib.error.HTTPError as e:
    check("admin auth guard", e.code == 401, e.code)

print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURE")
sys.exit(0 if ok else 1)
