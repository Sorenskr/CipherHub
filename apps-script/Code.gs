/**
 * ============================================================================
 * CipherHub Beta（暗号/关键词查询中心 · 三表打通实时同步版）— Google Apps Script (Code.gs)
 * ============================================================================
 *
 * 【绑定的《暗号表》三张工作表结构】
 *   1. 「总表」：A1 姓名 | B1 关键词 | C1 平台/模板
 *   2. 「短链」：A1 姓名 | B1 短链   | C1 地址
 *   3. 「团队」：A1 组名称 | B1..H1 各小组名；A2 组员人数；第 3 行起为各小组在册成员姓名
 *
 * 【核心联动机制】
 *   - 以「团队」表第 3 行起的在册组员名单为准（唯一数据源）。
 *   - 运行 cleanAndSyncAllByTeam() 或当用户在「团队」表手动删改人员触发 onEdit(e) 时，
 *     会自动将不在「团队」表名单中的旧人员从「总表」与「短链」中彻底删除，
 *     同时自动修正已知笔误（「驼圆圆」→「骆圆圆」、「许鹏云」→「许鹏雲」、「聊天记录」→「聊天」），
 *     并按固定模板顺序重新整理「总表」。
 */

var SPREADSHEET_ID = '11HHwGX4lCUyHmBjcdrWhmGUtZsYmwlwoxIE4Qh_aKFU';
var ADMIN_TOKEN = 'admin123';

var MAIN_SHEET_NAME = '总表';
var LINK_SHEET_NAME = '短链';
var TEAM_SHEET_NAME = '团队';
var FEEDBACK_SHEET_NAME = 'CH_Feedback';

var HEADERS = ['姓名', '关键词', '平台/模板'];
var LINK_HEADERS = ['姓名', '短链', '地址'];
var TEMPLATE_ORDER = ['番号', '聊天', '走光', '任务', '新模版', '备用', '备用2', '创新'];

var TEMPLATE_META = [
  { id: 'fanhao',    name: '番号',   short: '番', color: '#7c5cff', order: 1 },
  { id: 'liaotian',  name: '聊天',   short: '聊', color: '#00c8b4', order: 2 },
  { id: 'zouguang',  name: '走光',   short: '走', color: '#ff5c8a', order: 3 },
  { id: 'renwu',     name: '任务',   short: '任', color: '#3ea6ff', order: 4 },
  { id: 'xinmoban',  name: '新模版', short: '新', color: '#e1306c', order: 5 },
  { id: 'beiyong',   name: '备用',   short: '备', color: '#ffb020', order: 6 },
  { id: 'beiyong2',  name: '备用2',  short: '备2', color: '#8b93a7', order: 7 },
  { id: 'chuangxin', name: '创新',   short: '创', color: '#28c76f', order: 8 }
];

var PERSON_NAME_ALIAS = {
  '驼圆圆': '骆圆圆',
  '许鹏云': '许鹏雲'
};

var TEMPLATE_ALIAS = {
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

function normalizePersonName_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  return PERSON_NAME_ALIAS[s] || s;
}

function normalizeTemplateName_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '番号';
  if (TEMPLATE_ALIAS[s]) return TEMPLATE_ALIAS[s];
  var lower = s.toLowerCase();
  if (TEMPLATE_ALIAS[lower]) return TEMPLATE_ALIAS[lower];
  return s;
}

function getTemplateOrderIndex_(tplName) {
  var norm = normalizeTemplateName_(tplName);
  var idx = TEMPLATE_ORDER.indexOf(norm);
  return idx >= 0 ? idx : 999;
}

