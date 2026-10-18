'use strict';
/**
 * 极简 JSON 数据存储（零第三方依赖）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

let db = null;
let writeTimer = null;
let dirty = false;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function defaultDb() {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    version: 1,
    settings: {
      siteName: '暗号查询中心',
      subtitle: '输入姓名或暗号，秒查全平台归属',
      adminUser: 'admin',
      adminSalt: salt,
      adminPassHash: hashPassword('admin123', salt),
      updatedAt: '',
      logos: ['/assets/Laya.png', '/assets/Laya2.png'],
      feedback: {
        title: '问题反馈',
        desc: '查不到暗号、信息有误、需要新增成员？把问题丢给我们，管理员会尽快处理。',
        enableForm: true,
      },
      contacts: [],
    },
    platforms: [
      { id: 'threads', name: 'Threads', color: '#6e56cf', icon: 'threads', order: 1 },
      { id: 'instagram', name: 'Instagram', color: '#e1306c', icon: 'instagram', order: 2 },
      { id: 'tiktok', name: 'TikTok', color: '#00c8b4', icon: 'tiktok', order: 3 },
      { id: 'x', name: 'X', color: '#8b93a7', icon: 'x', order: 4 },
      { id: 'facebook', name: 'Facebook', color: '#1877f2', icon: 'facebook', order: 5 },
      { id: 'video', name: '视频', color: '#ff7a59', icon: 'video', order: 6 },
      { id: 'link', name: '短链', color: '#3ea6ff', icon: 'link', order: 7 },
      { id: 'image', name: '图文', color: '#ffb020', icon: 'image', order: 8 },
    ],
    groups: [],
    people: [],
    entries: [],
    feedbacks: [],
  };
}

function load() {
  ensureDirs();
  if (db) return db;
  if (fs.existsSync(FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      const bak = FILE + '.corrupt.' + Date.now();
      fs.copyFileSync(FILE, bak);
      db = defaultDb();
    }
  } else {
    db = defaultDb();
    saveNow();
  }
  db.platforms = db.platforms || [];
  db.groups = db.groups || [];
  db.people = db.people || [];
  db.entries = db.entries || [];
  db.feedbacks = db.feedbacks || [];
  db.settings = db.settings || defaultDb().settings;
  if (!Array.isArray(db.settings.logos) || !db.settings.logos.length) {
    db.settings.logos = ['/assets/Laya.png', '/assets/Laya2.png'];
  }
  if (!db.settings.feedback) db.settings.feedback = { title: '问题反馈', desc: '', enableForm: true };
  if (!Array.isArray(db.settings.contacts)) db.settings.contacts = [];
  return db;
}

function saveNow() {
  ensureDirs();
  db.settings.updatedAt = new Date().toISOString();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), 'utf8');
  fs.renameSync(tmp, FILE);
  dirty = false;
}

function save() {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (dirty) saveNow();
  }, 200);
}

function hashPassword(pwd, salt) {
  return crypto.createHash('sha256').update(String(salt) + String(pwd)).digest('hex');
}

function verifyPassword(pwd) {
  const s = db.settings;
  return hashPassword(pwd, s.adminSalt) === s.adminPassHash;
}

function setPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.settings.adminSalt = salt;
  db.settings.adminPassHash = hashPassword(pwd, salt);
  save();
}

function nextId(arr) {
  let max = 0;
  for (const it of arr) if (typeof it.id === 'number' && it.id > max) max = it.id;
  return max + 1;
}

function slugId(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'p';
  return base + '-' + Math.random().toString(36).slice(2, 6);
}

/* ---------------- 查询 ---------------- */

function platformMap() {
  const m = {};
  for (const p of db.platforms) m[p.id] = p;
  return m;
}

function personMap() {
  const m = {};
  for (const p of db.people) m[p.id] = p;
  return m;
}

function entriesOfPerson(personId) {
  return db.entries.filter((e) => e.personId === personId);
}

function decorate(e) {
  const pm = platformMap();
  const pe = personMap();
  return Object.assign({}, e, {
    platform: pm[e.platformId] || null,
    person: pe[e.personId] || null,
  });
}

/**
 * 搜索：同时匹配姓名与暗号/短链值
 */
