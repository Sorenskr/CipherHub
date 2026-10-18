/**
 * 静态版数据垫片（GitHub Pages / 纯静态托管时使用）
 *
 * 在根目录 index.html 中，本文件会在 app.js 之前执行：
 * 它把 window.__DATA__ 作为数据源，拦截 /api/* 的 fetch 请求，
 * 让原本依赖服务端的 app.js 无需任何改动即可离线运行。
 */
(function () {
  'use strict';

  var DATA = window.__DATA__ || {};
  var PLATFORMS = DATA.platforms || [];
  var PEOPLE = DATA.people || [];
  var ENTRIES = DATA.entries || [];
  var GROUPS = DATA.groups || [];
  var SETTINGS = DATA.settings || {};

  var PM = {}, PEM = {};
  PLATFORMS.forEach(function (p) { PM[p.id] = p; });
  PEOPLE.forEach(function (p) { PEM[p.id] = p; });

  function fixAsset(u) {
    return String(u || '').replace(/^\/?assets\//, 'assets/');
  }

  function maskName(n) {
    var s = String(n || '');
    if (!s) return '—';
    if (s.length <= 1) return s + '*';
    return s[0] + new Array(s.length).join('*');
  }

  function maskValue(v, kind) {
    var s = String(v || '');
    if (!s) return '';
    if (kind === 'link') {
      var seg = s.split('-');
      if (seg.length >= 3) return seg[0] + '-•••-' + seg[seg.length - 1];
      if (seg.length === 2) return seg[0] + '-•••';
      return s.slice(0, 3) + '•••';
    }
    if (s.length <= 3) return s[0] + new Array(Math.max(s.length, 2)).join('•');
    var head = s.slice(0, 2), tail = s.slice(-1);
    var mid = Math.min(s.length - 3, 4);
    return head + new Array(mid + 1).join('•') + tail;
  }

  function decorate(e) {
    var out = {}, k;
    for (k in e) if (Object.prototype.hasOwnProperty.call(e, k)) out[k] = e[k];
    out.platform = PM[e.platformId] || null;
    out.person = PEM[e.personId] || null;
    return out;
  }

  function byName(a, b) {
    return String(a.name).localeCompare(String(b.name), 'zh');
  }

  function withEntries(person, platform, kind) {
    var list = ENTRIES.filter(function (e) {
      if (e.personId !== person.id) return false;
      if (platform && e.platformId !== platform) return false;
      if (kind && e.kind !== kind) return false;
      return true;
    });
    list.sort(function (a, b) {
      var pa = PM[a.platformId], pb = PM[b.platformId];
      var oa = pa ? (pa.order || 99) : 99, ob = pb ? (pb.order || 99) : 99;
      if (oa !== ob) return oa - ob;
      return String(a.value).localeCompare(String(b.value));
    });
    return {
      id: person.id,
      name: person.name,
      group: person.group,
      note: person.note,
      entries: list.map(decorate),
    };
  }

  function stats() {
    var counts = {}, byP = {};
    PLATFORMS.forEach(function (p) { counts[p.id] = 0; });
    ENTRIES.forEach(function (e) {
      if (counts[e.platformId] === undefined) counts[e.platformId] = 0;
      counts[e.platformId]++;
    });
    var fbs = [];
    try { fbs = JSON.parse(localStorage.getItem('ch_feedbacks') || '[]'); } catch (x) { fbs = []; }
    return {
      people: PEOPLE.length,
      entries: ENTRIES.length,
      platforms: PLATFORMS.length,
      byPlatform: counts,
      feedbackTotal: fbs.length,
      feedbackNew: fbs.filter(function (f) { return f.status !== 'done'; }).length,
      updatedAt: SETTINGS.updatedAt || '',
    };
  }

  function search(opt) {
    var q = String(opt.q || '').trim().toLowerCase();
    var platform = opt.platform || '', group = opt.group || '';
    var peopleLimit = opt.peopleLimit || 50, entryLimit = opt.entryLimit || 300;
    var res = { people: [], entries: [], peopleTotal: 0, entriesTotal: 0 };

    var groupOk = function (p) { return !group || (p && String(p.group || '').indexOf(group) >= 0); };

    if (!q) {
      var all = PEOPLE.filter(groupOk).sort(byName);
      res.peopleTotal = all.length;
      res.people = all.slice(0, peopleLimit).map(function (p) { return withEntries(p); });
      return res;
    }

    var nameHits = PEOPLE.filter(function (p) {
      return String(p.name || '').toLowerCase().indexOf(q) >= 0 && groupOk(p);
    });
    nameHits.sort(function (a, b) {
      var ae = String(a.name).toLowerCase() === q ? 0 : String(a.name).toLowerCase().indexOf(q);
      var be = String(b.name).toLowerCase() === q ? 0 : String(b.name).toLowerCase().indexOf(q);
      if (ae !== be) return ae - be;
      return byName(a, b);
    });

    var ehits = ENTRIES.filter(function (e) {
      if (platform && e.platformId !== platform) return false;
      if (String(e.value || '').toLowerCase().indexOf(q) < 0) return false;
      if (group) { var p = PEM[e.personId]; if (!groupOk(p)) return false; }
      return true;
    });
    ehits.sort(function (a, b) {
      var av = String(a.value || '').toLowerCase(), bv = String(b.value || '').toLowerCase();
      var ax = av === q ? 0 : 1, bx = bv === q ? 0 : 1;
      if (ax !== bx) return ax - bx;
      if (av.length !== bv.length) return av.length - bv.length;
      return av.localeCompare(bv);
    });

    var ids = {};
    nameHits.forEach(function (p) { ids[p.id] = 1; });
    ehits.forEach(function (e) { if (e.personId) ids[e.personId] = 1; });
    var allPeople = PEOPLE.filter(function (p) { return ids[p.id]; });

    res.peopleTotal = allPeople.length;
    res.entriesTotal = ehits.length;
    res.people = allPeople.slice(0, peopleLimit).map(function (p) { return withEntries(p, platform, ''); });
    res.entries = ehits.slice(0, entryLimit).map(decorate);
    res.matchedPeople = nameHits.length;
    return res;
  }

  function suggest(q, limit) {
    var key = String(q || '').trim().toLowerCase();
    var n = limit || 8, people = [], codes = [], seen = {};
    if (!key) return { people: people, codes: codes };
    PEOPLE.forEach(function (p) {
      if (people.length >= n) return;
      if (String(p.name).toLowerCase().indexOf(key) >= 0) {
        people.push({ id: p.id, name: p.name, group: p.group });
      }
    });
    ENTRIES.forEach(function (e) {
      if (codes.length >= n) return;
      var v = String(e.value || '').toLowerCase();
      if (v.indexOf(key) >= 0 && !seen[e.value]) {
        seen[e.value] = 1;
        codes.push({ value: e.value, kind: e.kind, platform: PM[e.platformId] ? PM[e.platformId].name : '' });
      }
    });
    return { people: people, codes: codes };
  }

  function samples(opt) {
    opt = opt || {};
    var n = Math.min(Math.max(Number(opt.n) || 14, 1), 60);
    var pool = ENTRIES.slice();
    if (opt.platform) pool = pool.filter(function (e) { return e.platformId === opt.platform; });
    if (opt.group) {
      pool = pool.filter(function (e) {
        var p = PEM[e.personId];
        return p && String(p.group || '').indexOf(opt.group) >= 0;
      });
    }
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var items = pool.slice(0, n).map(function (e) {
      var p = PM[e.platformId] || {}, per = PEM[e.personId];
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
    var codes = [], links = [], seen = {};
    pool.forEach(function (e) {
      if (seen[e.value]) return;
      if (e.kind === 'code' && codes.length < 6) { seen[e.value] = 1; codes.push(e.value); }
      else if (e.kind === 'link' && links.length < 3) { seen[e.value] = 1; links.push(e.value); }
    });
    return { items: items, codes: codes, links: links, groups: GROUPS.slice(), total: pool.length };
  }

  function bootstrap() {
    return {
      settings: {
        siteName: SETTINGS.siteName || '暗号查询中心',
        subtitle: SETTINGS.subtitle || '',
        logos: (SETTINGS.logos || []).map(fixAsset),
        feedback: SETTINGS.feedback || { title: '问题反馈', desc: '', enableForm: true },
        contacts: SETTINGS.contacts || [],
      },
      platforms: PLATFORMS.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); }),
      groups: GROUPS.slice(),
      stats: stats(),
    };
  }

  function parseQuery(url) {
    var i = url.indexOf('?');
    var out = {};
    if (i < 0) return out;
    url.slice(i + 1).split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      out[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    return out;
  }

  function respond(data) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: function () { return null; } },
      json: function () { return Promise.resolve(JSON.parse(JSON.stringify(data))); },
      text: function () { return Promise.resolve(JSON.stringify(data)); },
    });
  }

  window.__STATIC_MODE__ = true;

  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, opt) {
    url = String(url || '');
    var m = url.match(/(?:^|\/)api\/([^?]*)/);
    if (!m) {
      if (origFetch) return origFetch(url, opt);
      return Promise.reject(new Error('no fetch'));
    }
    var name = m[1];
    var qs = parseQuery(url);

    if (name === 'bootstrap') return respond(bootstrap());
    if (name === 'stats') return respond(stats());
    if (name === 'search') {
      return respond(search({
        q: qs.q || '',
        platform: qs.platform || '',
        group: qs.group || '',
        peopleLimit: Number(qs.peopleLimit || 50),
        entryLimit: Number(qs.entryLimit || 300),
      }));
    }
    if (name === 'suggest') return respond(suggest(qs.q || '', 8));
    if (name === 'samples') {
      return respond(samples({ platform: qs.platform || '', group: qs.group || '', n: Number(qs.n || 14) }));
    }
    if (name === 'feedback') {
      var body = {};
      try { body = JSON.parse((opt && opt.body) || '{}'); } catch (e) { body = {}; }
      if (!String(body.message || '').trim()) {
        return Promise.resolve({
          ok: false, status: 400,
          json: function () { return Promise.resolve({ error: '请填写反馈内容' }); },
        });
      }
      var list = [];
      try { list = JSON.parse(localStorage.getItem('ch_feedbacks') || '[]'); } catch (e) { list = []; }
      list.unshift({
        id: Date.now(),
        name: body.name || '',
        contact: body.contact || '',
        message: String(body.message).slice(0, 1000),
        status: 'new',
        createdAt: new Date().toISOString(),
      });
      try { localStorage.setItem('ch_feedbacks', JSON.stringify(list.slice(0, 200))); } catch (e) {}
      return respond({ ok: true, local: true });
    }
    return Promise.resolve({
      ok: false, status: 404,
      json: function () { return Promise.resolve({ error: '静态版不支持该接口' }); },
    });
  };
})();