function colToLetter_(colNum) {
  var temp = '';
  var letter = '';
  var n = colNum;
  while (n > 0) {
    temp = (n - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    n = (n - temp - 1) / 26;
  }
  return letter;
}

function getSpreadsheet_(overrideId) {
  var reqId = String(overrideId || '').trim();
  if (reqId) {
    return SpreadsheetApp.openById(reqId);
  }
  // 优先读取当前绑定的工作簿，确保简单触发器 onEdit(e) 拥有原生权限
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  throw new Error('未绑定 Google 表格：请检查 SPREADSHEET_ID 或在表格内打开 Apps Script');
}

function ensureMainSheet_(ss, preferredSheetName) {
  var sheets = ss.getSheets();
  var targetName = String(preferredSheetName || '').trim();

  if (targetName) {
    var byName = ss.getSheetByName(targetName);
    if (byName) return byName;
  }

  var mainSh = ss.getSheetByName(MAIN_SHEET_NAME);
  if (mainSh) return mainSh;

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var nm = sh.getName();
    if (nm === FEEDBACK_SHEET_NAME || nm === LINK_SHEET_NAME || nm === TEAM_SHEET_NAME) continue;
    if (sh.getLastRow() >= 1 && sh.getLastColumn() >= 2) {
      var h = sh.getRange(1, 1, 1, Math.min(3, sh.getLastColumn())).getValues()[0];
      var a1 = String(h[0] || '').trim();
      var b1 = String(h[1] || '').trim();
      if (a1 === '姓名' && (b1 === '关键词' || b1 === '暗号')) {
        return sh;
      }
    }
  }

  var created = ss.insertSheet(MAIN_SHEET_NAME, 0);
  created.getRange(1, 1, 1, 3).setValues([HEADERS]);
  return created;
}

function ensureLinkSheet_(ss) {
  var sh = ss.getSheetByName(LINK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(LINK_SHEET_NAME);
    sh.getRange(1, 1, 1, 3).setValues([LINK_HEADERS]);
    try { sh.setFrozenRows(1); } catch (e) {}
  }
  return sh;
}

/**
 * 读取「团队」工作表全部小组与在册组员名单
 */
function readTeamsData_(ss) {
  var sh = ss.getSheetByName(TEAM_SHEET_NAME);
  if (!sh) {
    return {
      sheet: null,
      teams: [],
      memberGroupMap: {},
      validSet: {},
      validCount: 0
    };
  }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 3 || lastCol < 2) {
    return {
      sheet: sh,
      teams: [],
      memberGroupMap: {},
      validSet: {},
      validCount: 0
    };
  }

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headerRow = values[0] || [];
  var teams = [];
  var memberGroupMap = {};
  var validSet = {};

  for (var c = 1; c < headerRow.length; c++) {
    var teamName = String(headerRow[c] == null ? '' : headerRow[c]).trim();
    if (!teamName) continue;

    var members = [];
    var seenInTeam = {};
    for (var r = 2; r < values.length; r++) {
      var rawMember = values[r][c];
      var memberName = normalizePersonName_(rawMember);
      if (!memberName || memberName === '组名称' || memberName === '组员人数') continue;
      if (!seenInTeam[memberName]) {
        seenInTeam[memberName] = true;
        members.push(memberName);
      }
      if (!memberGroupMap[memberName]) {
        memberGroupMap[memberName] = teamName;
      }
      validSet[memberName] = true;
    }

    teams.push({
      name: teamName,
      colIndex: c + 1,
      colLetter: colToLetter_(c + 1),
      count: members.length,
      members: members
    });
  }

  return {
    sheet: sh,
    teams: teams,
    memberGroupMap: memberGroupMap,
    validSet: validSet,
    validCount: Object.keys(validSet).length
  };
}

/**
 * 规范化、去重并按固定模板顺序排序「总表」数据
 */
function sortRowsByTemplateOrder_(rows, validSet, memberGroupMap) {
  var hasWhitelist = Boolean(validSet && Object.keys(validSet).length > 0);
  var seen = {};

  return (rows || [])
    .map(function (r, idx) {
      var rawName = r && r.name !== undefined ? r.name : (r && r[0] !== undefined ? r[0] : '');
      var rawKw   = r && r.keyword !== undefined ? r.keyword : (r && r.value !== undefined ? r.value : (r && r[1] !== undefined ? r[1] : ''));
      var rawTpl  = r && r.template !== undefined ? r.template : (r && r.platformName !== undefined ? r.platformName : (r && r[2] !== undefined ? r[2] : '番号'));

      var name = normalizePersonName_(rawName);
      var keyword = String(rawKw == null ? '' : rawKw).trim();
      var tpl = normalizeTemplateName_(rawTpl);

      return {
        idx: idx,
        name: name,
        keyword: keyword,
        template: tpl,
        orderIdx: getTemplateOrderIndex_(tpl)
      };
    })
    .filter(function (item) {
      if (!item.name || !item.keyword) return false;
      if (item.name === '姓名' && (item.keyword === '关键词' || item.keyword === '暗号')) return false;
      if (hasWhitelist && !validSet[item.name]) return false;
      var dupKey = item.name + '||' + item.keyword + '||' + item.template;
      if (seen[dupKey]) return false;
      seen[dupKey] = true;
      return true;
    })
    .sort(function (a, b) {
      if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
      if (a.orderIdx === 999 && a.template !== b.template) {
        return a.template.localeCompare(b.template, 'zh-CN');
      }
      return a.idx - b.idx;
    })
    .map(function (item, newIdx) {
      return {
        rowNumber: newIdx + 2,
        name: item.name,
        group: (memberGroupMap && memberGroupMap[item.name]) || '',
        keyword: item.keyword,
        template: item.template
      };
    });
}