function search(opt) {
  const q = String(opt.q || '').trim().toLowerCase();
  const platform = opt.platform || '';
  const group = opt.group || '';
  const kind = opt.kind || '';
  const peopleLimit = opt.peopleLimit || 50;
  const entryLimit = opt.entryLimit || 200;

  const pmap = personMap();
  const result = { people: [], entries: [], peopleTotal: 0, entriesTotal: 0 };

  const groupOk = (p) => !group || (p && String(p.group || '').includes(group));

  if (!q) {
    let list = db.people.slice();
    if (group) list = list.filter(groupOk);
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
    result.peopleTotal = list.length;
    result.people = list.slice(0, peopleLimit).map((p) => withEntries(p));
    return result;
  }

  // 姓名匹配
  const nameHits = db.people.filter(
    (p) => String(p.name || '').toLowerCase().includes(q) && groupOk(p)
  );
  nameHits.sort((a, b) => {
    const ae = String(a.name) === q ? 0 : String(a.name).indexOf(q);
    const be = String(b.name) === q ? 0 : String(b.name).indexOf(q);
    if (ae !== be) return ae - be;
    return String(a.name).localeCompare(String(b.name), 'zh');
  });

  // 暗号/短链匹配（先精确后模糊）
  let ehits = db.entries.filter((e) => {
    if (platform && e.platformId !== platform) return false;
    if (kind && e.kind !== kind) return false;
    if (group) {
      const p = pmap[e.personId];
      if (!groupOk(p)) return false;
    }
    return String(e.value || '').toLowerCase().includes(q);
  });
  ehits.sort((a, b) => {
    const av = String(a.value || '').toLowerCase();
    const bv = String(b.value || '').toLowerCase();
    const ax = av === q ? 0 : 1;
    const bx = bv === q ? 0 : 1;
    if (ax !== bx) return ax - bx;
    if (av.length !== bv.length) return av.length - bv.length;
    return av.localeCompare(bv);
  });

  // 若命中暗号，则把对应人员也纳入"匹配人员"
  const personIds = new Set(nameHits.map((p) => p.id));
  for (const e of ehits) if (e.personId) personIds.add(e.personId);

  const allPeople = db.people.filter((p) => personIds.has(p.id));
  result.peopleTotal = allPeople.length;
  result.entriesTotal = ehits.length;

  result.people = allPeople
    .slice(0, peopleLimit)
    .map((p) => withEntries(p, platform, kind, q));
  result.entries = ehits.slice(0, entryLimit).map(decorate);
  result.matchedPeople = nameHits.length;
  return result;
}

function withEntries(person, platform, kind, hl) {
  let list = entriesOfPerson(person.id);
  if (platform) list = list.filter((e) => e.platformId === platform);
  if (kind) list = list.filter((e) => e.kind === kind);
  const pmap = platformMap();
  list.sort((a, b) => {
    const pa = pmap[a.platformId], pb = pmap[b.platformId];
    const oa = pa ? pa.order || 99 : 99, ob = pb ? pb.order || 99 : 99;
    if (oa !== ob) return oa - ob;
    return String(a.value).localeCompare(String(b.value));
  });
  return {
    id: person.id,
    name: person.name,
    group: person.group,
    note: person.note,
    highlight: hl || '',
    entries: list.map(decorate),
  };
}

function getPerson(id) {
  const p = db.people.find((x) => x.id === Number(id));
  if (!p) return null;
  return withEntries(p);
}

function suggest(q, limit) {
  const key = String(q || '').trim().toLowerCase();
  const n = limit || 8;
  const people = [];
  const codes = [];
  if (!key) return { people, codes };
  for (const p of db.people) {
    if (String(p.name).toLowerCase().includes(key)) {
      people.push({ id: p.id, name: p.name, group: p.group });
      if (people.length >= n) break;
    }
  }
  const seen = new Set();
  for (const e of db.entries) {
    const v = String(e.value || '').toLowerCase();
    if (v.includes(key) && !seen.has(e.value)) {
      seen.add(e.value);
      const pm = platformMap()[e.platformId];
      codes.push({ value: e.value, kind: e.kind, platform: pm ? pm.name : '' });
      if (codes.length >= n) break;
    }
  }
  return { people, codes };
}

/* 脱敏：仅用于前台随机展示，避免直接暴露完整名单 */
function maskName(n) {
  const s = String(n || '');
  if (!s) return '—';
  if (s.length <= 1) return s + '*';
  return s[0] + '*'.repeat(s.length - 1);
}

