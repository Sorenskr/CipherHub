/**
 * CipherHub 离线后台（纯静态，可放在 GitHub Pages）
 *
 * 数据来自页面内置的 window.__DATA__；
 * 页面同时内置了前台模板 window.__TPL__（index.html / style.css / static-shim.js / app.js），
 * 因此可以在浏览器里直接重新生成完整的前台 index.html 并下载。
 *
 * 所有改动先存本机 localStorage 草稿，导出后 push 到仓库即生效。
 */
(function () {
  'use strict';

  var DRAFT_KEY = 'ch_admin_draft';
  var OK_KEY = 'ch_admin_ok';
  var PASS = window.__ADMIN_PASS__ || 'admin123';
  var TPL = window.__TPL__ || {};

  var DB = null;
  var peopleCache = [];
  var entryCache = [];

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast-item ' + (type || '');
    el.textContent = msg;
    $('#toast').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, 2000);
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function nextId(arr) {
    var m = 0;
    (arr || []).forEach(function (x) { if (typeof x.id === 'number' && x.id > m) m = x.id; });
    return m + 1;
  }

  /* ---------------- 数据持久化（本机草稿） ---------------- */
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), db: DB }));
    } catch (e) {
      toast('本机存储空间不足，请及时导出', 'err');
    }
    var t = $('#expTime');
    if (t) t.textContent = new Date().toLocaleString('zh-CN');
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function normalize(db) {
    db = db || {};
    db.platforms = db.platforms || [];
    db.groups = db.groups || [];
    db.people = db.people || [];
    db.entries = db.entries || [];
    db.settings = db.settings || {};
    if (!db.settings.logos || !db.settings.logos.length) db.settings.logos = ['/assets/Laya.png', '/assets/Laya2.png'];
    if (!db.settings.feedback) db.settings.feedback = { title: '问题反馈', desc: '', enableForm: true };
    if (!Array.isArray(db.settings.contacts)) db.settings.contacts = [];
    return db;
  }

  /* ---------------- 访问口令 ---------------- */
  function initGate() {
    var gate = $('#gate');
    if (!PASS) { gate.style.display = 'none'; enterApp(); return; }
    if (localStorage.getItem(OK_KEY) === '1') { gate.style.display = 'none'; enterApp(); return; }
    gate.style.display = 'grid';
    $('#gateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if ($('#gatePass').value !== PASS) {
        $('#gateErr').textContent = '口令不对';
        return;
      }
      localStorage.setItem(OK_KEY, '1');
      gate.style.display = 'none';
      enterApp();
    });
  }

  function enterApp() {
    $('#app').style.display = 'block';
    var draft = loadDraft();
    if (draft && draft.db) {
      DB = normalize(draft.db);
      $('#draftBar').style.display = '';
      $('#draftTime').textContent = new Date(draft.at).toLocaleString('zh-CN');
    } else {
      DB = normalize(clone(window.__DATA__ || {}));
    }
    $('#expTime').textContent = draft ? new Date(draft.at).toLocaleString('zh-CN') : '-';
    fillSelects();
    renderAll();
    bindAll();
    setupBrandLogo();
  }

  function setupBrandLogo() {
    var logos = (DB.settings.logos || []).map(function (u) {
      return String(u).replace(/^\/?assets\//, 'assets/');
    });
    var box = $('#brandLogoBox'), img = $('#brandLogo');
    var gbox = $('#gateLogo');
    if (!logos.length) { if (box) box.textContent = '#'; if (gbox) gbox.textContent = '#'; return; }
    if (img) { img.src = logos[0]; img.onerror = function () { img.style.display = 'none'; box.textContent = '#'; }; }
    if (gbox) gbox.innerHTML = '<img src="' + logos[0] + '" style="width:100%;height:100%;object-fit:cover;border-radius:11px">';
  }

  /* ---------------- 渲染 ---------------- */
  function pmap() { var m = {}; DB.platforms.forEach(function (p) { m[p.id] = p; }); return m; }
  function pemap() { var m = {}; DB.people.forEach(function (p) { m[p.id] = p; }); return m; }

  function stats() {
    var c = {};
    DB.platforms.forEach(function (p) { c[p.id] = 0; });
    DB.entries.forEach(function (e) { if (c[e.platformId] === undefined) c[e.platformId] = 0; c[e.platformId]++; });
    return { people: DB.people.length, entries: DB.entries.length, platforms: DB.platforms.length, byPlatform: c };
  }

  function renderAll() {
    renderDash(); renderPeople(); renderEntries(); renderPlatforms(); loadSettings();
  }

  function renderDash() {
    var s = stats();
    var cards = [
      { n: s.people, t: '成员' }, { n: s.entries, t: '暗号 / 短链' },
      { n: s.platforms, t: '平台' }, { n: DB.groups.length, t: '分组' },
    ];
    var html = cards.map(function (c) {
      return '<div class="box"><b>' + c.n + '</b><span>' + c.t + '</span></div>';
    }).join('');
    $('#dashStats').innerHTML = html;
    $('#expStats').innerHTML = html;

    var plats = DB.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var max = 1;
    plats.forEach(function (p) { if ((s.byPlatform[p.id] || 0) > max) max = s.byPlatform[p.id]; });
    $('#dashPlat').innerHTML = plats.map(function (p) {
      var n = s.byPlatform[p.id] || 0;
      return '<tr><td style="width:120px"><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(p.color) + ';display:inline-block"></span>' + esc(p.name) + '</span></td>' +
        '<td><div style="height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden"><div style="height:100%;width:' + (max ? (n / max * 100) : 0).toFixed(1) + '%;background:' + esc(p.color) + '"></div></div></td>' +
        '<td style="width:70px;text-align:right" class="mono">' + n + '</td></tr>';
    }).join('');
  }

  function renderPeople() {
    var q = $('#pQ').value.trim().toLowerCase();
    var g = $('#pGroup').value;
    var pe = pemap();
    var list = DB.people.filter(function (p) {
      if (q && String(p.name).toLowerCase().indexOf(q) < 0) return false;
      if (g && String(p.group || '').indexOf(g) < 0) return false;
      return true;
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); });
    peopleCache = list;
    $('#pCount').textContent = '共 ' + list.length + ' 人';
    $('#pBody').innerHTML = list.map(function (p) {
      var cnt = DB.entries.filter(function (e) { return e.personId === p.id; }).length;
      return '<tr><td class="mono muted">' + p.id + '</td><td><b>' + esc(p.name) + '</b></td>' +
        '<td class="muted">' + esc(p.group || '-') + '</td><td class="mono">' + cnt + '</td>' +
        '<td><div class="ops"><button class="btn sm" data-edit="' + p.id + '">编辑</button>' +
        '<button class="btn sm danger" data-del="' + p.id + '">删除</button></div></td></tr>';
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-mute);padding:26px">暂无成员</td></tr>';
    $$('#pBody [data-edit]').forEach(function (b) { b.onclick = function () { editPerson(Number(b.dataset.edit)); }; });
    $$('#pBody [data-del]').forEach(function (b) { b.onclick = function () { delPerson(Number(b.dataset.del)); }; });
  }

  function renderEntries() {
    var q = $('#eQ').value.trim().toLowerCase();
    var pf = $('#ePlat').value, g = $('#eGroup').value;
    var pe = pemap(), pm = pmap();
    var list = DB.entries.filter(function (e) {
      if (pf && e.platformId !== pf) return false;
      var p = pe[e.personId];
      if (g && (!p || String(p.group || '').indexOf(g) < 0)) return false;
      if (q) {
        var v = String(e.value || '').toLowerCase();
        if (v.indexOf(q) < 0 && (!p || String(p.name).toLowerCase().indexOf(q) < 0)) return false;
      }
      return true;
    }).sort(function (a, b) { return b.id - a.id; });
    entryCache = list;
    $('#eCount').textContent = '显示 ' + Math.min(list.length, 400) + ' 条 / 共 ' + DB.entries.length + ' 条';
    $('#eBody').innerHTML = list.slice(0, 400).map(function (e) {
      var p = pe[e.personId] || {}, pl = pm[e.platformId] || {};
      return '<tr><td class="mono muted">' + e.id + '</td>' +
        '<td>' + esc(p.name || '-') + '</td>' +
        '<td><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(pl.color || '#7c5cff') + ';display:inline-block"></span>' + esc(pl.name || e.platformId) + '</span></td>' +
        '<td class="mono">' + esc(e.value) + '</td>' +
        '<td class="tiny muted">' + esc(e.type || '-') + '</td>' +
        '<td class="tiny muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (e.url ? esc(e.url) : '-') + '</td>' +
        '<td><div class="ops"><button class="btn sm" data-edit="' + e.id + '">编辑</button>' +
        '<button class="btn sm danger" data-del="' + e.id + '">删除</button></div></td></tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:26px">暂无记录</td></tr>';
    $$('#eBody [data-edit]').forEach(function (b) { b.onclick = function () { editEntry(Number(b.dataset.edit)); }; });
    $$('#eBody [data-del]').forEach(function (b) { b.onclick = function () { delEntry(Number(b.dataset.del)); }; });
  }

  function renderPlatforms() {
    var s = stats();
    var list = DB.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    $('#plList').innerHTML = list.map(function (p) {
      return '<div class="row" data-id="' + esc(p.id) + '">' +
        '<input class="input" data-k="name" value="' + esc(p.name) + '" placeholder="名称">' +
        '<input class="input" data-k="id" value="' + esc(p.id) + '" placeholder="标识">' +
        '<input class="input" data-k="color" type="color" value="' + esc(p.color || '#7c5cff') + '" style="padding:4px;height:42px">' +
        '<input class="input" data-k="order" type="number" value="' + (p.order || 0) + '" placeholder="排序">' +
        '<div style="display:flex;gap:6px"><button class="btn sm" data-save="' + esc(p.id) + '">保存</button>' +
        '<button class="btn sm danger" data-del="' + esc(p.id) + '"' + ((s.byPlatform[p.id] || 0) > 0 ? ' disabled title="仍有记录占用"' : '') + '>删除</button></div></div>';
    }).join('');
    $$('#plList [data-save]').forEach(function (b) {
      b.onclick = function () {
        var row = b.closest('.row');
        var get = function (k) { return row.querySelector('[data-k="' + k + '"]').value.trim(); };
        var old = DB.platforms.find(function (x) { return x.id === b.dataset.save; });
        var nid = get('id');
        if (!get('name')) { toast('名称不能为空', 'err'); return; }
        if (nid !== old.id) {
          if (DB.platforms.some(function (x) { return x.id === nid; })) { toast('标识已存在', 'err'); return; }
          DB.entries.forEach(function (e) { if (e.platformId === old.id) e.platformId = nid; });
        }
        old.id = nid; old.name = get('name'); old.color = get('color'); old.order = Number(get('order'));
        commit();
        toast('已保存', 'ok');
      };
    });
    $$('#plList [data-del]').forEach(function (b) {
      b.onclick = function () {
        DB.platforms = DB.platforms.filter(function (x) { return x.id !== b.dataset.del; });
        commit(); toast('已删除', 'ok');
      };
    });
  }

  function commit() {
    saveDraft();
    renderDash(); renderPeople(); renderEntries(); renderPlatforms(); loadSettings();
  }

  /* ---------------- 增删改 ---------------- */
  function personForm(p) {
    return '<div class="form-row"><label>姓名 *</label><input class="input" id="fName" value="' + esc(p ? p.name : '') + '"></div>' +
      '<div class="form-row"><label>分组</label><input class="input" id="fGroup" value="' + esc(p ? p.group : '') + '" placeholder="例如 Laya"></div>' +
      '<div class="err-text" id="fErr"></div>';
  }

  function editPerson(id) {
    var p = id ? peopleCache.find(function (x) { return x.id === id; }) : null;
    openModal(id ? '编辑成员' : '新增成员', personForm(p), function () {
      var name = $('#fName').value.trim(), group = $('#fGroup').value.trim();
      if (!name) { $('#fErr').textContent = '姓名不能为空'; return false; }
      if (DB.people.some(function (x) { return x.name === name && x.id !== id; })) { $('#fErr').textContent = '已有同名成员'; return false; }
      if (p) { p.name = name; p.group = group; }
      else DB.people.push({ id: nextId(DB.people), name: name, group: group, note: '' });
      if (group && DB.groups.indexOf(group) < 0) DB.groups.push(group);
      closeModal(); commit(); toast('已保存', 'ok');
      return false;
    });
  }

  function delPerson(id) {
    var p = peopleCache.find(function (x) { return x.id === id; });
    var cnt = DB.entries.filter(function (e) { return e.personId === id; }).length;
    confirmModal('删除成员', '确定删除「' + esc(p ? p.name : id) + '」？其下 ' + cnt + ' 条记录也会一并删除。', function () {
      DB.people = DB.people.filter(function (x) { return x.id !== id; });
      DB.entries = DB.entries.filter(function (e) { return e.personId !== id; });
      commit(); toast('已删除', 'ok');
    });
  }

  function entryForm(e) {
    var po = DB.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); }).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (e && e.platformId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    var allPeople = DB.people.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); });
    var pe = allPeople.map(function (p) {
      return '<option value="' + p.id + '"' + (e && e.personId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    return '<div class="form-grid">' +
      '<div class="form-row"><label>成员 *</label><select class="select" id="fPerson">' + pe + '</select></div>' +
      '<div class="form-row"><label>平台 *</label><select class="select" id="fPlat">' + po + '</select></div></div>' +
      '<div class="form-row"><label>暗号 / 短链 *</label><input class="input" id="fValue" value="' + esc(e ? e.value : '') + '"></div>' +
      '<div class="form-grid">' +
      '<div class="form-row"><label>记录类型</label><select class="select" id="fKind">' +
      '<option value="code"' + (!e || e.kind === 'code' ? ' selected' : '') + '>暗号</option>' +
      '<option value="link"' + (e && e.kind === 'link' ? ' selected' : '') + '>短链</option></select></div>' +
      '<div class="form-row"><label>内容类型</label><input class="input" id="fType" value="' + esc(e ? e.type : '') + '" placeholder="图文 / 视频"></div></div>' +
      '<div class="form-row"><label>链接地址</label><input class="input" id="fUrl" value="' + esc(e ? e.url : '') + '" placeholder="https://..."></div>' +
      '<div class="err-text" id="fErr"></div>';
  }

  function editEntry(id) {
    var e = id ? entryCache.find(function (x) { return x.id === id; }) : null;
    if (!DB.people.length) { toast('请先新增成员', 'err'); return; }
    openModal(id ? '编辑记录' : '新增记录', entryForm(e), function () {
      var v = $('#fValue').value.trim();
      if (!v) { $('#fErr').textContent = '暗号 / 短链不能为空'; return false; }
      var data = {
        personId: Number($('#fPerson').value), platformId: $('#fPlat').value,
        kind: $('#fKind').value, value: v, type: $('#fType').value.trim(), url: $('#fUrl').value.trim(),
      };
      if (e) { Object.keys(data).forEach(function (k) { e[k] = data[k]; }); }
      else { data.id = nextId(DB.entries); data.note = ''; DB.entries.push(data); }
      closeModal(); commit(); toast('已保存', 'ok');
      return false;
    });
  }

  function delEntry(id) {
    var e = entryCache.find(function (x) { return x.id === id; });
    confirmModal('删除记录', '确定删除「' + esc(e ? e.value : id) + '」？', function () {
      DB.entries = DB.entries.filter(function (x) { return x.id !== id; });
      commit(); toast('已删除', 'ok');
    });
  }

  /* ---------------- 批量导入 ---------------- */
  var ALIAS = {
    threads: 'threads', thareads: 'threads', thresds: 'threads',
    ins: 'instagram', instagram: 'instagram', ig: 'instagram',
    tik: 'tiktok', tiktok: 'tiktok', tk: 'tiktok',
    x: 'x', twitter: 'x',
    fb: 'facebook', facebook: 'facebook',
    视频: 'video', video: 'video', sp: 'video',
    短链: 'link', link: 'link',
    图文: 'image', image: 'image', tw: 'image',
  };

  function bulk() {
    var lines = $('#bText').value.split(/\r?\n/);
    var defPlat = $('#bPlat').value, defGroup = $('#bGroup').value.trim();
    var byName = {};
    DB.platforms.forEach(function (p) { byName[p.name.toLowerCase()] = p.id; });
    var made = { people: 0, entries: 0 }, errors = [];
    lines.forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = line.split(/[\t,，\s]+/).filter(Boolean);
      if (parts.length < 2) { errors.push('第 ' + (i + 1) + ' 行格式错误：' + line); return; }
      var name = parts[0], value = parts[1];
      var pid = defPlat;
      if (parts[2]) {
        var key = String(parts[2]).toLowerCase();
        if (ALIAS[key]) pid = ALIAS[key];
        else if (byName[key]) pid = byName[key];
      }
      if (!pid) { errors.push('第 ' + (i + 1) + ' 行缺少平台：' + line); return; }
      var type = parts[3] || '';
      var url = parts[4] || '';
      var person = DB.people.filter(function (p) { return p.name === name; })[0];
      if (!person) {
        person = { id: nextId(DB.people), name: name, group: defGroup, note: '' };
        DB.people.push(person);
        if (defGroup && DB.groups.indexOf(defGroup) < 0) DB.groups.push(defGroup);
        made.people++;
      }
      DB.entries.push({
        id: nextId(DB.entries), personId: person.id, platformId: pid,
        kind: pid === 'link' ? 'link' : 'code', value: value, type: type, url: url, note: '',
      });
      made.entries++;
    });
    commit();
    var html = '<div class="tag" style="background:rgba(40,199,111,.16);border-color:rgba(40,199,111,.5);color:var(--ok)">新增成员 ' + made.people + ' 人，新增记录 ' + made.entries + ' 条</div>';
    if (errors.length) html += '<div class="tiny" style="margin-top:10px">跳过 ' + errors.length + ' 行：<br>' + errors.slice(0, 20).map(esc).join('<br>') + '</div>';
    $('#bResult').innerHTML = html;
    toast('导入完成', 'ok');
  }

  /* ---------------- 设置 ---------------- */
  function loadSettings() {
    $('#sName').value = DB.settings.siteName || '';
    $('#sSub').value = DB.settings.subtitle || '';
    $('#sGroups').value = (DB.groups || []).join(', ');
    $('#sLogos').value = (DB.settings.logos || []).join(', ');
    var fb = DB.settings.feedback || {};
    $('#fbTitle').value = fb.title || '';
    $('#fbDesc').value = fb.desc || '';
    $('#fbEnable').checked = fb.enableForm !== false;
    renderContacts(DB.settings.contacts || []);
  }

  function renderContacts(list) {
    $('#ctList').innerHTML = list.map(function (c, i) {
      return '<div class="ct-row" style="display:grid;grid-template-columns:110px 1fr 150px auto;gap:8px">' +
        '<input class="input" data-k="type" value="' + esc(c.type || '') + '" placeholder="微信">' +
        '<input class="input" data-k="value" value="' + esc(c.value || '') + '" placeholder="wxid / QQ / 邮箱">' +
        '<input class="input" data-k="label" value="' + esc(c.label || '') + '" placeholder="备注">' +
        '<button class="btn sm danger" data-ctdel="' + i + '">删除</button></div>';
    }).join('') || '<div class="tiny muted">暂无联系方式</div>';
    $$('#ctList [data-ctdel]').forEach(function (b) { b.onclick = function () { b.closest('.ct-row').remove(); }; });
  }

  function readContacts() {
    return $$('#ctList .ct-row').map(function (r) {
      return {
        type: r.querySelector('[data-k="type"]').value.trim(),
        value: r.querySelector('[data-k="value"]').value.trim(),
        label: r.querySelector('[data-k="label"]').value.trim(),
      };
    }).filter(function (c) { return c.value; });
  }

  /* ---------------- 导出 ---------------- */
  function safeJson(obj) {
    return JSON.stringify(obj, null, 0).replace(/<\//g, '<\\/');
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function stripCreds(s) {
    s = clone(s || {});
    delete s.adminUser; delete s.adminSalt; delete s.adminPassHash;
    return s;
  }

  function exportIndex() {
    if (!TPL.index || !TPL.css || !TPL.shim || !TPL.app) {
      toast('页面缺少模板，请重新生成 admin.html', 'err');
      return;
    }
    var db = clone(DB);
    db.settings = stripCreds(db.settings);
    db.feedbacks = [];

    // 注意：这里的 </script> 必须写成 <\/script>，否则本文件被内联进 HTML 时会提前截断脚本块
    var html = TPL.index
      .replace('<link rel="stylesheet" href="/css/style.css">', '<style>\n' + TPL.css + '\n</style>')
      .replace('<script src="/js/app.js"><\/script>',
        '<script>window.__DATA__=' + safeJson(db) + ';<\/script>\n' +
        '<script>\n' + TPL.shim + '\n<\/script>\n' +
        '<script>\n' + TPL.app + '\n<\/script>')
      .replace(/"\/assets\//g, '"assets/')
      .replace(/'\/assets\//g, "'assets/");

    html = html.replace('<div id="toast"></div>',
      '<div class="tip-bar" style="margin-top:16px">当前为<b>静态版</b>：查询功能完整可用，数据快照由后台导出生成。</div>\n<div id="toast"></div>');

    download('index.html', html);
    $('#expMsg').textContent = '已生成 index.html（' + (html.length / 1024).toFixed(0) + ' KB），覆盖仓库根目录后 push 即可。';
    toast('index.html 已下载', 'ok');
  }

  function exportDb() {
    var db = clone(DB);
    if (!db.settings.adminUser) {
      db.settings.adminUser = 'admin';
      db.settings.adminPassHash = '';
      db.settings.adminSalt = '';
    }
    download('db.json', JSON.stringify(db, null, 1));
    $('#expMsg').textContent = '已导出 db.json，覆盖到仓库 data/ 目录（Node 版用）后 push。';
    toast('db.json 已下载', 'ok');
  }

  /* ---------------- 弹窗 ---------------- */
  var okHandler = null;
  function openModal(title, body, onOk) {
    $('#mTitle').textContent = title;
    $('#mBody').innerHTML = body;
    okHandler = onOk;
    $('#mask').classList.add('on');
    setTimeout(function () { var f = $('#mBody').querySelector('input,select,textarea'); if (f) f.focus(); }, 50);
  }
  function closeModal() { $('#mask').classList.remove('on'); okHandler = null; }
  function confirmModal(title, text, onOk) {
    openModal(title, '<div style="font-size:14px;line-height:1.7">' + text + '</div>', function () {
      closeModal(); onOk(); return false;
    });
  }

  /* ---------------- 绑定 ---------------- */
  function fillSelects() {
    var plats = DB.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    $('#ePlat').innerHTML = '<option value="">全部平台</option>' + plats.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
    $('#bPlat').innerHTML = plats.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
    var g = '<option value="">全部分组</option>' + (DB.groups || []).map(function (x) {
      return '<option value="' + esc(x) + '">' + esc(x) + '</option>';
    }).join('');
    $('#pGroup').innerHTML = g;
    $('#eGroup').innerHTML = g;
  }

  function bindAll() {
    $$('#tabs button').forEach(function (btn) {
      btn.onclick = function () {
        $$('#tabs button').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        $$('.panel').forEach(function (p) { p.classList.remove('on'); });
        $('#panel-' + btn.dataset.tab).classList.add('on');
      };
    });

    $('#pQ').addEventListener('input', renderPeople);
    $('#pGroup').onchange = renderPeople;
    $('#pAdd').onclick = function () { editPerson(null); };

    $('#eQ').addEventListener('input', renderEntries);
    $('#ePlat').onchange = renderEntries;
    $('#eGroup').onchange = renderEntries;
    $('#eAdd').onclick = function () { editEntry(null); };

    $('#bSubmit').onclick = bulk;
    $('#plAdd').onclick = function () {
      openModal('新增平台',
        '<div class="form-grid">' +
        '<div class="form-row"><label>名称 *</label><input class="input" id="pfName" placeholder="例如 YouTube"></div>' +
        '<div class="form-row"><label>标识（英文唯一）</label><input class="input" id="pfId" placeholder="youtube"></div></div>' +
        '<div class="form-grid">' +
        '<div class="form-row"><label>颜色</label><input class="input" id="pfColor" type="color" value="#7c5cff" style="padding:4px;height:42px"></div>' +
        '<div class="form-row"><label>排序</label><input class="input" id="pfOrder" type="number" value="' + (DB.platforms.length + 1) + '"></div></div>' +
        '<div class="err-text" id="fErr"></div>',
        function () {
          var name = $('#pfName').value.trim();
          var id = $('#pfId').value.trim() || ('p' + Math.random().toString(36).slice(2, 7));
          if (!name) { $('#fErr').textContent = '名称不能为空'; return false; }
          if (DB.platforms.some(function (x) { return x.id === id; })) { $('#fErr').textContent = '标识已存在'; return false; }
          DB.platforms.push({ id: id, name: name, color: $('#pfColor').value, icon: 'dot', order: Number($('#pfOrder').value) });
          closeModal(); commit(); toast('已新增', 'ok');
          return false;
        });
    };

    $('#sSave').onclick = function () {
      DB.settings.siteName = $('#sName').value.trim() || DB.settings.siteName;
      DB.settings.subtitle = $('#sSub').value.trim();
      var gs = $('#sGroups').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      DB.groups = gs;
      var ls = $('#sLogos').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (ls.length) DB.settings.logos = ls;
      commit(); toast('已保存', 'ok');
    };

    $('#ctAdd').onclick = function () {
      var list = readContacts();
      list.push({ type: '微信', value: '', label: '' });
      renderContacts(list);
      var rows = $$('#ctList .ct-row');
      if (rows.length) rows[rows.length - 1].querySelector('[data-k="value"]').focus();
    };

    $('#fbSave').onclick = function () {
      DB.settings.feedback = {
        title: $('#fbTitle').value.trim() || '问题反馈',
        desc: $('#fbDesc').value.trim(),
        enableForm: $('#fbEnable').checked,
      };
      DB.settings.contacts = readContacts();
      commit(); toast('已保存', 'ok');
    };

    $('#expIndex').onclick = exportIndex;
    $('#expDb').onclick = exportDb;

    $('#impDb').onclick = function () { $('#impFile').click(); };
    $('#impFile').onchange = function () {
      var f = this.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          if (!Array.isArray(d.people) || !Array.isArray(d.entries)) throw new Error('格式不对');
          DB = normalize(d);
          saveDraft();
          fillSelects(); renderAll();
          toast('已导入 db.json', 'ok');
        } catch (e) { toast('导入失败：' + e.message, 'err'); }
      };
      rd.readAsText(f);
      this.value = '';
    };

    $('#dropDraft').onclick = function () {
      confirmModal('清除草稿', '将放弃本机未导出的全部改动，恢复到线上版本。确定？', function () {
        localStorage.removeItem(DRAFT_KEY);
        DB = normalize(clone(window.__DATA__ || {}));
        $('#draftBar').style.display = 'none';
        $('#expTime').textContent = '-';
        fillSelects(); renderAll();
        toast('已恢复线上版本', 'ok');
      });
    };

    $('#draftDrop').onclick = function () {
      localStorage.removeItem(DRAFT_KEY);
      DB = normalize(clone(window.__DATA__ || {}));
      $('#draftBar').style.display = 'none';
      $('#expTime').textContent = '-';
      fillSelects(); renderAll();
      toast('已使用线上版本', 'ok');
    };

    $('#mClose').onclick = closeModal;
    $('#mCancel').onclick = closeModal;
    $('#mask').addEventListener('mousedown', function (e) { if (e.target === $('#mask')) closeModal(); });
    $('#mOk').onclick = function () { if (okHandler) okHandler(); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#mask').classList.contains('on')) closeModal();
      if (e.key === 'Enter' && $('#mask').classList.contains('on') && e.target.tagName === 'INPUT') {
        e.preventDefault(); if (okHandler) okHandler();
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  var theme = localStorage.getItem('ch_theme');
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  initGate();
})();