/**
 * 规范化与过滤「短链」表数据
 */
function normalizeShortLinks_(links, validSet, memberGroupMap) {
  var hasWhitelist = Boolean(validSet && Object.keys(validSet).length > 0);
  var seen = {};
  var out = [];

  (links || []).forEach(function (item) {
    var rawName = item && item.name !== undefined ? item.name : (item && item[0] !== undefined ? item[0] : '');
    var rawSlug = item && item.slug !== undefined ? item.slug : (item && item[1] !== undefined ? item[1] : '');
    var rawUrl  = item && item.url !== undefined ? item.url : (item && item[2] !== undefined ? item[2] : '');

    var name = normalizePersonName_(rawName);
    var slug = String(rawSlug == null ? '' : rawSlug).trim();
    var url  = String(rawUrl == null ? '' : rawUrl).trim();

    if (!name || (!slug && !url)) return;
    if (name === '姓名' && (slug === '短链' || url === '地址')) return;
    if (hasWhitelist && !validSet[name]) return;

    var dupKey = name + '||' + slug + '||' + url;
    if (seen[dupKey]) return;
    seen[dupKey] = true;

    out.push({
      rowNumber: out.length + 2,
      name: name,
      group: (memberGroupMap && memberGroupMap[name]) || '',
      slug: slug,
      url: url
    });
  });

  return out;
}

/**
 * 读取「总表」原始行
 */
function readRawMainRows_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var numCols = Math.max(3, Math.min(sh.getLastColumn(), 5));
  var values = sh.getRange(2, 1, lastRow - 1, numCols).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    out.push({
      name: values[i][0],
      keyword: values[i][1],
      template: values[i][2]
    });
  }
  return out;
}

/**
 * 读取「短链」表原始行
 */
function readRawShortLinks_(ss) {
  var sh = ss.getSheetByName(LINK_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return { sheet: sh, links: [] };
  var numCols = Math.max(3, Math.min(sh.getLastColumn(), 4));
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, numCols).getValues();
  var links = [];
  for (var i = 0; i < values.length; i++) {
    links.push({
      name: values[i][0],
      slug: values[i][1],
      url: values[i][2]
    });
  }
  return { sheet: sh, links: links };
}

/**
 * 写回「总表」，并清理第 2 行起的残留彩色底色
 */
function writeRowsToSheet_(sh, sortedRows) {
  var rows = sortedRows || [];
  sh.clearContents();
  if (sh.getMaxRows() > 1) {
    sh.getRange(2, 1, sh.getMaxRows() - 1, Math.max(3, sh.getMaxColumns())).setBackground(null);
  }
  var matrix = [HEADERS];
  for (var i = 0; i < rows.length; i++) {
    matrix.push([rows[i].name, rows[i].keyword, rows[i].template]);
  }
  sh.getRange(1, 1, matrix.length, 3).setValues(matrix);
  try { sh.setFrozenRows(1); } catch (e) {}
  return rows;
}

/**
 * 写回「短链」表
 */
function writeShortLinksToSheet_(sh, normalizedLinks) {
  var links = normalizedLinks || [];
  sh.clearContents();
  if (sh.getMaxRows() > 1) {
    sh.getRange(2, 1, sh.getMaxRows() - 1, Math.max(3, sh.getMaxColumns())).setBackground(null);
  }
  var matrix = [LINK_HEADERS];
  for (var i = 0; i < links.length; i++) {
    matrix.push([links[i].name, links[i].slug, links[i].url]);
  }
  sh.getRange(1, 1, matrix.length, 3).setValues(matrix);
  try { sh.setFrozenRows(1); } catch (e) {}
  return links;
}

/**
 * 同步「团队」表第 2 行的人数统计公式（=COUNTA(B3:B100)），并修正团队表内笔误姓名
 */