function maskValue(v, kind) {
  const s = String(v || '');
  if (!s) return '';
  if (kind === 'link') {
    const seg = s.split('-');
    if (seg.length >= 3) return seg[0] + '-•••-' + seg[seg.length - 1];
    if (seg.length === 2) return seg[0] + '-•••';
    return s.slice(0, 3) + '•••';
  }
  if (s.length <= 3) return s[0] + '•'.repeat(Math.max(s.length - 1, 1));
  const head = s.slice(0, 2);
  const tail = s.slice(-1);
  const mid = Math.min(s.length - 3, 4);
  return head + '•'.repeat(mid) + tail;
}

/* ---------------- 反馈 ---------------- */

function addFeedback(data) {
  const message = String(data.message || '').trim();
  if (!message) throw new Error('请填写反馈内容');
  if (message.length > 1000) throw new Error('反馈内容过长（最多 1000 字）');
  const f = {
    id: nextId(db.feedbacks),
    name: String(data.name || '').trim().slice(0, 40),
    contact: String(data.contact || '').trim().slice(0, 80),
    message,
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  db.feedbacks.unshift(f);
  if (db.feedbacks.length > 2000) db.feedbacks.length = 2000;
  save();
  return f;
}

function listFeedbacks(status) {
  let list = db.feedbacks.slice();
  if (status && status !== 'all') list = list.filter((f) => f.status === status);
  return list;
}

function setFeedbackStatus(id, status) {
  const f = db.feedbacks.find((x) => x.id === Number(id));
  if (!f) throw new Error('反馈不存在');
  f.status = status === 'done' ? 'done' : 'new';
  save();
  return f;
}

function deleteFeedback(id) {
  const i = db.feedbacks.findIndex((x) => x.id === Number(id));
  if (i < 0) throw new Error('反馈不存在');
  db.feedbacks.splice(i, 1);
  save();
  return true;
}

function feedbackStats() {
  return {
    total: db.feedbacks.length,
    new: db.feedbacks.filter((f) => f.status !== 'done').length,
  };
}

/**
 * 随机抽样（已脱敏），用于前台速览
 */
function samples(opt) {
  opt = opt || {};
  const n = Math.min(Math.max(Number(opt.n) || 14, 1), 60);
  const pm = platformMap();
  const pe = personMap();
  let pool = db.entries.slice();
  if (opt.platform) pool = pool.filter((e) => e.platformId === opt.platform);
  if (opt.group) {
    pool = pool.filter((e) => {
      const p = pe[e.personId];
      return p && String(p.group || '').includes(opt.group);
    });
  }
  // Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const items = pool.slice(0, n).map((e) => {
    const p = pm[e.platformId] || {};
    const per = pe[e.personId];
    return {
      platformId: e.platformId,
      platformName: p.name || e.platformId,
      color: p.color || '#7c5cff',
      kind: e.kind,
      type: e.type || '',
      maskedValue: maskValue(e.value, e.kind),
      maskedName: per ? maskName(per.name) : '—',
      group: per ? (per.group || '') : '',
    };
  });
  // 搜索框占位提示候选（真实值，可直接输入查询）
  const codes = [], links = [], seen = {};
  for (const e of pool) {
    if (seen[e.value]) continue;
    if (e.kind === 'code' && codes.length < 6) { seen[e.value] = 1; codes.push(e.value); }
    else if (e.kind === 'link' && links.length < 3) { seen[e.value] = 1; links.push(e.value); }
  }
  return { items, codes, links, groups: db.groups.slice(), total: pool.length };
}

function stats() {
  const counts = {};
  for (const p of db.platforms) counts[p.id] = 0;
  for (const e of db.entries) {
    if (counts[e.platformId] === undefined) counts[e.platformId] = 0;
    counts[e.platformId]++;
  }
  return {
    people: db.people.length,
    entries: db.entries.length,
    platforms: db.platforms.length,
    byPlatform: counts,
    feedbackTotal: db.feedbacks.length,
    feedbackNew: db.feedbacks.filter((f) => f.status !== 'done').length,
    updatedAt: db.settings.updatedAt,
  };
}

/* ---------------- 写入 ---------------- */

function addPerson(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('姓名不能为空');
  if (db.people.some((p) => p.name === name)) throw new Error('已存在同名成员：' + name);
  const p = {
    id: nextId(db.people),
    name,
    group: String(data.group || '').trim(),
    note: String(data.note || '').trim(),
  };
  db.people.push(p);
  if (p.group && !db.groups.includes(p.group)) db.groups.push(p.group);
  save();
  return p;
}

