/**
 * CipherHub Beta · 三表打通实时同步与数据中心 (sheet-sync.js)
 *
 * 核心职责：
 *   1. 彻底清除历史 v1 本地残留缓存，确保网页数据与在线表格 100% 同步统一。
 *   2. 同步联动《暗号表》的三张工作表：
 *      - 「团队」：各小组（慕杰组、李俊鑫组等）及在册组员名单（唯一人员白名单）
 *      - 「总表」：A1 姓名 | B1 关键词 | C1 平台/模板（按固定分类顺序排列）
 *      - 「短链」：A1 姓名 | B1 短链   | C1 地址
 *   3. 严格过滤机制：若线上表格中删除了某条数据或某位成员，本地拉取时全量覆盖，绝不残留旧数据。
 *   4. 支持 Apps Script Web App 双向读写与 Google Sheets GViz 三表并行直连降级读取。
 */
(function () {
  'use strict';

  // 清除旧版 v1 遗留缓存，防止历史测试数据或已删除旧人数据残留
  try {
    localStorage.removeItem('ch_beta_local_data_v1');
    localStorage.removeItem('ch_beta_bind_cfg_v1');
  } catch (e) {}

  var BIND_STORAGE_KEY = 'ch_beta_bind_cfg_v2';
  var LOCAL_DATA_KEY   = 'ch_beta_local_data_v2';

  var TEMPLATE_ORDER = window.TEMPLATE_ORDER || ['番号', '聊天', '走光', '任务', '新模版', '备用', '备用2', '创新'];
  var BASE_TEMPLATES = window.TEMPLATES || [
    { id: 'fanhao',    name: '番号',   short: '番',  color: '#7c5cff', order: 1 },
    { id: 'liaotian',  name: '聊天',   short: '聊',  color: '#00c8b4', order: 2 },
    { id: 'zouguang',  name: '走光',   short: '走',  color: '#ff5c8a', order: 3 },
    { id: 'renwu',     name: '任务',   short: '任',  color: '#3ea6ff', order: 4 },
    { id: 'xinmoban',  name: '新模版', short: '新',  color: '#e1306c', order: 5 },
    { id: 'beiyong',   name: '备用',   short: '备',  color: '#ffb020', order: 6 },
    { id: 'beiyong2',  name: '备用2',  short: '备2', color: '#8b93a7', order: 7 },
    { id: 'chuangxin', name: '创新',   short: '创',  color: '#28c76f', order: 8 }
  ];
  var ALIAS = window.TEMPLATE_ALIAS || {
    '番号': '番号',
    'fanhao': '番号',
    '聊天': '聊天',
    '聊天记录': '聊天',
    'liaotian': '聊天',
    '走光': '走光',
    'zouguang': '走光',
    '任务': '任务',
    'renwu': '任务',
    '新模版': '新模版',
    '新模板': '新模版',
    'xinmoban': '新模版',
    '备用': '备用',
    '备用1': '备用',
    '备用 1': '备用',
    'beiyong': '备用',
    '备用2': '备用2',
    '备用 2': '备用2',
    'beiyong2': '备用2',
    '创新': '创新',
    'chuangxin': '创新'
  };
  var PERSON_ALIAS = window.PERSON_NAME_ALIAS || {
    '驼圆圆': '骆圆圆',
    '许鹏云': '许鹏雲'
  };

  function normalizePersonName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    return PERSON_ALIAS[s] || s;
  }

  function normalizeTemplateName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '番号';
    if (ALIAS[s]) return ALIAS[s];
    var lower = s.toLowerCase();
    if (ALIAS[lower]) return ALIAS[lower];
    return s;
  }

  function getTemplateOrderIndex(tplName) {
    var norm = normalizeTemplateName(tplName);
    var idx = TEMPLATE_ORDER.indexOf(norm);
    return idx >= 0 ? idx : 999;
  }

  function normalizeTeamsData(rawTeams) {
    var teams = [];
    var memberGroupMap = {};
    var validSet = {};

    (Array.isArray(rawTeams) ? rawTeams : []).forEach(function (t) {
      if (!t || !t.name) return;
      var teamName = String(t.name).trim();
      if (!teamName) return;
      var members = [];
      var seen = {};
      (Array.isArray(t.members) ? t.members : []).forEach(function (m) {
        var name = normalizePersonName(m);
        if (!name || name === '组名称' || name === '组员人数') return;
        if (!seen[name]) {
          seen[name] = true;
          members.push(name);
        }
        if (!memberGroupMap[name]) {
          memberGroupMap[name] = teamName;
        }
        validSet[name] = true;
      });
      teams.push({
        name: teamName,
        count: members.length,
        members: members
      });
    });

    return {
      teams: teams,
      memberGroupMap: memberGroupMap,
      validSet: validSet,
      validCount: Object.keys(validSet).length
    };
  }

  function sortRowsByTemplateOrder(rows, validSet, memberGroupMap) {
    if (!Array.isArray(rows)) return [];
    var hasWhitelist = Boolean(validSet && Object.keys(validSet).length > 0);
    var seen = {};

    return rows
      .map(function (r, i) {
        var rawName = r && r.name !== undefined ? r.name : (r && r[0] !== undefined ? r[0] : '');
        var rawKw   = r && r.keyword !== undefined ? r.keyword : (r && r.value !== undefined ? r.value : (r && r[1] !== undefined ? r[1] : ''));
        var rawTpl  = r && r.template !== undefined ? r.template : (r && r.platformName !== undefined ? r.platformName : (r && r[2] !== undefined ? r[2] : '番号'));
        var name = normalizePersonName(rawName);
        var keyword = String(rawKw == null ? '' : rawKw).trim();
        var tpl = normalizeTemplateName(rawTpl);
        return {
          _origIdx: i,
          name: name,
          keyword: keyword,
          template: tpl,
          _orderIdx: getTemplateOrderIndex(tpl)
        };
      })
      .filter(function (item) {
        if (!item.name && !item.keyword) return false;
        if (item.name === '姓名' && (item.keyword === '关键词' || item.keyword === '暗号')) return false;
        if (hasWhitelist && !validSet[item.name]) return false;
        var dupKey = item.name + '||' + item.keyword + '||' + item.template;
        if (seen[dupKey]) return false;
        seen[dupKey] = true;
        return true;
      })
      .sort(function (a, b) {
        if (a._orderIdx !== b._orderIdx) return a._orderIdx - b._orderIdx;
        if (a._orderIdx === 999 && a.template !== b.template) {
          return a.template.localeCompare(b.template, 'zh-CN');
        }
        return a._origIdx - b._origIdx;
      })
      .map(function (item, idx) {
        return {
          id: idx + 1,
          rowNumber: idx + 2,
          name: item.name,
          group: (memberGroupMap && memberGroupMap[item.name]) || '',
          keyword: item.keyword,
          template: item.template
        };
      });
  }

  function detectLinkChannelTag(slug) {
    var s = String(slug || '').toLowerCase();
    if (/-tw\b/.test(s) || s.slice(-3) === '-tw') return 'TW';
    if (/-sp\b/.test(s) || s.slice(-3) === '-sp') return 'SP';
    return '短链';
  }

  function normalizeShortLinks(links, validSet, memberGroupMap) {
    if (!Array.isArray(links)) return [];
    var hasWhitelist = Boolean(validSet && Object.keys(validSet).length > 0);
    var seen = {};
    var out = [];

    links.forEach(function (l) {
      var rawName = l && l.name !== undefined ? l.name : (l && l[0] !== undefined ? l[0] : '');
      var rawSlug = l && l.slug !== undefined ? l.slug : (l && l[1] !== undefined ? l[1] : '');
      var rawUrl  = l && l.url !== undefined ? l.url : (l && l[2] !== undefined ? l[2] : '');

      var name = normalizePersonName(rawName);
      var slug = String(rawSlug == null ? '' : rawSlug).trim();
      var url  = String(rawUrl == null ? '' : rawUrl).trim();

      if (!name || (!slug && !url)) return;
      if (name === '姓名' && (slug === '短链' || url === '地址')) return;
      if (hasWhitelist && !validSet[name]) return;

      var dupKey = name + '||' + slug + '||' + url;
      if (seen[dupKey]) return;
      seen[dupKey] = true;

      out.push({
        id: out.length + 1,
        rowNumber: out.length + 2,
        name: name,
        group: (memberGroupMap && memberGroupMap[name]) || '',
        slug: slug,
        url: url,
        channelTag: detectLinkChannelTag(slug)
      });
    });

    return out;
  }

  function parseSheetInput(input) {
    var s = String(input || '').trim();
    if (!s) return { spreadsheetId: '', gid: '' };
    var mId = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    var mGid = s.match(/[?#&]gid=(\d+)/);
    if (mId) {
      return { spreadsheetId: mId[1], gid: mGid ? mGid[1] : '' };
    }
    if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) {
      return { spreadsheetId: s, gid: '' };
    }
    return { spreadsheetId: '', gid: '' };
  }

  function loadBindConfig() {
    var def = window.CH_BETA_CONFIG || {};
    var saved = {};
    try {
      var raw = localStorage.getItem(BIND_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch (e) {}

    return {
      appsScriptUrl:  String(saved.appsScriptUrl !== undefined ? saved.appsScriptUrl : (def.appsScriptUrl || '')).trim(),
      sheetUrl:       String(saved.sheetUrl !== undefined ? saved.sheetUrl : (def.sheetUrl || '')).trim(),
      sheetName:      String(saved.sheetName !== undefined ? saved.sheetName : (def.sheetName || '')).trim(),
      adminToken:     String(saved.adminToken || def.adminPass || 'admin123').trim(),
      autoSyncSec:    saved.autoSyncSec !== undefined ? Number(saved.autoSyncSec) : Number(def.autoSyncSec !== undefined ? def.autoSyncSec : 25),
      autoPushOnEdit: saved.autoPushOnEdit !== undefined ? Boolean(saved.autoPushOnEdit) : true
    };
  }

  function saveBindConfig(cfg) {
    var merged = Object.assign(loadBindConfig(), cfg || {});
    try {
      localStorage.setItem(BIND_STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {}
    setupAutoSyncTimer();
    return merged;
  }

  function loadLocalData() {
    var def = window.DEFAULT_DATA || { settings: {}, teams: [], rows: [], shortLinks: [] };
    try {
      var raw = localStorage.getItem(LOCAL_DATA_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.rows)) {
          return {
            updatedAt: parsed.updatedAt || def.updatedAt || new Date().toISOString(),
            settings: Object.assign({}, def.settings, parsed.settings || {}),
            teams: Array.isArray(parsed.teams) ? parsed.teams : (def.teams || []),
            rows: parsed.rows,
            shortLinks: Array.isArray(parsed.shortLinks) ? parsed.shortLinks : (def.shortLinks || []),
            source: parsed.source || 'local'
          };
        }
      }
    } catch (e) {}
    return {
      updatedAt: def.updatedAt || new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(def.settings || {})),
      teams: JSON.parse(JSON.stringify(def.teams || [])),
      rows: JSON.parse(JSON.stringify(def.rows || [])),
      shortLinks: JSON.parse(JSON.stringify(def.shortLinks || [])),
      source: 'default'
    };
  }

  var state = loadLocalData();
  var syncMeta = {
    status: 'idle',
    lastSyncAt: '',
    error: '',
    mode: '',
    sheetTitle: ''
  };
  var listeners = [];
  var autoSyncTimer = null;

  function persistState() {
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify({
        updatedAt: state.updatedAt,
        settings: state.settings,
        teams: state.teams,
        rows: state.rows,
        shortLinks: state.shortLinks,
        source: state.source
      }));
    } catch (e) {}
  }

  function notify() {
    var snapshot = buildDerivedModel();
    listeners.slice().forEach(function (fn) {
      try { fn(snapshot); } catch (e) {}
    });
  }

  function buildDerivedModel() {
    var teamInfo = normalizeTeamsData(state.teams);
    var validSet = teamInfo.validCount > 0 ? teamInfo.validSet : null;
    var memberGroupMap = teamInfo.memberGroupMap;

    var rows = sortRowsByTemplateOrder(state.rows, validSet, memberGroupMap);
    var shortLinks = normalizeShortLinks(state.shortLinks, validSet, memberGroupMap);

    var tplMap = {};
    var templates = BASE_TEMPLATES.map(function (t) {
      var copy = Object.assign({}, t, { count: 0 });
      tplMap[t.name] = copy;
      return copy;
    });

    rows.forEach(function (r) {
      if (!tplMap[r.template]) {
        var customTpl = {
          id: 'tpl_' + templates.length,
          name: r.template,
          short: String(r.template).slice(0, 1),
          color: '#6e56cf',
          order: templates.length + 1,
          count: 0
        };
        tplMap[r.template] = customTpl;
        templates.push(customTpl);
      }
      tplMap[r.template].count++;
    });

    var peopleMap = {};
    var people = [];
    var entries = [];

    // 优先按「团队」表在册成员初始化，保证新成员（哪怕暂未配暗号）也能在对应小组下查到
    teamInfo.teams.forEach(function (team) {
      team.members.forEach(function (memberName) {
        if (!peopleMap[memberName]) {
          var p = {
            id: people.length + 1,
            name: memberName,
            group: team.name,
            entries: [],
            shortLinks: []
          };
          peopleMap[memberName] = p;
          people.push(p);
        }
      });
    });

    function ensurePerson(name) {
      var nm = name || '未命名';
      if (!peopleMap[nm]) {
        peopleMap[nm] = {
          id: people.length + 1,
          name: nm,
          group: memberGroupMap[nm] || '',
          entries: [],
          shortLinks: []
        };
        people.push(peopleMap[nm]);
      }
      return peopleMap[nm];
    }

    rows.forEach(function (r, idx) {
      var person = ensurePerson(r.name);
      var tplInfo = tplMap[r.template] || templates[0];
      var entry = {
        id: idx + 1,
        rowNumber: r.rowNumber,
        personId: person.id,
        personName: person.name,
        name: person.name,
        group: person.group,
        keyword: r.keyword,
        value: r.keyword,
        template: r.template,
        platformId: tplInfo ? tplInfo.id : 'custom',
        platformName: tplInfo ? tplInfo.name : r.template,
        color: tplInfo ? tplInfo.color : '#7c5cff',
        order: tplInfo ? tplInfo.order : 99
      };
      person.entries.push(entry);
      entries.push(entry);
    });

    shortLinks.forEach(function (l) {
      var person = ensurePerson(l.name);
      person.shortLinks.push(l);
    });

    // 补全每个团队的暗号与短链统计
    var teams = teamInfo.teams.map(function (t) {
      var entryCount = 0;
      var linkCount = 0;
      var activeMembers = 0;
      t.members.forEach(function (m) {
        var p = peopleMap[m];
        if (p) {
          entryCount += p.entries.length;
          linkCount += p.shortLinks.length;
          if (p.entries.length > 0 || p.shortLinks.length > 0) activeMembers++;
        }
      });
      return {
        name: t.name,
        count: t.members.length,
        members: t.members,
        entryCount: entryCount,
        shortLinkCount: linkCount,
        activeMembers: activeMembers
      };
    });

    var byTemplate = {};
    templates.forEach(function (t) { byTemplate[t.id] = t.count; byTemplate[t.name] = t.count; });

    return {
      updatedAt: state.updatedAt,
      source: state.source,
      syncMeta: Object.assign({}, syncMeta),
      bindConfig: loadBindConfig(),
      settings: state.settings,
      templateOrder: TEMPLATE_ORDER.slice(),
      templates: templates,
      teams: teams,
      memberGroupMap: memberGroupMap,
      rows: rows,
      shortLinks: shortLinks,
      people: people,
      entries: entries,
      stats: {
        people: people.length,
        teams: teams.length,
        entries: entries.length,
        rows: rows.length,
        shortLinks: shortLinks.length,
        templates: templates.length,
        byTemplate: byTemplate,
        updatedAt: state.updatedAt
      }
    };
  }

  /**
   * 底层 GViz JSONP 读取指定工作表
   */
  function fetchGvizTable(spreadsheetId, gid, sheetName, headersCount) {
    return new Promise(function (resolve, reject) {
      var cbName = '__ch_gviz_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('读取 Google 表格超时（' + (sheetName || gid || '主表') + '）'));
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      }

      window[cbName] = function (resp) {
        cleanup();
        if (!resp || resp.status === 'error') {
          var errMsg = (resp && resp.errors && resp.errors[0] && resp.errors[0].detailed_message) || '读取在线表格失败';
          reject(new Error(errMsg));
          return;
        }
        resolve(resp.table || { cols: [], rows: [] });
      };

      var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(spreadsheetId) +
        '/gviz/tq?tqx=responseHandler:' + cbName;
      if (headersCount !== undefined && headersCount !== null) {
        url += '&headers=' + encodeURIComponent(headersCount);
      }
      if (sheetName) {
        url += '&sheet=' + encodeURIComponent(sheetName);
      } else if (gid) {
        url += '&gid=' + encodeURIComponent(gid);
      }
      url += '&_t=' + Date.now();

      script.src = url;
      script.onerror = function () {
        cleanup();
        reject(new Error('无法连接 Google 表格，请检查网络或表格公开权限'));
      };
      document.head.appendChild(script);
    });
  }

  function cellVal(cell) {
    if (!cell) return '';
    var v = (cell.f !== undefined && cell.f !== null) ? cell.f : cell.v;
    return v == null ? '' : String(v).trim();
  }

  function fetchAllSheetsViaGviz(spreadsheetId, gid, mainSheetName) {
    var targetMain = mainSheetName || '总表';
    var pMain = fetchGvizTable(spreadsheetId, gid, targetMain, 1);
    var pLinks = fetchGvizTable(spreadsheetId, '', '短链', 1).catch(function () { return null; });
    var pTeams = fetchGvizTable(spreadsheetId, '', '团队', 1).catch(function () { return null; });

    return Promise.all([pMain, pLinks, pTeams]).then(function (results) {
      var mainTable = results[0];
      var linkTable = results[1];
      var teamTable = results[2];

      // 1. 解析「总表」
      var rawRows = [];
      (mainTable.rows || []).forEach(function (r) {
        var c = r.c || [];
        var name = cellVal(c[0]);
        var keyword = cellVal(c[1]);
        var tpl = cellVal(c[2]) || '番号';
        if (!name && !keyword) return;
        if (name === '姓名' && (keyword === '关键词' || keyword === '暗号')) return;
        rawRows.push({ name: name, keyword: keyword, template: tpl });
      });

      // 2. 解析「短链」
      var rawLinks = [];
      if (linkTable && Array.isArray(linkTable.rows)) {
        linkTable.rows.forEach(function (r) {
          var c = r.c || [];
          var name = cellVal(c[0]);
          var slug = cellVal(c[1]);
          var url  = cellVal(c[2]);
          if (!name || (!slug && !url)) return;
          if (name === '姓名' && (slug === '短链' || url === '地址')) return;
          rawLinks.push({ name: name, slug: slug, url: url });
        });
      }

      // 3. 解析「团队」
      var parsedTeams = [];
      if (teamTable) {
        var tCols = teamTable.cols || [];
        var tRows = teamTable.rows || [];
        var colLabels = tCols.map(function (col) { return String((col && col.label) || '').trim(); });
        var dataStartRow = 0;

        // 兜底：若第 1 行没有放入 cols.label 而是出现在 tRows[0]
        var hasColLabels = colLabels.some(function (lbl, i) { return i >= 1 && lbl.length > 0; });
        if (!hasColLabels && tRows.length > 0) {
          colLabels = (tRows[0].c || []).map(cellVal);
          dataStartRow = 1;
        }

        for (var colIdx = 1; colIdx < colLabels.length; colIdx++) {
          var teamName = colLabels[colIdx];
          if (!teamName) continue;
          // 清理可能被自动附加的人数尾部
          teamName = teamName.replace(/\s+\d+$/, '').trim();
          var members = [];
          for (var rIdx = dataStartRow; rIdx < tRows.length; rIdx++) {
            var cells = (tRows[rIdx] && tRows[rIdx].c) || [];
            var aVal = cellVal(cells[0]);
            var val = cellVal(cells[colIdx]);
            if (aVal === '组员人数' || aVal === '组名称') continue;
            // 跳过人数统计行（纯数字）
            if (/^\d+$/.test(val)) continue;
            if (val) members.push(val);
          }
          parsedTeams.push({
            name: teamName,
            count: members.length,
            members: members
          });
        }
      }

      return {
        ok: true,
        rows: rawRows,
        shortLinks: rawLinks,
        teams: parsedTeams
      };
    });
  }

  function applyRemoteSnapshot(data, mode, sheetTitle) {
    if (Array.isArray(data.teams)) {
      state.teams = data.teams;
    }
    if (Array.isArray(data.rows)) {
      state.rows = data.rows;
    }
    if (Array.isArray(data.shortLinks)) {
      state.shortLinks = data.shortLinks;
    }
    if (data.settings && typeof data.settings === 'object') {
      state.settings = Object.assign({}, state.settings, data.settings);
    }
    state.updatedAt = data.updatedAt || new Date().toISOString();
    state.source = mode === 'gas' ? 'cloud-gas' : 'cloud-gviz';
    syncMeta.status = 'ok';
    syncMeta.mode = mode;
    syncMeta.lastSyncAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    syncMeta.sheetTitle = sheetTitle || '暗号表';
    syncMeta.error = '';
    persistState();
    notify();
    return buildDerivedModel();
  }

  function pullFromOnlineSheet() {
    var cfg = loadBindConfig();
    var gasUrl = cfg.appsScriptUrl;
    var parsedSheet = parseSheetInput(cfg.sheetUrl);

    if (!gasUrl && !parsedSheet.spreadsheetId) {
      syncMeta.status = 'idle';
      syncMeta.mode = 'local';
      notify();
      return Promise.resolve(buildDerivedModel());
    }

    syncMeta.status = 'syncing';
    syncMeta.error = '';
    notify();

    if (gasUrl) {
      var sep = gasUrl.indexOf('?') >= 0 ? '&' : '?';
      var reqUrl = gasUrl + sep + 'action=bootstrap&_t=' + Date.now();
      if (parsedSheet.spreadsheetId) reqUrl += '&spreadsheetId=' + encodeURIComponent(parsedSheet.spreadsheetId);
      if (cfg.sheetName) reqUrl += '&sheet=' + encodeURIComponent(cfg.sheetName);

      return fetch(reqUrl, { method: 'GET', cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (!data || data.ok === false) {
            throw new Error((data && data.error) || 'Apps Script 返回异常');
          }
          var title = (data.spreadsheetName ? data.spreadsheetName + ' · ' : '') + (data.sheetName || '总表');
          return applyRemoteSnapshot(data, 'gas', title);
        })
        .catch(function (err) {
          if (parsedSheet.spreadsheetId) {
            return fetchAllSheetsViaGviz(parsedSheet.spreadsheetId, parsedSheet.gid, cfg.sheetName)
              .then(function (gvizRes) {
                return applyRemoteSnapshot(gvizRes, 'gviz', '暗号表（总表 + 短链 + 团队）');
              })
              .catch(function () {
                syncMeta.status = 'err';
                syncMeta.error = err.message || '同步失败';
                notify();
                throw err;
              });
          }
          syncMeta.status = 'err';
          syncMeta.error = err.message || '同步失败';
          notify();
          throw err;
        });
    }

    return fetchAllSheetsViaGviz(parsedSheet.spreadsheetId, parsedSheet.gid, cfg.sheetName)
      .then(function (gvizRes) {
        return applyRemoteSnapshot(gvizRes, 'gviz', '暗号表（总表 + 短链 + 团队）');
      })
      .catch(function (err) {
        syncMeta.status = 'err';
        syncMeta.error = err.message || '读取表格失败';
        notify();
        throw err;
      });
  }

  function pushToOnlineSheet(customAction, extraPayload) {
    var cfg = loadBindConfig();
    if (!cfg.appsScriptUrl) {
      return Promise.reject(new Error('请先在后台「在线表格绑定」中填写 Google Apps Script 部署链接 (Web App URL)'));
    }
    var parsedSheet = parseSheetInput(cfg.sheetUrl);
    var model = buildDerivedModel();
    var payload = Object.assign({
      action: customAction || 'SAVE_ROWS',
      token: cfg.adminToken || 'admin123',
      spreadsheetId: parsedSheet.spreadsheetId || '',
      sheetName: cfg.sheetName || '',
      rows: model.rows.map(function (r) {
        return { name: r.name, keyword: r.keyword, template: r.template };
      }),
      shortLinks: model.shortLinks.map(function (l) {
        return { name: l.name, slug: l.slug, url: l.url };
      }),
      settings: state.settings
    }, extraPayload || {});

    syncMeta.status = 'syncing';
    notify();

    return fetch(cfg.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (res) {
        if (!res || res.ok === false) {
          throw new Error((res && res.error) || '写入在线表格失败');
        }
        return applyRemoteSnapshot(res, 'gas', syncMeta.sheetTitle || '暗号表');
      })
      .catch(function (err) {
        syncMeta.status = 'err';
        syncMeta.error = err.message || '写入失败';
        notify();
        throw err;
      });
  }

  function cleanByTeamCloud() {
    return pushToOnlineSheet('CLEAN_BY_TEAM', {});
  }

  function setRows(newRows, options) {
    options = options || {};
    var teamInfo = normalizeTeamsData(state.teams);
    var validSet = options.ignoreWhitelist ? null : (teamInfo.validCount > 0 ? teamInfo.validSet : null);
    state.rows = sortRowsByTemplateOrder(newRows, validSet, teamInfo.memberGroupMap);
    state.updatedAt = new Date().toISOString();
    if (!options.keepSource) state.source = 'local-edited';
    persistState();
    notify();

    var cfg = loadBindConfig();
    if (options.pushCloud || (options.autoPush !== false && cfg.autoPushOnEdit && cfg.appsScriptUrl)) {
      return pushToOnlineSheet('SAVE_ROWS').catch(function () {});
    }
    return Promise.resolve(buildDerivedModel());
  }

  function setShortLinks(newLinks, options) {
    options = options || {};
    var teamInfo = normalizeTeamsData(state.teams);
    var validSet = options.ignoreWhitelist ? null : (teamInfo.validCount > 0 ? teamInfo.validSet : null);
    state.shortLinks = normalizeShortLinks(newLinks, validSet, teamInfo.memberGroupMap);
    state.updatedAt = new Date().toISOString();
    if (!options.keepSource) state.source = 'local-edited';
    persistState();
    notify();

    var cfg = loadBindConfig();
    if (options.pushCloud || (options.autoPush !== false && cfg.autoPushOnEdit && cfg.appsScriptUrl)) {
      return pushToOnlineSheet('SAVE_SHORT_LINKS', {
        shortLinks: state.shortLinks.map(function (l) {
          return { name: l.name, slug: l.slug, url: l.url };
        })
      }).catch(function () {});
    }
    return Promise.resolve(buildDerivedModel());
  }

  function updateSettings(newSettings, pushCloud) {
    state.settings = Object.assign({}, state.settings, newSettings || {});
    state.updatedAt = new Date().toISOString();
    persistState();
    notify();

    var cfg = loadBindConfig();
    if (pushCloud && cfg.appsScriptUrl) {
      return pushToOnlineSheet('SAVE_SETTINGS', { settings: state.settings });
    }
    return Promise.resolve(buildDerivedModel());
  }

  function resetToDefault() {
    localStorage.removeItem(LOCAL_DATA_KEY);
    var def = window.DEFAULT_DATA || { settings: {}, teams: [], rows: [], shortLinks: [] };
    state = {
      updatedAt: def.updatedAt || new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(def.settings || {})),
      teams: JSON.parse(JSON.stringify(def.teams || [])),
      rows: JSON.parse(JSON.stringify(def.rows || [])),
      shortLinks: JSON.parse(JSON.stringify(def.shortLinks || [])),
      source: 'default'
    };
    persistState();
    notify();
    return buildDerivedModel();
  }

  function setupAutoSyncTimer() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
    var cfg = loadBindConfig();
    var hasRemote = Boolean(cfg.appsScriptUrl || parseSheetInput(cfg.sheetUrl).spreadsheetId);
    var sec = Number(cfg.autoSyncSec || 0);
    if (hasRemote && sec >= 10) {
      autoSyncTimer = setInterval(function () {
        if (document.hidden) return;
        if (document.body.classList.contains('adm-on')) return;
        pullFromOnlineSheet().catch(function () {});
      }, sec * 1000);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !document.body.classList.contains('adm-on')) {
      var cfg = loadBindConfig();
      if (cfg.appsScriptUrl || parseSheetInput(cfg.sheetUrl).spreadsheetId) {
        pullFromOnlineSheet().catch(function () {});
      }
    }
  });

  window.CHStore = {
    TEMPLATE_ORDER: TEMPLATE_ORDER,
    normalizePersonName: normalizePersonName,
    normalizeTemplateName: normalizeTemplateName,
    getTemplateOrderIndex: getTemplateOrderIndex,
    sortRowsByTemplateOrder: sortRowsByTemplateOrder,
    normalizeShortLinks: normalizeShortLinks,
    parseSheetInput: parseSheetInput,
    getBindConfig: loadBindConfig,
    saveBindConfig: saveBindConfig,
    getModel: buildDerivedModel,
    setRows: setRows,
    setShortLinks: setShortLinks,
    updateSettings: updateSettings,
    resetToDefault: resetToDefault,
    pullFromOnlineSheet: pullFromOnlineSheet,
    pushToOnlineSheet: pushToOnlineSheet,
    cleanByTeamCloud: cleanByTeamCloud,
    subscribe: function (fn) {
      if (typeof fn === 'function' && listeners.indexOf(fn) < 0) {
        listeners.push(fn);
      }
    }
  };

  setupAutoSyncTimer();
})();