function syncTeamCountsFormulas_(teamSh, teams) {
  if (!teamSh || !teams || !teams.length) return;
  var maxRow = Math.max(teamSh.getLastRow(), 100);
  var lastCol = teamSh.getLastColumn();
  if (lastRowSafe_(teamSh) >= 3 && lastCol >= 2) {
    var memberRange = teamSh.getRange(3, 2, teamSh.getLastRow() - 2, lastCol - 1);
    var mVals = memberRange.getValues();
    var changed = false;
    for (var r = 0; r < mVals.length; r++) {
      for (var c = 0; c < mVals[r].length; c++) {
        var raw = String(mVals[r][c] == null ? '' : mVals[r][c]).trim();
        if (raw && PERSON_NAME_ALIAS[raw]) {
          mVals[r][c] = PERSON_NAME_ALIAS[raw];
          changed = true;
        }
      }
    }
    if (changed) {
      memberRange.setValues(mVals);
    }
  }
  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    var formula = '=COUNTA(' + t.colLetter + '3:' + t.colLetter + maxRow + ')';
    teamSh.getRange(2, t.colIndex).setFormula(formula);
  }
}

function lastRowSafe_(sh) {
  try { return sh.getLastRow(); } catch (e) { return 0; }
}

/**
 * 【核心清理函数】以「团队」表在册人员为白名单，彻底清理「总表」与「短链」中已不存在的人员，
 * 同时自动修正姓名/模板笔误、刷新「团队」人数公式并按标准顺序重排「总表」。
 */
function cleanAndSyncAllByTeam(overrideSpreadsheetId) {
  var ss = getSpreadsheet_(overrideSpreadsheetId);
  var teamsData = readTeamsData_(ss);
  if (!teamsData.sheet || teamsData.validCount < 1) {
    throw new Error('未从「团队」工作表读取到有效的在册成员名单，为保护数据安全已取消清理');
  }

  // 1. 更新团队表人数统计公式
  syncTeamCountsFormulas_(teamsData.sheet, teamsData.teams);

  // 2. 清理并重排「总表」
  var mainSh = ensureMainSheet_(ss, MAIN_SHEET_NAME);
  var rawMain = readRawMainRows_(mainSh);
  var removedMainNames = {};
  rawMain.forEach(function (r) {
    var nm = normalizePersonName_(r.name);
    if (nm && nm !== '姓名' && !teamsData.validSet[nm]) {
      removedMainNames[nm] = (removedMainNames[nm] || 0) + 1;
    }
  });
  var cleanedMain = sortRowsByTemplateOrder_(rawMain, teamsData.validSet, teamsData.memberGroupMap);
  writeRowsToSheet_(mainSh, cleanedMain);

  // 3. 清理「短链」表
  var rawLinksInfo = readRawShortLinks_(ss);
  var removedLinkNames = {};
  rawLinksInfo.links.forEach(function (l) {
    var nm = normalizePersonName_(l.name);
    if (nm && nm !== '姓名' && !teamsData.validSet[nm]) {
      removedLinkNames[nm] = (removedLinkNames[nm] || 0) + 1;
    }
  });
  var cleanedLinks = normalizeShortLinks_(rawLinksInfo.links, teamsData.validSet, teamsData.memberGroupMap);
  if (rawLinksInfo.sheet) {
    writeShortLinksToSheet_(rawLinksInfo.sheet, cleanedLinks);
  }

  var summary = {
    teamCount: teamsData.teams.length,
    validMembersCount: teamsData.validCount,
    mainBeforeCount: rawMain.filter(function (r) { return String(r.name || '').trim() || String(r.keyword || '').trim(); }).length,
    mainAfterCount: cleanedMain.length,
    removedMainNames: removedMainNames,
    linksBeforeCount: rawLinksInfo.links.filter(function (l) { return String(l.name || '').trim() || String(l.slug || '').trim(); }).length,
    linksAfterCount: cleanedLinks.length,
    removedLinkNames: removedLinkNames
  };

  Logger.log('清理同步完成: ' + JSON.stringify(summary));
  return {
    ss: ss,
    teamsData: teamsData,
    rows: cleanedMain,
    shortLinks: cleanedLinks,
    summary: summary
  };
}

