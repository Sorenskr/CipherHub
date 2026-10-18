/* 暗号查询中心 —— 前台逻辑 */
(function () {
  'use strict';

  var state = {
    q: '',
    platform: '',
    group: '',
    boot: null,
    limit: 30,
    entryLimit: 300,
    loading: false,
    samples: null,
    spotIdx: 0,
    spotTimer: null,
    phTimer: null,
    phType: null,
    phIdx: 0,
    phCands: [],
  };

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function highlight(text, q) {
    var t = esc(text);
    if (!q) return t;
    var k = q.trim();
    if (!k) return t;
    var lower = String(text).toLowerCase();
    var idx = lower.indexOf(k.toLowerCase());
    if (idx < 0) return t;
    var raw = String(text);
    return esc(raw.slice(0, idx)) + '<mark>' + esc(raw.slice(idx, idx + k.length)) + '</mark>' + esc(raw.slice(idx + k.length));
  }

  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'linear-gradient(135deg, hsl(' + h + ',68%,58%), hsl(' + ((h + 42) % 360) + ',70%,48%))';
  }

  function pico(name) {
    var map = { Threads: 'Th', Instagram: 'In', TikTok: 'TT', X: 'X', Facebook: 'F' };
    if (map[name]) return map[name];
    return String(name || '').slice(0, 1);
  }

  function toast(msg, type) {
    var box = $('#toast');
    var el = document.createElement('div');
    el.className = 'toast-item ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 260);
    }, 1600);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制：' + text, 'ok'); },
        function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('已复制：' + text, 'ok');
    } catch (e) {
      toast('复制失败，请手动选择', 'err');
    }
    ta.remove();
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function api(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- 背景动效 ---------- */
  function initBackground() {
    var box = document.getElementById('bgDots');
    if (!box) return;
    var colors = ['#7c5cff', '#3ea6ff', '#ff5c8a', '#00c8b4', '#ffb020'];
    var n = window.innerWidth < 700 ? 12 : 20;
    var html = '';
    for (var i = 0; i < n; i++) {
      var s = (2 + Math.random() * 4).toFixed(1);
      var dur = (15 + Math.random() * 18).toFixed(1);
      var delay = '-' + (Math.random() * 24).toFixed(1);
      var dx = ((Math.random() * 90 - 45) | 0);
      var left = (Math.random() * 100).toFixed(2);
      html += '<i style="--s:' + s + 'px;--c:' + colors[i % colors.length] + ';left:' + left +
        '%;animation-duration:' + dur + 's;animation-delay:' + delay + 's;--dx:' + dx + 'px"></i>';
    }
    box.innerHTML = html;
  }

  /* ---------- 主题 ---------- */
  function initTheme() {
    var t = localStorage.getItem('ch_theme');
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    $('#themeBtn').onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ch_theme', next);
    };
  }

  /* ---------- Logo 切换 ---------- */
  function setupLogo(b) {
    var logos = (b.settings && b.settings.logos) || [];
    logos = logos.filter(Boolean);
    var box = $('#logoBox');
    var img = $('#brandLogo');
    var btn = $('#logoBtn');
    if (!logos.length) {
      box.innerHTML = '#';
      btn.style.display = 'none';
      return;
    }
    var saved = parseInt(localStorage.getItem('ch_logo'), 10);
    var idx = (isNaN(saved) || saved < 0 || saved >= logos.length)
      ? Math.floor(Math.random() * logos.length)
      : saved;

    function paint(i) {
      idx = ((i % logos.length) + logos.length) % logos.length;
      img.style.animation = 'none';
      img.onerror = function () {
        img.style.display = 'none';
        box.textContent = '#';
      };
      img.onload = function () {
        img.style.display = 'block';
        img.style.animation = '';
      };
      img.src = logos[idx];
      if (img.complete && img.naturalWidth) {
        img.style.display = 'block';
        img.style.animation = '';
      }
      localStorage.setItem('ch_logo', String(idx));
      btn.title = '切换 Logo (' + (idx + 1) + '/' + logos.length + ')';
    }

    paint(idx);
    btn.onclick = function () {
      paint(idx + 1);
      toast('已切换 Logo', 'ok');
    };
    if (logos.length < 2) btn.style.display = 'none';
  }

  /* ---------- 问题反馈 ---------- */
  function renderFeedback(b) {
    var s = (b && b.settings) || {};
    var fb = s.feedback || {};
    var contacts = s.contacts || [];

    $('#fbTitle').textContent = fb.title || '问题反馈';
    $('#fbDesc').textContent = fb.desc || '';
    $('#fbDesc').style.display = fb.desc ? '' : 'none';

    var box = $('#fbContacts');
    if (contacts.length) {
      box.style.display = '';
      $('#fbEmpty').style.display = 'none';
      box.innerHTML = contacts.map(function (c) {
        return '<div class="ct">' +
          '<span class="ty">' + esc(c.type || '其他') + '</span>' +
          '<span class="vl">' + esc(c.value) + (c.label ? ' <span class="tiny muted">· ' + esc(c.label) + '</span>' : '') + '</span>' +
          '<button class="cp" data-copy="' + esc(c.value) + '" title="复制">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>' +
          '</button></div>';
      }).join('');
      box.querySelectorAll('[data-copy]').forEach(function (el) {
        el.onclick = function () { copy(el.getAttribute('data-copy')); };
      });
    } else {
      box.style.display = 'none';
      $('#fbEmpty').style.display = '';
    }

    var form = $('#fbForm');
    form.style.display = fb.enableForm === false ? 'none' : '';
    var fab = $('#fbFab');
    fab.style.display = fb.enableForm === false ? 'none' : '';
    if (fb.enableForm === false) $('#fbSub').textContent = '管理员已关闭留言';
    else $('#fbSub').textContent = '查不到、信息有误、需要新增 —— 都可以告诉我们';
  }

  function bindFeedback() {
    $('#fbFab').onclick = function () {
      document.getElementById('feedback').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('#fbForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('#fbMsg').value.trim();
      if (!msg) { toast('请填写反馈内容', 'err'); return; }
      var btn = $('#fbSubmit');
      btn.disabled = true;
      btn.textContent = '提交中…';
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('#fbName').value.trim(),
          contact: $('#fbContact').value.trim(),
          message: msg,
        }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || '提交失败');
          return d;
        });
      }).then(function () {
        $('#fbMsg').value = '';
        toast('已提交，谢谢反馈！', 'ok');
      }).catch(function (err) {
        toast(err.message, 'err');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = '提交反馈';
      });
    });
  }

  /* ---------- 搜索框占位提示（每次打开都不一样 + 打字机轮播） ---------- */
  function buildPlaceholders(s) {
    var out = [];
    (s.codes || []).forEach(function (c) { out.push('试着输入「' + c + '」'); });
    (s.links || []).forEach(function (l) { out.push('试试搜短链「' + l + '」'); });
    (s.groups || []).forEach(function (g) { out.push('也可以输入「' + g + '」'); });
    out.push('输入姓名或暗号试试');
    return shuffle(out);
  }

  function typePlaceholder(text) {
    var input = $('#q');
    clearInterval(state.phType);
    var k = 0;
    input.setAttribute('placeholder', '');
    state.phType = setInterval(function () {
      k++;
      input.setAttribute('placeholder', text.slice(0, k));
      if (k >= text.length) clearInterval(state.phType);
    }, 55);
  }

  function startPlaceholder() {
    var input = $('#q');
    if (!state.phCands.length) return;
    clearInterval(state.phTimer);
    state.phIdx = Math.floor(Math.random() * state.phCands.length);
    typePlaceholder(state.phCands[state.phIdx]);
    state.phTimer = setInterval(function () {
      if (input.value || document.activeElement === input) return;
      state.phIdx++;
      if (state.phIdx >= state.phCands.length) {
        state.phIdx = 0;
        shuffle(state.phCands);
      }
      typePlaceholder(state.phCands[state.phIdx]);
    }, 5000);
  }

  function stopPlaceholder() {
    clearInterval(state.phTimer);
    clearInterval(state.phType);
  }

  /* ---------- 筛选 ---------- */
  function renderFilters() {
    var b = state.boot;
    var s = b.stats.byPlatform || {};
    var html = '<button class="chip' + (state.platform ? '' : ' on') + '" data-plat="">全部平台</button>';
    b.platforms.forEach(function (p) {
      html += '<button class="chip' + (state.platform === p.id ? ' on' : '') + '" data-plat="' + esc(p.id) + '">' +
        '<span class="pico" style="background:' + esc(p.color) + '">' + esc(pico(p.name)) + '</span>' +
        esc(p.name) + '<span class="cnt">' + (s[p.id] || 0) + '</span></button>';
    });
    $('#platFilter').innerHTML = html;

    var ghtml = '<button class="chip' + (state.group ? '' : ' on') + '" data-group="">全部分组</button>';
    (b.groups || []).forEach(function (g) {
      ghtml += '<button class="chip' + (state.group === g ? ' on' : '') + '" data-group="' + esc(g) + '">' + esc(g) + '</button>';
    });
    $('#groupFilter').innerHTML = (b.groups || []).length ? ghtml : '';

    $('#platFilter').querySelectorAll('.chip').forEach(function (el) {
      el.onclick = function () {
        state.platform = state.platform === el.dataset.plat ? '' : el.dataset.plat;
        state.limit = 30;
        renderFilters(); renderMatrix(); refreshSamples();
        if (state.q.trim()) doSearch();
      };
    });
    $('#groupFilter').querySelectorAll('.chip').forEach(function (el) {
      el.onclick = function () {
        state.group = state.group === el.dataset.group ? '' : el.dataset.group;
        state.limit = 30;
        renderFilters(); refreshSamples();
        if (state.q.trim()) doSearch();
      };
    });
  }

  /* ---------- 统计（数字滚动） ---------- */
  function countUp(el, to, dur) {
    var start = performance.now();
    var from = 0;
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderStats() {
    var s = state.boot.stats;
    var b = state.boot;
    var cards = [
      { n: s.people, t: '成员' },
      { n: s.entries, t: '暗号 / 短链' },
      { n: b.platforms.length, t: '平台' },
      { n: (b.groups || []).length, t: '分组' },
    ];
    $('#stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><b data-to="' + c.n + '">0</b><span>' + c.t + '</span></div>';
    }).join('');
    Array.prototype.forEach.call($('#stats').querySelectorAll('b'), function (el, i) {
      setTimeout(function () { countUp(el, Number(el.dataset.to), 900); }, i * 90);
    });
    if (s.updatedAt) {
      $('#updatedAt').textContent = '最近更新：' + new Date(s.updatedAt).toLocaleString('zh-CN');
    }
  }

  /* ---------- 速览：平台矩阵 ---------- */
  function renderMatrix() {
    var b = state.boot;
    var s = b.stats.byPlatform || {};
    var plats = b.platforms.slice().sort(function (x, y) { return (x.order || 99) - (y.order || 99); });
    var max = 1;
    plats.forEach(function (p) { if ((s[p.id] || 0) > max) max = s[p.id] || 0; });
    var total = 0;
    plats.forEach(function (p) { total += s[p.id] || 0; });

    $('#matrix').innerHTML = plats.map(function (p, i) {
      var n = s[p.id] || 0;
      var rel = max ? (n / max * 100) : 0;
      return '<div class="mx' + (state.platform === p.id ? ' on' : '') + '" data-plat="' + esc(p.id) + '" style="--pc:' + esc(p.color) + '">' +
        '<div class="top"><span class="ico" style="background:' + esc(p.color) + '">' + esc(pico(p.name)) + '</span>' +
        '<span class="nm">' + esc(p.name) + '</span></div>' +
        '<div class="nums"><b data-to="' + n + '">0</b><small>条</small></div>' +
        '<div class="bar"><i data-w="' + rel.toFixed(1) + '"></i></div>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call($('#matrix').querySelectorAll('b'), function (el, i) {
      setTimeout(function () { countUp(el, Number(el.dataset.to), 1000); }, 120 + i * 70);
    });
    Array.prototype.forEach.call($('#matrix').querySelectorAll('.bar i'), function (el, i) {
      setTimeout(function () { el.style.width = Math.max(Number(el.dataset.w), 5) + '%'; }, 200 + i * 70);
    });

    $('#matrix').querySelectorAll('.mx').forEach(function (el) {
      el.onclick = function () {
        state.platform = state.platform === el.dataset.plat ? '' : el.dataset.plat;
        state.limit = 30;
        renderFilters(); renderMatrix(); refreshSamples();
        if (state.q.trim()) doSearch();
      };
    });

    var note = state.platform
      ? '已聚焦「' + esc((plats.find(function (p) { return p.id === state.platform; }) || {}).name || '') + '」'
      : '点击任意平台查看该平台随机样本';
    $('#discoverNote').textContent = note;
  }

  /* ---------- 速览：滚动带 + 聚焦卡 + 预览墙 ---------- */
  function refreshSamples() {
    var qs = '?platform=' + encodeURIComponent(state.platform) +
      '&group=' + encodeURIComponent(state.group) + '&n=14';
    return api('/api/samples' + qs).then(function (s) {
      state.samples = s;
      renderMarquee(s);
      renderPreview(s);
      startSpot(s.items.slice(0, 6));
    }).catch(function () {});
  }

  function renderMarquee(s) {
    var items = s.items || [];
    if (!items.length) { $('#mqTrack').innerHTML = ''; return; }
    var one = items.map(function (it) {
      return '<span class="mq-item" style="--pc:' + esc(it.color) + '">' +
        '<span class="d"></span><span class="v">' + esc(it.maskedValue) + '</span>' +
        '<span class="p">' + esc(it.platformName) + '</span></span>';
    }).join('');
    $('#mqTrack').innerHTML = one + one;
  }

  function startSpot(items) {
    clearInterval(state.spotTimer);
    if (!items || !items.length) { $('#spotBody').innerHTML = ''; return; }
    state.spotItems = items;
    state.spotIdx = 0;
    drawSpot(0);
    state.spotTimer = setInterval(function () {
      drawSpot((state.spotIdx + 1) % state.spotItems.length);
    }, 4200);
    $('#spotDots').innerHTML = items.map(function (_, i) {
      return '<b data-i="' + i + '"' + (i === 0 ? ' class="on"' : '') + '></b>';
    }).join('');
  }

  function drawSpot(i) {
    var items = state.spotItems || [];
    if (!items.length) return;
    state.spotIdx = i;
    var it = items[i];
    $('#spotBody').innerHTML =
      '<div class="spot-item" style="--pc:' + esc(it.color) + '">' +
        '<div class="spot-plat"><span class="ico">' + esc(pico(it.platformName)) + '</span>' +
          '<b>' + esc(it.platformName) + '</b>' +
          (it.type ? '<span class="tag">' + esc(it.type) + '</span>' : '') +
          '<span class="tag">' + (it.kind === 'link' ? '短链' : '暗号') + '</span></div>' +
        '<div class="spot-code">' + esc(it.maskedValue) + '</div>' +
        '<div class="spot-who">归属 ' + esc(it.maskedName) + (it.group ? ' · ' + esc(it.group) : '') + '</div>' +
      '</div>';
    Array.prototype.forEach.call($('#spotDots').children, function (d, k) {
      d.classList.toggle('on', k === i);
    });
  }

  function renderPreview(s) {
    var show = !!(state.platform || state.group);
    $('#previewBox').style.display = show ? '' : 'none';
    if (!show) return;
    var items = (s.items || []).slice(0, 12);
    var name = '';
    if (state.platform) {
      var p = state.boot.platforms.find(function (x) { return x.id === state.platform; });
      name = p ? p.name : '';
    }
    $('#pvTitle').textContent = (name ? name : esc(state.group)) + ' · 随机样本';
    $('#pvNote').textContent = '共 ' + s.total + ' 条，以下为随机抽取的 ' + items.length + ' 条（已脱敏）';
    $('#pvGrid').innerHTML = items.map(function (it, i) {
      return '<div class="pv" style="--pc:' + esc(it.color) + ';animation-delay:' + (i * 45) + 'ms">' +
        '<div class="t"><span class="d"></span>' + esc(it.platformName) + (it.type ? ' · ' + esc(it.type) : '') + '</div>' +
        '<div class="v">' + esc(it.maskedValue) + '</div>' +
        '<div class="w">' + esc(it.maskedName) + (it.group ? ' · ' + esc(it.group) : '') + '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 查询结果 ---------- */
  function codeChip(e, q) {
    var hit = q && String(e.value).toLowerCase().indexOf(q.toLowerCase()) >= 0;
    var isLink = e.kind === 'link';
    var html = '<span class="code' + (hit ? ' hit' : '') + (isLink ? ' link' : '') + '" data-copy="' + esc(e.value) + '" title="点击复制">';
    html += highlight(e.value, q);
    if (e.type) html += '<span class="kt">' + esc(e.type) + '</span>';
    if (isLink && e.url) {
      html += '<a class="go" href="' + esc(e.url) + '" target="_blank" rel="noopener" title="打开链接" onclick="event.stopPropagation()">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M13 5h6v6"/><path d="M19 5l-8 8"/><path d="M18 14v5H5V6h5"/></svg></a>';
    }
    html += '</span>';
    return html;
  }

  function personCard(p, q) {
    var groups = {};
    p.entries.forEach(function (e) {
      var pid = e.platformId;
      if (!groups[pid]) groups[pid] = { name: (e.platform && e.platform.name) || pid, color: (e.platform && e.platform.color) || '#7c5cff', list: [] };
      groups[pid].list.push(e);
    });
    var order = {};
    state.boot.platforms.forEach(function (pl) { order[pl.id] = pl.order || 99; });
    var keys = Object.keys(groups).sort(function (a, b) { return (order[a] || 99) - (order[b] || 99); });

    var body = keys.map(function (k) {
      var g = groups[k];
      return '<div class="plat">' +
        '<div class="label"><span class="pico" style="background:' + esc(g.color) + '">' + esc(pico(g.name)) + '</span>' +
        esc(g.name) + '<span class="cnt">· ' + g.list.length + '</span></div>' +
        '<div class="chips">' + g.list.map(function (e) { return codeChip(e, q); }).join('') + '</div>' +
        '</div>';
    }).join('');

    return '<article class="person">' +
      '<div class="head">' +
        '<div class="avatar" style="background:' + avatarColor(p.name) + '">' + esc(p.name.slice(0, 1)) + '</div>' +
        '<div><div class="name">' + highlight(p.name, q) + '</div>' +
          '<div class="sub">' + (p.group ? '<span class="tag">' + esc(p.group) + '</span>' : '') +
          '<span class="tag">' + p.entries.length + ' 条</span></div></div>' +
        '<button class="btn sm ghost copy-all" data-copyall="' + esc(p.id) + '">复制全部</button>' +
      '</div>' +
      (body || '<div class="tiny muted">该成员暂无记录</div>') +
      '</article>';
  }

  function entryRow(e, q) {
    var p = e.person || {};
    var pl = e.platform || {};
    return '<div class="entry">' +
      '<span class="val">' + highlight(e.value, q) + '</span>' +
      '<span class="who"><b data-goto="' + esc(p.name || '') + '">' + highlight(p.name || '未分配', q) + '</b>' +
        (p.group ? ' <span class="tiny muted">· ' + esc(p.group) + '</span>' : '') + '</span>' +
      '<span class="right">' +
        (pl.name ? '<span class="tag"><span class="pico" style="background:' + esc(pl.color || '#7c5cff') + ';width:14px;height:14px;border-radius:4px;display:inline-grid;place-items:center;font-size:9px;color:#fff">' + esc(pico(pl.name)) + '</span>' + esc(pl.name) + '</span>' : '') +
        (e.type ? '<span class="tag">' + esc(e.type) + '</span>' : '') +
        (e.url ? '<a class="url" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.url) + '</a>' : '') +
        '<button class="btn sm ghost" data-copy="' + esc(e.value) + '">复制</button>' +
      '</span>' +
      '</div>';
  }

  function render(data) {
    var q = state.q.trim();
    var box = $('#results');
    var html = '';

    if (!data.people.length && !data.entries.length) {
      box.innerHTML = '<div class="empty"><div class="big">🔍</div>没有找到与「' + esc(q) + '」相关的内容<br>' +
        '<span class="tiny">换个关键词试试，或联系管理员添加</span></div>';
      return;
    }

    if (data.people.length) {
      html += '<div class="section-head"><h2>匹配成员</h2><span class="n">共 ' + data.peopleTotal + ' 人' +
        (data.peopleTotal > data.people.length ? '（显示前 ' + data.people.length + '）' : '') + '</span></div>';
      html += '<div class="people-grid">' + data.people.map(function (p) { return personCard(p, q); }).join('') + '</div>';
      if (data.peopleTotal > data.people.length) {
        html += '<div style="text-align:center;margin:18px 0"><button class="btn" id="morePeople">加载更多成员</button></div>';
      }
    }
    if (data.entries.length) {
      html += '<div class="section-head"><h2>匹配暗号 / 短链</h2><span class="n">共 ' + data.entriesTotal + ' 条' +
        (data.entriesTotal > data.entries.length ? '（显示前 ' + data.entries.length + '）' : '') + '</span></div>';
      html += '<div class="entry-list">' + data.entries.map(function (e) { return entryRow(e, q); }).join('') + '</div>';
      if (data.entriesTotal > data.entries.length) {
        html += '<div style="text-align:center;margin:18px 0"><button class="btn" id="moreEntries">加载更多记录</button></div>';
      }
    }

    box.innerHTML = html;
    bindResult();
  }

  function bindResult() {
    document.querySelectorAll('[data-copy]').forEach(function (el) {
      el.onclick = function (ev) {
        if (ev.target.closest('a')) return;
        copy(el.getAttribute('data-copy'));
      };
    });
    document.querySelectorAll('[data-goto]').forEach(function (el) {
      el.onclick = function () {
        state.q = el.getAttribute('data-goto');
        $('#q').value = state.q;
        $('#searchbox').classList.add('has-value');
        state.limit = 30;
        doSearch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
    document.querySelectorAll('[data-copyall]').forEach(function (el) {
      el.onclick = function () {
        var card = el.closest('.person');
        var name = card.querySelector('.name').textContent;
        var lines = [name];
        card.querySelectorAll('.plat').forEach(function (pl) {
          var label = pl.querySelector('.label').textContent.split('·')[0].trim();
          var codes = [];
          pl.querySelectorAll('.code').forEach(function (c) {
            codes.push(c.textContent.replace(/(图文|视频)$/, '').trim());
          });
          lines.push(label + '：' + codes.join('、'));
        });
        copy(lines.join('\n'));
      };
    });
    var mp = document.getElementById('morePeople');
    if (mp) mp.onclick = function () { state.limit += 30; doSearch(); };
    var me = document.getElementById('moreEntries');
    if (me) me.onclick = function () { state.entryLimit += 300; doSearch(); };
  }

  function switchView() {
    var hasQ = !!state.q.trim();
    $('#discover').style.display = hasQ ? 'none' : '';
    $('#results').style.display = hasQ ? '' : 'none';
  }

  /* ---------- 搜索 ---------- */
  function doSearch() {
    var q = state.q.trim();
    switchView();
    if (!q) return;
    if (state.loading) return;
    state.loading = true;
    var qs = new URLSearchParams({
      q: q,
      platform: state.platform,
      group: state.group,
      peopleLimit: String(state.limit),
      entryLimit: String(state.entryLimit),
    });
    history.replaceState(null, '', location.pathname + '#q=' + encodeURIComponent(q));

    api('/api/search?' + qs.toString()).then(function (d) {
      render(d);
    }).catch(function () {
      $('#results').innerHTML = '<div class="empty"><div class="big">⚠️</div>加载失败，请刷新重试</div>';
    }).then(function () { state.loading = false; });
  }

  /* ---------- 输入建议 ---------- */
  var sugItems = [], sugIndex = -1;
  function renderSuggest(data) {
    var box = $('#suggest');
    var html = '';
    sugItems = [];
    if (data.people.length) {
      html += '<div class="grp">成员</div>';
      data.people.forEach(function (p) {
        sugItems.push(p.name);
        html += '<div class="item" data-v="' + esc(p.name) + '"><span>👤</span><span>' + highlight(p.name, state.q) + '</span>' +
          (p.group ? '<span class="meta">' + esc(p.group) + '</span>' : '') + '</div>';
      });
    }
    if (data.codes.length) {
      html += '<div class="grp">暗号 / 短链</div>';
      data.codes.forEach(function (c) {
        sugItems.push(c.value);
        html += '<div class="item" data-v="' + esc(c.value) + '"><span>#</span><span class="val">' + highlight(c.value, state.q) + '</span>' +
          '<span class="meta">' + esc(c.platform || '') + '</span></div>';
      });
    }
    if (!html) html = '<div class="empty">无匹配建议</div>';
    box.innerHTML = html;
    box.classList.add('show');
    sugIndex = -1;
    box.querySelectorAll('.item').forEach(function (el) {
      el.onmousedown = function (ev) {
        ev.preventDefault();
        pickSuggest(el.getAttribute('data-v'));
      };
    });
  }

  function pickSuggest(v) {
    state.q = v;
    $('#q').value = v;
    $('#searchbox').classList.add('has-value');
    $('#suggest').classList.remove('show');
    state.limit = 30;
    stopPlaceholder();
    doSearch();
  }

  var loadSuggest = debounce(function () {
    var q = state.q.trim();
    if (!q) { $('#suggest').classList.remove('show'); return; }
    api('/api/suggest?q=' + encodeURIComponent(q)).then(renderSuggest).catch(function () {});
  }, 160);

  /* ---------- 输入绑定 ---------- */
  function bindInput() {
    var input = $('#q');
    input.addEventListener('input', function () {
      state.q = input.value;
      state.limit = 30;
      $('#searchbox').classList.toggle('has-value', !!input.value);
      if (input.value) stopPlaceholder();
      loadSuggest();
      doSearch();
    });
    input.addEventListener('focus', function () {
      if (state.q.trim()) loadSuggest();
    });
    input.addEventListener('blur', function () {
      if (!input.value) startPlaceholder();
    });
    input.addEventListener('keydown', function (e) {
      var box = $('#suggest');
      if (!box.classList.contains('show')) return;
      var items = box.querySelectorAll('.item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sugIndex += e.key === 'ArrowDown' ? 1 : -1;
        if (sugIndex < 0) sugIndex = items.length - 1;
        if (sugIndex >= items.length) sugIndex = 0;
        items.forEach(function (el, i) { el.classList.toggle('active', i === sugIndex); });
      } else if (e.key === 'Enter' && sugIndex >= 0) {
        e.preventDefault();
        pickSuggest(items[sugIndex].getAttribute('data-v'));
      } else if (e.key === 'Escape') {
        box.classList.remove('show');
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.searchbox')) $('#suggest').classList.remove('show');
    });
    $('#clearBtn').onclick = function () {
      input.value = '';
      state.q = '';
      state.limit = 30;
      $('#searchbox').classList.remove('has-value');
      $('#suggest').classList.remove('show');
      switchView();
      startPlaceholder();
      input.focus();
    };

    $('#shuffleAll').onclick = function () {
      refreshSamples().then(function () {
        renderMatrix();
        toast('已换一批', 'ok');
      });
    };
    $('#spotMore').onclick = function () {
      drawSpot((state.spotIdx + 1) % (state.spotItems || [1]).length);
    };
    var nd = document.getElementById('navDiscover');
    if (nd) nd.onclick = function () {
      input.value = '';
      state.q = '';
      state.limit = 30;
      $('#searchbox').classList.remove('has-value');
      switchView();
      startPlaceholder();
    };
  }

  /* ---------- 启动 ---------- */
  initBackground();
  initTheme();

  api('/api/bootstrap').then(function (b) {
    state.boot = b;
    document.title = b.settings.siteName;
    $('#siteName').textContent = b.settings.siteName;
    if (b.settings.subtitle) $('#subtitle').textContent = b.settings.subtitle;
    renderFilters();
    renderStats();
    renderMatrix();
    setupLogo(b);
    renderFeedback(b);
    bindInput();
    bindFeedback();

    // 先拿随机样本（决定占位提示 + 速览内容）
    api('/api/samples?n=14').then(function (s) {
      state.phCands = buildPlaceholders(s);
      startPlaceholder();
    });
    refreshSamples();

    var m = location.hash.match(/q=([^&]*)/);
    if (m) {
      state.q = decodeURIComponent(m[1]);
      $('#q').value = state.q;
      $('#searchbox').classList.add('has-value');
      stopPlaceholder();
      doSearch();
    } else {
      switchView();
    }
  }).catch(function () {
    $('#results').style.display = '';
    $('#results').innerHTML = '<div class="empty"><div class="big">⚠️</div>服务未启动或加载失败</div>';
  });
})();