function updatePerson(id, data) {
  const p = db.people.find((x) => x.id === Number(id));
  if (!p) throw new Error('成员不存在');
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new Error('姓名不能为空');
    if (db.people.some((x) => x.name === name && x.id !== p.id)) throw new Error('已存在同名成员');
    p.name = name;
  }
  if (data.group !== undefined) {
    p.group = String(data.group).trim();
    if (p.group && !db.groups.includes(p.group)) db.groups.push(p.group);
  }
  if (data.note !== undefined) p.note = String(data.note).trim();
  save();
  return p;
}

function deletePerson(id) {
  const i = db.people.findIndex((x) => x.id === Number(id));
  if (i < 0) throw new Error('成员不存在');
  const [p] = db.people.splice(i, 1);
  db.entries = db.entries.filter((e) => e.personId !== p.id);
  save();
  return { removedEntries: true };
}

function validPlatform(pid) {
  return db.platforms.some((p) => p.id === pid);
}

function addEntry(data) {
  const personId = Number(data.personId);
  if (!db.people.some((p) => p.id === personId)) throw new Error('请选择成员');
  if (!validPlatform(data.platformId)) throw new Error('请选择平台');
  const value = String(data.value || '').trim();
  if (!value) throw new Error('暗号/短链不能为空');
  const e = {
    id: nextId(db.entries),
    personId,
    platformId: data.platformId,
    kind: data.kind === 'link' ? 'link' : 'code',
    value,
    type: String(data.type || '').trim(),
    url: String(data.url || '').trim(),
    note: String(data.note || '').trim(),
  };
  db.entries.push(e);
  save();
  return e;
}

function updateEntry(id, data) {
  const e = db.entries.find((x) => x.id === Number(id));
  if (!e) throw new Error('记录不存在');
  if (data.personId !== undefined) {
    if (!db.people.some((p) => p.id === Number(data.personId))) throw new Error('请选择成员');
    e.personId = Number(data.personId);
  }
  if (data.platformId !== undefined) {
    if (!validPlatform(data.platformId)) throw new Error('请选择平台');
    e.platformId = data.platformId;
  }
  if (data.kind !== undefined) e.kind = data.kind === 'link' ? 'link' : 'code';
  if (data.value !== undefined) {
    const v = String(data.value).trim();
    if (!v) throw new Error('暗号/短链不能为空');
    e.value = v;
  }
  if (data.type !== undefined) e.type = String(data.type).trim();
  if (data.url !== undefined) e.url = String(data.url).trim();
  if (data.note !== undefined) e.note = String(data.note).trim();
  save();
  return e;
}

function deleteEntry(id) {
  const i = db.entries.findIndex((x) => x.id === Number(id));
  if (i < 0) throw new Error('记录不存在');
  db.entries.splice(i, 1);
  save();
  return true;
}

/**
 * 批量添加：文本每行一条
 * 格式：姓名 暗号 [平台] [类型]
 */
function bulkAdd(text, defaults) {
  const lines = String(text || '').split(/\r?\n/);
  const pm = platformMap();
  const platformByName = {};
  for (const p of db.platforms) platformByName[p.name.toLowerCase()] = p.id;
  const alias = {
    threads: 'threads', thareads: 'threads', thresds: 'threads',
    ins: 'instagram', instagram: 'instagram', ig: 'instagram',
    tik: 'tiktok', tiktok: 'tiktok', tk: 'tiktok',
    x: 'x', twitter: 'x',
    fb: 'facebook', facebook: 'facebook',
    视频: 'video', video: 'video', sp: 'video',
    短链: 'link', link: 'link', url: 'link',
    图文: 'image', image: 'image', tw: 'image',
  };
  const created = { people: 0, entries: 0 };
  const errors = [];
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/[\t,，\s]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`第 ${idx + 1} 行格式错误：${line}`);
      return;
    }
    const name = parts[0];
    const value = parts[1];
    let pid = defaults && defaults.platformId ? defaults.platformId : '';
    let type = (defaults && defaults.type) || '';
    if (parts[2]) {
      const key = String(parts[2]).toLowerCase();
      pid = alias[key] || platformByName[key] || pid;
      if (!alias[key] && !platformByName[key]) type = type || parts[2];
    }
    if (parts[3]) type = parts[3];
    let url = '';
    if (parts[4]) url = parts[4];
    if (!pid) {
      errors.push(`第 ${idx + 1} 行缺少平台：${line}`);
      return;
    }
    let person = db.people.find((p) => p.name === name);
    if (!person) {
      person = {
        id: nextId(db.people),
        name,
        group: (defaults && defaults.group) || '',
        note: '',
      };
      db.people.push(person);
      created.people++;
    }
    db.entries.push({
      id: nextId(db.entries),
      personId: person.id,
      platformId: pid,
      kind: pid === 'link' ? 'link' : 'code',
      value,
      type,
      url,
      note: '',
    });
    created.entries++;
  });
  save();
  return { created, errors };
}