/**
 * 表格菜单 & 自动编辑联动触发器
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🧹 暗号中心')
      .addItem('按「团队」表名单立即清理同步总表与短链', 'menuCleanAndSyncByTeam')
      .addItem('按标准分类顺序重排「总表」', 'menuSortMainSheet')
      .addToUi();
  } catch (e) {}
}

function menuCleanAndSyncByTeam() {
  var res = cleanAndSyncAllByTeam();
  SpreadsheetApp.getUi().alert(
    '同步清理完成！\n\n' +
    '• 当前「团队」在册成员：' + res.summary.validMembersCount + ' 人（' + res.summary.teamCount + ' 组）\n' +
    '• 「总表」保留：' + res.summary.mainAfterCount + ' 条（原 ' + res.summary.mainBeforeCount + ' 条）\n' +
    '• 「短链」保留：' + res.summary.linksAfterCount + ' 条（原 ' + res.summary.linksBeforeCount + ' 条）'
  );
}

function menuSortMainSheet() {
  var ss = getSpreadsheet_();
  var teamsData = readTeamsData_(ss);
  var mainSh = ensureMainSheet_(ss, MAIN_SHEET_NAME);
  var rawMain = readRawMainRows_(mainSh);
  var sorted = sortRowsByTemplateOrder_(rawMain, null, teamsData.memberGroupMap);
  writeRowsToSheet_(mainSh, sorted);
  SpreadsheetApp.getUi().alert('「总表」已按标准分类顺序重排，共 ' + sorted.length + ' 条。');
}

/**
 * 简单编辑触发器：当在「团队」表修改或删除成员时，自动将不在「团队」表的人员从「总表」和「短链」中清除
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (!sh) return;
    var name = sh.getName();
    if (name === TEAM_SHEET_NAME) {
      // 跳过第 2 行人数公式行，以免编辑人数行重复执行
      if (e.range.getRow() === 2 && e.range.getNumRows() === 1) return;
      cleanAndSyncAllByTeam();
    }
  } catch (err) {
    Logger.log('onEdit 自动联动异常: ' + err);
  }
}

function buildTemplatesMeta_(rows) {
  var map = {};
  var list = TEMPLATE_META.map(function (t) {
    var copy = {
      id: t.id,
      name: t.name,
      short: t.short,
      color: t.color,
      order: t.order,
      count: 0
    };
    map[t.name] = copy;
    return copy;
  });

  (rows || []).forEach(function (r) {
    if (!map[r.template]) {
      var custom = {
        id: 'tpl_' + list.length,
        name: r.template,
        short: String(r.template).slice(0, 1),
        color: '#6e56cf',
        order: list.length + 1,
        count: 0
      };
      map[r.template] = custom;
      list.push(custom);
    }
    map[r.template].count++;
  });
  return list;
}

function readAllSheetsSnapshot_(ss, preferredMainSheetName, autoSortMain) {
  var teamsData = readTeamsData_(ss);
  var mainSh = ensureMainSheet_(ss, preferredMainSheetName);
  var rawMain = readRawMainRows_(mainSh);
  var sortedMain = sortRowsByTemplateOrder_(
    rawMain,
    teamsData.validCount > 0 ? teamsData.validSet : null,
    teamsData.memberGroupMap
  );
  if (autoSortMain) {
    writeRowsToSheet_(mainSh, sortedMain);
  }

  var rawLinksInfo = readRawShortLinks_(ss);
  var normalizedLinks = normalizeShortLinks_(
    rawLinksInfo.links,
    teamsData.validCount > 0 ? teamsData.validSet : null,
    teamsData.memberGroupMap
  );

  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: mainSh.getName(),
    teams: teamsData.teams.map(function (t) {
      return { name: t.name, count: t.count, members: t.members };
    }),
    memberGroupMap: teamsData.memberGroupMap,
    rows: sortedMain,
    shortLinks: normalizedLinks,
    templates: buildTemplatesMeta_(sortedMain)
  };
}

function getSiteSettings_() {
  var raw = PropertiesService.getScriptProperties().getProperty('CH_BETA_SETTINGS');
  var def = {
    siteName: '暗号查询中心 Beta',
    subtitle: '支持按姓名、暗号关键词、短链或团队组别一站式查询，与在线表格实时同步',
    groups: ['慕杰组', '李俊鑫组', '潘立浩组', '娄慧珍组', '江峰组', '刘全泉组', '宋磊组'],
    feedback: {
      title: '问题反馈',
      desc: '查不到、关键词或短链有误、需要新增 —— 都可以直接留言告诉我们',
      enableForm: true
    },
    contacts: []
  };
  if (!raw) return def;
  try {
    var parsed = JSON.parse(raw);
    return Object.assign(def, parsed || {});
  } catch (e) {
    return def;
  }
}

function saveSiteSettings_(settings) {
  var cur = getSiteSettings_();
  var merged = Object.assign(cur, settings || {});
  PropertiesService.getScriptProperties().setProperty('CH_BETA_SETTINGS', JSON.stringify(merged));
  return merged;
}

function appendFeedback_(payload) {
  var ss = getSpreadsheet_(payload && payload.spreadsheetId);
  var sh = ss.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(FEEDBACK_SHEET_NAME);
    sh.getRange(1, 1, 1, 5).setValues([['时间', '称呼/姓名', '联系方式', '反馈内容', '状态']]);
    try { sh.setFrozenRows(1); } catch (e) {}
  }
  var now = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
  sh.appendRow([
    now,
    String((payload && payload.name) || '匿名').trim(),
    String((payload && payload.contact) || '').trim(),
    String((payload && payload.message) || '').trim(),
    'new'
  ]);
  return { ok: true, createdAt: now };
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(reqToken) {
  var savedToken = PropertiesService.getScriptProperties().getProperty('CH_ADMIN_TOKEN') || ADMIN_TOKEN;
  if (!savedToken) return true;
  return String(reqToken || '').trim() === String(savedToken).trim();
}

/**
 * GET 请求入口
 *   - ?action=bootstrap (默认)：拉取「团队 + 总表 + 短链」完整实时数据
 *   - ?action=ping：健康检查
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || 'bootstrap').toLowerCase();

    if (action === 'ping') {
      return jsonOut_({ ok: true, status: 'online', updatedAt: new Date().toISOString() });
    }

    var ss = getSpreadsheet_(params.spreadsheetId);
    var autoSort = params.autoSort === '1' || params.autoSort === 'true';
    var snap = readAllSheetsSnapshot_(ss, params.sheet, autoSort);

    return jsonOut_({
      ok: true,
      updatedAt: new Date().toISOString(),
      spreadsheetId: snap.spreadsheetId,
      spreadsheetName: snap.spreadsheetName,
      sheetName: snap.sheetName,
      headers: HEADERS,
      templateOrder: TEMPLATE_ORDER,
      templates: snap.templates,
      teams: snap.teams,
      memberGroupMap: snap.memberGroupMap,
      rows: snap.rows,
      shortLinks: snap.shortLinks,
      settings: getSiteSettings_()
    });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

/**
 * POST 请求入口（使用 text/plain JSON 避免 CORS 预检拦截）
 *   - CLEAN_BY_TEAM：按「团队」表名单清理云端「总表」与「短链」
 *   - SAVE_ROWS：全量保存「总表」
 *   - SAVE_SHORT_LINKS：全量保存「短链」
 *   - UPSERT_ROW / DELETE_ROW / SORT_SHEET / SAVE_SETTINGS / FEEDBACK
 */
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(raw);
    var action = String(body.action || '').toUpperCase();

    if (action === 'FEEDBACK') {
      return jsonOut_(appendFeedback_(body));
    }

    if (!checkToken_(body.token)) {
      return jsonOut_({ ok: false, error: '后台管理密钥（ADMIN_TOKEN）不正确' });
    }

    var ss = getSpreadsheet_(body.spreadsheetId);

    if (action === 'CLEAN_BY_TEAM') {
      var cleanRes = cleanAndSyncAllByTeam(body.spreadsheetId);
      return jsonOut_({
        ok: true,
        updatedAt: new Date().toISOString(),
        summary: cleanRes.summary,
        teams: cleanRes.teamsData.teams.map(function (t) {
          return { name: t.name, count: t.count, members: t.members };
        }),
        memberGroupMap: cleanRes.teamsData.memberGroupMap,
        rows: cleanRes.rows,
        shortLinks: cleanRes.shortLinks,
        templates: buildTemplatesMeta_(cleanRes.rows),
        settings: getSiteSettings_()
      });
    }

    var sh = ensureMainSheet_(ss, body.sheetName);
    var teamsData = readTeamsData_(ss);
    var validSet = teamsData.validCount > 0 ? teamsData.validSet : null;

    if (action === 'SAVE_ROWS') {
      var incoming = Array.isArray(body.rows) ? body.rows : [];
      var sorted = sortRowsByTemplateOrder_(incoming, validSet, teamsData.memberGroupMap);
      writeRowsToSheet_(sh, sorted);
      if (Array.isArray(body.shortLinks)) {
        var linkSh = ensureLinkSheet_(ss);
        var cleanLinks = normalizeShortLinks_(body.shortLinks, validSet, teamsData.memberGroupMap);
        writeShortLinksToSheet_(linkSh, cleanLinks);
      }
      if (body.settings) saveSiteSettings_(body.settings);
      var afterSaveSnap = readAllSheetsSnapshot_(ss, body.sheetName, false);
      return jsonOut_({
        ok: true,
        updatedAt: new Date().toISOString(),
        sheetName: afterSaveSnap.sheetName,
        total: afterSaveSnap.rows.length,
        teams: afterSaveSnap.teams,
        memberGroupMap: afterSaveSnap.memberGroupMap,
        rows: afterSaveSnap.rows,
        shortLinks: afterSaveSnap.shortLinks,
        templates: afterSaveSnap.templates
      });
    }

    if (action === 'SAVE_SHORT_LINKS') {
      var linkSheet = ensureLinkSheet_(ss);
      var incomingLinks = Array.isArray(body.shortLinks) ? body.shortLinks : [];
      var savedLinks = normalizeShortLinks_(incomingLinks, validSet, teamsData.memberGroupMap);
      writeShortLinksToSheet_(linkSheet, savedLinks);
      return jsonOut_({
        ok: true,
        updatedAt: new Date().toISOString(),
        shortLinks: savedLinks
      });
    }

    if (action === 'SORT_SHEET') {
      var snapSorted = readAllSheetsSnapshot_(ss, body.sheetName, true);
      return jsonOut_({
        ok: true,
        updatedAt: new Date().toISOString(),
        sheetName: snapSorted.sheetName,
        total: snapSorted.rows.length,
        teams: snapSorted.teams,
        memberGroupMap: snapSorted.memberGroupMap,
        rows: snapSorted.rows,
        shortLinks: snapSorted.shortLinks,
        templates: snapSorted.templates
      });
    }

    if (action === 'UPSERT_ROW') {
      var curRaw = readRawMainRows_(sh);
      var curSorted = sortRowsByTemplateOrder_(curRaw, validSet, teamsData.memberGroupMap);
      var rowObj = body.row || {};
      var targetIdx = typeof body.rowIndex === 'number' ? body.rowIndex : -1;
      var cleanRow = {
        name: normalizePersonName_(rowObj.name || ''),
        keyword: String(rowObj.keyword || '').trim(),
        template: normalizeTemplateName_(rowObj.template || '番号')
      };
      if (!cleanRow.name || !cleanRow.keyword) {
        return jsonOut_({ ok: false, error: '姓名和关键词不能为空' });
      }
      if (targetIdx >= 0 && targetIdx < curSorted.length) {
        curSorted[targetIdx] = cleanRow;
      } else {
        curSorted.push(cleanRow);
      }
      var afterUpsert = sortRowsByTemplateOrder_(curSorted, validSet, teamsData.memberGroupMap);
      writeRowsToSheet_(sh, afterUpsert);
      return jsonOut_({
        ok: true,
        updatedAt: new Date().toISOString(),
        total: afterUpsert.length,
        rows: afterUpsert
      });
    }

    if (action === 'DELETE_ROW') {
      var delList = sortRowsByTemplateOrder_(readRawMainRows_(sh), validSet, teamsData.memberGroupMap);
      var delIdx = typeof body.rowIndex === 'number' ? body.rowIndex : -1;
      if (delIdx >= 0 && delIdx < delList.length) {
        delList.splice(delIdx, 1);
      }
      var afterDel = sortRowsByTemplateOrder_(delList, validSet, teamsData.memberGroupMap);
      writeRowsToSheet_(sh, afterDel);
      return jsonOut_({
        ok: true,
        updatedAt: new Date().toISOString(),
        total: afterDel.length,
        rows: afterDel
      });
    }

    if (action === 'SAVE_SETTINGS') {
      var s = saveSiteSettings_(body.settings || {});
      return jsonOut_({ ok: true, settings: s, updatedAt: new Date().toISOString() });
    }

    return jsonOut_({ ok: false, error: '未知操作 action: ' + action });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}
