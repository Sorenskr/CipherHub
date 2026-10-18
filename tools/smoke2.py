# -*- coding: utf-8 -*-
"""新增功能回归：反馈提交 / 后台反馈管理 / 反馈与 Logo 配置 / 静态资源 / 局域网地址"""
import json, urllib.request, urllib.error, urllib.parse, sys

B = "http://127.0.0.1:3000"
ok = True


def check(name, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + name + ("  " + str(extra) if extra else ""))
    if not cond:
        ok = False


def get(p, cookie=""):
    r = urllib.request.Request(B + p, headers={"Cookie": cookie})
    try:
        with urllib.request.urlopen(r, timeout=10) as x:
            return x.status, x.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def post(p, data, cookie="", raw=False):
    body = data if raw else json.dumps(data).encode()
    r = urllib.request.Request(B + p, data=body, method="POST",
                               headers={"Content-Type": "application/json", "Cookie": cookie})
    try:
        with urllib.request.urlopen(r, timeout=10) as x:
            return x.status, json.loads(x.read().decode()), dict(x.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode()), {}
        except Exception:
            return e.code, {}, {}


# 静态资源
for p in ["/assets/Laya.png", "/assets/Laya2.png", "/assets/logo.png"]:
    st, b = get(p)
    check("asset " + p, st == 200 and len(b) > 1000, "len=%s" % len(b))

# bootstrap 含反馈配置
st, b = get("/api/bootstrap")
d = json.loads(b)
check("bootstrap.logos", isinstance(d["settings"].get("logos"), list) and len(d["settings"]["logos"]) >= 2,
      d["settings"].get("logos"))
check("bootstrap.feedback", isinstance(d["settings"].get("feedback"), dict), d["settings"].get("feedback"))
check("bootstrap.contacts", isinstance(d["settings"].get("contacts"), list), d["settings"].get("contacts"))

# 访客提交反馈
st, d, _ = post("/api/feedback", {"name": "测试同学", "contact": "wx_123", "message": "某某的 Instagram 暗号查不到"})
check("submit feedback", st == 200 and d.get("ok"), d)
st, d, _ = post("/api/feedback", {"message": ""})
check("empty feedback rejected", st == 400, d)

# 登录
st, d, h = post("/api/login", {"username": "admin", "password": "admin123"})
ck = h.get("Set-Cookie", "").split(";")[0]
check("login", st == 200, d)

st, d = get("/api/admin/feedbacks?status=all", ck)[0], json.loads(get("/api/admin/feedbacks?status=all", ck)[1])
check("admin feedbacks", st == 200 and len(d["items"]) == 1, d.get("stats"))
fid = d["items"][0]["id"]
check("feedback content", d["items"][0]["message"].startswith("某某"), d["items"][0]["message"])

st, d, _ = post("/api/admin/feedbacks", {"status": "done"}, ck + "&x=1")
st, d, _ = post("/api/admin/feedbacks", {"status": "done"}, ck)
# PUT 需要 query id
r = urllib.request.Request(B + "/api/admin/feedbacks?id=%d" % fid, data=json.dumps({"status": "done"}).encode(),
                           method="PUT", headers={"Content-Type": "application/json", "Cookie": ck})
with urllib.request.urlopen(r, timeout=10) as x:
    dd = json.loads(x.read().decode())
check("mark feedback done", dd.get("status") == "done", dd)

# 配置反馈 + 联系方式 + logo
st, d, _ = post("/api/admin/settings", {
    "feedback": {"title": "问题反馈", "desc": "有问题就留言", "enableForm": True},
    "contacts": [
        {"type": "微信", "value": "laya_helper", "label": "工作日回复"},
        {"type": "邮箱", "value": "hi@example.com", "label": ""},
    ],
    "logos": ["/assets/Laya.png", "/assets/Laya2.png"],
}, ck)
check("save feedback config", st == 200, d.get("settings", {}).get("contacts"))

st, b = get("/api/bootstrap")
dd = json.loads(b)["settings"]
check("contacts persisted", len(dd["contacts"]) == 2 and dd["contacts"][0]["value"] == "laya_helper", dd["contacts"])
check("feedback desc persisted", dd["feedback"]["desc"] == "有问题就留言", dd["feedback"])

# 局域网地址
st, b = get("/api/admin/net", ck)
nd = json.loads(b)
check("net addresses", st == 200 and isinstance(nd["addresses"], list), nd)

# 清理测试反馈
r = urllib.request.Request(B + "/api/admin/feedbacks?id=%d" % fid, method="DELETE", headers={"Cookie": ck})
with urllib.request.urlopen(r, timeout=10) as x:
    pass
st, b = get("/api/admin/feedbacks?status=all", ck)
check("feedback cleaned", json.loads(b)["stats"]["total"] == 0, json.loads(b)["stats"])

# 恢复空联系方式
post("/api/admin/settings", {"contacts": []}, ck)

print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURE")
sys.exit(0 if ok else 1)
