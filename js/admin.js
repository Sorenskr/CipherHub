/**
 * CipherHub Beta · 内置后台管理逻辑 (admin.js)
 *
 * 核心能力：
 *   1. 在线表格绑定与「按团队一键清理云端总表与短链」
 *   2. 总表暗号管理（A1姓名 | B1关键词 | C1平台/模板）
 *   3. 短链管理（A1姓名 | B1短链 | C1地址）
 *   4. 团队与成员汇总、批量粘贴导入、CSV / data.js 导出与站点设置
 */
(function () {
  'use strict';

  var OK_KEY = 'ch_beta_admin_ok';
  var mounted = false;

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

  function toast(msg, type) {
    var box = $('#admToast');
    if (!box) {
      if (window.chToast) window.chToast(msg, type);
      return;
    }
    var el = document.createElement('div');
    el.className = 'toast-item ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, 2400);
  }

  function getPass() {
    var cfg = window.CHStore.getBindConfig();
    return cfg.adminToken || (window.CH_BETA_CONFIG && window.CH_BETA_CONFIG.adminPass) || 'admin123';
  }

  function ensureMounted() {
    if (mounted) return;
    mounted = true;
    bindEvents();
    window.CHStore.subscribe(function () {
      if (document.body.classList.contains('adm-on')) {
        renderAll();
      }
    });
  }

  function showGate(targetTab) {
    ensureMounted();
    $('#admGate').style.display = 'grid';
    $('#admRoot').style.display = 'none';
    $('#admGate').dataset.targetTab = targetTab || 'bind';
    document.body.classList.add('adm-on');
    setTimeout(function () {
      var p = $('#admGatePass');
      if (p) p.focus();
    }, 60);
  }

  function switchTab(tabName) {
    if (!tabName) return;
    $$('#admTabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === tabName);
    });
    $$('#admRoot .panel').forEach(function (p) {
      p.classList.toggle('on', p.id === 'adm-panel-' + tabName);
    });
  }

  function showAdmin(targetTab) {
    $('#admGate').style.display = 'none';
    $('#admRoot').style.display = 'block';
    document.body.classList.add('adm-on');
    if (targetTab) switchTab(targetTab);
    renderAll();
    window.scrollTo(0, 0);
  }

  function exitAdmin() {
    document.body.classList.remove('adm-on');
    $('#admRoot').style.display = 'none';
    $('#admGate').style.display = 'none';
    window.scrollTo(0, 0);
  }

  function boot(targetTab) {
    ensureMounted();
    loadBindForm();
    loadSettingsForm();
    showAdmin(targetTab || 'bind');
  }

  window.CHAdmin = {
    open: function (targetTab) {
      if (localStorage.getItem(OK_KEY) === '1') {
        boot(targetTab);
        return;
      }
      showGate(targetTab);
    },
    isOpen: function () {
      return document.body.classList.contains('adm-on');
    }
  };

  /* ---------------- 渲染各面板 ---------------- */
  function fillTemplateSelects(model) {
    var opts = '<option value="">全部分类（按固定顺序）</option>' +
      model.templates.map(function (t) {
        return '<option value="' + esc(t.name) + '">' + esc(t.name) + ' (' + (t.count || 0) + ')</option>';
      }).join('');
    var rowFilter = $('#admRTpl');
    if (rowFilter) {
      var prev = rowFilter.value;
      rowFilter.innerHTML = opts;
      rowFilter.value = prev;
    }

    var bulkTpl = $('#admBTpl');
    if (bulkTpl) {
      var prevB = bulkTpl.value;
      bulkTpl.innerHTML = model.templates.map(function (t) {
        return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>';
      }).join('');
      if (prevB) bulkTpl.value = prevB;
    }
  }

  function renderAll() {
    var model = window.CHStore.getModel();
    fillTemplateSelects(model);
    renderBindOverview(model);
    renderRowsTable(model);
    renderLinksTable(model);
    renderPeopleTable(model);
  }

  function loadBindForm() {
    var cfg = window.CHStore.getBindConfig();
    $('#admCfgGasUrl').value = cfg.appsScriptUrl || '';
    $('#admCfgSheetUrl').value = cfg.sheetUrl || '';
    $('#admCfgSheetName').value = cfg.sheetName || '';
    $('#admCfgToken').value = cfg.adminToken || 'admin123';
    $('#admCfgInterval').value = String(cfg.autoSyncSec !== undefined ? cfg.autoSyncSec : 25);
    $('#admCfgAutoPush').checked = cfg.autoPushOnEdit !== false;
  }

  function readBindForm() {
    return {
      appsScriptUrl: $('#admCfgGasUrl').value.trim(),
      sheetUrl: $('#admCfgSheetUrl').value.trim(),
      sheetName: $('#admCfgSheetName').value.trim(),
      adminToken: $('#admCfgToken').value.trim() || 'admin123',
      autoSyncSec: Number($('#admCfgInterval').value || 0),
      autoPushOnEdit: $('#admCfgAutoPush').checked
    };
  }

  function renderBindOverview(model) {
    var meta = model.syncMeta || {};
    var cfg = model.bindConfig || {};
    var hasGas = Boolean(cfg.appsScriptUrl);
    var parsedSheet = window.CHStore.parseSheetInput(cfg.sheetUrl);
    var hasSheet = Boolean(parsedSheet.spreadsheetId);

    var statusHtml = '';
    if (hasGas) {
      statusHtml = '<span class="tag" style="border-color:rgba(40,199,111,.5);color:var(--ok)">🟢 已绑定 Apps Script 双向同步</span>';
    } else if (hasSheet) {
      statusHtml = '<span class="tag" style="border-color:rgba(62,166,255,.5);color:var(--brand-2)">🔵 已绑定 Google 表格直连读取</span>';
    } else {
      statusHtml = '<span class="tag">⚪ 未绑定在线表格（当前使用本地快照）</span>';
    }
    if (meta.lastSyncAt) {
      statusHtml += ' <span class="tiny muted">最近同步：' + esc(meta.lastSyncAt) + '</span>';
    }
    if (meta.error) {
      statusHtml += ' <span class="tiny" style="color:var(--danger)">错误：' + esc(meta.error) + '</span>';
    }
    $('#admBindStatusBox').innerHTML = statusHtml;

    var cards = [
      { n: model.people.length,                t: '团队在册成员（' + (model.teams ? model.teams.length : 0) + ' 组）' },
      { n: model.rows.length,                  t: '总表暗号行数' },
      { n: (model.shortLinks || []).length,    t: '短链表条数' },
      { n: hasGas ? '双向读写' : (hasSheet ? '实时只读' : '本地快照'), t: '当前连接模式' }
    ];
    $('#admDashStats').innerHTML = cards.map(function (c) {
      return '<div class="box"><b>' + esc(c.n) + '</b><span>' + esc(c.t) + '</span></div>';
    }).join('');

    var max = 1;
    model.templates.forEach(function (t) { if ((t.count || 0) > max) max = t.count; });
    $('#admDashPlat').innerHTML = model.templates.map(function (t, idx) {
      var n = t.count || 0;
      return '<tr>' +
        '<td style="width:70px" class="mono muted">顺序 #' + (idx + 1) + '</td>' +
        '<td style="width:130px"><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(t.color) + ';display:inline-block"></span>' + esc(t.name) + '</span></td>' +
        '<td><div style="height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden"><div style="height:100%;width:' + (max ? (n / max * 100) : 0).toFixed(1) + '%;background:' + esc(t.color) + '"></div></div></td>' +
        '<td style="width:90px;text-align:right" class="mono">' + n + ' 行</td>' +
      '</tr>';
    }).join('');
  }

  /* ---------------- 总表暗号（A1 姓名 | B1 关键词 | C1 平台/模板） ---------------- */
  function renderRowsTable(model) {
    var q = ($('#admRQ').value || '').trim().toLowerCase();
    var tpl = $('#admRTpl').value || '';

    var colorMap = {};
    model.templates.forEach(function (t) { colorMap[t.name] = t.color; });

    var list = model.rows.filter(function (r) {
      if (tpl && r.template !== tpl) return false;
      if (q) {
        return r.name.toLowerCase().indexOf(q) >= 0 ||
               (r.group || '').toLowerCase().indexOf(q) >= 0 ||
               r.keyword.toLowerCase().indexOf(q) >= 0 ||
               r.template.toLowerCase().indexOf(q) >= 0;
      }
      return true;
    });

    $('#admRCount').textContent = '当前筛选 ' + list.length + ' 行 / 总计 ' + model.rows.length + ' 行';

    $('#admRBody').innerHTML = list.slice(0, 600).map(function (r) {
      var c = colorMap[r.template] || '#7c5cff';
      var rowIdx = r.id - 1;
      return '<tr>' +
        '<td class="mono muted">第 ' + r.rowNumber + ' 行</td>' +
        '<td><b>' + esc(r.name) + '</b></td>' +
        '<td>' + (r.group ? '<span class="tag">' + esc(r.group) + '</span>' : '<span class="muted tiny">—</span>') + '</td>' +
        '<td class="mono">' + esc(r.keyword) + '</td>' +
        '<td><span class="tag"><span style="width:8px;height:8px;border-radius:50%;background:' + esc(c) + ';display:inline-block"></span>' + esc(r.template) + '</span></td>' +
        '<td><div class="ops">' +
          '<button class="btn sm" data-redit="' + rowIdx + '">编辑</button>' +
          '<button class="btn sm danger" data-rdel="' + rowIdx + '">删除</button>' +
        '</div></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-mute);padding:28px">暂无记录</td></tr>';

    $$('#admRBody [data-redit]').forEach(function (b) {
      b.onclick = function () { openRowModal(Number(b.dataset.redit)); };
    });
    $$('#admRBody [data-rdel]').forEach(function (b) {
      b.onclick = function () { deleteRow(Number(b.dataset.rdel)); };
    });
  }

  function openRowModal(rowIndex) {
    var model = window.CHStore.getModel();
    var isEdit = typeof rowIndex === 'number' && rowIndex >= 0 && rowIndex < model.rows.length;
    var cur = isEdit ? model.rows[rowIndex] : { name: '', keyword: '', template: $('#admRTpl').value || '番号' };

    var tplOptions = model.templates.map(function (t) {
      return '<option value="' + esc(t.name) + '"' + (cur.template === t.name ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');

    openModal(isEdit ? ('编辑总表第 ' + cur.rowNumber + ' 行') : '新增暗号行',
      '<div class="form-row"><label>A1 姓名 *（须在「团队」表中在册）</label><input class="input" id="admFName" value="' + esc(cur.name) + '" placeholder="输入成员姓名"></div>' +
      '<div class="form-row"><label>B1 关键词 *</label><input class="input" id="admFKeyword" value="' + esc(cur.keyword) + '" placeholder="输入对应的关键词 / 暗号"></div>' +
      '<div class="form-row"><label>C1 平台/模板 *</label><select class="select" id="admFTpl">' + tplOptions + '</select></div>' +
      '<div class="tiny muted">保存后将按标准分类顺序排列；若该姓名不在「团队」表中，将被自动过滤，请先确认成员已在「团队」表登记。</div>' +
      '<div class="err-text" id="admFErr" style="margin-top:6px"></div>',
      function () {
        var name = $('#admFName').value.trim();
        var keyword = $('#admFKeyword').value.trim();
        var tpl = $('#admFTpl').value.trim() || '番号';
        if (!name) { $('#admFErr').textContent = '姓名不能为空'; return false; }
        if (!keyword) { $('#admFErr').textContent = '关键词不能为空'; return false; }

        var rows = model.rows.slice();
        if (isEdit) {
          rows[rowIndex] = { name: name, keyword: keyword, template: tpl };
        } else {
          rows.push({ name: name, keyword: keyword, template: tpl });
        }
        closeModal();
        window.CHStore.setRows(rows).then(function () {
          toast('已保存并同步对齐', 'ok');
        });
        return false;
      }
    );
  }

  function deleteRow(rowIndex) {
    var model = window.CHStore.getModel();
    var target = model.rows[rowIndex];
    if (!target) return;
    confirmModal('删除第 ' + target.rowNumber + ' 行',
      '确定删除 <b>' + esc(target.name) + '</b> 的关键词「<b>' + esc(target.keyword) + '</b>」（分类：' + esc(target.template) + '）吗？',
      function () {
        var rows = model.rows.slice();
        rows.splice(rowIndex, 1);
        window.CHStore.setRows(rows).then(function () {
          toast('已删除该行', 'ok');
        });
      }
    );
  }

  /* ---------------- 短链管理面板 ---------------- */
  function renderLinksTable(model) {
    var tbody = $('#admLBody');
    if (!tbody) return;
    var q = ($('#admLQ').value || '').trim().toLowerCase();
    var allLinks = model.shortLinks || [];
    var list = allLinks.filter(function (l) {
      if (!q) return true;
      return l.name.toLowerCase().indexOf(q) >= 0 ||
             (l.group || '').toLowerCase().indexOf(q) >= 0 ||
             l.slug.toLowerCase().indexOf(q) >= 0 ||
             l.url.toLowerCase().indexOf(q) >= 0;
    });

    $('#admLCount').textContent = '当前筛选 ' + list.length + ' 条 / 总计 ' + allLinks.length + ' 条短链';

    tbody.innerHTML = list.slice(0, 400).map(function (l) {
      var idx = l.id - 1;
      return '<tr>' +
        '<td class="mono muted">第 ' + l.rowNumber + ' 行</td>' +
        '<td><b>' + esc(l.name) + '</b></td>' +
        '<td>' + (l.group ? '<span class="tag">' + esc(l.group) + '</span>' : '<span class="muted tiny">—</span>') + '</td>' +
        '<td class="mono">' + esc(l.slug) + '</td>' +
        '<td class="mono tiny" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(l.url) + '">' + esc(l.url) + '</td>' +
        '<td><div class="ops">' +
          '<button class="btn sm" data-ledit="' + idx + '">编辑</button>' +
          '<button class="btn sm danger" data-ldel="' + idx + '">删除</button>' +
        '</div></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-mute);padding:28px">暂无短链记录</td></tr>';

    $$('#admLBody [data-ledit]').forEach(function (b) {
      b.onclick = function () { openLinkModal(Number(b.dataset.ledit)); };
    });
    $$('#admLBody [data-ldel]').forEach(function (b) {
      b.onclick = function () { deleteLink(Number(b.dataset.ldel)); };
    });
  }

  function openLinkModal(linkIndex) {
    var model = window.CHStore.getModel();
    var links = model.shortLinks || [];
    var isEdit = typeof linkIndex === 'number' && linkIndex >= 0 && linkIndex < links.length;
    var cur = isEdit ? links[linkIndex] : { name: '', slug: '', url: '' };

    openModal(isEdit ? ('编辑短链第 ' + cur.rowNumber + ' 行') : '新增成员短链',
      '<div class="form-row"><label>A1 姓名 *（须在「团队」表中在册）</label><input class="input" id="admLName" value="' + esc(cur.name) + '" placeholder="输入成员姓名"></div>' +
      '<div class="form-row"><label>B1 短链标识 *</label><input class="input" id="admLSlug" value="' + esc(cur.slug) + '" placeholder="例如：laya-zzl-tw"></div>' +
      '<div class="form-row"><label>C1 地址 *</label><input class="input" id="admLUrl" value="' + esc(cur.url) + '" placeholder="https://app.adjust.com/..."></div>' +
      '<div class="err-text" id="admFErr" style="margin-top:6px"></div>',
      function () {
        var name = $('#admLName').value.trim();
        var slug = $('#admLSlug').value.trim();
        var url  = $('#admLUrl').value.trim();
        if (!name) { $('#admFErr').textContent = '姓名不能为空'; return false; }
        if (!slug && !url) { $('#admFErr').textContent = '短链标识与地址不能同时为空'; return false; }

        var next = links.slice();
        if (isEdit) {
          next[linkIndex] = { name: name, slug: slug, url: url };
        } else {
          next.push({ name: name, slug: slug, url: url });
        }
        closeModal();
        window.CHStore.setShortLinks(next).then(function () {
          toast('短链已保存并同步', 'ok');
        });
        return false;
      }
    );
  }

  function deleteLink(linkIndex) {
    var model = window.CHStore.getModel();
    var target = (model.shortLinks || [])[linkIndex];
    if (!target) return;
    confirmModal('删除第 ' + target.rowNumber + ' 行短链',
      '确定删除 <b>' + esc(target.name) + '</b> 的短链「<b>' + esc(target.slug) + '</b>」吗？',
      function () {
        var next = (model.shortLinks || []).slice();
        next.splice(linkIndex, 1);
        window.CHStore.setShortLinks(next).then(function () {
          toast('已删除该条短链', 'ok');
        });
      }
    );
  }

  /* ---------------- 团队与成员汇总面板 ---------------- */
  function renderPeopleTable(model) {
    var q = ($('#admPQ').value || '').trim().toLowerCase();
    var list = model.people.filter(function (p) {
      return !q || p.name.toLowerCase().indexOf(q) >= 0 || (p.group || '').toLowerCase().indexOf(q) >= 0;
    });

    $('#admPCount').textContent = '共 ' + list.length + ' 名在册成员';
    $('#admPBody').innerHTML = list.map(function (p) {
      var tags = p.entries.map(function (e) {
        return '<span class="tag"><b style="color:var(--text)">' + esc(e.template) + '</b>: ' + esc(e.keyword) + '</span>';
      });
      (p.shortLinks || []).forEach(function (l) {
        tags.push('<span class="tag" style="border-color:rgba(62,166,255,.45)"><b style="color:var(--brand-2)">短链</b>: ' + esc(l.slug) + '</span>');
      });
      if (!tags.length) {
        tags.push('<span class="tiny muted">暂未分配暗号或短链</span>');
      }
      return '<tr>' +
        '<td><b>' + esc(p.name) + '</b></td>' +
        '<td>' + (p.group ? '<span class="tag">' + esc(p.group) + '</span>' : '<span class="muted tiny">—</span>') + '</td>' +
        '<td class="mono">' + p.entries.length + '码 / ' + (p.shortLinks ? p.shortLinks.length : 0) + '链</td>' +
        '<td><div style="display:flex;flex-wrap:wrap;gap:6px">' + tags.join(' ') + '</div></td>' +
        '<td><div class="ops">' +
          '<button class="btn sm" data-pedit="' + esc(p.name) + '">改名</button>' +
          '<button class="btn sm danger" data-pdel="' + esc(p.name) + '">清空记录</button>' +
        '</div></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-mute);padding:28px">暂无成员</td></tr>';

    $$('#admPBody [data-pedit]').forEach(function (b) {
      b.onclick = function () {
        var oldName = b.dataset.pedit;
        openModal('修改成员姓名',
          '<div class="form-row"><label>原姓名：' + esc(oldName) + '</label>' +
          '<input class="input" id="admPNewName" value="' + esc(oldName) + '" placeholder="输入新姓名"></div>' +
          '<div class="tiny muted">提示：若该成员同时在在线「团队」表中，请记得在表格「团队」页同步改名，否则下次云端清洗会按团队表为准。</div>' +
          '<div class="err-text" id="admFErr"></div>',
          function () {
            var newName = $('#admPNewName').value.trim();
            if (!newName) { $('#admFErr').textContent = '姓名不能为空'; return false; }
            var m = window.CHStore.getModel();
            var rows = m.rows.map(function (r) {
              return r.name === oldName ? { name: newName, keyword: r.keyword, template: r.template } : r;
            });
            var links = (m.shortLinks || []).map(function (l) {
              return l.name === oldName ? { name: newName, slug: l.slug, url: l.url } : l;
            });
            closeModal();
            Promise.all([
              window.CHStore.setRows(rows, { ignoreWhitelist: true }),
              window.CHStore.setShortLinks(links, { ignoreWhitelist: true })
            ]).then(function () {
              toast('已更新成员姓名', 'ok');
            });
            return false;
          }
        );
      };
    });

    $$('#admPBody [data-pdel]').forEach(function (b) {
      b.onclick = function () {
        var delName = b.dataset.pdel;
        confirmModal('清空成员全部暗号与短链',
          '确定删除「<b>' + esc(delName) + '</b>」名下的全部暗号与短链记录吗？（若需连同在册名单一并移除，请直接在在线表格「团队」页删除该姓名）',
          function () {
            var m = window.CHStore.getModel();
            var rows = m.rows.filter(function (r) { return r.name !== delName; });
            var links = (m.shortLinks || []).filter(function (l) { return l.name !== delName; });
            Promise.all([
              window.CHStore.setRows(rows),
              window.CHStore.setShortLinks(links)
            ]).then(function () {
              toast('已清空该成员名下暗号与短链', 'ok');
            });
          }
        );
      };
    });
  }

  /* ---------------- 批量粘贴导入 ---------------- */
  function handleBulkImport() {
    var rawText = $('#admBText').value || '';
    var defTpl = $('#admBTpl').value || '番号';
    var mode = $('#admBMode').value || 'append';

    var lines = rawText.split(/\r?\n/);
    var parsed = [];
    var skipped = [];

    lines.forEach(function (raw, idx) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = line.indexOf('\t') >= 0
        ? line.split('\t').map(function (s) { return s.trim(); })
        : line.split(/[,，\s]+/).filter(Boolean);

      if (parts.length < 2) {
        skipped.push('第 ' + (idx + 1) + ' 行缺少关键词：' + line);
        return;
      }
      var name = window.CHStore.normalizePersonName(parts[0]);
      var keyword = parts[1];
      var tpl = parts[2] ? window.CHStore.normalizeTemplateName(parts[2]) : defTpl;

      if (name === '姓名' && (keyword === '关键词' || keyword === '暗号')) return;
      parsed.push({ name: name, keyword: keyword, template: tpl });
    });

    if (!parsed.length) {
      toast('未识别到有效行，请检查格式（姓名 关键词 [分类]）', 'err');
      return;
    }

    var baseRows = mode === 'replace' ? [] : window.CHStore.getModel().rows.slice();
    var combined = baseRows.concat(parsed);

    window.CHStore.setRows(combined).then(function (newModel) {
      var msg = '<div class="tag" style="background:rgba(40,199,111,.16);border-color:rgba(40,199,111,.5);color:var(--ok)">' +
        '已处理 ' + parsed.length + ' 行！当前总表共 ' + newModel.rows.length + ' 行（已按分类顺序排好并自动过滤非在册成员）</div>';
      if (skipped.length) {
        msg += '<div class="tiny muted" style="margin-top:8px">跳过 ' + skipped.length + ' 行：<br>' +
          skipped.slice(0, 15).map(esc).join('<br>') + '</div>';
      }
      $('#admBResult').innerHTML = msg;
      toast('批量导入完成', 'ok');
    });
  }

  /* ---------------- 站点设置与导出 ---------------- */
  function loadSettingsForm() {
    var model = window.CHStore.getModel();
    var s = model.settings || {};
    $('#admSName').value = s.siteName || '';
    $('#admSSub').value = s.subtitle || '';
    $('#admSLogos').value = (s.logos || []).join(', ');
    var fb = s.feedback || {};
    $('#admFbTitle').value = fb.title || '';
    $('#admFbDesc').value = fb.desc || '';
    $('#admFbEnable').checked = fb.enableForm !== false;
    renderContactsEditor(s.contacts || []);
  }

  function renderContactsEditor(list) {
    $('#admCtList').innerHTML = list.map(function (c) {
      return '<div class="ct-row" style="display:grid;grid-template-columns:110px 1fr 150px auto;gap:8px">' +
        '<input class="input" data-k="type" value="' + esc(c.type || '') + '" placeholder="微信 / TG">' +
        '<input class="input" data-k="value" value="' + esc(c.value || '') + '" placeholder="账号 / 链接">' +
        '<input class="input" data-k="label" value="' + esc(c.label || '') + '" placeholder="备注">' +
        '<button class="btn sm danger" type="button" data-ctdel>删除</button></div>';
    }).join('') || '<div class="tiny muted">暂无联系方式</div>';

    $$('#admCtList [data-ctdel]').forEach(function (b) {
      b.onclick = function () { b.closest('.ct-row').remove(); };
    });
  }

  function readContactsEditor() {
    return $$('#admCtList .ct-row').map(function (r) {
      return {
        type: r.querySelector('[data-k="type"]').value.trim(),
        value: r.querySelector('[data-k="value"]').value.trim(),
        label: r.querySelector('[data-k="label"]').value.trim()
      };
    }).filter(function (c) { return c.value; });
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function exportCsv() {
    var model = window.CHStore.getModel();
    var csvEscape = function (v) {
      var s = String(v == null ? '' : v);
      if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    var lines = ['姓名,关键词,平台/模板'];
    model.rows.forEach(function (r) {
      lines.push([csvEscape(r.name), csvEscape(r.keyword), csvEscape(r.template)].join(','));
    });
    downloadFile('暗号总表_A姓名_B关键词_C模板.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('已导出总表 CSV', 'ok');
  }

  function exportDataJs() {
    var model = window.CHStore.getModel();
    var cfg = window.CHStore.getBindConfig();
    var code =
      '/**\n' +
      ' * CipherHub Beta · 默认配置与三表快照数据 (由后台导出生成)\n' +
      ' */\n' +
      '(function () {\n' +
      '  \'use strict\';\n\n' +
      '  window.CH_BETA_CONFIG = ' + JSON.stringify({
        appsScriptUrl: cfg.appsScriptUrl || '',
        sheetUrl: cfg.sheetUrl || '',
        sheetName: cfg.sheetName || '总表',
        adminPass: cfg.adminToken || 'admin123',
        autoSyncSec: cfg.autoSyncSec || 25
      }, null, 2) + ';\n\n' +
      '  window.TEMPLATE_ORDER = ' + JSON.stringify(window.TEMPLATE_ORDER) + ';\n\n' +
      '  window.TEMPLATES = ' + JSON.stringify(window.TEMPLATES, null, 2) + ';\n\n' +
      '  window.PERSON_NAME_ALIAS = ' + JSON.stringify(window.PERSON_NAME_ALIAS || { '驼圆圆': '骆圆圆', '许鹏云': '许鹏雲' }, null, 2) + ';\n\n' +
      '  window.TEMPLATE_ALIAS = ' + JSON.stringify(window.TEMPLATE_ALIAS, null, 2) + ';\n\n' +
      '  window.DEFAULT_DATA = ' + JSON.stringify({
        updatedAt: new Date().toISOString(),
        settings: model.settings,
        teams: (model.teams || []).map(function (t) {
          return { name: t.name, count: t.count, members: t.members };
        }),
        rows: model.rows.map(function (r) {
          return { name: r.name, keyword: r.keyword, template: r.template };
        }),
        shortLinks: (model.shortLinks || []).map(function (l) {
          return { name: l.name, slug: l.slug, url: l.url };
        })
      }, null, 2) + ';\n' +
      '})();\n';
    downloadFile('data.js', code, 'application/javascript;charset=utf-8');
    toast('已导出 js/data.js（含三表完整快照）', 'ok');
  }

  /* ---------------- 弹窗控制 ---------------- */
  var okHandler = null;
  function openModal(title, body, onOk) {
    $('#admMTitle').textContent = title;
    $('#admMBody').innerHTML = body;
    okHandler = onOk;
    $('#admMask').classList.add('on');
    setTimeout(function () {
      var f = $('#admMBody').querySelector('input,select,textarea');
      if (f) f.focus();
    }, 50);
  }
  function closeModal() {
    $('#admMask').classList.remove('on');
    okHandler = null;
  }
  function confirmModal(title, htmlText, onOk) {
    openModal(title, '<div style="font-size:14px;line-height:1.7">' + htmlText + '</div>', function () {
      closeModal();
      onOk();
      return false;
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    $('#admGateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var inputPass = $('#admGatePass').value.trim();
      if (inputPass !== getPass()) {
        $('#admGateErr').textContent = '后台口令不对（默认：admin123）';
        return;
      }
      $('#admGateErr').textContent = '';
      localStorage.setItem(OK_KEY, '1');
      boot($('#admGate').dataset.targetTab || 'bind');
    });

    $('#admGateCancel').onclick = function (e) {
      e.preventDefault();
      exitAdmin();
    };
    $('#admExit').onclick = exitAdmin;
    $('#admHome').onclick = function (e) {
      e.preventDefault();
      exitAdmin();
    };

    $$('#admTabs button').forEach(function (btn) {
      btn.onclick = function () {
        switchTab(btn.dataset.tab);
      };
    });

    // 保存绑定并拉取
    $('#admBindSavePull').onclick = function () {
      var cfg = readBindForm();
      window.CHStore.saveBindConfig(cfg);
      if (!cfg.appsScriptUrl && !cfg.sheetUrl) {
        toast('已保存配置（当前未填写在线表格链接，使用本地快照）', 'ok');
        renderAll();
        return;
      }
      var btn = $('#admBindSavePull');
      btn.disabled = true;
      btn.textContent = '正在从在线表格同步…';
      window.CHStore.pullFromOnlineSheet()
        .then(function (m) {
          toast('同步成功！团队 ' + m.people.length + ' 人，总表 ' + m.rows.length + ' 条，短链 ' + (m.shortLinks || []).length + ' 条', 'ok');
        })
        .catch(function (err) {
          toast('拉取失败：' + err.message, 'err');
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = '🔗 保存并立即从在线表格同步';
        });
    };

    // 按「团队」表名单一键清理云端总表与短链
    var cleanBtn = $('#admBindCleanByTeam');
    if (cleanBtn) {
      cleanBtn.onclick = function () {
        confirmModal('按「团队」表名单清理云端总表与短链',
          '此操作会以云端 Google 表格的 <b>「团队」</b> 在册组员为唯一准绳，彻底清除 <b>「总表」</b> 与 <b>「短链」</b> 中所有已不在团队表内的旧人员记录，并自动修正笔误。确定执行吗？',
          function () {
            cleanBtn.disabled = true;
            cleanBtn.textContent = '正在清理云端表格…';
            window.CHStore.cleanByTeamCloud()
              .then(function (m) {
                toast('云端清理完成！保留团队 ' + m.people.length + ' 人、总表 ' + m.rows.length + ' 条、短链 ' + (m.shortLinks || []).length + ' 条', 'ok');
              })
              .catch(function (err) {
                toast('清理失败：' + err.message, 'err');
              })
              .then(function () {
                cleanBtn.disabled = false;
                cleanBtn.textContent = '🧹 按「团队」表名单清理云端总表与短链';
              });
          }
        );
      };
    }

    // 推送网页数据到在线表格
    $('#admBindPushCloud').onclick = function () {
      var cfg = readBindForm();
      window.CHStore.saveBindConfig(cfg);
      var btn = $('#admBindPushCloud');
      btn.disabled = true;
      btn.textContent = '正在写入在线表格…';
      window.CHStore.pushToOnlineSheet('SAVE_ROWS')
        .then(function (m) {
          toast('已将总表 ' + m.rows.length + ' 条、短链 ' + (m.shortLinks || []).length + ' 条写入在线表格！', 'ok');
        })
        .catch(function (err) {
          toast('写入失败：' + err.message, 'err');
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = '☁️ 推送当前网页数据到在线表格';
        });
    };

    // 在线总表按分类重排
    $('#admBindSortCloud').onclick = function () {
      var cfg = readBindForm();
      window.CHStore.saveBindConfig(cfg);
      window.CHStore.pushToOnlineSheet('SORT_SHEET')
        .then(function (m) {
          toast('已将在线总表按固定分类重排对齐（共 ' + m.rows.length + ' 行）', 'ok');
        })
        .catch(function (err) {
          toast('整理失败：' + err.message, 'err');
        });
    };

    // 总表筛选与操作
    $('#admRQ').addEventListener('input', function () {
      renderRowsTable(window.CHStore.getModel());
    });
    $('#admRTpl').onchange = function () {
      renderRowsTable(window.CHStore.getModel());
    };
    $('#admRAdd').onclick = function () {
      openRowModal(-1);
    };
    $('#admRSort').onclick = function () {
      var rows = window.CHStore.getModel().rows;
      window.CHStore.setRows(rows).then(function () {
        toast('已按固定分类顺序重新对齐', 'ok');
      });
    };

    // 短链筛选与新增
    var admLQ = $('#admLQ');
    if (admLQ) {
      admLQ.addEventListener('input', function () {
        renderLinksTable(window.CHStore.getModel());
      });
    }
    var admLAdd = $('#admLAdd');
    if (admLAdd) {
      admLAdd.onclick = function () { openLinkModal(-1); };
    }

    // 成员搜索
    $('#admPQ').addEventListener('input', function () {
      renderPeopleTable(window.CHStore.getModel());
    });

    // 批量导入
    $('#admBSubmit').onclick = handleBulkImport;

    // 站点设置保存
    $('#admSSave').onclick = function () {
      var logos = $('#admSLogos').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var partial = {
        siteName: $('#admSName').value.trim() || '暗号查询中心',
        subtitle: $('#admSSub').value.trim()
      };
      if (logos.length) partial.logos = logos;
      window.CHStore.updateSettings(partial, true).then(function () {
        toast('站点信息已保存', 'ok');
      });
    };

    $('#admCtAdd').onclick = function () {
      var list = readContactsEditor();
      list.push({ type: '微信', value: '', label: '' });
      renderContactsEditor(list);
    };

    $('#admFbSave').onclick = function () {
      window.CHStore.updateSettings({
        feedback: {
          title: $('#admFbTitle').value.trim() || '问题反馈',
          desc: $('#admFbDesc').value.trim(),
          enableForm: $('#admFbEnable').checked
        },
        contacts: readContactsEditor()
      }, true).then(function () {
        toast('反馈配置已保存', 'ok');
      });
    };

    // 导出与重置
    $('#admExpCsv').onclick = exportCsv;
    $('#admExpDataJs').onclick = exportDataJs;
    $('#admResetDefault').onclick = function () {
      confirmModal('恢复默认快照数据', '将清除本机缓存并恢复内置三表快照（若已绑定在线表格，刷新后仍会实时拉取在线表格）。确定？', function () {
        window.CHStore.resetToDefault();
        toast('已恢复默认快照', 'ok');
      });
    };

    // 弹窗关闭
    $('#admMClose').onclick = closeModal;
    $('#admMCancel').onclick = closeModal;
    $('#admMask').addEventListener('mousedown', function (e) {
      if (e.target === $('#admMask')) closeModal();
    });
    $('#admMOk').onclick = function () {
      if (okHandler) okHandler();
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#admMask').classList.contains('on')) closeModal();
      if (e.key === 'Enter' && $('#admMask').classList.contains('on') && e.target.tagName === 'INPUT') {
        e.preventDefault();
        if (okHandler) okHandler();
      }
    });
  }

  ensureMounted();
})();
