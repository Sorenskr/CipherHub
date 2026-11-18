/**
 * CipherHub Beta · 前台交互逻辑 (app.js)
 *
 * 三表打通实时同步：
 *   - 「团队」：各小组及在册成员（唯一人员白名单）
 *   - 「总表」：A1 姓名 | B1 关键词 | C1 平台/模板（固定顺序排列）
 *   - 「短链」：A1 姓名 | B1 短链   | C1 地址
 */
(function () {
  'use strict';

  var state = {
    q: '',
    team: '',      // 选中的团队组名，如 '慕杰组'
    template: '',  // 选中的分类名，或 '__LINKS__' 表示专门查看短链
    viewMode: 'discover', // 'discover' | 'sheet'
    sheetTab: 'main',     // 'main' | 'links' | 'teams'
    limit: 80,
    entryLimit: 600,
    spotIdx: 0,
    spotTimer: null,
    spotItems: [],
    phTimer: null,
    phType: null,
    phIdx: 0,
    phCands: [],
    sugIdx: -1,
    sugItems: []
  };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHttpUrl(url) {
    var s = String(url || '').trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function highlight(text, q) {
    var t = esc(text);
    if (!q) return t;
    var k = q.trim();
    if (!k) return t;
    var raw = String(text == null ? '' : text);
    var idx = raw.toLowerCase().indexOf(k.toLowerCase());
    if (idx < 0) return t;
    return esc(raw.slice(0, idx)) + '<mark>' + esc(raw.slice(idx, idx + k.length)) + '</mark>' + esc(raw.slice(idx + k.length));
  }

  function avatarColor(name) {
    var s = String(name || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'linear-gradient(135deg, hsl(' + h + ',68%,58%), hsl(' + ((h + 42) % 360) + ',70%,48%))';
  }

  function pico(name) {
    var map = {
      '番号': '番',
      '聊天': '聊',
      '走光': '走',
      '任务': '任',
      '新模版': '新',
      '备用': '备',
      '备用2': '备2',
      '备用 2': '备2',
      '创新': '创'
    };
    if (map[name]) return map[name];
    return String(name || '').slice(0, 1);
  }

  function maskName(n) {
    var s = String(n || '');
    if (!s) return '—';
    if (s.length <= 1) return s + '*';
    return s[0] + new Array(s.length).join('*');
  }

  function maskValue(v) {
    var s = String(v || '');
    if (!s) return '';
    if (s.length <= 3) return s[0] + new Array(Math.max(s.length, 2)).join('•');
    var head = s.slice(0, 2), tail = s.slice(-1);
    var mid = Math.min(s.length - 3, 4);
    return head + new Array(mid + 1).join('•') + tail;
  }

  function toast(msg, type) {
    var box = $('#toast');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast-item ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 260);
    }, 1800);
  }
  window.chToast = toast;

  function copyText(text, customMsg) {
    var msg = customMsg || ('已复制：' + text);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { toast(msg, 'ok'); },
        function () { fallbackCopy(text, msg); }
      );
    } else {
      fallbackCopy(text, msg);
    }
  }

  function fallbackCopy(text, msg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(msg, 'ok');
    } catch (e) {
      toast('复制失败，请手动选择复制', 'err');
    }
    ta.remove();
  }

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- 背景动效 ---------- */
  function initBackground() {
    var box = $('#bgDots');
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
    var btn = $('#themeBtn');
    if (btn) {
      btn.onclick = function () {
        var cur = document.documentElement.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ch_theme', next);
      };
    }
  }

  /* ---------- Logo 切换 ---------- */
  function setupLogo(model) {
    var logos = (model.settings && model.settings.logos) || [];
    logos = logos.filter(Boolean);
    var box = $('#logoBox');
    var img = $('#brandLogo');
    var btn = $('#logoBtn');
    if (!logos.length || !box || !img) {
      if (box) box.textContent = '#';
      if (btn) btn.style.display = 'none';
      return;
    }
    var saved = parseInt(localStorage.getItem('ch_logo'), 10);
    var idx = (isNaN(saved) || saved < 0 || saved >= logos.length) ? 0 : saved;

    function paint(i) {
      idx = ((i % logos.length) + logos.length) % logos.length;
      img.onerror = function () {
        img.style.display = 'none';
        box.textContent = '#';
      };
      img.onload = function () {
        img.style.display = 'block';
      };
      img.src = logos[idx];
      localStorage.setItem('ch_logo', String(idx));
      if (btn) btn.title = '切换 Logo (' + (idx + 1) + '/' + logos.length + ')';
    }

    paint(idx);
    if (btn) {
      btn.style.display = logos.length < 2 ? 'none' : '';
      btn.onclick = function () {
        paint(idx + 1);
        toast('已切换 Logo', 'ok');
      };
    }
  }

  /* ---------- 前台隐藏在线表格状态栏 ---------- */
  function renderSyncBar() {
    var bar = $('#syncBar');
    if (bar) bar.style.display = 'none';
  }

  /* ---------- 搜索框占位轮播 ---------- */
  function buildPlaceholders(model) {
    var out = [];
    shuffle(model.rows).slice(0, 4).forEach(function (r) {
      out.push('试着输入暗号「' + r.keyword + '」查归属人');
    });
    shuffle(model.shortLinks || []).slice(0, 3).forEach(function (l) {
      out.push('输入短链「' + l.slug + '」反查归属成员');
    });
    shuffle(model.people).slice(0, 3).forEach(function (p) {
      out.push('输入姓名「' + p.name + '」查看名下全部暗号与短链');
    });
    shuffle(model.teams || []).slice(0, 2).forEach(function (t) {
      out.push('输入「' + t.name + '」查看全组暗号与短链');
    });
    out.push('输入姓名、暗号关键词、短链或团队名…');
    return shuffle(out);
  }

  function typePlaceholder(text) {
    var input = $('#q');
    if (!input) return;
    clearInterval(state.phType);
    var k = 0;
    input.setAttribute('placeholder', '');
    state.phType = setInterval(function () {
      k++;
      input.setAttribute('placeholder', text.slice(0, k));
      if (k >= text.length) clearInterval(state.phType);
    }, 45);
  }

  function startPlaceholder() {
    var input = $('#q');
    if (!input || !state.phCands.length) return;
    clearInterval(state.phTimer);
    state.phIdx = Math.floor(Math.random() * state.phCands.length);
    typePlaceholder(state.phCands[state.phIdx]);
    state.phTimer = setInterval(function () {
      if (input.value || document.activeElement === input) return;
      state.phIdx = (state.phIdx + 1) % state.phCands.length;
      typePlaceholder(state.phCands[state.phIdx]);
    }, 5000);
  }

  function stopPlaceholder() {
    clearInterval(state.phTimer);
    clearInterval(state.phType);
  }

  /* ---------- 团队与分类双排筛选 ---------- */
  function renderTeamFilters(model) {
    var box = $('#teamFilter');
    if (!box) return;
    var teams = model.teams || [];
    if (!teams.length) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';
    var html = '<button class="chip team-chip' + (state.team ? '' : ' on') + '" data-team="">' +
      '<span class="t-ico">👥</span>全部团队 <span class="cnt">' + model.people.length + '</span></button>';

    teams.forEach(function (t) {
      html += '<button class="chip team-chip' + (state.team === t.name ? ' on' : '') + '" data-team="' + esc(t.name) + '">' +
        esc(t.name) + '<span class="cnt">' + t.count + '</span></button>';
    });
    box.innerHTML = html;

    box.querySelectorAll('.team-chip').forEach(function (el) {
      el.onclick = function () {
        var clicked = el.getAttribute('data-team') || '';
        state.team = state.team === clicked ? '' : clicked;
        state.limit = 80;
        refreshAllViews();
      };
    });
  }

  function renderFilters(model) {
    var html = '<button class="chip' + (state.template ? '' : ' on') + '" data-tpl="">全部分类 <span class="cnt">' + model.rows.length + '</span></button>';
    model.templates.forEach(function (t) {
      if ((t.count || 0) === 0 && window.CHStore.getTemplateOrderIndex(t.name) === 999) return;
      html += '<button class="chip' + (state.template === t.name ? ' on' : '') + '" data-tpl="' + esc(t.name) + '">' +
        '<span class="pico" style="background:' + esc(t.color) + '">' + esc(pico(t.name)) + '</span>' +
        esc(t.name) + '<span class="cnt">' + (t.count || 0) + '</span></button>';
    });
    if ((model.shortLinks || []).length > 0) {
      html += '<button class="chip' + (state.template === '__LINKS__' ? ' on' : '') + '" data-tpl="__LINKS__">' +
        '<span class="pico" style="background:linear-gradient(135deg,#3ea6ff,#00c8b4)">链</span>' +
        '专属短链 <span class="cnt">' + model.shortLinks.length + '</span></button>';
    }
    var box = $('#platFilter');
    if (!box) return;
    box.innerHTML = html;

    box.querySelectorAll('.chip').forEach(function (el) {
      el.onclick = function () {
        var clicked = el.getAttribute('data-tpl') || '';
        state.template = state.template === clicked ? '' : clicked;
        state.limit = 80;
        refreshAllViews();
      };
    });
  }

  /* ---------- 统计条 ---------- */
  function renderStats(model) {
    var cards = [
      { n: model.stats.people,     t: '团队在册成员（' + (model.stats.teams || 0) + ' 组）' },
      { n: model.stats.entries,    t: '总表暗号 / 关键词' },
      { n: model.stats.shortLinks, t: '专属短链' },
      { n: model.source.indexOf('cloud') === 0 ? '实时在线' : '本地就绪', t: '三表同步状态' }
    ];
    var box = $('#stats');
    if (box) {
      box.innerHTML = cards.map(function (c) {
        return '<div class="stat"><b>' + esc(c.n) + '</b><span>' + esc(c.t) + '</span></div>';
      }).join('');
    }
    var up = $('#updatedAt');
    if (up && model.updatedAt) {
      up.textContent = '数据最近更新：' + new Date(model.updatedAt).toLocaleString('zh-CN');
    }
  }

  /* ---------- 速览：分类矩阵 ---------- */
  function renderMatrix(model) {
    var tpls = model.templates.filter(function (t) {
      return (t.count || 0) > 0 || window.CHStore.getTemplateOrderIndex(t.name) < 999;
    });
    var max = 1;
    tpls.forEach(function (t) { if ((t.count || 0) > max) max = t.count; });

    var box = $('#matrix');
    if (!box) return;
    box.innerHTML = tpls.map(function (t) {
      var n = t.count || 0;
      var rel = max ? Math.max((n / max * 100), n > 0 ? 6 : 0) : 0;
      return '<div class="mx' + (state.template === t.name ? ' on' : '') + '" data-tpl="' + esc(t.name) + '" style="--pc:' + esc(t.color) + '">' +
        '<div class="top">' +
          '<span class="ico" style="background:' + esc(t.color) + '">' + esc(pico(t.name)) + '</span>' +
          '<span class="nm">' + esc(t.name) + '</span>' +
        '</div>' +
        '<div class="nums"><b>' + n + '</b><small>条</small></div>' +
        '<div class="bar"><i style="width:' + rel.toFixed(1) + '%"></i></div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.mx').forEach(function (el) {
      el.onclick = function () {
        var clicked = el.getAttribute('data-tpl') || '';
        state.template = state.template === clicked ? '' : clicked;
        refreshAllViews();
      };
    });

    var note = $('#discoverNote');
    if (note) {
      if (state.template === '__LINKS__') {
        note.textContent = '已聚焦「专属短链」';
      } else if (state.template) {
        note.textContent = '已聚焦「' + state.template + '」';
      } else {
        note.textContent = '点击任意分类查看随机样本，或点击上方团队查看全组';
      }
    }
  }

  /* ---------- 速览：滚动带 + 聚焦卡 + 样本墙 ---------- */
  function renderDiscoverSamples(model) {
    var isLinkMode = state.template === '__LINKS__';
    var pool;

    if (isLinkMode) {
      pool = (model.shortLinks || []).map(function (l) {
        return {
          template: '专属短链',
          color: '#3ea6ff',
          keyword: l.slug,
          name: l.name
        };
      });
    } else {
      pool = model.entries.filter(function (e) {
        return !state.template || e.template === state.template;
      });
    }

    var picked = shuffle(pool).slice(0, 14).map(function (e) {
      return {
        template: e.template,
        color: e.color,
        maskedValue: maskValue(e.keyword),
        maskedName: maskName(e.name)
      };
    });

    var mq = $('#mqTrack');
    if (mq) {
      if (!picked.length) {
        mq.innerHTML = '';
      } else {
        var one = picked.map(function (it) {
          return '<span class="mq-item" style="--pc:' + esc(it.color) + '">' +
            '<span class="d"></span><span class="v">' + esc(it.maskedValue) + '</span>' +
            '<span class="p">' + esc(it.template) + ' · 归属 ' + esc(it.maskedName) + '</span></span>';
        }).join('');
        mq.innerHTML = one + one;
      }
    }

    startSpot(picked.slice(0, 6));

    var pvBox = $('#previewBox');
    if (pvBox) {
      var show = Boolean(state.template);
      pvBox.style.display = show ? '' : 'none';
      if (show) {
        $('#pvTitle').textContent = (isLinkMode ? '专属短链' : state.template) + ' · 随机样本';
        $('#pvNote').textContent = '共 ' + pool.length + ' 条，以下为随机抽取的脱敏样本';
        $('#pvGrid').innerHTML = picked.slice(0, 12).map(function (it, idx) {
          return '<div class="pv" style="--pc:' + esc(it.color) + ';animation-delay:' + (idx * 40) + 'ms">' +
            '<div class="t"><span class="d"></span>' + esc(it.template) + '</div>' +
            '<div class="v">' + esc(it.maskedValue) + '</div>' +
            '<div class="w">归属人：' + esc(it.maskedName) + '</div>' +
          '</div>';
        }).join('');
      }
    }
  }

  function startSpot(items) {
    clearInterval(state.spotTimer);
    var body = $('#spotBody'), dots = $('#spotDots');
    if (!body || !dots) return;
    if (!items || !items.length) {
      body.innerHTML = '<div class="muted tiny">当前分类暂无记录</div>';
      dots.innerHTML = '';
      return;
    }
    state.spotItems = items;
    state.spotIdx = 0;
    drawSpot(0);
    state.spotTimer = setInterval(function () {
      drawSpot((state.spotIdx + 1) % state.spotItems.length);
    }, 4200);
    dots.innerHTML = items.map(function (_, i) {
      return '<b data-i="' + i + '"' + (i === 0 ? ' class="on"' : '') + '></b>';
    }).join('');
    dots.querySelectorAll('b').forEach(function (b) {
      b.onclick = function () { drawSpot(Number(b.getAttribute('data-i') || 0)); };
    });
  }

  function drawSpot(i) {
    var items = state.spotItems || [];
    if (!items.length) return;
    state.spotIdx = i;
    var it = items[i];
    var body = $('#spotBody');
    if (body) {
      body.innerHTML =
        '<div class="spot-item" style="--pc:' + esc(it.color) + '">' +
          '<div class="spot-plat"><span class="ico">' + esc(pico(it.template)) + '</span>' +
            '<b>' + esc(it.template) + '</b>' +
            '<span class="tag">脱敏预览</span></div>' +
          '<div class="spot-code">' + esc(it.maskedValue) + '</div>' +
          '<div class="spot-who">归属人：' + esc(it.maskedName) + '</div>' +
        '</div>';
    }
    var dots = $('#spotDots');
    if (dots) {
      Array.prototype.forEach.call(dots.children, function (d, k) {
        d.classList.toggle('on', k === i);
      });
    }
  }

  /* ---------- 三表全量明细视图 ---------- */
  function getFilteredMainRows(model) {
    var q = state.q.trim().toLowerCase();
    var tplFilter = state.template;
    var teamFilter = state.team;
    if (tplFilter === '__LINKS__') return [];

    return model.rows.filter(function (r) {
      if (teamFilter && r.group !== teamFilter) return false;
      if (tplFilter && r.template !== tplFilter) return false;
      if (q) {
        return r.name.toLowerCase().indexOf(q) >= 0 ||
               (r.group || '').toLowerCase().indexOf(q) >= 0 ||
               r.keyword.toLowerCase().indexOf(q) >= 0 ||
               r.template.toLowerCase().indexOf(q) >= 0;
      }
      return true;
    });
  }

  function getFilteredLinks(model) {
    var q = state.q.trim().toLowerCase();
    var teamFilter = state.team;

    return (model.shortLinks || []).filter(function (l) {
      if (teamFilter && l.group !== teamFilter) return false;
      if (q) {
        return l.name.toLowerCase().indexOf(q) >= 0 ||
               (l.group || '').toLowerCase().indexOf(q) >= 0 ||
               l.slug.toLowerCase().indexOf(q) >= 0 ||
               l.url.toLowerCase().indexOf(q) >= 0;
      }
      return true;
    });
  }

  function renderSheetOneToOneView(model) {
    var sec = $('#sheetViewSec');
    if (!sec) return;

    $$('#sheetTabSwitch button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-sheet-tab') === state.sheetTab);
    });

    var tblCard = $('#sheetTableCard');
    var teamsGrid = $('#sheetTeamsGrid');
    var thead = $('#sheetViewHead');
    var tbody = $('#sheetViewBody');

    if (state.sheetTab === 'teams') {
      tblCard.style.display = 'none';
      teamsGrid.style.display = '';

      var q = state.q.trim().toLowerCase();
      var peopleMap = {};
      model.people.forEach(function (p) { peopleMap[p.name] = p; });

      var teamsToShow = (model.teams || []).filter(function (t) {
        if (state.team && t.name !== state.team) return false;
        if (!q) return true;
        if (t.name.toLowerCase().indexOf(q) >= 0) return true;
        return t.members.some(function (m) { return m.toLowerCase().indexOf(q) >= 0; });
      });

      var memberTotal = 0;
      teamsToShow.forEach(function (t) { memberTotal += t.count; });
      $('#sheetViewCount').textContent = '共 ' + teamsToShow.length + ' 个团队，' + memberTotal + ' 名在册成员';

      if (!teamsToShow.length) {
        teamsGrid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">👥</div>没有匹配的团队或成员</div>';
        return;
      }

      teamsGrid.innerHTML = teamsToShow.map(function (t) {
        var pills = t.members.map(function (m) {
          var p = peopleMap[m];
          var eCnt = p ? p.entries.length : 0;
          var lCnt = p ? p.shortLinks.length : 0;
          var isEmpty = eCnt === 0 && lCnt === 0;
          return '<button type="button" class="member-pill' + (isEmpty ? ' no-code' : '') + '" data-goto="' + esc(m) + '" title="点击查看 ' + esc(m) + ' 全部暗号与短链">' +
            '<span>' + highlight(m, state.q) + '</span>' +
            '<span class="cnt">' + (isEmpty ? '待分配' : (eCnt + '码' + (lCnt ? '/' + lCnt + '链' : ''))) + '</span>' +
          '</button>';
        }).join('');

        return '<div class="team-card">' +
          '<div class="team-card-head">' +
            '<div>' +
              '<div class="team-card-title">' + highlight(t.name, state.q) + '</div>' +
              '<div class="team-card-meta">在册 ' + t.count + ' 人 · 暗号 ' + (t.entryCount || 0) + ' 条 · 短链 ' + (t.shortLinkCount || 0) + ' 条</div>' +
            '</div>' +
            '<span class="spacer"></span>' +
            '<button type="button" class="btn sm ghost" data-team-filter="' + esc(t.name) + '">展开卡片</button>' +
          '</div>' +
          '<div class="team-members-wrap">' + pills + '</div>' +
        '</div>';
      }).join('');

      bindResultEvents(sec);
      return;
    }

    tblCard.style.display = '';
    teamsGrid.style.display = 'none';

    if (state.sheetTab === 'links') {
      var filteredLinks = getFilteredLinks(model);
      $('#sheetViewCount').textContent = '共 ' + filteredLinks.length + ' 条专属短链';
      thead.innerHTML = '<tr>' +
        '<th style="width:76px">序号</th>' +
        '<th>归属人</th>' +
        '<th style="width:120px">所属团队</th>' +
        '<th>短链标识</th>' +
        '<th>Adjust 链接</th>' +
        '<th style="width:170px">快捷操作</th>' +
      '</tr>';

      if (!filteredLinks.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:36px;color:var(--text-mute)">没有找到匹配的短链记录</td></tr>';
        return;
      }

      tbody.innerHTML = filteredLinks.slice(0, state.entryLimit).map(function (l, idx) {
        var chCls = l.channelTag === 'TW' ? 'tw' : (l.channelTag === 'SP' ? 'sp' : '');
        var href = safeHttpUrl(l.url);
        return '<tr>' +
          '<td class="mono muted">#' + (idx + 1) + '</td>' +
          '<td><b style="cursor:pointer" data-goto="' + esc(l.name) + '" title="点击查看该成员卡片">' + highlight(l.name, state.q) + '</b></td>' +
          '<td>' + (l.group ? '<span class="team-badge" data-team-filter="' + esc(l.group) + '">' + esc(l.group) + '</span>' : '<span class="muted tiny">—</span>') + '</td>' +
          '<td class="mono"><span class="link-ch ' + chCls + '" style="margin-right:6px">' + esc(l.channelTag) + '</span><span class="link-slug" data-copy="' + esc(l.slug) + '">' + highlight(l.slug, state.q) + '</span></td>' +
          '<td class="mono tiny" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(l.url) + '">' + highlight(l.url, state.q) + '</td>' +
          '<td><div class="ops">' +
            '<button class="btn sm ghost" data-copy="' + esc(l.slug) + '">短链</button>' +
            '<button class="btn sm ghost" data-copy="' + esc(l.url) + '">链接</button>' +
            (href ? '<a class="btn sm ghost" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" title="打开链接">↗</a>' : '') +
          '</div></td>' +
        '</tr>';
      }).join('');

      bindResultEvents(sec);
      return;
    }

    // 默认 sheetTab === 'main'（总表暗号）
    var filtered = getFilteredMainRows(model);
    var colorMap = {};
    model.templates.forEach(function (t) { colorMap[t.name] = t.color; });

    $('#sheetViewCount').textContent = '共 ' + filtered.length + ' 条暗号记录';
    thead.innerHTML = '<tr>' +
      '<th style="width:76px">序号</th>' +
      '<th>归属人</th>' +
      '<th style="width:120px">所属团队</th>' +
      '<th>关键词 / 暗号</th>' +
      '<th>平台 / 模板</th>' +
      '<th style="width:110px">快捷操作</th>' +
    '</tr>';

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:36px;color:var(--text-mute)">没有找到匹配的暗号记录</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.slice(0, state.entryLimit).map(function (r, idx) {
      var c = colorMap[r.template] || '#7c5cff';
      return '<tr>' +
        '<td class="mono muted">#' + (idx + 1) + '</td>' +
        '<td><b style="cursor:pointer" data-goto="' + esc(r.name) + '" title="点击查看该成员卡片">' + highlight(r.name, state.q) + '</b></td>' +
        '<td>' + (r.group ? '<span class="team-badge" data-team-filter="' + esc(r.group) + '">' + esc(r.group) + '</span>' : '<span class="muted tiny">—</span>') + '</td>' +
        '<td class="mono"><span class="code" data-copy="' + esc(r.keyword) + '" title="点击复制关键词">' + highlight(r.keyword, state.q) + '</span></td>' +
        '<td><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(c) + ';display:inline-block"></span>' + highlight(r.template, state.q) + '</span></td>' +
        '<td><div class="ops"><button class="btn sm ghost" data-copy="' + esc(r.keyword) + '">复制</button></div></td>' +
      '</tr>';
    }).join('');

    bindResultEvents(sec);
  }

  /* ---------- 搜索 / 团队筛选结果（一站式归属人卡片 + 匹配明细） ---------- */
  function personCard(p, q, tplFilter, colorMap) {
    var isLinkOnly = tplFilter === '__LINKS__';
    var groups = {};
    var entries = isLinkOnly ? [] : p.entries.filter(function (e) {
      return !tplFilter || e.template === tplFilter;
    });

    entries.forEach(function (e) {
      var t = e.template;
      if (!groups[t]) {
        groups[t] = {
          name: t,
          color: colorMap[t] || '#7c5cff',
          order: window.CHStore.getTemplateOrderIndex(t),
          list: []
        };
      }
      groups[t].list.push(e);
    });

    var keys = Object.keys(groups).sort(function (a, b) {
      return groups[a].order - groups[b].order;
    });

    var codeBody = keys.map(function (k) {
      var g = groups[k];
      return '<div class="plat">' +
        '<div class="label"><span class="pico" style="background:' + esc(g.color) + '">' + esc(pico(g.name)) + '</span>' +
        esc(g.name) + '<span class="cnt">· ' + g.list.length + '</span></div>' +
        '<div class="chips">' + g.list.map(function (e) {
          var hit = q && e.keyword.toLowerCase().indexOf(q.toLowerCase()) >= 0;
          return '<span class="code' + (hit ? ' hit' : '') + '" data-copy="' + esc(e.keyword) + '" title="点击复制">' +
            highlight(e.keyword, q) + '</span>';
        }).join('') + '</div>' +
      '</div>';
    }).join('');

    if (!isLinkOnly && !codeBody) {
      codeBody = '<div class="empty-inline">暂未分配' + (tplFilter ? '「' + esc(tplFilter) + '」' : '') + '暗号关键词</div>';
    }

    var links = (!tplFilter || isLinkOnly) ? (p.shortLinks || []) : [];
    var linksBody = '';
    if (links.length > 0) {
      linksBody = '<div class="links-box">' +
        '<div class="label"><span class="pico">链</span>专属短链<span class="cnt">· ' + links.length + '</span></div>' +
        '<div class="link-list">' + links.map(function (l) {
          var chCls = l.channelTag === 'TW' ? 'tw' : (l.channelTag === 'SP' ? 'sp' : '');
          var ql = (q || '').toLowerCase();
          var hit = ql && (l.slug.toLowerCase().indexOf(ql) >= 0 || l.url.toLowerCase().indexOf(ql) >= 0);
          var href = safeHttpUrl(l.url);
          return '<div class="link-row' + (hit ? ' hit' : '') + '">' +
            '<span class="link-ch ' + chCls + '">' + esc(l.channelTag) + '</span>' +
            '<span class="link-slug" data-copy="' + esc(l.slug) + '" title="点击复制短链标识">' + highlight(l.slug, q) + '</span>' +
            '<span class="link-url" title="' + esc(l.url) + '">' + highlight(l.url, q) + '</span>' +
            '<span class="link-ops">' +
              '<button type="button" class="btn sm ghost" data-copy="' + esc(l.url) + '" title="复制 Adjust 链接">复制链接</button>' +
              (href ? '<a class="btn sm ghost" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" title="新窗口打开">↗</a>' : '') +
            '</span>' +
          '</div>';
        }).join('') + '</div>' +
      '</div>';
    }

    var groupBadge = p.group
      ? '<span class="team-badge" data-team-filter="' + esc(p.group) + '" title="点击查看全组">' + highlight(p.group, q) + '</span>'
      : '';

    return '<article class="person" data-person-name="' + esc(p.name) + '">' +
      '<div class="head">' +
        '<div class="avatar" style="background:' + avatarColor(p.name) + '">' + esc(p.name.slice(0, 1)) + '</div>' +
        '<div><div class="name">' + highlight(p.name, q) + '</div>' +
          '<div class="sub">' + groupBadge +
            '<span class="tag">暗号 ' + entries.length + ' 条</span>' +
            (links.length ? '<span class="tag">短链 ' + links.length + ' 条</span>' : '') +
          '</div></div>' +
        '<button type="button" class="btn sm ghost copy-all" data-copyall="' + esc(p.name) + '">复制全部</button>' +
      '</div>' +
      codeBody +
      linksBody +
    '</article>';
  }

  function entryRow(e, q) {
    return '<div class="entry">' +
      '<span class="val" data-copy="' + esc(e.keyword) + '" style="cursor:pointer" title="点击复制">' + highlight(e.keyword, q) + '</span>' +
      '<span class="who">归属：<b data-goto="' + esc(e.name) + '">' + highlight(e.name, q) + '</b>' +
        (e.group ? ' <span class="team-badge" data-team-filter="' + esc(e.group) + '" style="margin-left:4px">' + highlight(e.group, q) + '</span>' : '') +
      '</span>' +
      '<span class="right">' +
        '<span class="tag"><span class="pico" style="background:' + esc(e.color || '#7c5cff') + ';width:15px;height:15px;border-radius:4px;display:inline-grid;place-items:center;font-size:9px;color:#fff">' + esc(pico(e.template)) + '</span>' + highlight(e.template, q) + '</span>' +
        '<button class="btn sm ghost" data-copy="' + esc(e.keyword) + '">复制</button>' +
      '</span>' +
    '</div>';
  }

  function linkEntryRow(l, q) {
    var chCls = l.channelTag === 'TW' ? 'tw' : (l.channelTag === 'SP' ? 'sp' : '');
    var href = safeHttpUrl(l.url);
    return '<div class="entry">' +
      '<span class="link-ch ' + chCls + '">' + esc(l.channelTag) + '</span>' +
      '<span class="val" data-copy="' + esc(l.slug) + '" style="cursor:pointer" title="点击复制短链标识">' + highlight(l.slug, q) + '</span>' +
      '<span class="who">归属：<b data-goto="' + esc(l.name) + '">' + highlight(l.name, q) + '</b>' +
        (l.group ? ' <span class="team-badge" data-team-filter="' + esc(l.group) + '" style="margin-left:4px">' + highlight(l.group, q) + '</span>' : '') +
      '</span>' +
      '<span class="right">' +
        '<span class="tiny muted mono" style="max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(l.url) + '">' + highlight(l.url, q) + '</span>' +
        '<button class="btn sm ghost" data-copy="' + esc(l.slug) + '">复制短链</button>' +
        '<button class="btn sm ghost" data-copy="' + esc(l.url) + '">复制链接</button>' +
        (href ? '<a class="btn sm ghost" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" title="打开链接">↗</a>' : '') +
      '</span>' +
    '</div>';
  }

  function renderSearchResults(model) {
    var q = state.q.trim();
    var ql = q.toLowerCase();
    var tplFilter = state.template;
    var teamFilter = state.team;
    var isLinkOnly = tplFilter === '__LINKS__';
    var box = $('#results');
    if (!box) return;

    var colorMap = {};
    model.templates.forEach(function (t) { colorMap[t.name] = t.color; });

    var matchedEntries = isLinkOnly ? [] : model.entries.filter(function (e) {
      if (teamFilter && e.group !== teamFilter) return false;
      if (tplFilter && e.template !== tplFilter) return false;
      if (!ql) return true;
      return e.name.toLowerCase().indexOf(ql) >= 0 ||
             (e.group || '').toLowerCase().indexOf(ql) >= 0 ||
             e.keyword.toLowerCase().indexOf(ql) >= 0 ||
             e.template.toLowerCase().indexOf(ql) >= 0;
    });

    var matchedLinks = (!tplFilter || isLinkOnly) ? (model.shortLinks || []).filter(function (l) {
      if (teamFilter && l.group !== teamFilter) return false;
      if (!ql) return true;
      return l.name.toLowerCase().indexOf(ql) >= 0 ||
             (l.group || '').toLowerCase().indexOf(ql) >= 0 ||
             l.slug.toLowerCase().indexOf(ql) >= 0 ||
             l.url.toLowerCase().indexOf(ql) >= 0;
    }) : [];

    var hitNamesByDetail = {};
    matchedEntries.forEach(function (e) { hitNamesByDetail[e.name] = true; });
    matchedLinks.forEach(function (l) { hitNamesByDetail[l.name] = true; });

    var matchedPeople = model.people.filter(function (p) {
      if (teamFilter && p.group !== teamFilter) return false;
      if (!ql) {
        if (isLinkOnly) return (p.shortLinks || []).length > 0;
        if (tplFilter) return Boolean(hitNamesByDetail[p.name]);
        return true;
      }
      var matchSelf = p.name.toLowerCase().indexOf(ql) >= 0 || (p.group || '').toLowerCase().indexOf(ql) >= 0;
      if (matchSelf) {
        if (isLinkOnly) return (p.shortLinks || []).length > 0;
        if (tplFilter) return p.entries.some(function (e) { return e.template === tplFilter; });
        return true;
      }
      return Boolean(hitNamesByDetail[p.name]);
    });

    if (!matchedPeople.length && !matchedEntries.length && !matchedLinks.length) {
      box.innerHTML = '<div class="empty"><div class="big">🔍</div>没有找到与「' + esc(q || teamFilter || tplFilter) + '」相关的在册成员、暗号或短链<br>' +
        '<span class="tiny">提示：仅展示当前「团队」表在册人员的记录，已离组/删除人员不会显示</span></div>';
      return;
    }

    var html = '';
    if (matchedPeople.length) {
      var titlePrefix = teamFilter ? (teamFilter + ' · ') : '';
      html += '<div class="section-head"><h2>' + esc(titlePrefix) + '归属成员</h2><span class="n">共 ' + matchedPeople.length + ' 人</span>' +
        (teamFilter ? '<span class="spacer"></span><button type="button" class="btn sm ghost" id="clearTeamFilterBtn">返回全部团队速览</button>' : '') +
      '</div>';
      html += '<div class="people-grid">' + matchedPeople.slice(0, state.limit).map(function (p) {
        return personCard(p, q, tplFilter, colorMap);
      }).join('') + '</div>';
    }

    if (matchedEntries.length) {
      html += '<div class="section-head"><h2>匹配暗号 / 关键词</h2><span class="n">共 ' + matchedEntries.length + ' 条</span></div>';
      html += '<div class="entry-list">' + matchedEntries.slice(0, state.entryLimit).map(function (e) {
        return entryRow(e, q);
      }).join('') + '</div>';
    }

    if (matchedLinks.length) {
      html += '<div class="section-head"><h2>匹配专属短链</h2><span class="n">共 ' + matchedLinks.length + ' 条</span></div>';
      html += '<div class="entry-list">' + matchedLinks.slice(0, state.entryLimit).map(function (l) {
        return linkEntryRow(l, q);
      }).join('') + '</div>';
    }

    box.innerHTML = html;
    var clearTeamBtn = $('#clearTeamFilterBtn');
    if (clearTeamBtn) {
      clearTeamBtn.onclick = function () {
        state.team = '';
        refreshAllViews();
      };
    }
    bindResultEvents(box);
  }

  function bindResultEvents(root) {
    (root || document).querySelectorAll('[data-copy]').forEach(function (el) {
      el.onclick = function (ev) {
        ev.stopPropagation();
        copyText(el.getAttribute('data-copy'));
      };
    });
    (root || document).querySelectorAll('[data-goto]').forEach(function (el) {
      el.onclick = function () {
        state.q = el.getAttribute('data-goto') || '';
        state.viewMode = 'discover';
        $('#q').value = state.q;
        $('#searchbox').classList.toggle('has-value', Boolean(state.q));
        refreshAllViews();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
    (root || document).querySelectorAll('[data-team-filter]').forEach(function (el) {
      el.onclick = function (ev) {
        ev.stopPropagation();
        state.team = el.getAttribute('data-team-filter') || '';
        state.viewMode = 'discover';
        refreshAllViews();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
    (root || document).querySelectorAll('[data-copyall]').forEach(function (el) {
      el.onclick = function () {
        var name = el.getAttribute('data-copyall') || '';
        var model = window.CHStore.getModel();
        var person = model.people.find(function (p) { return p.name === name; });
        if (!person) return;

        var lines = [person.name + (person.group ? '（' + person.group + '）' : '')];
        var groups = {};
        person.entries.forEach(function (e) {
          if (!groups[e.template]) groups[e.template] = [];
          groups[e.template].push(e.keyword);
        });
        Object.keys(groups).sort(function (a, b) {
          return window.CHStore.getTemplateOrderIndex(a) - window.CHStore.getTemplateOrderIndex(b);
        }).forEach(function (tpl) {
          lines.push(tpl + '：' + groups[tpl].join('、'));
        });

        if (person.shortLinks && person.shortLinks.length) {
          lines.push('专属短链：');
          person.shortLinks.forEach(function (l) {
            lines.push(l.slug + '  ' + l.url);
          });
        }
        copyText(lines.join('\n'), '已复制 ' + person.name + ' 的全部暗号与短链');
      };
    });
  }

  /* ---------- 搜索建议下拉 ---------- */
  function renderSuggest(model) {
    var box = $('#suggest');
    var q = state.q.trim().toLowerCase();
    if (!box || !q) {
      if (box) box.classList.remove('show');
      return;
    }

    var teamHits = (model.teams || []).filter(function (t) {
      return t.name.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 3);

    var peopleHits = model.people.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 6);

    var kwHits = [];
    var seenKw = {};
    model.entries.forEach(function (e) {
      if (kwHits.length >= 6) return;
      var k = e.keyword + '|' + e.name;
      if (e.keyword.toLowerCase().indexOf(q) >= 0 && !seenKw[k]) {
        seenKw[k] = true;
        kwHits.push(e);
      }
    });

    var linkHits = [];
    (model.shortLinks || []).forEach(function (l) {
      if (linkHits.length >= 5) return;
      if (l.slug.toLowerCase().indexOf(q) >= 0 || l.url.toLowerCase().indexOf(q) >= 0) {
        linkHits.push(l);
      }
    });

    var html = '';
    state.sugItems = [];
    if (teamHits.length) {
      html += '<div class="grp">团队分组</div>';
      teamHits.forEach(function (t) {
        state.sugItems.push(t.name);
        html += '<div class="item" data-v="' + esc(t.name) + '"><span>👥</span><span>' + highlight(t.name, state.q) + '</span>' +
          '<span class="meta">' + t.count + ' 名成员</span></div>';
      });
    }
    if (peopleHits.length) {
      html += '<div class="grp">归属成员</div>';
      peopleHits.forEach(function (p) {
        state.sugItems.push(p.name);
        html += '<div class="item" data-v="' + esc(p.name) + '"><span>👤</span><span>' + highlight(p.name, state.q) + '</span>' +
          '<span class="meta">' + (p.group ? esc(p.group) + ' · ' : '') + p.entries.length + ' 暗号' + (p.shortLinks.length ? ' · ' + p.shortLinks.length + ' 短链' : '') + '</span></div>';
      });
    }
    if (kwHits.length) {
      html += '<div class="grp">暗号 / 关键词</div>';
      kwHits.forEach(function (e) {
        state.sugItems.push(e.keyword);
        html += '<div class="item" data-v="' + esc(e.keyword) + '"><span>#</span><span class="val">' + highlight(e.keyword, state.q) + '</span>' +
          '<span class="meta">归属：' + esc(e.name) + ' · ' + esc(e.template) + '</span></div>';
      });
    }
    if (linkHits.length) {
      html += '<div class="grp">专属短链</div>';
      linkHits.forEach(function (l) {
        state.sugItems.push(l.slug);
        html += '<div class="item" data-v="' + esc(l.slug) + '"><span>🔗</span><span class="val">' + highlight(l.slug, state.q) + '</span>' +
          '<span class="meta">归属：' + esc(l.name) + '</span></div>';
      });
    }
    if (!html) html = '<div class="empty">无匹配建议</div>';
    box.innerHTML = html;
    box.classList.add('show');
    state.sugIdx = -1;

    box.querySelectorAll('.item').forEach(function (el) {
      el.onmousedown = function (ev) {
        ev.preventDefault();
        pickSuggest(el.getAttribute('data-v') || '');
      };
    });
  }

  function pickSuggest(v) {
    state.q = v;
    $('#q').value = v;
    $('#searchbox').classList.toggle('has-value', Boolean(v));
    $('#suggest').classList.remove('show');
    stopPlaceholder();
    refreshAllViews();
  }

  /* ---------- 问题反馈 ---------- */
  function renderFeedback(model) {
    var s = model.settings || {};
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
          '<span class="ty">' + esc(c.type || '联系') + '</span>' +
          '<span class="vl">' + esc(c.value) + (c.label ? ' <span class="tiny muted">· ' + esc(c.label) + '</span>' : '') + '</span>' +
          '<button class="cp" data-copy="' + esc(c.value) + '" title="复制">复制</button>' +
        '</div>';
      }).join('');
      box.querySelectorAll('[data-copy]').forEach(function (el) {
        el.onclick = function () { copyText(el.getAttribute('data-copy')); };
      });
    } else {
      box.style.display = 'none';
      $('#fbEmpty').style.display = '';
    }

    var enable = fb.enableForm !== false;
    $('#fbForm').style.display = enable ? '' : 'none';
    $('#fbFab').style.display = enable ? '' : 'none';
    $('#fbSub').textContent = enable ? '查不到、关键词或短链有误 —— 都可以告诉我们' : '管理员已关闭留言';
  }

  function bindFeedback() {
    var fab = $('#fbFab');
    if (fab) {
      fab.onclick = function () {
        $('#feedback').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
    var form = $('#fbForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('#fbMsg').value.trim();
      if (!msg) { toast('请填写反馈内容', 'err'); return; }
      var payload = {
        action: 'FEEDBACK',
        name: $('#fbName').value.trim(),
        contact: $('#fbContact').value.trim(),
        message: msg,
        createdAt: new Date().toISOString()
      };
      var btn = $('#fbSubmit');
      btn.disabled = true;
      btn.textContent = '提交中…';

      var cfg = window.CHStore.getBindConfig();
      var saveLocalFb = function () {
        try {
          var list = JSON.parse(localStorage.getItem('ch_beta_feedbacks') || '[]');
          list.unshift(payload);
          localStorage.setItem('ch_beta_feedbacks', JSON.stringify(list.slice(0, 200)));
        } catch (err) {}
      };

      var p = cfg.appsScriptUrl
        ? fetch(cfg.appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          }).then(function (r) { return r.json(); })
        : Promise.resolve({ ok: true });

      p.then(function () {
        saveLocalFb();
        $('#fbMsg').value = '';
        toast('已提交反馈，感谢！', 'ok');
      }).catch(function () {
        saveLocalFb();
        $('#fbMsg').value = '';
        toast('已记录反馈！', 'ok');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = '提交反馈';
      });
    });
  }

  /* ---------- 视图切换与总刷新 ---------- */
  function refreshAllViews() {
    var model = window.CHStore.getModel();
    var rawSiteName = (model.settings && model.settings.siteName) || '暗号查询中心';
    var resolvedSiteName = rawSiteName === '暗号查询中心 Beta' ? '暗号查询中心' : rawSiteName;
    document.title = resolvedSiteName;
    $('#siteName').textContent = resolvedSiteName;
    if (model.settings && model.settings.subtitle) {
      $('#subtitle').textContent = model.settings.subtitle;
    }

    renderSyncBar(model);
    renderTeamFilters(model);
    renderFilters(model);
    renderStats(model);
    renderFeedback(model);

    var hasQ = Boolean(state.q.trim());
    var hasTeam = Boolean(state.team);
    var isSheetMode = state.viewMode === 'sheet';

    $$('#viewSwitch button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === state.viewMode);
    });

    if (isSheetMode) {
      $('#discover').style.display = 'none';
      $('#results').style.display = 'none';
      $('#sheetViewSec').style.display = '';
      renderSheetOneToOneView(model);
    } else {
      $('#sheetViewSec').style.display = 'none';
      if (hasQ || hasTeam) {
        $('#discover').style.display = 'none';
        $('#results').style.display = '';
        renderSearchResults(model);
      } else {
        $('#discover').style.display = '';
        $('#results').style.display = 'none';
        renderMatrix(model);
        renderDiscoverSamples(model);
      }
    }
  }

  function bindEvents() {
    var input = $('#q');
    input.addEventListener('input', function () {
      state.q = input.value;
      state.limit = 80;
      $('#searchbox').classList.toggle('has-value', Boolean(input.value));
      if (input.value) stopPlaceholder();
      renderSuggest(window.CHStore.getModel());
      refreshAllViews();
    });
    input.addEventListener('focus', function () {
      if (state.q.trim()) renderSuggest(window.CHStore.getModel());
    });
    input.addEventListener('blur', function () {
      if (!input.value) startPlaceholder();
    });
    input.addEventListener('keydown', function (e) {
      var box = $('#suggest');
      if (!box.classList.contains('show')) return;
      var items = box.querySelectorAll('.item');
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        state.sugIdx += e.key === 'ArrowDown' ? 1 : -1;
        if (state.sugIdx < 0) state.sugIdx = items.length - 1;
        if (state.sugIdx >= items.length) state.sugIdx = 0;
        items.forEach(function (el, i) { el.classList.toggle('active', i === state.sugIdx); });
      } else if (e.key === 'Enter' && state.sugIdx >= 0) {
        e.preventDefault();
        pickSuggest(items[state.sugIdx].getAttribute('data-v') || '');
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
      $('#searchbox').classList.remove('has-value');
      $('#suggest').classList.remove('show');
      refreshAllViews();
      startPlaceholder();
      input.focus();
    };

    $$('#viewSwitch button').forEach(function (btn) {
      btn.onclick = function () {
        state.viewMode = btn.getAttribute('data-view') || 'discover';
        refreshAllViews();
      };
    });

    $$('#sheetTabSwitch button').forEach(function (btn) {
      btn.onclick = function () {
        state.sheetTab = btn.getAttribute('data-sheet-tab') || 'main';
        refreshAllViews();
      };
    });

    var navSheet = $('#navSheetView');
    if (navSheet) {
      navSheet.onclick = function (e) {
        e.preventDefault();
        state.viewMode = state.viewMode === 'sheet' ? 'discover' : 'sheet';
        refreshAllViews();
      };
    }

    var navDiscover = $('#navDiscover');
    if (navDiscover) {
      navDiscover.onclick = function (e) {
        e.preventDefault();
        input.value = '';
        state.q = '';
        state.team = '';
        state.template = '';
        state.viewMode = 'discover';
        $('#searchbox').classList.remove('has-value');
        refreshAllViews();
      };
    }

    var btnCopySheet = $('#copySheetAllBtn');
    if (btnCopySheet) {
      btnCopySheet.onclick = function () {
        var model = window.CHStore.getModel();
        if (state.sheetTab === 'links') {
          var links = getFilteredLinks(model);
          var lLines = ['姓名\t短链\t地址'];
          links.forEach(function (l) { lLines.push(l.name + '\t' + l.slug + '\t' + l.url); });
          copyText(lLines.join('\n'), '已复制 ' + links.length + ' 条短链明细');
          return;
        }
        if (state.sheetTab === 'teams') {
          var tLines = (model.teams || []).map(function (t) {
            return t.name + ' (' + t.count + '人)：' + t.members.join('、');
          });
          copyText(tLines.join('\n'), '已复制全部团队分组名单');
          return;
        }
        var rows = getFilteredMainRows(model);
        var lines = ['姓名\t关键词\t平台/模板'];
        rows.forEach(function (r) {
          lines.push(r.name + '\t' + r.keyword + '\t' + r.template);
        });
        copyText(lines.join('\n'), '已复制 ' + rows.length + ' 行总表数据');
      };
    }

    $('#shuffleAll').onclick = function () {
      renderDiscoverSamples(window.CHStore.getModel());
      toast('已换一批随机样本', 'ok');
    };

    $('#spotMore').onclick = function () {
      if (state.spotItems.length) {
        drawSpot((state.spotIdx + 1) % state.spotItems.length);
      }
    };

    // 连点左上角 Logo 5 次进入后台
    var logoBox = $('#logoBox');
    if (logoBox) {
      var clickCount = 0, clickTimer = null;
      logoBox.style.cursor = 'pointer';
      logoBox.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clickCount++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(function () { clickCount = 0; }, 2500);
        logoBox.style.transform = 'scale(0.88)';
        setTimeout(function () { logoBox.style.transform = ''; }, 130);
        if (clickCount >= 5) {
          clickCount = 0;
          if (window.CHAdmin) window.CHAdmin.open('bind');
        } else if (clickCount >= 3) {
          toast('再点 ' + (5 - clickCount) + ' 次进入后台管理');
        }
      });
    }
  }

  /* ---------- 初始化 ---------- */
  initBackground();
  initTheme();

  var initModel = window.CHStore.getModel();
  setupLogo(initModel);
  state.phCands = buildPlaceholders(initModel);
  bindEvents();
  bindFeedback();
  refreshAllViews();
  startPlaceholder();

  window.CHStore.subscribe(function (newModel) {
    setupLogo(newModel);
    state.phCands = buildPlaceholders(newModel);
    refreshAllViews();
  });

  window.CHStore.pullFromOnlineSheet().catch(function () {});
})();