function listEntries(opt) {
  const { q, platformId, personId, kind, group } = opt || {};
  const pmap = personMap();
  let list = db.entries.slice();
  if (platformId) list = list.filter((e) => e.platformId === platformId);
  if (personId) list = list.filter((e) => e.personId === Number(personId));
  if (kind) list = list.filter((e) => e.kind === kind);
  if (group) list = list.filter((e) => {
    const p = pmap[e.personId];
    return p && String(p.group || '').includes(group);
  });
  if (q) {
    const k = String(q).toLowerCase();
    list = list.filter((e) => {
      const p = pmap[e.personId];
      return (
        String(e.value).toLowerCase().includes(k) ||
        (p && String(p.name).toLowerCase().includes(k))
      );
    });
  }
  list.sort((a, b) => b.id - a.id);
  return list.map(decorate);
}

function listPeople(opt) {
  const { q, group } = opt || {};
  let list = db.people.slice();
  if (group) list = list.filter((p) => String(p.group || '').includes(group));
  if (q) {
    const k = String(q).toLowerCase();
    list = list.filter((p) => String(p.name).toLowerCase().includes(k));
  }
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
  return list.map((p) => {
    const es = entriesOfPerson(p.id);
    return Object.assign({}, p, { count: es.length });
  });
}

function upsertPlatform(p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('平台名称不能为空');
  const id = String(p.id || slugId(name)).trim();
  const exist = db.platforms.find((x) => x.id === id);
  if (exist) {
    exist.name = name;
    if (p.color) exist.color = p.color;
    if (p.icon) exist.icon = p.icon;
    if (p.order !== undefined) exist.order = Number(p.order);
  } else {
    db.platforms.push({
      id,
      name,
      color: p.color || '#7c5cff',
      icon: p.icon || 'dot',
      order: p.order !== undefined ? Number(p.order) : db.platforms.length + 1,
    });
  }
  save();
  return db.platforms.find((x) => x.id === id);
}

function deletePlatform(id) {
  const cnt = db.entries.filter((e) => e.platformId === id).length;
  if (cnt > 0) throw new Error(`该平台下还有 ${cnt} 条记录，请先转移或删除`);
  db.platforms = db.platforms.filter((p) => p.id !== id);
  save();
  return true;
}

function replaceAll(newDb) {
  if (!newDb || !Array.isArray(newDb.people) || !Array.isArray(newDb.entries)) {
    throw new Error('数据格式不正确');
  }
  backup();
  db.platforms = Array.isArray(newDb.platforms) && newDb.platforms.length ? newDb.platforms : db.platforms;
  db.groups = Array.isArray(newDb.groups) ? newDb.groups : [];
  db.people = newDb.people;
  db.entries = newDb.entries;
  saveNow();
  return true;
}

function backup() {
  ensureDirs();
  if (!fs.existsSync(FILE)) return null;
  const name = 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.copyFileSync(FILE, path.join(BACKUP_DIR, name));
  return name;
}

module.exports = {
  load,
  save,
  saveNow,
  get db() { return db; },
  hashPassword,
  verifyPassword,
  setPassword,
  search,
  suggest,
  samples,
  stats,
  getPerson,
  addPerson,
  updatePerson,
  deletePerson,
  addEntry,
  updateEntry,
  deleteEntry,
  bulkAdd,
  listEntries,
  listPeople,
  upsertPlatform,
  deletePlatform,
  replaceAll,
  backup,
  nextId,
  addFeedback,
  listFeedbacks,
  setFeedbackStatus,
  deleteFeedback,
  feedbackStats,
};
