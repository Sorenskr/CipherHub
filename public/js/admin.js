/* 暗号查询中心 —— 后台管理 */
(function () {
  'use strict';

  var boot = null;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, type) {
    var box = $('#toast');
    var el = document.createElement('div');
    el.className = 'toast-item ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, 2000);
  }

  function req(method, path, body) {
    var opt = { method: method, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers = { 'Content-Type': 'application/json' };
      opt.body = JSON.stringify(body);
    }
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
        return d;
      });
    });
  }

  /* ---------- 登录 ---------- */
  function showLogin() {
    $('#loginPage').style.display = 'grid';
    $('#adminPage').style.display = 'none';
  }

  function showAdmin() {
    $('#loginPage').style.display = 'none';
    $('#adminPage').style.display = 'block';
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#lgErr').textContent = '';
    var btn = $('#lgBtn');
    btn.disabled = true; btn.textContent = '登录中…';
    req('POST', '/api/login', { username: $('#lgUser').value, password: $('#lgPass').value })
      .then(function () {
        $('#lgPass').value = '';
        return loadBoot();
      })
      .then(function () { showAdmin(); })
      .catch(function (err) {
        $('#lgErr').textContent = err.message;
      })
      .then(function () { btn.disabled = false; btn.textContent = '登 录'; });
  });

  $('#logoutBtn').onclick = function () {
    req('POST', '/api/logout', {}).then(function () { showLogin(); });
  };

  /* ---------- 初始化数据 ---------- */
  function loadBoot() {
    return req('GET', '/api/bootstrap').then(function (b) {
      boot = b;
      document.title = '管理后台 · ' + b.settings.siteName;
      fillSelects();
      renderDash();
      renderNet();
    });
  }

  function fillSelects() {
    var plats = boot.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var opts = '<option value="">全部平台</option>' + plats.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
    $('#ePlat').innerHTML = opts;
    $('#bPlat').innerHTML = plats.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');

    var gopts = '<option value="">全部分组</option>' + (boot.groups || []).map(function (g) {
      return '<option value="' + esc(g) + '">' + esc(g) + '</option>';
    }).join('');
    $('#pGroup').innerHTML = gopts;
    $('#eGroup').innerHTML = gopts;
  }

  /* ---------- Tabs ---------- */
  $$('#tabs button').forEach(function (btn) {
    btn.onclick = function () {
      $$('#tabs button').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      $$('.panel').forEach(function (p) { p.classList.remove('on'); });
      $('#panel-' + btn.dataset.tab).classList.add('on');
      if (btn.dataset.tab === 'people') loadPeople();
      if (btn.dataset.tab === 'entries') loadEntries();
      if (btn.dataset.tab === 'feedback') loadFeedbacks();
      if (btn.dataset.tab === 'platforms') renderPlatforms();
      if (btn.dataset.tab === 'settings') loadSettings();
      if (btn.dataset.tab === 'dash') renderNet();
    };
  });

  /* ---------- 概览 ---------- */
  function renderDash() {
    var s = boot.stats;
    var cards = [
      { n: s.people, t: '成员总数' },
      { n: s.entries, t: '暗号 / 短链' },
      { n: boot.platforms.length, t: '平台数量' },
      { n: (boot.groups || []).length, t: '分组数量' },
    ];
    $('#dashStats').innerHTML = cards.map(function (c) {
      return '<div class="box"><b>' + c.n + '</b><span>' + c.t + '</span></div>';
    }).join('');

    var badge = $('#fbBadge');
    if (badge) {
      var nw = s.feedbackNew || 0;
      badge.style.display = nw ? '' : 'none';
      badge.textContent = nw ? ' · ' + nw : '';
      badge.style.color = 'var(--warn)';
    }

    $('#dashPlat').innerHTML = boot.platforms.slice().sort(function (a, b) {
      return (s.byPlatform[b.id] || 0) - (s.byPlatform[a.id] || 0);
    }).map(function (p) {
      var n = s.byPlatform[p.id] || 0;
      var pct = s.entries ? Math.round((n / s.entries) * 100) : 0;
      return '<tr><td style="width:120px"><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(p.color) + ';display:inline-block"></span>' + esc(p.name) + '</span></td>' +
        '<td><div style="height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + esc(p.color) + '"></div></div></td>' +
        '<td style="width:70px;text-align:right" class="mono">' + n + '</td></tr>';
    }).join('');
  }

  /* ---------- 手机 / 局域网访问地址 ---------- */
  function renderNet() {
    var box = $('#netList');
    if (!box) return;
    req('GET', '/api/admin/net').then(function (d) {
      var list = (d.addresses || []).map(function (a) { return 'http://' + a + ':' + d.port + '/'; });
      list.unshift('http://localhost:' + d.port + '/');
      box.innerHTML = list.map(function (u) {
        return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<a class="btn sm ghost" href="' + u + '" target="_blank" style="font-family:var(--mono)">' + esc(u) + '</a>' +
          '<button class="btn sm" data-net="' + esc(u) + '">复制</button></div>';
      }).join('') || '<div class="tiny muted">未检测到局域网地址</div>';
      box.querySelectorAll('[data-net]').forEach(function (b) {
        b.onclick = function () {
          var u = b.getAttribute('data-net');
          if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('已复制', 'ok'); });
          else toast(u, 'ok');
        };
      });
    }).catch(function () {});
  }

  /* ---------- 反馈 ---------- */
  var fbCache = [];
  function loadFeedbacks() {
    req('GET', '/api/admin/feedbacks?status=' + encodeURIComponent($('#fStatus').value)).then(function (d) {
      fbCache = d.items;
      $('#fbStats').textContent = '未处理 ' + (d.stats.new || 0) + ' / 共 ' + (d.stats.total || 0);
      $('#fCount').textContent = '显示 ' + d.items.length + ' 条';
      $('#fBody').innerHTML = d.items.map(function (f) {
        var t = new Date(f.createdAt);
        var done = f.status === 'done';
        return '<tr>' +
          '<td class="tiny muted">' + esc(isNaN(t) ? f.createdAt : t.toLocaleString('zh-CN')) + '</td>' +
          '<td>' + esc(f.name || '-') + '</td>' +
          '<td>' + esc(f.contact || '-') + '</td>' +
          '<td style="white-space:pre-wrap;word-break:break-word">' + esc(f.message) + '</td>' +
          '<td>' + (done ? '<span class="tag">已处理</span>' : '<span class="tag" style="border-color:rgba(255,176,32,.5);color:var(--warn)">未处理</span>') + '</td>' +
          '<td><div class="ops">' +
            '<button class="btn sm" data-toggle="' + f.id + '">' + (done ? '标为未处理' : '标为已处理') + '</button>' +
            '<button class="btn sm danger" data-fdel="' + f.id + '">删除</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-mute);padding:26px">暂无反馈</td></tr>';

      $$('#fBody [data-toggle]').forEach(function (b) {
        b.onclick = function () {
          var f = fbCache.find(function (x) { return x.id === Number(b.dataset.toggle); });
          req('PUT', '/api/admin/feedbacks?id=' + b.dataset.toggle, { status: f.status === 'done' ? 'new' : 'done' })
            .then(function () { toast('已更新', 'ok'); return loadBoot(); })
            .then(loadFeedbacks).catch(function (e) { toast(e.message, 'err'); });
        };
      });
      $$('#fBody [data-fdel]').forEach(function (b) {
        b.onclick = function () {
          confirmModal('删除反馈', '确定删除这条反馈？', function () {
            req('DELETE', '/api/admin/feedbacks?id=' + b.dataset.fdel)
              .then(function () { toast('已删除', 'ok'); return loadBoot(); })
              .then(loadFeedbacks).catch(function (e) { toast(e.message, 'err'); });
          });
        };
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  $('#fStatus').onchange = loadFeedbacks;
  $('#fReload').onclick = loadFeedbacks;

  /* ---------- 成员 ---------- */
  var peopleCache = [];
  function loadPeople() {
    var qs = '?q=' + encodeURIComponent($('#pQ').value.trim()) + '&group=' + encodeURIComponent($('#pGroup').value);
    req('GET', '/api/admin/people' + qs).then(function (d) {
      peopleCache = d.items;
      $('#pCount').textContent = '共 ' + d.items.length + ' 人';
      $('#pBody').innerHTML = d.items.map(function (p) {
        return '<tr>' +
          '<td class="mono muted">' + p.id + '</td>' +
          '<td><b>' + esc(p.name) + '</b></td>' +
          '<td class="muted">' + esc(p.group || '-') + '</td>' +
          '<td class="mono">' + p.count + '</td>' +
          '<td><div class="ops">' +
            '<button class="btn sm" data-edit="' + p.id + '">编辑</button>' +
            '<button class="btn sm danger" data-del="' + p.id + '">删除</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-mute);padding:26px">暂无成员</td></tr>';

      $$('#pBody [data-edit]').forEach(function (b) {
        b.onclick = function () { editPerson(Number(b.dataset.edit)); };
      });
      $$('#pBody [data-del]').forEach(function (b) {
        b.onclick = function () { delPerson(Number(b.dataset.del)); };
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  $('#pQ').addEventListener('input', debounce(loadPeople, 220));
  $('#pGroup').onchange = loadPeople;
  $('#pReload').onclick = loadPeople;
  $('#pAdd').onclick = function () { editPerson(null); };

  function personForm(p) {
    var groups = (boot.groups || []).map(function (g) { return '<option value="' + esc(g) + '"' + (p && p.group === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    return '<div class="form-row"><label>姓名 *</label><input class="input" id="fName" value="' + esc(p ? p.name : '') + '" placeholder="例如 张三"></div>' +
      '<div class="form-row"><label>分组</label><input class="input" id="fGroup" list="groupList" value="' + esc(p ? p.group : '') + '" placeholder="例如 Laya">' +
      '<datalist id="groupList">' + groups + '</datalist></div>' +
      '<div class="form-row"><label>备注</label><input class="input" id="fNote" value="' + esc(p ? p.note : '') + '"></div>' +
      '<div class="err-text" id="fErr"></div>';
  }

  function editPerson(id) {
    var p = id ? peopleCache.find(function (x) { return x.id === id; }) : null;
    openModal(id ? '编辑成员' : '新增成员', personForm(p), function () {
      var data = {
        name: $('#fName').value.trim(),
        group: $('#fGroup').value.trim(),
        note: $('#fNote').value.trim(),
      };
      if (!data.name) { $('#fErr').textContent = '姓名不能为空'; return false; }
      var promise = id ? req('PUT', '/api/admin/people?id=' + id, data) : req('POST', '/api/admin/people', data);
      promise.then(function () {
        closeModal(); toast('已保存', 'ok');
        return loadBoot();
      }).then(loadPeople).catch(function (e) { $('#fErr').textContent = e.message; });
      return false;
    });
  }

  function delPerson(id) {
    var p = peopleCache.find(function (x) { return x.id === id; });
    confirmModal('删除成员', '确定删除「' + esc(p ? p.name : id) + '」？该成员下的全部暗号 / 短链记录也会一并删除，且不可恢复。', function () {
      req('DELETE', '/api/admin/people?id=' + id).then(function () {
        toast('已删除', 'ok');
        return loadBoot();
      }).then(loadPeople).catch(function (e) { toast(e.message, 'err'); });
    });
  }

  /* ---------- 暗号记录 ---------- */
  var entryCache = [];
  function loadEntries() {
    var qs = '?q=' + encodeURIComponent($('#eQ').value.trim()) +
      '&platform=' + encodeURIComponent($('#ePlat').value) +
      '&group=' + encodeURIComponent($('#eGroup').value) +
      '&kind=' + encodeURIComponent($('#eKind').value);
    req('GET', '/api/admin/entries' + qs).then(function (d) {
      entryCache = d.items;
      $('#eCount').textContent = '显示 ' + d.items.length + ' 条 / 共 ' + d.total + ' 条';
      $('#eBody').innerHTML = d.items.slice(0, 400).map(function (e) {
        var pl = e.platform || {};
        return '<tr>' +
          '<td class="mono muted">' + e.id + '</td>' +
          '<td>' + esc(e.person ? e.person.name : '-') + '<div class="tiny muted">' + esc(e.person && e.person.group ? e.person.group : '') + '</div></td>' +
          '<td><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(pl.color || '#7c5cff') + ';display:inline-block"></span>' + esc(pl.name || e.platformId) + '</span></td>' +
          '<td class="mono">' + esc(e.value) + '</td>' +
          '<td class="tiny muted">' + esc(e.type || '-') + '</td>' +
          '<td class="tiny muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (e.url ? esc(e.url) : '-') + '</td>' +
          '<td><div class="ops">' +
            '<button class="btn sm" data-edit="' + e.id + '">编辑</button>' +
            '<button class="btn sm danger" data-del="' + e.id + '">删除</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:26px">暂无记录</td></tr>';

      $$('#eBody [data-edit]').forEach(function (b) {
        b.onclick = function () { editEntry(Number(b.dataset.edit)); };
      });
      $$('#eBody [data-del]').forEach(function (b) {
        b.onclick = function () { delEntry(Number(b.dataset.del)); };
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  $('#eQ').addEventListener('input', debounce(loadEntries, 220));
  ['#ePlat', '#eGroup', '#eKind'].forEach(function (s) { $(s).onchange = loadEntries; });
  $('#eReload').onclick = loadEntries;
  $('#eAdd').onclick = function () { editEntry(null); };

  function entryForm(e) {
    var po = boot.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); })
      .map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (e && e.platformId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('');
    var peopleOpts = peopleCache.length ? peopleCache : [];
    var pe = peopleOpts.map(function (p) {
      return '<option value="' + p.id + '"' + (e && e.personId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    return '<div class="form-grid">' +
      '<div class="form-row"><label>成员 *</label><select class="select" id="fPerson">' + pe + '</select></div>' +
      '<div class="form-row"><label>平台 *</label><select class="select" id="fPlat">' + po + '</select></div>' +
      '</div>' +
      '<div class="form-row"><label>暗号 / 短链 *</label><input class="input" id="fValue" value="' + esc(e ? e.value : '') + '" placeholder="例如 3250 或 laya-zzl-tw"></div>' +
      '<div class="form-grid">' +
      '<div class="form-row"><label>记录类型</label><select class="select" id="fKind">' +
        '<option value="code"' + (!e || e.kind === 'code' ? ' selected' : '') + '>暗号</option>' +
        '<option value="link"' + (e && e.kind === 'link' ? ' selected' : '') + '>短链</option>' +
      '</select></div>' +
      '<div class="form-row"><label>内容类型</label><input class="input" id="fType" value="' + esc(e ? e.type : '') + '" placeholder="图文 / 视频"></div>' +
      '</div>' +
      '<div class="form-row"><label>链接地址（短链填写）</label><input class="input" id="fUrl" value="' + esc(e ? e.url : '') + '" placeholder="https://..."></div>' +
      '<div class="err-text" id="fErr"></div>';
  }

  function editEntry(id) {
    if (!peopleCache.length) {
      req('GET', '/api/admin/people?q=').then(function (d) { peopleCache = d.items; editEntry(id); });
      return;
    }
    var e = id ? entryCache.find(function (x) { return x.id === id; }) : null;
    openModal(id ? '编辑记录' : '新增记录', entryForm(e), function () {
      var data = {
        personId: Number($('#fPerson').value),
        platformId: $('#fPlat').value,
        kind: $('#fKind').value,
        value: $('#fValue').value.trim(),
        type: $('#fType').value.trim(),
        url: $('#fUrl').value.trim(),
      };
      if (!data.value) { $('#fErr').textContent = '暗号 / 短链不能为空'; return false; }
      var promise = id ? req('PUT', '/api/admin/entries?id=' + id, data) : req('POST', '/api/admin/entries', data);
      promise.then(function () {
        closeModal(); toast('已保存', 'ok');
        return loadBoot();
      }).then(loadEntries).catch(function (err) { $('#fErr').textContent = err.message; });
      return false;
    });
  }

  function delEntry(id) {
    var e = entryCache.find(function (x) { return x.id === id; });
    confirmModal('删除记录', '确定删除记录「' + esc(e ? e.value : id) + '」？', function () {
      req('DELETE', '/api/admin/entries?id=' + id).then(function () {
        toast('已删除', 'ok');
        return loadBoot();
      }).then(loadEntries).catch(function (err) { toast(err.message, 'err'); });
    });
  }

  /* ---------- 批量导入 ---------- */
  $('#bDemo').onclick = function () {
    $('#bText').value = '# 格式：姓名 暗号 平台 类型 链接\n张三 1234 ins\n张三 5678 tik\n张三 8899 视频\n张三 laya-zs-tw 短链 图文 https://app.adjust.com/xxxx';
  };
  $('#bSubmit').onclick = function () {
    var text = $('#bText').value;
    if (!text.trim()) { toast('请先粘贴内容', 'err'); return; }
    $('#bSubmit').disabled = true;
    req('POST', '/api/admin/bulk', {
      text: text,
      platformId: $('#bPlat').value,
      type: $('#bType').value.trim(),
      group: $('#bGroup').value.trim(),
    }).then(function (r) {
      var html = '<div class="tag" style="background:rgba(40,199,111,.16);border-color:rgba(40,199,111,.5);color:var(--ok)">' +
        '新增成员 ' + r.created.people + ' 人，新增记录 ' + r.created.entries + ' 条</div>';
      if (r.errors && r.errors.length) {
        html += '<div style="margin-top:10px" class="tiny">跳过 ' + r.errors.length + ' 行：<br>' +
          r.errors.slice(0, 20).map(esc).join('<br>') + '</div>';
      }
      $('#bResult').innerHTML = html;
      toast('导入完成', 'ok');
      return loadBoot();
    }).catch(function (e) { toast(e.message, 'err'); })
      .then(function () { $('#bSubmit').disabled = false; });
  };

  /* ---------- 平台 ---------- */
  function renderPlatforms() {
    var list = boot.platforms.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var counts = boot.stats.byPlatform || {};
    $('#plList').innerHTML = list.map(function (p) {
      return '<div class="row" data-id="' + esc(p.id) + '">' +
        '<input class="input" data-k="name" value="' + esc(p.name) + '" placeholder="名称">' +
        '<input class="input" data-k="id" value="' + esc(p.id) + '" placeholder="标识" title="唯一英文标识，修改会导致原记录失联，请谨慎">' +
        '<input class="input" data-k="color" type="color" value="' + esc(p.color || '#7c5cff') + '" style="padding:4px;height:42px">' +
        '<input class="input" data-k="order" type="number" value="' + (p.order || 0) + '" placeholder="排序">' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn sm" data-save="' + esc(p.id) + '">保存</button>' +
          '<button class="btn sm danger" data-del="' + esc(p.id) + '"' + ((counts[p.id] || 0) > 0 ? ' disabled title="仍有记录占用"' : '') + '>删除</button>' +
        '</div></div>';
    }).join('');

    $$('#plList [data-save]').forEach(function (b) {
      b.onclick = function () {
        var row = b.closest('.row');
        var get = function (k) { return row.querySelector('[data-k="' + k + '"]').value.trim(); };
        req('POST', '/api/admin/platforms', {
          id: get('id'), name: get('name'), color: get('color'), order: Number(get('order')),
        }).then(function () { toast('已保存', 'ok'); return loadBoot(); })
          .then(renderPlatforms).catch(function (e) { toast(e.message, 'err'); });
      };
    });
    $$('#plList [data-del]').forEach(function (b) {
      b.onclick = function () {
        req('DELETE', '/api/admin/platforms?id=' + encodeURIComponent(b.dataset.del))
          .then(function () { toast('已删除', 'ok'); return loadBoot(); })
          .then(renderPlatforms).catch(function (e) { toast(e.message, 'err'); });
      };
    });
  }

  $('#plAdd').onclick = function () {
    openModal('新增平台',
      '<div class="form-grid">' +
      '<div class="form-row"><label>名称 *</label><input class="input" id="pfName" placeholder="例如 YouTube"></div>' +
      '<div class="form-row"><label>标识（英文唯一）</label><input class="input" id="pfId" placeholder="youtube"></div>' +
      '</div>' +
      '<div class="form-grid">' +
      '<div class="form-row"><label>颜色</label><input class="input" id="pfColor" type="color" value="#7c5cff" style="padding:4px;height:42px"></div>' +
      '<div class="form-row"><label>排序</label><input class="input" id="pfOrder" type="number" value="' + (boot.platforms.length + 1) + '"></div>' +
      '</div><div class="err-text" id="fErr"></div>',
      function () {
        var data = {
          name: $('#pfName').value.trim(),
          id: $('#pfId').value.trim(),
          color: $('#pfColor').value,
          order: Number($('#pfOrder').value),
        };
        if (!data.name) { $('#fErr').textContent = '名称不能为空'; return false; }
        req('POST', '/api/admin/platforms', data).then(function () {
          closeModal(); toast('已新增', 'ok');
          return loadBoot();
        }).then(renderPlatforms).catch(function (e) { $('#fErr').textContent = e.message; });
        return false;
      });
  };

  /* ---------- 设置 ---------- */
  function loadSettings() {
    $('#sName').value = boot.settings.siteName || '';
    $('#sSub').value = boot.settings.subtitle || '';
    $('#sGroups').value = (boot.groups || []).join(', ');
    $('#sLogos').value = (boot.settings.logos || []).join(', ');
    var fb = boot.settings.feedback || {};
    $('#fbTitle').value = fb.title || '';
    $('#fbDesc').value = fb.desc || '';
    $('#fbEnable').checked = fb.enableForm !== false;
    renderContacts(boot.settings.contacts || []);
  }

  function renderContacts(list) {
    var box = $('#ctList');
    box.innerHTML = list.map(function (c, i) {
      return '<div class="ct-row" data-i="' + i + '" style="display:grid;grid-template-columns:110px 1fr 150px auto;gap:8px">' +
        '<input class="input" data-k="type" value="' + esc(c.type || '') + '" placeholder="微信">' +
        '<input class="input" data-k="value" value="' + esc(c.value || '') + '" placeholder="wxid_xxx / 123456 / a@b.com">' +
        '<input class="input" data-k="label" value="' + esc(c.label || '') + '" placeholder="备注（选填）">' +
        '<button class="btn sm danger" data-ctdel="' + i + '">删除</button></div>';
    }).join('') || '<div class="tiny muted">暂无联系方式</div>';
    $$('#ctList [data-ctdel]').forEach(function (b) {
      b.onclick = function () { b.closest('.ct-row').remove(); };
    });
  }

  $('#ctAdd').onclick = function () {
    var rows = $$('#ctList .ct-row');
    var list = readContacts();
    list.push({ type: '微信', value: '', label: '' });
    renderContacts(list);
    var all = $$('#ctList .ct-row');
    if (all.length) all[all.length - 1].querySelector('input[data-k="value"]').focus();
  };

  function readContacts() {
    return $$('#ctList .ct-row').map(function (row) {
      return {
        type: row.querySelector('[data-k="type"]').value.trim(),
        value: row.querySelector('[data-k="value"]').value.trim(),
        label: row.querySelector('[data-k="label"]').value.trim(),
      };
    });
  }

  $('#sSave').onclick = function () {
    req('POST', '/api/admin/settings', {
      siteName: $('#sName').value.trim(),
      subtitle: $('#sSub').value.trim(),
      groups: $('#sGroups').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
      logos: $('#sLogos').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
    }).then(function () { toast('已保存', 'ok'); return loadBoot(); })
      .then(function () { fillSelects(); loadSettings(); })
      .catch(function (e) { toast(e.message, 'err'); });
  };

  $('#fbSave').onclick = function () {
    req('POST', '/api/admin/settings', {
      feedback: {
        title: $('#fbTitle').value.trim(),
        desc: $('#fbDesc').value.trim(),
        enableForm: $('#fbEnable').checked,
      },
      contacts: readContacts(),
    }).then(function () { toast('已保存反馈配置', 'ok'); return loadBoot(); })
      .then(loadSettings)
      .catch(function (e) { toast(e.message, 'err'); });
  };

  $('#pwSave').onclick = function () {
    var op = $('#op').value, np = $('#np').value;
    if (np.length < 6) { toast('新密码至少 6 位', 'err'); return; }
    req('POST', '/api/admin/password', { oldPassword: op, newPassword: np })
      .then(function () { $('#op').value = ''; $('#np').value = ''; toast('密码已修改，请牢记', 'ok'); })
      .catch(function (e) { toast(e.message, 'err'); });
  };

  $('#expBtn').onclick = function () { location.href = '/api/admin/export'; };
  $('#bakBtn').onclick = function () {
    req('POST', '/api/admin/backup', {}).then(function (r) {
      $('#dataMsg').textContent = '已备份：data/backups/' + r.file;
      toast('备份完成', 'ok');
    }).catch(function (e) { toast(e.message, 'err'); });
  };
  $('#impBtn').onclick = function () { $('#impFile').click(); };
  $('#impFile').onchange = function () {
    var f = this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { toast('JSON 解析失败', 'err'); return; }
      confirmModal('恢复数据', '即将用该文件覆盖当前全部数据（共 ' + (data.entries ? data.entries.length : 0) + ' 条记录）。操作前会自动备份，确定继续？', function () {
        req('POST', '/api/admin/import', data).then(function () {
          toast('恢复成功', 'ok');
          return loadBoot();
        }).then(function () { fillSelects(); loadPeople(); }).catch(function (e) { toast(e.message, 'err'); });
      });
    };
    reader.readAsText(f);
    this.value = '';
  };

  /* ---------- 弹窗 ---------- */
  var okHandler = null;
  function openModal(title, body, onOk) {
    $('#mTitle').textContent = title;
    $('#mBody').innerHTML = body;
    okHandler = onOk;
    $('#mask').classList.add('on');
    setTimeout(function () {
      var f = $('#mBody').querySelector('input,select,textarea');
      if (f) f.focus();
    }, 50);
  }
  function closeModal() { $('#mask').classList.remove('on'); okHandler = null; }

  function confirmModal(title, text, onOk) {
    openModal(title, '<div style="font-size:14px;line-height:1.7">' + text + '</div>', function () {
      closeModal();
      onOk();
      return false;
    });
    $('#mOk').textContent = '确定';
  }

  $('#mClose').onclick = closeModal;
  $('#mCancel').onclick = closeModal;
  $('#mask').addEventListener('mousedown', function (e) { if (e.target === $('#mask')) closeModal(); });
  $('#mOk').onclick = function () {
    $('#mOk').textContent = '确定';
    if (okHandler) okHandler();
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#mask').classList.contains('on')) closeModal();
    if (e.key === 'Enter' && $('#mask').classList.contains('on') && e.target.tagName === 'INPUT') {
      e.preventDefault();
      if (okHandler) okHandler();
    }
  });

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  /* ---------- 启动 ---------- */
  var theme = localStorage.getItem('ch_theme');
  if (theme) document.documentElement.setAttribute('data-theme', theme);

  req('GET', '/api/me').then(function (d) {
    if (d.user) {
      return loadBoot().then(showAdmin);
    }
    showLogin();
  }).catch(showLogin);
})();
