/* 배당자판기 종합 배당 계산기 3판 widget.js · 글에는 <div id="bdgj4-root"></div> 와 이 파일을 부르는 script 두 줄만 넣으면 돎 */
(function(){
'use strict';
// 종합 배당 계산기 2판 · 계산 구간 (바깥 라이브러리 없음)
// 브라우저 = window.BDGJ4CALC · node = module.exports
(function (root) {
  'use strict';

  var TAX = { kr: 0.154, kr_해외: 0.154, kr_일부비과세: 0.154, us: 0.15 };
  var LIMIT = 20000000; // 금융소득 종합과세 안내 기준(원) · 안내만, 세금 계산 X
  var OVER_MSG = '세전 1년 배당이 2천만원을 넘어요. 금융소득이 2천만원을 넘으면 종합과세 대상이 될 수 있어요. 이 계산기는 그 세금을 계산하지 않아요.';

  // 원 단위 반올림은 이 한 곳에서만 한다
  function rnd(x) { return Math.round(Math.round(x * 1e4) / 1e4); }

  function num(s) { var c = String(s).replace(/[^0-9.]/g, ''); return c === '' ? NaN : Number(c); }

  // 123400 -> '12만 3,400원' · 10000000 -> '1,000만원' · 354609930 -> '3억 5,460만 9,930원'
  function won(n) {
    var r = rnd(n); if (r === 0) { r = 0; }
    var sign = r < 0 ? '-' : ''; r = Math.abs(r);
    var man = Math.floor(r / 10000), rest = r % 10000;
    if (man === 0) { return sign + rest.toLocaleString('ko-KR') + '원'; }
    var eok = Math.floor(man / 10000), m = man % 10000, s = eok ? eok.toLocaleString('ko-KR') + '억' : '';
    if (m) { s += (s ? ' ' : '') + m.toLocaleString('ko-KR') + '만'; }
    return sign + s + (rest ? ' ' + rest.toLocaleString('ko-KR') + '원' : '원');
  }

  // 정수 total을 비중 w(12칸)로 나눔 · 합이 total과 꼭 같도록 큰 나머지 순으로 1원씩 더함
  function alloc(total, w) {
    var sum = 0, i;
    for (i = 0; i < 12; i++) { sum += w[i] > 0 ? w[i] : 0; }
    var out = [], frac = [], used = 0;
    for (i = 0; i < 12; i++) {
      var ex = sum > 0 && w[i] > 0 ? total * w[i] / sum : 0;
      var fl = Math.floor(ex + 1e-9);
      out.push(fl); frac.push({ i: i, f: ex - fl }); used += fl;
    }
    var left = total - used;
    frac = frac.filter(function (x) { return w[x.i] > 0; });
    frac.sort(function (a, b) { return (b.f - a.f) || (a.i - b.i); });
    for (var k = 0; k < frac.length && left > 0; k++, left--) { out[frac[k].i] += 1; }
    return out;
  }

  // 종목 하나를 계산에 쓸 꼴로 정리 (내 종목 포함)
  function norm(it) {
    if (!it) { return null; }
    var mo = (it.mo || []).filter(function (m, i, a) { return m >= 1 && m <= 12 && a.indexOf(m) === i; });
    var w = null, i;
    if (it.w && it.w.length === 12) {
      var s = 0; for (i = 0; i < 12; i++) { s += it.w[i] > 0 ? it.w[i] : 0; }
      if (s > 0) { w = it.w.map(function (x) { return x > 0 ? x : 0; }); }
    }
    if (!w) { w = []; for (i = 0; i < 12; i++) { w.push(mo.indexOf(i + 1) >= 0 ? 1 / mo.length : 0); } }
    var tx = it.tx || (it.mk === 'us' ? 'us' : 'kr');
    return { it: it, mo: mo, w: w, tx: tx, rate: TAX[tx], cur: it.cur || (it.mk === 'us' ? 'USD' : 'KRW') };
  }

  // 한 종목 · 한 줄 담기 -> 1년 세전·세후, 세율, 지급 횟수, 한 번 받는 세후, 달별 세후 12칸
  function pay(it, opt, fx) {
    var n = norm(it);
    if (!n || n.rate === undefined || !opt || !(opt.v > 0) || !n.mo.length) { return null; }
    var pre;
    if (opt.mode === 'sh') {
      if (!(it.dps > 0)) { return null; }
      pre = opt.v * it.dps * (n.cur === 'USD' ? fx : 1);
    } else {
      if (!(it.r > 0)) { return null; }
      pre = opt.v * it.r / 100;
    }
    if (!(pre > 0)) { return null; }
    var preR = rnd(pre), postR = rnd(pre * (1 - n.rate));
    var times = it.times > 0 ? it.times : n.mo.length; // 자료에 지급 횟수(times)가 있으면 그 값(TLTW는 12월 두 번 = 12) · 없으면 지급 달 수
    return {
      pre: preR, post: postR, rate: n.rate, times: times,
      perPayPost: rnd(postR / times),
      months: alloc(postR, n.w), preMonths: alloc(preR, n.w)
    };
  }

  function findItem(row, items) {
    if (row.custom) { return row; }
    for (var i = 0; i < (items || []).length; i++) {
      var x = items[i];
      if (x.key === row.key || x.tk === row.key) { return x; }
    }
    return null;
  }

  function dayOf(it, m) { return it && it.pd && it.pd[m] != null ? it.pd[m] : null; }

  // 바구니 -> 12칸 [{m, pre, post, list:[{key,nm,post,day}]}]
  function calendar(basket, items, fx) {
    var cal = [], m;
    for (m = 1; m <= 12; m++) { cal.push({ m: m, pre: 0, post: 0, list: [] }); }
    (basket || []).forEach(function (row) {
      var it = findItem(row, items); if (!it) { return; }
      var p = pay(it, { mode: row.mode, v: row.v }, fx); if (!p) { return; }
      for (var i = 0; i < 12; i++) {
        if (p.months[i] > 0 || p.preMonths[i] > 0) {
          cal[i].pre += p.preMonths[i]; cal[i].post += p.months[i];
          cal[i].list.push({ key: row.key, nm: it.nm, post: p.months[i], day: dayOf(it, i) });
        }
      }
    });
    return cal;
  }

  function summary(cal) {
    var preY = 0, postY = 0, empty = 0, maxM = null, minM = null, maxV = -1, minV = -1;
    cal.forEach(function (c) {
      preY += c.pre; postY += c.post;
      if (c.list.length === 0) { empty++; return; }
      if (maxV < 0 || c.post > maxV) { maxV = c.post; maxM = c.m; }
      if (minV < 0 || c.post < minV) { minV = c.post; minM = c.m; }
    });
    return { preY: preY, postY: postY, avg: rnd(postY / 12), maxM: maxM, minM: minM, empty: empty,
             over: preY > LIMIT, overMsg: preY > LIMIT ? OVER_MSG : '' };
  }

  function groupSum(basket, items, fx, keyFn) {
    var sums = {}, total = 0;
    (basket || []).forEach(function (row) {
      var it = findItem(row, items); if (!it) { return; }
      var p = pay(it, { mode: row.mode, v: row.v }, fx); if (!p) { return; }
      var k = keyFn(it); sums[k] = (sums[k] || 0) + p.post; total += p.post;
    });
    return { sums: sums, total: total };
  }

  function bySector(basket, items, fx) {
    var g = groupSum(basket, items, fx, function (it) { return it.sc || '기타'; });
    return Object.keys(g.sums).map(function (k) {
      return { sc: k, post: g.sums[k], pct: g.total > 0 ? Math.round(g.sums[k] / g.total * 1000) / 10 : 0 };
    }).sort(function (a, b) { return (b.post - a.post) || a.sc.localeCompare(b.sc, 'ko'); });
  }

  function byCycle(basket, items, fx) {
    var g = groupSum(basket, items, fx, function (it) { return it.cy || 0; });
    return Object.keys(g.sums).map(function (k) {
      return { cy: Number(k), post: g.sums[k], pct: g.total > 0 ? Math.round(g.sums[k] / g.total * 1000) / 10 : 0 };
    }).sort(function (a, b) { return (b.post - a.post) || (a.cy - b.cy); });
  }

  // 담은 줄 하나의 투자금(원) · 주 수면 주가×주 수(없으면 세전 배당금 ÷ 배당률) · goal과 avgRate가 같이 씀
  function moneyOf(it, row, p, fx) {
    if (row.mode === 'sh') {
      var cur = norm(it).cur;
      if (it.px > 0) { return row.v * it.px * (cur === 'USD' ? fx : 1); }
      if (it.r > 0) { return p.pre / (it.r / 100); }
      return 0;
    }
    return row.v;
  }

  // 담은 종목 평균 배당률(세전, %) = 1년 세전 배당금 합 ÷ 투자금 합 × 100 · 소수 첫째 자리 · 계산 못 한 줄은 빼고 skipped로 셈
  function avgRate(basket, items, fx) {
    var pre = 0, money = 0, skipped = 0;
    (basket || []).forEach(function (row) {
      var it = findItem(row, items); if (!it) { return; }
      var p = pay(it, { mode: row.mode, v: row.v }, fx);
      var m = p ? moneyOf(it, row, p, fx) : 0;
      if (!p || !(m > 0)) { skipped++; return; }
      pre += p.pre; money += m;
    });
    if (!(money > 0)) { return { rate: null, pre: 0, money: 0, skipped: skipped }; }
    return { rate: Math.round(pre / money * 1000) / 10, pre: pre, money: money, skipped: skipped };
  }

  // 한 달 평균 세후 target원이 되려면 필요한 총 투자금 · 지금 담은 비율 그대로 · 1만원 단위 올림
  function goal(basket, items, fx, targetMonthlyPost) {
    if (!(targetMonthlyPost > 0)) { return null; }
    var postY = 0, money = 0;
    (basket || []).forEach(function (row) {
      var it = findItem(row, items); if (!it) { return; }
      var p = pay(it, { mode: row.mode, v: row.v }, fx); if (!p) { return; }
      postY += p.post;
      money += moneyOf(it, row, p, fx);
    });
    if (!(postY > 0) || !(money > 0)) { return null; }
    var need = money * (targetMonthlyPost * 12) / postY;
    return Math.ceil(need / 10000 - 1e-9) * 10000;
  }

  function filter(items, f) {
    f = f || {};
    var cy = f.cy || [], mk = f.mk || [], sc = f.sc || [], q = String(f.q || '').trim().toLowerCase(), minR = Number(f.minR) > 0 ? Number(f.minR) : 0;
    return (items || []).filter(function (it) {
      if (cy.length && cy.indexOf(it.cy) < 0) { return false; }
      if (mk.length && mk.indexOf(it.mk) < 0) { return false; }
      if (sc.length && sc.indexOf(it.sc) < 0) { return false; }
      if (minR > 0 && !(it.r >= minR)) { return false; }
      if (q) {
        var hay = ((it.nm || '') + ' ' + (it.fn || '') + ' ' + (it.tk || '')).toLowerCase();
        if (hay.indexOf(q) < 0) { return false; }
      }
      return true;
    });
  }

  function rank(items, mode) {
    var a = (items || []).slice();
    var tie = function (x, y) { return String(x.tk || '').localeCompare(String(y.tk || ''), 'ko'); };
    a.sort(function (x, y) {
      if (mode === 'rasc') { return ((x.r || 0) - (y.r || 0)) || tie(x, y); }
      if (mode === 'name') { return String(x.nm || '').localeCompare(String(y.nm || ''), 'ko') || tie(x, y); }
      return ((y.r || 0) - (x.r || 0)) || tie(x, y);
    });
    return a;
  }

  // ---------- 3판에서 더한 것 (위 함수는 2판 그대로) ----------
  var CC_RE = /커버드콜/;
  function isCC(it) { return CC_RE.test((it && it.sc) || ''); }

  // 등급 · r<3 저배당 · 3≤r<8 중배당 · r≥8 고배당 · 커버드콜이면 '(커버드콜형)' + 금색
  function tier(it) {
    if (!it || !(it.r > 0)) { return null; }
    var r = Number(it.r), t;
    if (r < 3) { t = { key: 'low', name: '저배당', color: '#4C9AFF' }; }
    else if (r < 8) { t = { key: 'mid', name: '중배당', color: '#5FD3A0' }; }
    else { t = { key: 'high', name: '고배당', color: '#F5C542' }; }
    var cc = isCC(it);
    return { key: t.key, name: t.name, cc: cc, label: cc ? t.name + '(커버드콜형)' : t.name, color: cc ? '#F5C542' : t.color };
  }

  function blank(x) { return x === null || x === undefined || x === ''; }

  // 재투자 · 돈(원)으로만 굴림 · o = {M, Y, g, pg, re, r} · 반올림 없음(화면에서 rnd)
  function drip(V0, it, o) {
    o = o || {};
    var n = norm(it);
    var vol = !!(it && (it.fl || []).indexOf('변동큼') >= 0);
    var rIn = Number(o.r) > 0 ? Number(o.r) : (it ? Number(it.r) : NaN);
    var warn = { vol: vol, needPg: false, blow: null };
    if (!n || n.rate === undefined || !(rIn > 0) || !(V0 >= 0)) { return { rows: [], cum: 0, paid: Number(V0) || 0, warn: warn }; }
    var r0 = rIn / 100;
    if (r0 * 100 >= 20) { warn.needPg = true; return { rows: [], cum: 0, paid: V0, warn: warn }; } // 배당률 20% 넘음 = 몇 년씩 이어진다고 보기 어려워 재투자 계산 안 함(11/18 144방 · TSLY 주가 -20%에도 10년 93배가 나와서) · '가정 바꾸기' 배당률을 20 밑으로 넣으면 계산
    var M = Number(o.M) > 0 ? Number(o.M) : 0;
    var Y = Number(o.Y) > 0 ? Math.floor(Number(o.Y)) : 10;
    var g = blank(o.g) || !isFinite(Number(o.g)) ? 0 : Number(o.g);
    var pg = blank(o.pg) || !isFinite(Number(o.pg)) ? 0 : Number(o.pg);
    var re = !!o.re, w = n.w, tax = n.rate;
    var V = V0, paid = V0, cash = 0, cum = 0, P = 1, qp = Math.pow(1 + pg / 100, 1 / 12), rows = [];
    var startYl = r0 * 100;
    for (var y = 1; y <= Y; y++) {
      var G = Math.pow(1 + g / 100, y - 1), yDiv = 0;
      for (var m = 0; m < 12; m++) {
        V *= qp; P *= qp;
        if (M > 0) { V += M; paid += M; }
        if (w[m] > 0) {
          var net = V * r0 * G / (vol ? 1 : P) * w[m] * (1 - tax); // 커버드콜(변동큼) = 분배금이 주가를 따라감(배당률 고정) · 그 밖 = 1주 배당 고정
          yDiv += net; cum += net;
          if (re) { V += net; } else { cash += net; }
        }
      }
      var yl = r0 * G / (vol ? 1 : P) * 100;
      rows.push({ y: y, div: yDiv, val: V, cash: cash, yl: yl });
      if (!warn.blow && (yl >= startYl * 3 - 1e-9 || (yl >= 20 && startYl < 20))) { warn.blow = { y: y, yl: yl }; }
    }
    return { rows: rows, cum: cum, paid: paid, warn: warn };
  }

  // 같은 돈이면 비슷한 종목 · 같은 섹터 배당률 가까운 순 → 모자라면 같은 나라·같은 주기
  function similar(it, items, n) {
    n = n > 0 ? n : 3;
    if (!it) { return []; }
    var self = it.tk || it.key, cc = isCC(it), out = [];
    var ok = function (x) { return x && x !== it && (x.tk || x.key) !== self && x.r > 0 && (cc || !isCC(x)) && out.indexOf(x) < 0; };
    var near = function (a, b) { return (Math.abs(a.r - it.r) - Math.abs(b.r - it.r)) || String(a.tk || '').localeCompare(String(b.tk || ''), 'ko'); };
    var pick = function (f) {
      (items || []).filter(function (x) { return ok(x) && f(x); }).sort(near).forEach(function (x) { if (out.length < n) { out.push(x); } });
    };
    pick(function (x) { return (x.sc || '') === (it.sc || ''); });
    if (out.length < n) { pick(function (x) { return x.mk === it.mk && x.cy === it.cy; }); }
    return out;
  }

  // 링크 · '#bd=1&s=..&m=a|s|g&v=..&b=key_a_v-..&c=key_nm_r_mk_mo(.로 이음)[_tx]-..&x=..&d=M_Y_g_pg_r'
  var MODE_TO = { amt: 'a', sh: 's', goal: 'g' }, MODE_FROM = { a: 'amt', s: 'sh', g: 'goal' };
  function encF(x) { return encodeURIComponent(x === null || x === undefined ? '' : String(x)).replace(/_/g, '%5F').replace(/-/g, '%2D'); }
  function numStr(x) { return blank(x) || !isFinite(Number(x)) ? '' : String(Number(x)); }
  function encodeLink(st) {
    st = st || {};
    var parts = ['bd=1', 's=' + encF(st.s || ''), 'm=' + (MODE_TO[st.m] || 'a'), 'v=' + encF(numStr(st.v))];
    var b = (st.b || []).map(function (r) { return [encF(r.key), r.mode === 'sh' ? 's' : 'a', encF(numStr(r.v))].join('_'); });
    if (b.length) { parts.push('b=' + b.join('-')); }
    var c = (st.c || []).map(function (x) {
      var mk = x.mk === 'us' ? 'us' : 'kr', f = [encF(x.key), encF(x.nm), encF(numStr(x.r)), mk, encF((x.mo || []).join('.'))];
      if (x.tx && x.tx !== mk) { f.push(encF(x.tx)); }
      return f.join('_');
    });
    if (c.length) { parts.push('c=' + c.join('-')); }
    if (Number(st.x) > 0) { parts.push('x=' + encF(numStr(st.x))); }
    if (st.d) { var d = st.d; parts.push('d=' + [d.M, d.Y, d.g, d.pg, d.r].map(function (z) { return encF(numStr(z)); }).join('_')); }
    return '#' + parts.join('&');
  }
  function decodeLink(hash) {
    try {
      if (typeof hash !== 'string' || hash.indexOf('#bd=') !== 0) { return null; }
      var q = {}, segs = hash.slice(1).split('&'), i;
      for (i = 0; i < segs.length; i++) {
        var k = segs[i].indexOf('='); if (k <= 0) { return null; }
        q[segs[i].slice(0, k)] = segs[i].slice(k + 1);
      }
      if (q.bd !== '1') { return null; }
      var fin = function (s, allowBlank) {
        var t = decodeURIComponent(s || '');
        if (t === '') { if (allowBlank) { return null; } throw new Error('blank'); }
        var v = Number(t); if (!isFinite(v)) { throw new Error('nan'); } return v;
      };
      var s = decodeURIComponent(q.s || ''); if (!s) { return null; }
      var m = MODE_FROM[q.m]; if (!m) { return null; }
      var v = fin(q.v); if (v < 0) { return null; }
      var b = [], c = [], x = null, d = null;
      if (q.b) {
        q.b.split('-').forEach(function (one) {
          var f = one.split('_'); if (f.length !== 3 || (f[1] !== 'a' && f[1] !== 's')) { throw new Error('b'); }
          var key = decodeURIComponent(f[0]), bv = fin(f[2]); if (!key || !(bv > 0)) { throw new Error('b'); }
          b.push({ key: key, mode: f[1] === 's' ? 'sh' : 'amt', v: bv });
        });
      }
      if (q.c) {
        q.c.split('-').forEach(function (one) {
          var f = one.split('_'); if (f.length < 5 || f.length > 6 || (f[3] !== 'kr' && f[3] !== 'us')) { throw new Error('c'); }
          var key = decodeURIComponent(f[0]), nm = decodeURIComponent(f[1]), r = fin(f[2]);
          var mo = decodeURIComponent(f[4]).split('.').map(Number);
          if (!key || !nm || !(r > 0) || mo.some(function (z) { return !(z >= 1 && z <= 12 && z === Math.floor(z)); })) { throw new Error('c'); }
          var tx = f.length === 6 ? decodeURIComponent(f[5]) : f[3];
          if (TAX[tx] === undefined) { throw new Error('c'); }
          c.push({ key: key, custom: true, nm: nm, r: r, mk: f[3], mo: mo, tx: tx });
        });
      }
      if (q.x !== undefined) { x = fin(q.x); if (!(x > 0)) { return null; } }
      if (q.d !== undefined) {
        var df = q.d.split('_'); if (df.length !== 5) { return null; }
        d = { M: fin(df[0], true), Y: fin(df[1], true), g: fin(df[2], true), pg: fin(df[3], true), r: fin(df[4], true) };
      }
      return { s: s, m: m, v: v, b: b, c: c, x: x, d: d };
    } catch (e) { return null; }
  }

  // 리뷰 글 주소를 내도 되나 · n이 양수이고 비공개 목록(hide)에 없을 때만
  function linkOk(it, hide) {
    if (!it || typeof it.n !== 'number' || !(it.n > 0)) { return false; }
    return (hide || []).indexOf(it.n) < 0;
  }

  // 2천만 막대 · pct 소수 첫째 자리 · 0보다 크면 최소 2 · 80 넘으면 갈색 · 2천만 넘음 = over
  function gauge(preYear) {
    var pre = Number(preYear) > 0 ? Number(preYear) : 0;
    var pct = Math.round(pre / LIMIT * 1000) / 10;
    if (pre > 0 && pct < 2) { pct = 2; }
    return { pct: pct, fill: pct > 80 ? '#7A3E00' : '#1F5FBF', over: pre > LIMIT };
  }

  // 종목 하나 · 한 달 세후 target원이 되는 투자금 · 1만원 단위 올림
  function goalOne(it, targetMonthlyPost) {
    var n = norm(it);
    if (!n || n.rate === undefined || !(it.r > 0) || !(targetMonthlyPost > 0)) { return null; }
    var need = targetMonthlyPost * 12 / (it.r / 100 * (1 - n.rate));
    return Math.ceil(need / 10000 - 1e-9) * 10000;
  }

  var api = {
    TAX: TAX, LIMIT: LIMIT, OVER_MSG: OVER_MSG,
    rnd: rnd, num: num, won: won,
    pay: pay, avgRate: avgRate, calendar: calendar, summary: summary,
    bySector: bySector, byCycle: byCycle, goal: goal,
    filter: filter, rank: rank
  };
  api.tier = tier; api.drip = drip; api.similar = similar; api.encodeLink = encodeLink; api.decodeLink = decodeLink;
  api.linkOk = linkOk; api.gauge = gauge; api.goalOne = goalOne; api.moneyOf = moneyOf; api.norm = norm;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.BDGJ4CALC = api; }
})(typeof window !== 'undefined' ? window : null);
var C = BDGJ4CALC;
var DATA = {"asof":{"px":null,"r":"종목마다 리뷰 글 기준일","fx":"2026-11-13","made":"2026-11-16 10:20"},"fx":1335,"items":[{"n":5,"tk":"DIS","tkReal":true,"nm":"디즈니","fn":"디즈니(DIS)","mk":"us","tx":"us","ty":"주식","sc":"미디어","cy":2,"mo":[1,7],"w":[0.5,0.0,0.0,0.0,0.0,0.0,0.5,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":1.5,"cur":"USD","px":null,"pxd":null,"r":1.41,"rd":"2026-09-11","rh":"최근 지급분 1년 환산","la":0.75,"lx":null,"lp":"2026-07-22","lpPlan":false,"pd":[15,null,null,null,null,null,22,null,null,null,null,null],"fl":[],"one":"2년 만에 배당 두 배","src":"티스토리 /5 · 03_완성본/004_DIS/02_티스토리원고.md"},{"n":6,"tk":"SCHD","tkReal":true,"nm":"SCHD","fn":"SCHD(슈드)","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":1.054,"cur":"USD","px":null,"pxd":null,"r":3.2,"rd":"2026-09-24","rh":"최근 12개월 실제 지급","la":0.2665,"lx":"2026-09-23","lp":"2026-09-28","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,28,null,null,null],"fl":[],"one":"천만원 넣고 3년이면 배당 121만원","src":"티스토리 /6 · 03_완성본/002_SCHD/02_티스토리원고.md"},{"n":7,"tk":"KO","tkReal":true,"nm":"코카콜라","fn":"코카콜라(KO)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[4,7,10,12],"w":[0.0,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.25],"weq":true,"times":4,"dps":2.12,"cur":"USD","px":null,"pxd":null,"r":2.4,"rd":"2026-09-25","rh":"최근 지급분 1년 환산","la":0.53,"lx":"2026-09-15","lp":"2026-10-01","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,1,null,null],"fl":[],"one":"64년 연속 배당 인상","src":"티스토리 /7 · 03_완성본/001_KO/02_티스토리원고.md"},{"n":8,"tk":"JEPI","tkReal":true,"nm":"JEPI","fn":"JEPI(제피)","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":4.58,"cur":"USD","px":null,"pxd":null,"r":8.1,"rd":"2026-09-25","rh":"최근 12개월 실제 지급","la":0.37,"lx":"2026-09-01","lp":"2026-09-03","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,3,null,null,null],"fl":["변동큼"],"one":"천만원이면 매달 6만 7천원","src":"티스토리 /8 · 03_완성본/003_JEPI/02_티스토리원고.md"},{"n":9,"tk":"T","tkReal":true,"nm":"AT&T","fn":"AT&T","mk":"us","tx":"us","ty":"주식","sc":"통신","cy":4,"mo":[2,5,8,11],"w":[0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0],"weq":true,"times":4,"dps":1.11,"cur":"USD","px":null,"pxd":null,"r":4.46,"rd":"2026-09-28","rh":"최근 12개월 실제 지급","la":0.2775,"lx":"2026-10-09","lp":"2026-11-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,2,null],"fl":[],"one":"천만원이면 한 달 3만 7천원꼴","src":"티스토리 /9 · 03_완성본/005_T/02_티스토리원고.md"},{"n":10,"tk":"MO","tkReal":true,"nm":"알트리아","fn":"알트리아(MO)","mk":"us","tx":"us","ty":"주식","sc":"담배","cy":4,"mo":[1,4,7,10],"w":[0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0],"weq":true,"times":4,"dps":4.44,"cur":"USD","px":null,"pxd":null,"r":6.42,"rd":"2026-09-28","rh":"최근 지급분 1년 환산","la":1.11,"lx":"2026-09-15","lp":"2026-10-09","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,9,null,null],"fl":[],"one":"천만원이면 한 달 5만 3천원꼴","src":"티스토리 /10 · 03_완성본/006_MO/02_티스토리원고.md"},{"n":11,"tk":"005930","tkReal":true,"nm":"삼성전자","fn":"삼성전자","mk":"kr","tx":"kr","ty":"주식","sc":"IT(반도체·전자)","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.336505,0.221165,0.0,0.0,0.222354,0.0,0.0,0.219976,0.0],"weq":false,"times":4,"dps":1682,"cur":"KRW","px":null,"pxd":null,"r":0.62,"rd":"2026-09-28","rh":"최근 12개월 실제 지급","la":374,"lx":null,"lp":null,"lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,null,null],"fl":[],"one":"3년 전 천만원이 지금 4009만원","src":"티스토리 /11 · 03_완성본/007_삼성전자/02_티스토리원고.md"},{"n":13,"tk":"033780","tkReal":true,"nm":"KT&G","fn":"KT&G","mk":"kr","tx":"kr","ty":"주식","sc":"담배","cy":2,"mo":[4,9],"w":[0.0,0.0,0.0,0.69697,0.0,0.0,0.0,0.0,0.30303,0.0,0.0,0.0],"weq":false,"times":2,"dps":6600,"cur":"KRW","px":null,"pxd":null,"r":3.72,"rd":"2026-09-29","rh":"최근 12개월 실제 지급","la":2000,"lx":null,"lp":"2026-09-07","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,7,null,null,null],"fl":[],"one":"4년 만에 배당 25% 인상","src":"티스토리 /13 · 03_완성본/008_KT&G/02_티스토리원고.md"},{"n":14,"tk":"BCE","tkReal":true,"nm":"BCE","fn":"BCE(벨캐나다)","mk":"us","tx":"us","ty":"주식","sc":"통신","cy":4,"mo":[1,4,7,10],"w":[0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0],"weq":true,"times":4,"dps":1.26,"cur":"USD","px":null,"pxd":null,"r":6.28,"rd":"2026-09-29","rh":"최근 12개월 실제 지급","la":null,"lx":"2026-09-15","lp":"2026-10-15","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,15,null,null],"fl":[],"one":"천만원이면 한 달 5만 2천원꼴","src":"티스토리 /14 · 03_완성본/009_BCE/02_티스토리원고.md"},{"n":15,"tk":"JNJ","tkReal":true,"nm":"존슨앤존슨","fn":"존슨앤존슨(JNJ)","mk":"us","tx":"us","ty":"주식","sc":"헬스케어","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":5.28,"cur":"USD","px":null,"pxd":null,"r":1.97,"rd":"2026-09-29","rh":"최근 12개월 실제 지급","la":1.34,"lx":"2026-08-25","lp":"2026-09-08","lpPlan":false,"pd":[null,null,null,null,null,9,null,null,8,null,null,null],"fl":[],"one":"64년 연속 배당 인상","src":"티스토리 /15 · 03_완성본/010_JNJ/02_티스토리원고.md"},{"n":16,"tk":"VZ","tkReal":true,"nm":"버라이즌","fn":"버라이즌(VZ)","mk":"us","tx":"us","ty":"주식","sc":"통신","cy":4,"mo":[2,5,8,11],"w":[0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0],"weq":true,"times":4,"dps":2.795,"cur":"USD","px":null,"pxd":null,"r":6.09,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":0.7075,"lx":"2026-10-09","lp":"2026-11-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,2,null],"fl":[],"one":"20년 연속 배당 인상","src":"티스토리 /16 · 03_완성본/011_VZ/02_티스토리원고.md"},{"n":17,"tk":"005935","tkReal":true,"nm":"삼성전자우","fn":"삼성전자우","mk":"kr","tx":"kr","ty":"주식","sc":"IT(반도체·전자)","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.336898,0.221034,0.0,0.0,0.222222,0.0,0.0,0.219846,0.0],"weq":false,"times":4,"dps":1683,"cur":"KRW","px":null,"pxd":null,"r":0.82,"rd":"2026-10-01","rh":"최근 12개월 실제 지급","la":374,"lx":null,"lp":null,"lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,null,null],"fl":[],"one":"3년 전 천만원이 지금 3830만원","src":"티스토리 /17 · 03_완성본/013_삼성전자우/02_티스토리원고.md"},{"n":18,"tk":"AGNC","tkReal":true,"nm":"AGNC","fn":"AGNC인베스트먼트(AGNC)","mk":"us","tx":"us","ty":"리츠","sc":"리츠","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":1.44,"cur":"USD","px":null,"pxd":null,"r":15.88,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":0.12,"lx":"2026-09-30","lp":"2026-10-09","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,9,null,null],"fl":[],"one":"천만원이면 매달 13만 2천원","src":"티스토리 /18 · 03_완성본/027_AGNC/02_티스토리원고.md"},{"n":19,"tk":"PEP","tkReal":true,"nm":"펩시코","fn":"펩시코(PEP)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[1,3,6,9],"w":[0.25,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.0],"weq":true,"times":4,"dps":5.805,"cur":"USD","px":null,"pxd":null,"r":4.58,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":1.48,"lx":"2026-09-04","lp":"2026-09-30","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,30,null,null,null],"fl":[],"one":"4년 만에 배당 32% 인상","src":"티스토리 /19 · 03_완성본/014_PEP/02_티스토리원고.md"},{"n":20,"tk":"APLY","tkReal":true,"nm":"APLY","fn":"APLY","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":52,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":3.92,"cur":"USD","px":null,"pxd":null,"r":33.31,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":0.0679,"lx":"2026-10-01","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","주배당"],"one":"천만원이면 한 달 평균 27만 8천원","src":"티스토리 /20 · 03_완성본/036_APLY/02_티스토리원고.md"},{"n":21,"tk":"COST","tkReal":true,"nm":"코스트코","fn":"코스트코(COST)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[2,5,8,11],"w":[0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0],"weq":true,"times":4,"dps":5.54,"cur":"USD","px":null,"pxd":null,"r":0.61,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":1.47,"lx":"2026-07-24","lp":"2026-08-07","lpPlan":false,"pd":[null,13,null,null,15,null,null,7,null,null,14,null],"fl":[],"one":"3년 전 천만원이 지금 1664만원","src":"티스토리 /21 · 03_완성본/016_COST/02_티스토리원고.md"},{"n":22,"tk":"XOM","tkReal":true,"nm":"엑슨모빌","fn":"엑슨모빌(XOM)","mk":"us","tx":"us","ty":"주식","sc":"에너지","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":4.12,"cur":"USD","px":null,"pxd":null,"r":2.53,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":1.03,"lx":"2026-08-17","lp":"2026-09-10","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,10,null,null,null],"fl":[],"one":"43년 연속 배당 인상","src":"티스토리 /22 · 03_완성본/017_XOM/02_티스토리원고.md"},{"n":23,"tk":"289480","tkReal":true,"nm":"TIGER 200커버드콜","fn":"TIGER 200커버드콜","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":922,"cur":"KRW","px":null,"pxd":null,"r":7.03,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":94,"lx":"2026-09-29","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","세금넉넉"],"one":"천만원이면 매달 평균 5만 9천원","src":"티스토리 /23 · 03_완성본/066_TIGER 200커버드콜/02_티스토리원고.md"},{"n":24,"tk":"MA","tkReal":true,"nm":"마스터카드","fn":"마스터카드(MA)","mk":"us","tx":"us","ty":"주식","sc":"금융(결제망)","cy":4,"mo":[2,5,8,11],"w":[0.0,0.258161,0.0,0.0,0.25816,0.0,0.0,0.25816,0.0,0.0,0.225519,0.0],"weq":false,"times":4,"dps":3.37,"cur":"USD","px":null,"pxd":null,"r":0.61,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":0.87,"lx":"2026-07-09","lp":"2026-08-07","lpPlan":false,"pd":[null,9,null,null,8,null,null,7,null,null,9,null],"fl":[],"one":"천만원이 3년 만에 1417만원","src":"티스토리 /24 · 03_완성본/019_MA/02_티스토리원고.md"},{"n":25,"tk":"000270","tkReal":true,"nm":"기아","fn":"기아","mk":"kr","tx":"kr","ty":"주식","sc":"자동차","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":6800,"cur":"KRW","px":null,"pxd":null,"r":6.02,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":6800,"lx":"2026-03-24","lp":"2026-04-20","lpPlan":false,"pd":[null,null,null,20,null,null,null,null,null,null,null,null],"fl":[],"one":"3년 새 배당 94% 인상","src":"티스토리 /25 · 03_완성본/023_기아/02_티스토리원고.md"},{"n":26,"tk":"441640","tkReal":true,"nm":"KODEX 미국배당커버드콜액티브","fn":"KODEX 미국배당커버드콜액티브","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":1184,"cur":"KRW","px":null,"pxd":null,"r":9.77,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":96,"lx":"2026-09-14","lp":"2026-09-17","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,17,null,null,null],"fl":["변동큼","세금넉넉"],"one":"천만원이면 한 달 평균 8만 1천원","src":"티스토리 /26 · 03_완성본/069_KODEX 미국배당커버드콜액티브/02_티스토리원고.md"},{"n":27,"tk":"005380","tkReal":true,"nm":"현대차","fn":"현대차","mk":"kr","tx":"kr","ty":"주식","sc":"자동차","cy":4,"mo":[4,6,9,12],"w":[0.0,0.0,0.0,0.25,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":false,"times":4,"dps":10000,"cur":"KRW","px":null,"pxd":null,"r":2.89,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":2500,"lx":"2026-08-28","lp":"2026-09-30","lpPlan":false,"pd":[null,null,null,24,null,30,null,null,30,null,null,31],"fl":[],"one":"3년 만에 천만원이 1998만원","src":"티스토리 /27 · 03_완성본/020_현대차/02_티스토리원고.md"},{"n":29,"tk":"024110","tkReal":true,"nm":"기업은행","fn":"기업은행","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":2,"mo":[4,8],"w":[0.0,0.0,0.0,0.833068,0.0,0.0,0.0,0.166932,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":1258,"cur":"KRW","px":null,"pxd":null,"r":6.23,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":210,"lx":"2026-07-30","lp":"2026-08-28","lpPlan":false,"pd":[null,null,null,23,null,null,null,28,null,null,null,null],"fl":[],"one":"결산 1048원+2분기 210원","src":"티스토리 /29 · 03_완성본/077_기업은행/02_티스토리원고.md"},{"n":30,"tk":"JEPQ","tkReal":true,"nm":"JEPQ","fn":"JEPQ(젭큐)","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":6.885,"cur":"USD","px":null,"pxd":null,"r":11.28,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":0.56687,"lx":"2026-10-01","lp":"2026-10-05","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,5,null,null],"fl":["변동큼"],"one":"나스닥 커버드콜","src":"티스토리 /30 · 03_완성본/159_JEPQ/02_티스토리원고.md"},{"n":31,"tk":"017670","tkReal":true,"nm":"SK텔레콤","fn":"SK텔레콤","mk":"kr","tx":"kr","ty":"주식","sc":"통신","cy":4,"mo":[6,9],"w":[0.0,0.0,0.0,0.0,0.0,0.5,0.0,0.0,0.5,0.0,0.0,0.0],"weq":false,"times":2,"dps":1660,"cur":"KRW","px":null,"pxd":null,"r":1.88,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":830,"lx":"2026-08-28","lp":"2026-09-17","lpPlan":false,"pd":[null,null,null,null,null,18,null,null,17,null,null,null],"fl":[],"one":"쉬었다가 6월 다시 시작","src":"티스토리 /31 · 03_완성본/942_SK텔레콤/02_티스토리원고.md"},{"n":32,"tk":"088980","tkReal":true,"nm":"맥쿼리인프라","fn":"맥쿼리인프라","mk":"kr","tx":"kr","ty":"인프라펀드","sc":"인프라","cy":2,"mo":[2,8],"w":[0.0,0.520548,0.0,0.0,0.0,0.0,0.0,0.479452,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":730,"cur":"KRW","px":null,"pxd":null,"r":7.46,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":350,"lx":"2026-06-29","lp":"2026-08-28","lpPlan":false,"pd":[null,27,null,null,null,null,null,28,null,null,null,null],"fl":[],"one":"380원에서 350원으로","src":"티스토리 /32 · 03_완성본/047_맥쿼리인프라/02_티스토리원고.md"},{"n":33,"tk":"TSLY","tkReal":true,"nm":"TSLY","fn":"TSLY","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":52,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":18.2122,"cur":"USD","px":null,"pxd":null,"r":81.85,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":0.23,"lx":"2026-10-01","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","주배당"],"one":"테슬라 커버드콜","src":"티스토리 /33 · 03_완성본/186_TSLY/02_티스토리원고.md"},{"n":34,"tk":"DGRO","tkReal":true,"nm":"DGRO","fn":"DGRO","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":1.4937,"cur":"USD","px":null,"pxd":null,"r":1.96,"rd":"2026-10-07","rh":"최근 12개월 실제 지급","la":0.385,"lx":"2026-09-15","lp":"2026-09-18","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,18,null,null,null],"fl":[],"one":"배당 성장 ETF","src":"티스토리 /34 · 03_완성본/151_DGRO/02_티스토리원고.md"},{"n":35,"tk":"016360","tkReal":true,"nm":"삼성증권","fn":"삼성증권","mk":"kr","tx":"kr","ty":"주식","sc":"증권","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":4000,"cur":"KRW","px":null,"pxd":null,"r":4.67,"rd":"2026-10-08","rh":"최근 12개월 실제 지급","la":4000,"lx":"2025-12-29","lp":"2026-04-10","lpPlan":false,"pd":[null,null,null,10,null,null,null,null,null,null,null,null],"fl":[],"one":"1년에 한 번 4000원","src":"티스토리 /35 · 03_완성본/068_삼성증권/02_티스토리원고.md"},{"n":36,"tk":"NVDY","tkReal":true,"nm":"NVDY","fn":"NVDY","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":52,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":6.3325,"cur":"USD","px":null,"pxd":null,"r":50.38,"rd":"2026-10-09","rh":"최근 12개월 실제 지급","la":0.0761,"lx":"2026-10-08","lp":"2026-10-09","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,9,null,null],"fl":["변동큼","주배당"],"one":"엔비디아 커버드콜","src":"티스토리 /36 · 03_완성본/183_NVDY/02_티스토리원고.md"},{"n":37,"tk":"006800","tkReal":true,"nm":"미래에셋증권","fn":"미래에셋증권","mk":"kr","tx":"kr","ty":"주식","sc":"증권","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":300,"cur":"KRW","px":null,"pxd":null,"r":1.09,"rd":"2026-10-13","rh":"최근 12개월 실제 지급","la":300,"lx":"2026-03-16","lp":"2026-04-22","lpPlan":false,"pd":[null,null,null,22,null,null,null,null,null,null,null,null],"fl":[],"one":"현금 300원+주식","src":"티스토리 /37 · 03_완성본/353_미래에셋증권/02_티스토리원고.md"},{"n":38,"tk":"O","tkReal":true,"nm":"리얼티인컴","fn":"리얼티인컴(O)","mk":"us","tx":"us","ty":"리츠","sc":"리츠","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":3.243,"cur":"USD","px":null,"pxd":null,"r":5.93,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":0.2715,"lx":"2026-09-30","lp":"2026-10-15","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,15,null,null],"fl":[],"one":"31년 넘게 배당 인상","src":"티스토리 /38 · 03_완성본/233_O/02_티스토리원고.md"},{"n":39,"tk":"QYLD","tkReal":true,"nm":"QYLD","fn":"QYLD","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":2.1309,"cur":"USD","px":null,"pxd":null,"r":11.41,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":0.1767,"lx":"2026-09-21","lp":"2026-09-24","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,24,null,null,null],"fl":["변동큼"],"one":"나스닥100 커버드콜","src":"티스토리 /39 · 03_완성본/165_QYLD/02_티스토리원고.md"},{"n":40,"tk":"WMT","tkReal":true,"nm":"월마트","fn":"월마트(WMT)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[1,4,5,9],"w":[0.240409,0.0,0.0,0.253197,0.253197,0.0,0.0,0.0,0.253197,0.0,0.0,0.0],"weq":false,"times":4,"dps":0.9775,"cur":"USD","px":null,"pxd":null,"r":0.86,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":0.2475,"lx":"2026-08-21","lp":"2026-09-08","lpPlan":false,"pd":[5,null,null,6,26,null,null,null,8,null,null,null],"fl":[],"one":"53년 연속 인상","src":"티스토리 /40 · 03_완성본/037_WMT/02_티스토리원고.md"},{"n":41,"tk":"086790","tkReal":true,"nm":"하나금융지주","fn":"하나금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.297863,0.249673,0.0,0.0,0.251853,0.0,0.0,0.200611,0.0],"weq":false,"times":4,"dps":4586,"cur":"KRW","px":null,"pxd":null,"r":3.69,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":1155,"lx":null,"lp":"2026-08-21","lpPlan":false,"pd":[null,null,null,10,22,null,null,21,null,null,28,null],"fl":[],"one":"4년 새 32.4% 늘어","src":"티스토리 /41 · 03_완성본/065_하나금융지주/02_티스토리원고.md"},{"n":44,"tk":"VIG","tkReal":true,"nm":"VIG","fn":"VIG","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.228573,0.0,0.0,0.273936,0.0,0.0,0.25493,0.0,0.0,0.242561],"weq":false,"times":4,"dps":3.6461,"cur":"USD","px":null,"pxd":null,"r":1.51,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.9295,"lx":"2026-09-28","lp":"2026-09-30","lpPlan":false,"pd":[null,null,31,null,null,30,null,null,30,null,null,24],"fl":[],"one":"배당 성장 ETF","src":"티스토리 /44 · 03_완성본/154_VIG/02_티스토리원고.md"},{"n":45,"tk":"SPYI","tkReal":true,"nm":"SPYI","fn":"SPYI","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":6.3403,"cur":"USD","px":null,"pxd":null,"r":11.88,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.5338,"lx":"2026-09-16","lp":"2026-09-18","lpPlan":false,"pd":[null,null,null,null,null,18,24,21,18,null,null,null],"fl":["변동큼"],"one":"S&P500 커버드콜","src":"티스토리 /45 · 03_완성본/174_SPYI/02_티스토리원고.md"},{"n":46,"tk":"316140","tkReal":true,"nm":"우리금융지주","fn":"우리금융지주","mk":"kr","tx":"kr_일부비과세","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.542857,0.157143,0.0,0.0,0.157143,0.0,0.0,0.142857,0.0],"weq":false,"times":4,"dps":1400,"cur":"KRW","px":null,"pxd":null,"r":4.47,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":220,"lx":"2026-08-07","lp":"2026-08-31","lpPlan":false,"pd":[null,null,null,8,29,null,null,31,null,null,28,null],"fl":["일부비과세","세금넉넉"],"one":"4년 새 51.1% 늘어","src":"티스토리 /46 · 03_완성본/080_우리금융지주/02_티스토리원고.md"},{"n":47,"tk":"VYM","tkReal":true,"nm":"VYM","fn":"VYM","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.234444,0.0,0.0,0.266494,0.0,0.0,0.241301,0.0,0.0,0.257761],"weq":false,"times":4,"dps":3.6755,"cur":"USD","px":null,"pxd":null,"r":2.29,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.8869,"lx":"2026-09-18","lp":"2026-09-22","lpPlan":false,"pd":[null,null,24,null,null,23,null,null,22,null,null,23],"fl":[],"one":"고배당 ETF","src":"티스토리 /47 · 03_완성본/148_VYM/02_티스토리원고.md"},{"n":48,"tk":"105560","tkReal":true,"nm":"KB금융","fn":"KB금융","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.332092,0.236499,0.0,0.0,0.238982,0.0,0.0,0.192427,0.0],"weq":false,"times":4,"dps":4833,"cur":"KRW","px":null,"pxd":null,"r":3.02,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":1155,"lx":"2026-08-06","lp":"2026-08-21","lpPlan":false,"pd":[null,null,null,15,21,null,null,21,null,null,27,null],"fl":[],"one":"4년 새 48.5% 늘어","src":"티스토리 /48 · 03_완성본/050_KB금융/02_티스토리원고.md"},{"n":49,"tk":"TLTW","tkReal":true,"nm":"TLTW","fn":"TLTW","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[2,3,4,5,6,7,8,9,10,11,12],"w":[0.0,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.16667],"weq":false,"times":12,"dps":2.387675,"cur":"USD","px":null,"pxd":null,"r":11.57,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.2886,"lx":"2026-10-02","lp":"2026-10-07","lpPlan":false,"pd":[null,null,null,null,null,null,8,7,8,7,null,null],"fl":["변동큼"],"one":"미국 장기국채 커버드콜","src":"티스토리 /49 · 03_완성본/267_TLTW/02_티스토리원고.md"},{"n":52,"tk":"055550","tkReal":true,"nm":"신한지주","fn":"신한지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.300341,0.25256,0.0,0.0,0.25256,0.0,0.0,0.194539,0.0],"weq":false,"times":4,"dps":2930,"cur":"KRW","px":null,"pxd":null,"r":3.33,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":740,"lx":"2026-07-29","lp":"2026-08-28","lpPlan":false,"pd":[null,null,null,3,29,null,null,28,null,null,28,null],"fl":[],"one":"4년 새 32.1% 올라","src":"티스토리 /52 · 03_완성본/056_신한지주/02_티스토리원고.md"},{"n":53,"tk":"V","tkReal":true,"nm":"비자","fn":"비자(V)","mk":"us","tx":"us","ty":"주식","sc":"금융(결제망)","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":false,"times":4,"dps":2.68,"cur":"USD","px":null,"pxd":null,"r":0.66,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":0.67,"lx":"2026-08-11","lp":"2026-09-01","lpPlan":false,"pd":[null,null,2,null,null,1,null,null,1,null,null,1],"fl":[],"one":"결제망","src":"티스토리 /53 · 03_완성본/022_V/02_티스토리원고.md"},{"n":54,"tk":"037710","tkReal":true,"nm":"광주신세계","fn":"광주신세계","mk":"kr","tx":"kr","ty":"주식","sc":"유통(백화점)","cy":4,"mo":[4,6,9],"w":[0.0,0.0,0.0,0.666666,0.0,0.166667,0.0,0.0,0.166667,0.0,0.0,0.0],"weq":false,"times":3,"dps":3600,"cur":"KRW","px":null,"pxd":null,"r":10.91,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":600,"lx":"2026-08-28","lp":"2026-09-18","lpPlan":false,"pd":[null,null,null,20,null,19,null,null,18,null,null,null],"fl":[],"one":"결산 2400원+분기 600원 두 번","src":"티스토리 /54 · 03_완성본/221_광주신세계/02_티스토리원고.md"},{"n":55,"tk":"032830","tkReal":true,"nm":"삼성생명","fn":"삼성생명","mk":"kr","tx":"kr","ty":"주식","sc":"보험","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":5300,"cur":"KRW","px":null,"pxd":null,"r":2.16,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":5300,"lx":"2025-12-29","lp":"2026-04-17","lpPlan":false,"pd":[null,null,null,17,null,null,null,null,null,null,null,null],"fl":[],"one":"1년에 한 번 5300원","src":"티스토리 /55 · 03_완성본/074_삼성생명/02_티스토리원고.md"},{"n":56,"tk":"446720","tkReal":true,"nm":"SOL 미국배당다우존스","fn":"SOL 미국배당다우존스","mk":"kr","tx":"kr","ty":"ETF","sc":"배당 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":408,"cur":"KRW","px":null,"pxd":null,"r":3.01,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":37,"lx":"2026-09-29","lp":"2026-10-01","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,1,null,null],"fl":[],"one":"국내 상장 미국 배당 ETF","src":"티스토리 /56 · 03_완성본/260_SOL 미국배당다우존스/02_티스토리원고.md"},{"n":57,"tk":"458760","tkReal":true,"nm":"TIGER 미국배당다우존스타겟커버드콜2호","fn":"TIGER 미국배당다우존스타겟커버드콜2호","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":1093,"cur":"KRW","px":null,"pxd":null,"r":10.15,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":91,"lx":"2026-09-29","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","세금넉넉"],"one":"국내 상장 커버드콜","src":"티스토리 /57 · 03_완성본/348_TIGER 미국배당다우존스타겟커버드콜2호/02_티스토리원고.md"},{"n":71,"tk":"175330","tkReal":true,"nm":"JB금융지주","fn":"JB금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.456747,0.215225,0.0,0.0,0.217301,0.0,0.0,0.110727,0.0],"weq":false,"times":4,"dps":1445,"cur":"KRW","px":null,"pxd":null,"r":5.58,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":317,"lx":"2026-11-10","lp":"2026-11-25","lpPlan":true,"pd":[null,null,null,10,26,null,null,27,null,null,25,null],"fl":[],"one":"분기 317원 · 11월 25일 지급","src":"티스토리 /71 · 03_완성본/242_JB금융지주/02_티스토리원고.md"},{"n":72,"tk":"005387","tkReal":true,"nm":"현대차2우B","fn":"현대차2우B","mk":"kr","tx":"kr","ty":"주식","sc":"자동차","cy":4,"mo":[4,6,9,12],"w":[0.0,0.0,0.0,0.257425,0.0,0.247525,0.0,0.0,0.247525,0.0,0.0,0.247525],"weq":false,"times":4,"dps":10100,"cur":"KRW","px":null,"pxd":null,"r":6.74,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":2500,"lx":"2026-11-27","lp":"2026-12-30","lpPlan":true,"pd":[null,null,null,24,null,30,null,null,30,null,null,30],"fl":[],"one":"분기 2,500원·결산 2,600원","src":"티스토리 /72 · 03_완성본/122_현대차2우B/02_티스토리원고.md"},{"n":73,"tk":"000810","tkReal":true,"nm":"삼성화재","fn":"삼성화재","mk":"kr","tx":"kr","ty":"주식","sc":"보험","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":19500,"cur":"KRW","px":null,"pxd":null,"r":2.96,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":19500,"lx":"2026-03-26","lp":"2026-04-20","lpPlan":false,"pd":[null,null,null,20,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 19,500원 · 4월 지급","src":"티스토리 /73 · 03_완성본/059_삼성화재/02_티스토리원고.md"},{"n":74,"tk":"DIVO","tkReal":true,"nm":"DIVO","fn":"DIVO","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":2.29584,"cur":"USD","px":null,"pxd":null,"r":4.85,"rd":"2026-10-30","rh":"최근 지급분 1년 환산","la":0.19132,"lx":"2026-10-29","lp":"2026-10-30","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,30,null,null],"fl":["변동큼"],"one":"매달 0.19132달러(10월분)","src":"티스토리 /74 · 03_완성본/200_DIVO/02_티스토리원고.md"},{"n":75,"tk":"039490","tkReal":true,"nm":"키움증권","fn":"키움증권","mk":"kr","tx":"kr","ty":"주식","sc":"증권","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":11500,"cur":"KRW","px":null,"pxd":null,"r":5.24,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":11500,"lx":"2025-12-29","lp":"2026-04-10","lpPlan":false,"pd":[null,null,null,10,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 11,500원 · 4월 지급","src":"티스토리 /75 · 03_완성본/029_키움증권/02_티스토리원고.md"},{"n":76,"tk":"066570","tkReal":true,"nm":"LG전자","fn":"LG전자","mk":"kr","tx":"kr","ty":"주식","sc":"IT(반도체·전자)","cy":2,"mo":[4,8],"w":[0.0,0.0,0.0,0.62963,0.0,0.0,0.0,0.37037,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":1350,"cur":"KRW","px":null,"pxd":null,"r":0.9,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":500,"lx":"2026-08-12","lp":"2026-08-28","lpPlan":false,"pd":[null,null,null,22,null,null,null,28,null,null,null,null],"fl":[],"one":"결산 850원 + 중간 500원","src":"티스토리 /76 · 03_완성본/944_LG전자/02_티스토리원고.md"},{"n":80,"tk":"329200","tkReal":true,"nm":"TIGER 리츠부동산인프라","fn":"TIGER 리츠부동산인프라","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"리츠","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":396,"cur":"KRW","px":null,"pxd":null,"r":10.69,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":33,"lx":"2026-10-29","lp":"2026-11-03","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,3,null],"fl":["세금넉넉"],"one":"매달 33원 · 12번 같음","src":"티스토리 /80 · 03_완성본/443_TIGER 리츠부동산인프라/02_티스토리원고.md"},{"n":81,"tk":"051600","tkReal":true,"nm":"한전KPS","fn":"한전KPS","mk":"kr","tx":"kr","ty":"주식","sc":"발전소 정비","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":1651,"cur":"KRW","px":null,"pxd":null,"r":4.4,"rd":"2026-11-10","rh":"최근 12개월 실제 지급","la":1651,"lx":"2025-12-29","lp":"2026-04-30","lpPlan":false,"pd":[null,null,null,30,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 1,651원 · 4월 지급","src":"티스토리 /81 · 03_완성본/955_한전KPS/02_티스토리원고.md"},{"n":82,"tk":"138930","tkReal":true,"nm":"BNK금융지주","fn":"BNK금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.471699,0.188679,0.0,0.0,0.188679,0.0,0.0,0.150943,0.0],"weq":false,"times":4,"dps":795,"cur":"KRW","px":null,"pxd":null,"r":6.16,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":150,"lx":"2026-11-09","lp":"2026-11-25","lpPlan":true,"pd":[null,null,null,9,29,null,null,27,null,null,25,null],"fl":[],"one":"분기 150원 · 결산 375원","src":"티스토리 /82 · 03_완성본/957_BNK금융지주/02_티스토리원고.md"},{"n":83,"tk":"086280","tkReal":true,"nm":"현대글로비스","fn":"현대글로비스","mk":"kr","tx":"kr","ty":"주식","sc":"물류·해운","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":5800,"cur":"KRW","px":null,"pxd":null,"r":2.94,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":5800,"lx":"2026-03-30","lp":"2026-04-24","lpPlan":false,"pd":[null,null,null,24,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 5,800원 · 4월 지급","src":"티스토리 /83 · 03_완성본/945_현대글로비스/02_티스토리원고.md"},{"n":84,"tk":"139130","tkReal":true,"nm":"iM금융지주","fn":"iM금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":700,"cur":"KRW","px":null,"pxd":null,"r":4.59,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":700,"lx":"2026-02-26","lp":"2026-04-10","lpPlan":false,"pd":[null,null,null,10,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 700원 · 4월 지급","src":"티스토리 /84 · 03_완성본/960_iM금융지주/02_티스토리원고.md"},{"n":85,"tk":"035250","tkReal":true,"nm":"강원랜드","fn":"강원랜드","mk":"kr","tx":"kr","ty":"주식","sc":"카지노","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":950,"cur":"KRW","px":null,"pxd":null,"r":6.58,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":950,"lx":"2026-03-31","lp":"2026-04-24","lpPlan":false,"pd":[null,null,null,24,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 950원 · 4월 지급","src":"티스토리 /85 · 03_완성본/143_강원랜드/02_티스토리원고.md"},{"n":86,"tk":"000150","tkReal":true,"nm":"두산","fn":"두산","mk":"kr","tx":"kr","ty":"주식","sc":"지주사","cy":4,"mo":[4,5,8],"w":[0.0,0.0,0.0,0.666666,0.166667,0.0,0.0,0.166667,0.0,0.0,0.0,0.0],"weq":false,"times":3,"dps":6000,"cur":"KRW","px":null,"pxd":null,"r":0.98,"rd":"2026-11-13","rh":"최근 12개월 실제 지급","la":1000,"lx":"2026-11-23","lp":"2026-12-09","lpPlan":true,"pd":[null,null,null,30,28,null,null,25,null,null,null,null],"fl":[],"one":"결산 4,000원+분기 1,000원","src":"티스토리 /86 · 06_특별글/발표글_두산_2026-11-15/02_티스토리원고.md"}]};
var HIDE = [5,14,16,20,21,24,33,34,37,38,39,40,41,43,44,45,46,47,48,49,50,52,53,54,55,56,57,60,71,72,73,74,75,76,79,80,81,82,83,84,85,86];
var DATA_URL = 'https://bsw44822-max.github.io/dividend-calc/data.json';
var BLOG = 'https://dividendvending.tistory.com/';
var STORE = 'bdgj4_v1';
var LIMIT = 20000000;
var WEQ_TXT = '실제로는 회차마다 금액이 달라요. 여기서는 1년 치를 똑같이 나눠 보여 줘요.';

var CYN = { 52: '주배당', 12: '월배당', 4: '분기배당', 2: '반기배당', 1: '연배당' };
var CY_ORDER = [52, 12, 4, 2, 1];
var MKN = { kr: '국내', us: '미국' };
var CTRY = { BCE: '캐나다' }; // 미국 상장이지만 회사 나라가 다른 종목(11/18 144방 새 눈 · 세금 15% = 한-캐나다 조약 · /14 원고)
var TAXP = { kr: '15.4%', kr_해외: '15.4%', kr_일부비과세: '15.4%', us: '15%' };
var FLN = { 변동큼: '분배금(ETF가 주는 돈)과 주가가 크게 움직일 수 있어요', 주배당: '매주 받는 돈을 달별로 묶어 보여요', 세금넉넉: '세금은 15.4%를 다 뗀 값이고, 실제 세금은 더 적을 수 있어요', 일부비과세: '일부 비과세 배당이 섞여 있을 수 있어요' };
var OVER_TXT = '세전 1년 배당이 2천만원을 넘어요. 이자·배당 같은 금융소득이 2천만원을 넘으면 다른 소득과 합쳐 세금을 매기는 종합과세 대상이 될 수 있어요. 이 계산기는 그 세금을 계산하지 않아요.';
var DEF_AMT = 10000000, DEF_SH = 100, DEF_GOAL = 300000;
var EX_KEYS = ['BCE', 'T', 'JNJ'];
// 맨 위 빠른 고르기 칩 (앞 4개 = 폰 · 6개 = 넓은 화면) · 목록 '인기순'도 이 차례가 먼저
var POP = ['SCHD', 'JEPI', 'JEPQ', '105560', '005930', '033780'];
var Q_AMT = [[1000000, '100만'], [10000000, '1,000만'], [50000000, '5,000만'], [100000000, '1억']];
var Q_GOAL = [[300000, '30만'], [500000, '50만'], [1000000, '100만'], [3000000, '300만']];
var YEARS = [1, 3, 5, 10, 15, 20, 30];
var GOLD = '#F5C542';
var DRIP_WARN_VOL = '이 종목은 분배금을 주면서 주가가 내려간 적이 있어요. 아래 숫자는 넣은 가정대로 계산한 값이라 실제보다 크게 나올 수 있어요.';
var DRIP_NEED_PG = '배당률이 20%가 넘는 종목은 이 배당률이 몇 년씩 이어진다고 보기 어려워서 재투자 계산을 하지 않아요. 위 카드의 1년 금액을 봐 주세요. "가정 바꾸기"에서 배당률을 20보다 낮게 넣으면 계산해요.';
var CC_TXT = '분배금(ETF가 주는 돈)이 높아도 주가가 내려가면 원금이 줄 수 있어요.';
var GAUGE_NOTE = '이 계산기에 담은 배당만 더한 값이에요. 예금 이자와 다른 계좌 배당도 합쳐서 2,000만원을 넘는지 봐야 해요. ISA·연금계좌 안의 배당은 이 기준에서 빠져요.';
var LINK_NOTE = '링크로 받은 계산이에요. 여기서 고쳐도 내 저장 값은 그대로예요.';
var COPY_OK = '링크를 복사했어요. 카톡이나 메모에 붙여 넣으면 다른 기기에서도 그대로 열려요.';
var COPY_NO = '아래 주소를 길게 눌러 복사해 주세요.';

var R = '#bdgj4-root.bdgj4-root';
// 선택자 앞말(R)을 한 군데서 붙임 · 쉼표로 나뉜 선택자마다 R을 붙인다 (선택자 안에 쉼표가 든 :not(a,b) 같은 건 쓰지 않음)
function X(sel, body){ return sel.split(',').map(function(s){ return R + ' ' + s.trim(); }).join(',') + '{' + body + '}'; }
// 폭 클래스가 붙은 뿌리 밑 (w = 'bdgj4-w2' 또는 'bdgj4-w3')
function XW(w, sel, body){ return sel.split(',').map(function(s){ return R + '.' + w + ' ' + s.trim(); }).join(',') + '{' + body + '}'; }
var FONT_NUM = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",sans-serif';
var FONT_BODY = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",sans-serif';

var TITLES = ['배당금 계산기', '월배당 계산기, 내 배당 달력 만들기', '담은 종목', '내 배당 달력', '섹터(업종)별 금액과 비중'];
var FONT_TXT = (function(){ var s = '0123456789,.%-~ 억만원월' + TITLES.join(''), o = '', i; for (i = 0; i < s.length; i++) { if (o.indexOf(s.charAt(i)) < 0) { o += s.charAt(i); } } return o; })();

var W2 = 'bdgj4-w2', W3 = 'bdgj4-w3';
var CSS = [
  // 뿌리·리셋
  R + '{--bd-ink:#0D1220;--bd-panel:#EEF2F7;--bd-paper:#fff;--bd-gold:#F5C542;--bd-blue:#1F5FBF;--bd-blue-t:#DCE8FB;--bd-mute:#4F5E70;--bd-mute-n:#8AA0B6;--bd-line:#D3DBE6;--bd-line-n:#34425A;--bd-edge:#7C8A9C;--bd-track:#DDE4EE;--bd-num:' + FONT_NUM + ';--bd-body:' + FONT_BODY + ';max-width:1100px;margin:24px auto;padding:20px 14px 14px;background:var(--bd-panel);color:var(--bd-ink);font:400 16px/1.6 var(--bd-body);border:0;border-radius:16px;box-sizing:border-box;word-break:keep-all;overflow-wrap:break-word;text-align:left;-webkit-text-size-adjust:100%;}',
  X('*', 'box-sizing:border-box;font-family:inherit;letter-spacing:normal;text-shadow:none;-webkit-tap-highlight-color:transparent;'),
  X('h2,h3,p,label,summary,details,button,input,a', 'margin:0;padding:0;border:0;background:none;box-shadow:none;color:inherit;font:inherit;text-transform:none;text-indent:0;float:none;width:auto;max-width:none;min-width:0;-webkit-appearance:none;appearance:none;'),
  X('h2::before,h2::after,h3::before,h3::after', 'content:none;display:none;'),
  X('::selection', 'background:#0D1220;color:#fff;'),
  X('input', 'caret-color:#1F5FBF;'),
  X(':focus-visible', 'outline:3px solid #1F5FBF;outline-offset:2px;'),
  X('.bdgj4-band :focus-visible,.bdgj4-cards :focus-visible', 'outline-color:#F5C542;'),
  // 제목·글
  X('.bdgj4-h', 'font:900 30px/1.2 var(--bd-num);letter-spacing:-.02em;margin:0 0 12px;'),
  R + '[data-site] .bdgj4-h{display:none;}',
  X('.bdgj4-h2', 'font:900 24px/1.25 var(--bd-num);letter-spacing:-.015em;margin:0 0 8px;'),
  X('.bdgj4-sec', 'margin:40px 0 0;padding:0;border:0;'),
  X('.bdgj4-lab', 'display:block;font-size:16px;font-weight:700;margin:14px 0 6px;'),
  X('.bdgj4-hint,.bdgj4-note', 'font-size:16px;line-height:1.5;color:var(--bd-mute);margin:6px 0 0;'),
  X('.bdgj4-stale,.bdgj4-warn', 'font-size:16px;font-weight:500;color:#7A3E00;background:#FFF1CC;border:0;border-radius:10px;padding:10px 14px;margin:10px 0 0;'),
  X('.bdgj4-lnk', 'font-size:16px;color:var(--bd-ink);background:#fff;border-radius:10px;padding:10px 14px;margin:10px 0 0;box-shadow:inset 0 0 0 1px var(--bd-edge);'),
  X('.bdgj4-lnk .bdgj4-btns', 'margin-top:8px;'),
  // 입력·찾기 목록
  X('.bdgj4-inp', 'display:block;width:100%;height:52px;padding:0 14px;font-size:18px;font-weight:700;color:var(--bd-ink);background:#fff;border:1px solid var(--bd-edge);border-radius:10px;'),
  X('.bdgj4-inp:focus', 'outline:3px solid #1F5FBF;outline-offset:1px;border-color:#0D1220;'),
  X('.bdgj4-inp::placeholder', 'color:var(--bd-mute);font-weight:400;'),
  X('.bdgj4-inp.bdgj4-sm', 'height:48px;font-size:16px;font-weight:500;'),
  X('.bdgj4-inp.bdgj4-ro', 'font-size:16px;font-weight:500;margin-top:8px;'),
  X('.bdgj4-wrap', 'position:relative;'),
  // 금액 읽기 줄 = 입력 칸 안 오른쪽 (폰 첫 화면 줄이기 · 설계도 A-7 ①)
  X('.bdgj4-vwrap', 'position:relative;'),
  X('.bdgj4-vwrap .bdgj4-inp', 'padding-right:46%;'),
  X('.bdgj4-vread', 'position:absolute;right:14px;top:0;height:52px;line-height:52px;max-width:44%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:16px;color:var(--bd-mute);pointer-events:none;'),
  X('.bdgj4-sug', 'position:absolute;left:0;right:0;top:100%;border:1px solid var(--bd-edge);border-radius:10px;margin-top:4px;background:#fff;box-shadow:0 12px 28px -8px rgba(13,18,32,.35);max-height:300px;overflow-y:auto;z-index:20;'),
  X('.bdgj4-sug button', 'display:block;width:100%;text-align:left;min-height:48px;padding:12px 14px;font-size:16px;border-bottom:1px solid var(--bd-line);cursor:pointer;'),
  X('.bdgj4-sug button:hover', 'background:var(--bd-panel);'),
  X('.bdgj4-sug .bdgj4-sugnone', 'padding:11px 12px;color:#5B6B7D;'),
  // 첫 칸 틀 (폰 = 그냥 세로 · w2·w3 = 두 줄기는 맨 아래)
  X('.bdgj4-top', 'display:block;'),
  // 결과 카드 (30초 요약 꼴 · 위 4px 등급색 띠)
  X('.bdgj4-slot', 'position:relative;container-type:inline-size;margin:16px 0 0;'),
  X('.bdgj4-slotin', 'position:relative;overflow:hidden;border-radius:12px;'),
  X('.bdgj4-cards', '--bd-tc:#F5C542;display:block;margin:0;padding:14px 20px 14px;background:#0D1220;color:#fff;border-top:4px solid var(--bd-tc);border-radius:12px;'),
  X('.bdgj4-tier', 'font:800 16px/1.4 var(--bd-body);color:var(--bd-tc);margin:0 0 2px;'),
  X('.bdgj4-tk', 'display:block;'),
  X('.bdgj4-tk-nm', 'min-width:0;font-size:20px;font-weight:800;line-height:1.35;color:#fff;'),
  X('.bdgj4-tk-sub', 'font-size:16px;color:var(--bd-mute-n);margin:2px 0 0;'),
  X('.bdgj4-card', 'background:none;border:0;padding:0;margin:10px 0 0;'),
  X('.bdgj4-card-l', 'font-size:16px;font-weight:700;color:var(--bd-mute-n);flex:none;'),
  X('.bdgj4-money', 'white-space:nowrap;'),
  X('.bdgj4-card-v', 'font:900 40px/1.15 var(--bd-num);font-size:clamp(40px,13cqi,56px);letter-spacing:-.01em;color:var(--bd-tc);font-variant-numeric:tabular-nums;min-height:1.15em;white-space:nowrap;'),
  X('.bdgj4-card-v.bdgj4-long', 'font-size:32px;font-size:clamp(30px,10cqi,44px);'),
  X('.bdgj4-card.bdgj4-sub,.bdgj4-r3', 'display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;margin:0;padding:10px 0;border-top:1px solid var(--bd-line-n);'),
  X('.bdgj4-card:not(.bdgj4-sub)+.bdgj4-sub', 'margin-top:10px;'),
  X('.bdgj4-card.bdgj4-sub .bdgj4-card-v', 'font:900 20px/1.3 var(--bd-num);color:#fff;text-align:right;min-height:0;flex:1 1 auto;min-width:0;max-width:100%;'),
  X('.bdgj4-r3-l', 'font-size:16px;font-weight:700;color:var(--bd-mute-n);flex:none;'),
  X('.bdgj4-r3-v', 'font-size:16px;font-weight:700;color:#fff;text-align:right;flex:1 1 160px;min-width:0;'),
  X('.bdgj4-tk-ft', 'font-size:16px;line-height:1.55;color:var(--bd-mute-n);margin:0;padding:10px 0 0;border-top:1px solid var(--bd-line-n);'),
  X('.bdgj4-tk-ft + .bdgj4-tk-ft', 'border-top:0;padding-top:6px;'),
  X('.bdgj4-tk-ft a', 'color:#fff;font-weight:700;text-decoration:underline;text-underline-offset:4px;white-space:nowrap;'),
  X('.bdgj4-cc', 'margin:10px 0 0;padding:2px 0 2px 10px;border-left:3px solid #F5C542;color:#fff;font-size:16px;line-height:1.55;'),
  '@keyframes bdgj4-fade{from{opacity:0}to{opacity:1}}',
  X('.bdgj4-cards.bdgj4-go', 'animation:bdgj4-fade .2s ease-out both;'),
  '@media (prefers-reduced-motion:reduce){' + X('.bdgj4-cards.bdgj4-go', 'animation:none;') + '}',
  // 단추
  X('.bdgj4-btns', 'display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;'),
  X('.bdgj4-btn', 'min-height:48px;padding:8px 16px;border-radius:10px;font-size:16px;font-weight:700;background:#fff;color:var(--bd-ink);box-shadow:inset 0 0 0 1px var(--bd-edge);cursor:pointer;transition:background-color .12s,color .12s;'),
  X('.bdgj4-btn:active', 'transform:translateY(1px);'),
  X('.bdgj4-btn.bdgj4-pri', 'background:#0D1220;color:#fff;box-shadow:none;'),
  X('.bdgj4-btn.bdgj4-add', 'flex:1 1 160px;'),
  X('.bdgj4-btn.bdgj4-xs', 'min-height:44px;padding:6px 12px;flex:none;white-space:nowrap;'),
  X('.bdgj4-btn.bdgj4-inb', 'background:var(--bd-blue-t);color:var(--bd-blue);box-shadow:none;'),
  X('.bdgj4-btn.bdgj4-ghost', 'background:none;box-shadow:none;padding:6px 0;min-width:44px;justify-content:flex-start;text-align:left;font-weight:500;text-decoration:underline;text-underline-offset:4px;'),
  X('.bdgj4-btn[aria-expanded]', 'display:inline-flex;align-items:center;justify-content:center;'),
  X('.bdgj4-btn[aria-expanded]::after', 'content:"";width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);margin:0 0 4px 10px;flex:none;'),
  X('.bdgj4-btn[aria-expanded="true"]::after', 'transform:rotate(-135deg);margin-bottom:-4px;'),
  X('.bdgj4-act .bdgj4-btns', 'gap:10px 8px;'),
  X('.bdgj4-btn[disabled]', 'opacity:.55;cursor:not-allowed;'),
  // 빠른 금액 (4칸 한 줄 · 누르면 덮어씀)
  X('.bdgj4-quick', 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0 0;'),
  X('.bdgj4-quick .bdgj4-btn', 'min-height:44px;padding:4px 2px;font-weight:700;white-space:nowrap;'),
  X('.bdgj4-quick .bdgj4-btn.bdgj4-on', 'background:#0D1220;color:#fff;box-shadow:none;'),
  X('.bdgj4-fx', 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:8px 0 0;font-size:16px;color:var(--bd-mute);'),
  X('.bdgj4-fx .bdgj4-inp', 'width:140px;flex:none;'),
  // 칩 (알약 = 여러 개 켜기)
  X('.bdgj4-chips', 'display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;'),
  X('.bdgj4-chip', 'min-height:44px;padding:0 14px;border-radius:999px;font-size:16px;font-weight:500;background:#fff;color:var(--bd-ink);box-shadow:inset 0 0 0 1px #C3CDDA;cursor:pointer;'),
  X('.bdgj4-chip.bdgj4-on', 'background:#0D1220;color:#fff;box-shadow:none;'),
  // 맨 위 빠른 종목 칩 (폰 4개 · 넓은 화면 6개 + 더 보기) · 앞 점 = 등급색
  X('.bdgj4-pick', 'display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 0;'), // 11/18 144방: 블로그 글 안 폰 폭 310px(실측)에서 칩이 잘려 줄바꿈으로
  X('.bdgj4-pick .bdgj4-chip', 'flex:none;display:inline-flex;align-items:center;gap:5px;padding:0 9px;white-space:nowrap;'),
  X('.bdgj4-pick .bdgj4-p6,.bdgj4-pick .bdgj4-pmore', 'display:none;'),
  X('.bdgj4-dot', 'display:inline-block;flex:none;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 1px rgba(13,18,32,.25);vertical-align:middle;'),
  // 붙은 조각 (둘·셋 중 하나 고르기)
  X('.bdgj4-seg', 'display:inline-flex;flex-wrap:nowrap;gap:0;padding:3px;border-radius:12px;background:var(--bd-track);max-width:100%;'),
  X('.bdgj4-seg .bdgj4-chip', 'min-height:42px;border-radius:9px;background:transparent;box-shadow:none;'),
  X('.bdgj4-seg .bdgj4-chip.bdgj4-on', 'background:#0D1220;color:#fff;'),
  X('.bdgj4-tabs', 'display:flex;width:100%;margin:12px 0 0;'),
  X('.bdgj4-tabs .bdgj4-chip', 'flex:1 1 0;padding:0 4px;font-weight:700;white-space:nowrap;'),
  // 접는 칸·흰 칸
  X('.bdgj4-box', 'background:#fff;border:0;border-radius:12px;padding:14px 16px;margin:12px 0 0;'),
  X('.bdgj4-fold', 'padding:4px 16px;'),
  X('.bdgj4-fold[open]', 'padding-bottom:16px;'),
  X('.bdgj4-box summary,.bdgj4-det summary', 'display:flex;align-items:center;justify-content:space-between;min-height:48px;font-size:16px;font-weight:700;cursor:pointer;list-style:none;'),
  X('.bdgj4-fold > summary', 'font-size:18px;'),
  X('.bdgj4-box summary::-webkit-details-marker,.bdgj4-det summary::-webkit-details-marker', 'display:none;'),
  X('.bdgj4-box summary::after,.bdgj4-det summary::after', 'content:"";width:9px;height:9px;border-right:2px solid var(--bd-ink);border-bottom:2px solid var(--bd-ink);transform:rotate(45deg);margin:0 6px 4px 12px;flex:none;'),
  X('.bdgj4-box[open] > summary::after,.bdgj4-det[open] > summary::after', 'transform:rotate(-135deg);margin-bottom:-4px;'),
  // 같은 돈이면 비슷한 종목
  X('.bdgj4-simb', 'display:block;width:100%;text-align:left;min-height:48px;padding:10px 0;font-size:16px;border-bottom:1px solid var(--bd-line);cursor:pointer;'),
  X('.bdgj4-simb b', 'font-weight:800;'),
  X('.bdgj4-simb .bdgj4-dot', 'margin:0 6px 2px 0;'),
  // 재투자
  X('.bdgj4-dlead', 'font-size:18px;font-weight:800;margin:4px 0 0;'),
  X('.bdgj4-dres', 'display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:10px 0 0;'),
  X('.bdgj4-dcell', 'background:var(--bd-panel);border-radius:10px;padding:10px 14px;'),
  X('.bdgj4-dcell span', 'display:block;color:var(--bd-mute);font-size:16px;'),
  X('.bdgj4-dcell b', 'display:block;font:900 20px/1.35 var(--bd-num);font-variant-numeric:tabular-nums;'),
  X('.bdgj4-dttl', 'font-size:16px;font-weight:800;margin:14px 0 0;'),
  X('.bdgj4-gp', 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0;'),
  // 종목 목록
  X('.bdgj4-list', 'background:#fff;border-radius:12px;padding:0 12px;margin:10px 0 0;'),
  X('.bdgj4-it', 'position:relative;border-bottom:1px solid var(--bd-line);'),
  X('.bdgj4-it:last-child', 'border-bottom:0;'),
  X('.bdgj4-it-top', 'display:flex;align-items:flex-start;gap:8px;padding:8px 0 2px;cursor:pointer;'),
  X('.bdgj4-rk', 'flex:none;width:24px;text-align:right;color:var(--bd-mute);font-weight:500;font-variant-numeric:tabular-nums;line-height:28.8px;padding:7px 0;'),
  X('.bdgj4-nm', 'flex:1 1 auto;min-width:0;font-size:18px;font-weight:700;line-height:28.8px;padding:7px 0;'),
  X('.bdgj4-rt', 'flex:none;min-width:62px;text-align:right;font:900 18px/28.8px var(--bd-num);font-variant-numeric:tabular-nums;padding:7px 0;white-space:nowrap;'),
  X('.bdgj4-rt .bdgj4-dot', 'margin:0 6px 3px 0;'),
  X('.bdgj4-arw', 'position:absolute;right:4px;top:50%;margin-top:-8px;width:9px;height:9px;border-right:2px solid var(--bd-mute);border-bottom:2px solid var(--bd-mute);transform:rotate(45deg);'),
  X('.bdgj4-open .bdgj4-arw', 'transform:rotate(-135deg);'),
  X('.bdgj4-it-sub', 'position:relative;cursor:pointer;padding:0 28px 12px 32px;font-size:16px;color:var(--bd-mute);'),
  X('.bdgj4-it-det', 'margin:0 0 12px;padding:12px 14px;background:var(--bd-panel);border-radius:10px;font-size:16px;'),
  X('.bdgj4-it-det .bdgj4-btns', 'margin-top:8px;'),
  X('.bdgj4-kv', 'display:grid;grid-template-columns:minmax(80px,38%) minmax(0,1fr);column-gap:12px;padding:3px 0;'),
  X('.bdgj4-kv > span:first-child', 'color:var(--bd-mute);'),
  X('.bdgj4-kv > span:last-child', 'font-weight:700;'),
  X('.bdgj4-it-det a:not(.bdgj4-btn)', 'color:var(--bd-blue);font-weight:700;text-decoration:underline;text-underline-offset:4px;'),
  // 담은 종목
  X('.bdgj4-bklist', 'background:#fff;border-radius:12px;padding:0 14px;margin:10px 0 0;'),
  X('.bdgj4-bklist:empty', 'padding:0;'),
  X('.bdgj4-bk', 'border:0;border-radius:0;background:none;margin:0;padding:14px 0;border-bottom:1px solid var(--bd-line);'),
  X('.bdgj4-bk:last-child', 'border-bottom:0;'),
  X('.bdgj4-bk-top', 'display:flex;align-items:center;justify-content:space-between;gap:8px;'),
  X('.bdgj4-bk-nm', 'font-size:18px;font-weight:700;min-width:0;'),
  X('.bdgj4-bk-row', 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 0;'),
  X('.bdgj4-bk-row .bdgj4-inp', 'width:150px;flex:1 1 96px;max-width:200px;'),
  X('.bdgj4-bk-res', 'font-weight:800;margin:8px 0 0;font-variant-numeric:tabular-nums;'),
  // 달력 (칸이 곧 막대)
  X('.bdgj4-cal', 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:10px 0 0;'),
  X('.bdgj4-cell', '--v:0%;display:block;min-width:0;min-height:108px;padding:8px 2px 8px 6px;border:0;border-radius:10px;text-align:left;font-size:16px;line-height:1.35;color:var(--bd-ink);background:#fff;background:linear-gradient(to top,var(--bd-blue-t) var(--v),#fff var(--v));cursor:pointer;'),
  X('.bdgj4-cell b', 'display:block;font:900 16px/1.4 var(--bd-num);'),
  X('.bdgj4-cell span,.bdgj4-void', 'display:block;color:var(--bd-mute);'),
  X('.bdgj4-cell .bdgj4-amt', 'white-space:nowrap;display:block;font:900 16px/1.3 var(--bd-num);letter-spacing:-.7px;font-variant-numeric:tabular-nums;color:var(--bd-ink);'),
  X('.bdgj4-cell.bdgj4-sel', 'background:#0D1220;color:#fff;'),
  X('.bdgj4-cell.bdgj4-sel span,.bdgj4-cell.bdgj4-sel .bdgj4-void', 'color:var(--bd-mute-n);'),
  X('.bdgj4-cell.bdgj4-sel span.bdgj4-amt', 'color:#F5C542;'),
  X('.bdgj4-mdet', 'margin:8px 0 0;padding:12px 14px;border:0;border-radius:10px;background:#fff;'),
  X('.bdgj4-dl', 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0;margin:12px 0 0;'),
  X('.bdgj4-dl > span', 'padding:8px 0;border-bottom:1px solid var(--bd-line);'),
  X('.bdgj4-dl > span:nth-child(odd)', 'color:var(--bd-mute);'),
  X('.bdgj4-dl > span:nth-child(even)', 'font-weight:800;text-align:right;font-variant-numeric:tabular-nums;padding-left:12px;'),
  // 2천만 막대
  X('.bdgj4-gauge', 'margin:14px 0 0;'),
  X('.bdgj4-gauge-t', 'font-size:16px;font-weight:700;'),
  X('.bdgj4-gauge-b', 'height:14px;margin:6px 0 0;background:#DDE4EE;border-radius:7px;overflow:hidden;'),
  X('.bdgj4-gauge-b i', 'display:block;height:100%;background:#1F5FBF;border-radius:7px;'),
  // 섹터 막대
  X('.bdgj4-bar', 'margin:12px 0 0;'),
  X('.bdgj4-bar-t', 'display:flex;justify-content:space-between;gap:8px;'),
  X('.bdgj4-bar-t span:last-child', 'font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;'),
  X('.bdgj4-bar-b', 'height:12px;margin-top:4px;background:var(--bd-track);border-radius:0 2px 2px 0;overflow:hidden;'),
  X('.bdgj4-bar-b i', 'display:block;height:100%;background:var(--bd-blue);border-radius:0 2px 2px 0;'),
  // 표·안내·아래 띠
  X('.bdgj4-tblwrap', 'overflow-x:auto;-webkit-overflow-scrolling:touch;background:#fff;border:0;border-radius:12px;margin:8px 0 0;'),
  X('.bdgj4-tblwrap table', 'border-collapse:collapse;min-width:560px;width:100%;font-size:16px;'),
  X('.bdgj4-tblwrap small,.bdgj4-tblwrap td *,.bdgj4-tblwrap th *', 'font-size:16px;'),
  X('.bdgj4-tblwrap th', 'font-weight:700;color:var(--bd-mute);white-space:nowrap;'),
  X('.bdgj4-tblwrap th,.bdgj4-tblwrap td', 'white-space:nowrap;padding:10px 12px;border-bottom:1px solid var(--bd-line);font-size:16px;text-align:left;'),
  X('.bdgj4-tblwrap th:first-child,.bdgj4-tblwrap td:first-child', 'white-space:normal;min-width:180px;'),
  X('.bdgj4-ytbl table', 'min-width:0;'),
  X('.bdgj4-ytbl th:first-child,.bdgj4-ytbl td:first-child', 'min-width:0;'),
  X('.bdgj4-foot', 'margin:40px 0 0;padding-top:14px;border-top:1px solid var(--bd-line);font-size:16px;color:var(--bd-mute);'),
  X('.bdgj4-foot p', 'margin:0 0 4px;'),
  X('.bdgj4-band', 'position:sticky;bottom:8px;z-index:15;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 0 0;padding:8px 8px 8px 16px;border-radius:14px;background:#0D1220;color:#fff;font-weight:500;box-shadow:0 8px 20px -8px rgba(13,18,32,.5);'),
  X('.bdgj4-band-a', 'white-space:nowrap;display:block;font:900 18px/1.3 var(--bd-num);color:#F5C542;font-variant-numeric:tabular-nums;'),
  X('.bdgj4-band .bdgj4-btn', 'background:#fff;color:#0D1220;box-shadow:none;white-space:nowrap;'),
  // w2 (상자 폭 600 이상 · 글 안): 첫 칸 두 줄기 (왼쪽 입력 5 : 오른쪽 카드 6) · 칩 6개 · 재투자 칸 2칸·2×2
  R + '.' + W2 + '{padding:28px 24px 20px;}',
  XW(W2, '.bdgj4-top', 'display:grid;grid-template-columns:minmax(292px,5fr) minmax(0,6fr);column-gap:28px;grid-template-areas:"in slot" "act slot";align-items:start;'),
  XW(W2, '.bdgj4-in', 'grid-area:in;min-width:0;'), XW(W2, '.bdgj4-slot', 'grid-area:slot;margin-top:30px;'), XW(W2, '.bdgj4-act', 'grid-area:act;min-width:0;'),
  XW(W2, '.bdgj4-cell', 'min-height:124px;'),
  XW(W2, '.bdgj4-sm-row,.bdgj4-dform', 'display:flex;gap:12px;'), XW(W2, '.bdgj4-sm-row > *,.bdgj4-dform > *', 'flex:1 1 0;min-width:0;'),
  XW(W2, '.bdgj4-pick', 'flex-wrap:wrap;gap:6px;overflow:visible;'), XW(W2, '.bdgj4-pick .bdgj4-chip', 'padding:0 12px;'),
  XW(W2, '.bdgj4-pick .bdgj4-p6', 'display:inline-flex;'), XW(W2, '.bdgj4-pick .bdgj4-pmore', 'display:inline-flex;'),
  XW(W2, '.bdgj4-dres', 'grid-template-columns:repeat(2,minmax(0,1fr));'),
  // w3 (상자 폭 1000 이상 · 사이트 PC): 큰 숫자 64까지 · 재투자 왼쪽 입력·오른쪽 결과 · 밑은 두 줄기(왼쪽 종목 고르기 11 : 오른쪽 담은 종목·달력·섹터 9)
  R + '.' + W3 + '{padding:32px 32px 24px;}',
  XW(W3, '.bdgj4-top', 'column-gap:36px;'),
  XW(W3, '.bdgj4-card-v', 'font-size:clamp(40px,13cqi,64px);'),
  XW(W3, '.bdgj4-dwrap', 'display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);column-gap:28px;align-items:start;'),
  XW(W3, '.bdgj4-dform', 'display:block;'),
  XW(W3, '.bdgj4-cols', 'display:grid;grid-template-columns:minmax(0,11fr) minmax(0,9fr);column-gap:32px;align-items:start;'),
  XW(W3, '.bdgj4-colL,.bdgj4-colR', 'min-width:0;')
].join('');

function h(tag, cls, text){ var e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined && text !== null) { e.textContent = text; } return e; }
function add(p, c){ p.appendChild(c); return c; }
function btn(cls, text, fn){ var b = h('button', 'bdgj4-btn ' + cls, text); b.type = 'button'; if (fn) { b.addEventListener('click', fn); } return b; }
function chip(text, on, fn){ var b = h('button', 'bdgj4-chip' + (on ? ' bdgj4-on' : ''), text); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.addEventListener('click', fn); return b; }
var CELLPAD = 8;
var MONEY_RE = /-?\d[\d,]*(?:억(?: \d[\d,]*만)?(?: \d[\d,]*)?|만(?: \d[\d,]*)?)?원(?:\(\d+월 \d+일\))?|\(?\d+월 \d+일\)?/g;
function setM(el, text){
  el.textContent = ''; text = String(text); var last = 0, m;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text)) !== null) {
    if (m.index > last) { el.appendChild(document.createTextNode(text.slice(last, m.index))); }
    add(el, h('span', 'bdgj4-money', m[0])); last = m.index + m[0].length;
  }
  if (last < text.length) { el.appendChild(document.createTextNode(text.slice(last))); }
}
function fit(el, min){
  el.style.fontSize = '';
  var fs = parseFloat(window.getComputedStyle(el).fontSize), g = 0;
  while (el.scrollWidth > el.clientWidth + 0.5 && fs > min && g < 40) { fs -= 1; el.style.fontSize = fs + 'px'; g++; }
}
function checkTbl(){ if (!E.tblHold || !E.tblHint) { return; } E.tblHint.style.display = (E.tblDet.open && E.tblHold.scrollWidth > E.tblHold.clientWidth + 1) ? '' : 'none'; }
function fitCal(){
  if (!E.cal || !E.cal.getClientRects().length) { return; }
  var els = E.cal.querySelectorAll('.bdgj4-cell b, .bdgj4-cell .bdgj4-amt, .bdgj4-cell span:not(.bdgj4-void)'), mx = 0, i, w, rg = document.createRange();
  for (i = 0; i < els.length; i++) { rg.selectNodeContents(els[i]); w = rg.getBoundingClientRect().width; if (w > mx) { mx = w; } }
  var cw = E.cal.clientWidth, cands = [6, 4, 3, 2], n = 2;
  for (i = 0; i < cands.length; i++) { if ((cw - 4 * (cands[i] - 1)) / cands[i] - CELLPAD >= mx) { n = cands[i]; break; } }
  E.cal.style.gridTemplateColumns = 'repeat(' + n + ',minmax(0,1fr))';
}
function fitAll(){ if (E.cAvg) { fit(E.cAvg, 20); fit(E.cYear, 16); } fitCal(); checkTbl(); }
function comma(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtWon(n){
  n = Math.round(n); if (!isFinite(n)) { return '-'; }
  var neg = n < 0; n = Math.abs(n);
  if (n < 10000) { return (neg ? '-' : '') + comma(n) + '원'; }
  var eok = Math.floor(n / 100000000), man = Math.floor((n % 100000000) / 10000), rest = n % 10000, s = '';
  if (eok) { s += comma(eok) + '억'; }
  if (man) { s += (s ? ' ' : '') + comma(man) + '만'; }
  if (rest) { s += ' ' + comma(rest); }
  return (neg ? '-' : '') + s + '원';
}
function md(d){ if (!d) { return ''; } var p = String(d).split('-'); return p.length >= 3 ? Number(p[1]) + '월 ' + Number(p[2]) + '일' : ''; }
function num(v){ var x = Number(String(v).replace(/[^0-9]/g, '')); return x > 0 ? x : 0; }
// 주 수 = 소수 4자리까지 · 치는 중엔 칸 글자를 다시 쓰지 않음(글자가 아닌 것만 걸러 냄)
function cleanSh(s){ s = String(s).replace(/[^0-9.]/g, ''); var i = s.indexOf('.'); if (i >= 0) { s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 4); } return s; }
function numSh(s){ var x = parseFloat(cleanSh(s)); return x > 0 ? Math.round(x * 10000) / 10000 : 0; }
function fmtSh(v){ var x = Math.round(Number(v) * 10000) / 10000; if (!(x > 0)) { return ''; } var p = x.toFixed(4).replace(/0+$/, '').replace(/\.$/, '').split('.'); return comma(p[0]) + (p[1] ? '.' + p[1] : ''); }
function numDec(s){ var t = String(s).replace(/[^0-9.\-]/g, ''); if (t === '' || t === '-' || t === '.') { return null; } var x = parseFloat(t); return isFinite(x) ? x : null; }
function money(it, v){ if (v === null || v === undefined) { return ''; } return it.cur === 'USD' ? '$' + v : fmtWon(v); }
function monthsText(it){
  if (it.cy === 52) { return '매주'; }
  if (it.mo && it.mo.length === 12) { return '매달'; }
  if (it.cy === 12 && it.mo && it.mo.length === 11) {
    var miss = 0, i, dbl = [], mn = 9, t = '';
    for (i = 1; i <= 12; i++) { if (it.mo.indexOf(i) < 0) { miss = i; break; } }
    if (it.w && it.times > it.mo.length) {
      it.w.forEach(function(v){ if (v > 0 && v < mn) { mn = v; } });
      it.w.forEach(function(v, k){ if (v > 1.5 * mn) { dbl.push((k + 1) + '월'); } });
      if (dbl.length) { t = '(' + dbl.join(', ') + ' 두 번)'; }
    }
    return miss + '월만 빼고 매달' + t;
  }
  return it.mo.map(function(m){ return m + '월'; }).join(', ');
}
function cyText(it){
  var n = CYN[it.cy] || '-', nom = it.cy === 4 ? 4 : (it.cy === 2 ? 2 : 0);
  if (nom && it.times > 0 && it.times !== nom) { n += '(최근 1년 ' + it.times + '번)'; }
  return n;
}
function mkOf(it){ return (it && !it.custom && it.mk === 'us') ? 'us' : 'kr'; }
function listItems(){ return allItems(); }
function showCode(it){ if (!it || it.custom) { return false; } if (it.tkReal === false) { return false; } if (it.tkReal === true) { return true; } return !/^n/.test(String(it.tk)); }
function rhText(s){ return s === '최근 지급분 1년 환산' ? '최근 한 번 받은 돈 × 1년 횟수' : s; }
// 비공개 글은 주소를 안 그림 (HIDE = 빌드가 비공개번호.txt에서 넣음 · data.json이 새로 와도 그대로)
function linkOf(it){
  if (!it || it.custom || !it.n) { return ''; }
  var ok = C.linkOk ? C.linkOk(it, HIDE) : HIDE.indexOf(Number(it.n)) < 0;
  return ok ? BLOG + it.n : '';
}
function tierOf(it){ try { return C.tier ? C.tier(it) : null; } catch (e) { return null; } }
function tierColor(it){ var t = tierOf(it); return (t && t.color) || GOLD; }
function dotOf(it){ var t = tierOf(it), d = h('span', 'bdgj4-dot'); d.style.background = (t && t.color) || GOLD; d.setAttribute('role', 'img'); d.setAttribute('aria-label', t ? (t.label || t.name || '') : ''); if (!t) { d.setAttribute('aria-hidden', 'true'); } return d; }
function fxNow(){ return S.fx > 0 ? S.fx : DATA.fx; }
function dateRange(){
  var lo = '', hi = '';
  DATA.items.forEach(function(it){ if (it.rd) { if (!lo || it.rd < lo) { lo = it.rd; } if (!hi || it.rd > hi) { hi = it.rd; } } });
  return lo && hi ? md(lo) + '~' + md(hi) : '';
}
function monthDates(it){
  if (it.cy === 52) { return '매주'; }
  var known = [], unknown = [];
  it.mo.forEach(function(m){ if (it.pd && it.pd[m - 1]) { known.push(m + '월 ' + it.pd[m - 1] + '일쯤'); } else { unknown.push(m + '월'); } });
  if (unknown.length === 12) { return '매달 날짜 미정'; }
  var parts = [];
  if (known.length) { parts.push(known.join(', ')); }
  if (unknown.length) { parts.push(unknown.join(', ') + ' 날짜 미정'); }
  return parts.join(' / ');
}

// ---------- 상태 ----------
// mode = 'amt'(투자금) · 'sh'(주 수) · 'goal'(목표 월배당) · fx = 바꾼 환율(기기에 저장 X · 링크에만) · d = 재투자 입력(pg·r = null이면 빈칸)
function freshS(){ return { sel: 'SCHD', mode: 'amt', amt: DEF_AMT, sh: DEF_SH, gl: DEF_GOAL, minR: 0, basket: [], customs: [], cyOn: {}, mkOn: {}, scOn: {}, q: '', sort: 'pop', shown: 20, open: null, month: -1, fx: null, d: { M: 0, Y: 10, g: 0, pg: null, r: null }, fromLink: false }; }
var S = freshS();
var customItems = [];
function okCustom(c){ return c && c.key && !/^o_/.test(String(c.key)) && c.nm && c.r > 0 && Array.isArray(c.mo) && c.mo.length; }
function okRow(b){ return b && b.key && !/^o_/.test(String(b.key)) && (b.mode === 'amt' || b.mode === 'sh') && b.v > 0; }
function setDrip(d){
  if (!d || typeof d !== 'object') { return; }
  if (d.M >= 0) { S.d.M = Number(d.M); }
  if (YEARS.indexOf(Number(d.Y)) >= 0) { S.d.Y = Number(d.Y); }
  if (isFinite(Number(d.g)) && d.g !== null && d.g !== '') { S.d.g = Number(d.g); }
  S.d.pg = (d.pg === null || d.pg === undefined || d.pg === '' || !isFinite(Number(d.pg))) ? null : Number(d.pg);
  S.d.r = Number(d.r) > 0 ? Number(d.r) : null;
}
function loadState(){
  try {
    var o = JSON.parse(window.localStorage.getItem(STORE) || 'null');
    if (!o || typeof o !== 'object') { return; }
    if (typeof o.s === 'string') { S.sel = o.s; }
    if (o.m === 'amt' || o.m === 'sh' || o.m === 'goal') { S.mode = o.m; }
    if (o.a > 0) { S.amt = Number(o.a); }
    if (o.h > 0) { S.sh = Number(o.h); }
    if (o.g > 0) { S.gl = Number(o.g); }
    if (Array.isArray(o.c)) { S.customs = o.c.filter(okCustom); }
    if (Array.isArray(o.b)) { S.basket = o.b.filter(okRow).map(function(b){ return { key: String(b.key), mode: b.mode, v: Number(b.v) }; }); }
    if (o.d) { setDrip(o.d); }
  } catch (e) {}
}
// 링크로 연 동안(S.fromLink)은 저장하지 않음 = 내 저장 값을 안 덮어씀
function saveState(){
  if (S.fromLink) { return; }
  try { window.localStorage.setItem(STORE, JSON.stringify({ s: S.sel, m: S.mode, a: S.amt, h: S.sh, g: S.gl, c: S.customs, b: S.basket, d: S.d })); } catch (e) {}
}
function clearState(){ try { window.localStorage.removeItem(STORE); } catch (e) {} }
function fromLink(){
  if (!C.decodeLink) { return false; }
  var st = null;
  try { st = C.decodeLink(window.location.hash || ''); } catch (e) { st = null; }
  if (!st || typeof st !== 'object') { return false; }
  if (typeof st.s === 'string' && st.s) { S.sel = st.s; }
  if (st.m === 'amt' || st.m === 'sh' || st.m === 'goal') { S.mode = st.m; }
  if (Number(st.v) > 0) { if (S.mode === 'amt') { S.amt = Number(st.v); } else if (S.mode === 'sh') { S.sh = Number(st.v); } else { S.gl = Number(st.v); } }
  S.customs = Array.isArray(st.c) ? st.c.filter(okCustom) : [];
  S.basket = Array.isArray(st.b) ? st.b.filter(okRow).map(function(b){ return { key: String(b.key), mode: b.mode, v: Number(b.v) }; }) : [];
  S.fx = Number(st.x) > 0 ? Number(st.x) : null;
  if (st.d) { setDrip(st.d); }
  S.fromLink = true;
  return true;
}

function normCustom(c){
  var mo = c.mo.slice(), w = [], i, pd = [];
  for (i = 0; i < 12; i++) { w.push(mo.indexOf(i + 1) >= 0 ? 1 / mo.length : 0); pd.push(null); }
  if (Array.isArray(c.w) && c.w.length === 12) { w = c.w.slice(); }
  if (Array.isArray(c.pd) && c.pd.length === 12) { pd = c.pd.slice(); }
  return { key: c.key, tk: c.key, custom: true, n: null, nm: c.nm, fn: c.nm, mk: c.mk === 'us' ? 'us' : 'kr', tx: c.tx || (c.mk === 'us' ? 'us' : 'kr'), ty: '직접', sc: c.sc || '내 종목', cy: c.cy || (mo.length >= 12 ? 12 : (mo.length >= 4 ? 4 : (mo.length >= 2 ? 2 : 1))), times: c.times > 0 ? c.times : undefined, mo: mo, w: w, weq: true, dps: null, cur: 'KRW', px: null, pxd: null, r: Number(c.r), rd: null, rh: '내가 넣은 값', la: null, lx: null, lp: null, pd: pd, fl: [], one: '', src: '' };
}
function rebuildCustoms(){ customItems = S.customs.map(normCustom); }
function allItems(){ return DATA.items.concat(customItems); }
function itemOf(key){ var a = allItems(), i; for (i = 0; i < a.length; i++) { if (a[i].tk === key) { return a[i]; } } return null; }
function inBasket(key){ var i; for (i = 0; i < S.basket.length; i++) { if (S.basket[i].key === key) { return i; } } return -1; }
function cleanBasket(){ S.basket = S.basket.filter(function(b){ return !!itemOf(b.key); }); }

// ---------- 폭 (상자 폭으로 잼 · 미디어 쿼리 안 씀) ----------
var lastW = '';
function applyW(){
  if (!root) { return; }
  var w = root.clientWidth, cls = w >= 1000 ? 'w3' : (w >= 600 ? 'w2' : 'w1');
  if (cls === lastW) { return; }
  lastW = cls;
  root.classList.toggle(W2, w >= 600);
  root.classList.toggle(W3, w >= 1000);
  // 사이트 PC는 '비슷한 종목'·'재투자'를 처음부터 엶 (한 번만 · 그 뒤엔 읽는 사람이 연 대로)
  if (cls === 'w3' && E.simBox && !E.w3Opened) { E.w3Opened = true; E.simBox.open = true; E.dripBox.open = true; }
  fitAll();
}

// ---------- 뼈대 ----------
var root, E = {};
function start(){
  root = document.getElementById('bdgj4-root');
  if (!root) { return; }
  if (root.getAttribute('data-bdgj4-init')) { return; }
  root.setAttribute('data-bdgj4-init', '1');
  if (!/(^| )bdgj4-root( |$)/.test(root.className)) { root.className = (root.className + ' bdgj4-root').replace(/^ /, ''); }
  if (!document.getElementById('bdgj4-style')) { var st = document.createElement('style'); st.id = 'bdgj4-style'; st.appendChild(document.createTextNode(CSS)); (document.head || document.documentElement).appendChild(st); }
  if (!document.getElementById('bdgj4-font')) { var fl = document.createElement('link'); fl.id = 'bdgj4-font'; fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@900&display=swap&text=' + encodeURIComponent(FONT_TXT); (document.head || document.documentElement).appendChild(fl); }
  root.removeAttribute('style');
  if (!fromLink()) { loadState(); }
  rebuildCustoms(); cleanBasket();
  if (!itemOf(S.sel)) { S.sel = itemOf('SCHD') ? 'SCHD' : (DATA.items[0] ? DATA.items[0].tk : ''); }
  build();
  applyW();
  renderAll();
  tryMove();
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', tryMove); }
  window.addEventListener('load', tryMove);
  fetchNew();
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fitAll); }
  window.addEventListener('resize', function(){ applyW(); fitAll(); });
  if (typeof ResizeObserver === 'function') {
    var raf = 0;
    try { new ResizeObserver(function(){ if (raf) { return; } raf = (window.requestAnimationFrame || setTimeout)(function(){ raf = 0; applyW(); }); }).observe(root); } catch (e) {}
  }
}

function build(){
  root.innerHTML = '';
  // 0·1 제목 · 알림 줄
  add(root, h('h2', 'bdgj4-h', TITLES[0]));
  E.stale = add(root, h('p', 'bdgj4-stale')); E.stale.style.display = 'none';
  E.lnk = add(root, h('div', 'bdgj4-lnk')); E.lnk.style.display = 'none';
  add(E.lnk, h('div', '', LINK_NOTE));
  var lb = add(E.lnk, h('div', 'bdgj4-btns'));
  add(lb, btn('bdgj4-xs', '이 계산을 내 기기에 저장', function(){ S.fromLink = false; saveState(); E.lnk.style.display = 'none'; dropHash(); }));
  add(lb, btn('bdgj4-xs', '내 저장 값 보기', function(){
    var keepW = E.w3Opened; S = freshS(); loadState(); rebuildCustoms(); cleanBasket(); fixSel(); E.w3Opened = keepW;
    E.lnk.style.display = 'none'; dropHash(); E.minR.value = ''; E.q2.value = ''; renderAll();
  }));

  var top = add(root, h('div', 'bdgj4-top'));
  var inn = add(top, h('div', 'bdgj4-in'));
  // 2 종목 찾기 + 빠른 칩
  var w1 = add(inn, h('div', 'bdgj4-wrap'));
  var l1 = add(w1, h('label', 'bdgj4-lab', '종목 찾기')); l1.setAttribute('for', 'bdgj4-q1'); l1.style.marginTop = '0';
  E.q1 = add(w1, h('input', 'bdgj4-inp')); E.q1.id = 'bdgj4-q1'; E.q1.type = 'text'; E.q1.setAttribute('autocomplete', 'off'); E.q1.setAttribute('placeholder', '이름이나 코드 (예: SCHD, 기업은행)');
  E.sug = add(w1, h('div', 'bdgj4-sug')); E.sug.style.display = 'none';
  E.pick = add(inn, h('div', 'bdgj4-pick'));
  // 3 계산 기준 탭
  E.tabs = add(inn, h('div', 'bdgj4-chips bdgj4-seg bdgj4-tabs')); E.tabs.setAttribute('role', 'group'); E.tabs.setAttribute('aria-label', '계산 기준');
  // 4 값 입력 (읽기 줄 = 칸 안 오른쪽)
  E.amtLab = add(inn, h('label', 'bdgj4-lab', '투자금(원)')); E.amtLab.setAttribute('for', 'bdgj4-a1');
  var vw = add(inn, h('div', 'bdgj4-vwrap'));
  E.a1 = add(vw, h('input', 'bdgj4-inp')); E.a1.id = 'bdgj4-a1'; E.a1.type = 'text'; E.a1.setAttribute('inputmode', 'numeric'); E.a1.setAttribute('autocomplete', 'off');
  E.amtHint = add(vw, h('div', 'bdgj4-vread')); E.amtHint.setAttribute('aria-hidden', 'true');
  E.quick = add(inn, h('div', 'bdgj4-quick'));
  E.fxRow = add(inn, h('div', 'bdgj4-fx')); E.fxRow.style.display = 'none';

  // 5 결과 카드
  var slot = add(top, h('div', 'bdgj4-slot'));
  E.cards = add(add(slot, h('div', 'bdgj4-slotin')), h('div', 'bdgj4-cards'));
  E.tier = add(E.cards, h('div', 'bdgj4-tier'));
  var tk = add(E.cards, h('div', 'bdgj4-tk'));
  E.tkNm = add(tk, h('div', 'bdgj4-tk-nm'));
  E.selNote = add(E.cards, h('div', 'bdgj4-tk-sub'));
  function card(cls, label){ var c = add(E.cards, h('div', 'bdgj4-card ' + cls)); var l = add(c, h('div', 'bdgj4-card-l', label)); var v = add(c, h('div', 'bdgj4-card-v', '-')); v.lab = l; return v; }
  E.cAvg = card('', '한 달 평균(세후)');
  E.cYear = card('bdgj4-sub', '1년(세후)');
  E.cRate = card('bdgj4-sub', '배당률(세전)');
  var r3 = add(E.cards, h('div', 'bdgj4-r3')); add(r3, h('div', 'bdgj4-r3-l', '받는 달')); E.cMo = add(r3, h('div', 'bdgj4-r3-v'));
  E.fml = add(E.cards, h('p', 'bdgj4-fml bdgj4-tk-ft'));
  E.base = add(E.cards, h('p', 'bdgj4-base bdgj4-tk-ft'));
  E.cc = add(E.cards, h('p', 'bdgj4-cc', CC_TXT)); E.cc.style.display = 'none';

  // 6 단추 줄
  var act = add(top, h('div', 'bdgj4-act'));
  E.qMsg = add(act, h('div', 'bdgj4-warn')); E.qMsg.style.display = 'none';
  var br = add(act, h('div', 'bdgj4-btns'));
  E.bAdd = btn('bdgj4-pri bdgj4-add', '담기', addQuick); add(br, E.bAdd);
  add(br, btn('', '링크 복사', function(){ copyLink(E.cpMsg); }));
  E.bDet = btn('', '자세히(세전, 한 번 받을 때)', function(){ var open = E.det.style.display === 'none'; E.det.style.display = open ? '' : 'none'; E.bDet.setAttribute('aria-expanded', open ? 'true' : 'false'); }); E.bDet.setAttribute('aria-expanded', 'false'); add(br, E.bDet);
  add(act, h('div', 'bdgj4-hint', '담으면 1~12월 내 배당 달력에 들어가요.'));
  E.addMsg = add(act, h('div', 'bdgj4-hint'));
  E.cpMsg = add(act, h('div', ''));

  E.det = add(root, h('div', 'bdgj4-box')); E.det.style.display = 'none';
  E.dl = add(E.det, h('div', 'bdgj4-dl')); E.dl.style.marginTop = '0';

  // 7 같은 돈이면 비슷한 종목은?
  E.simBox = add(root, h('details', 'bdgj4-box bdgj4-fold'));
  add(E.simBox, h('summary', '', '같은 돈이면 비슷한 종목은?'));
  E.simList = add(E.simBox, h('div', ''));
  add(E.simBox, h('div', 'bdgj4-hint', '배당률이 높다고 좋은 종목은 아니에요.'));
  E.simBox.addEventListener('toggle', renderSimilar);

  // 8 재투자하면 몇 년 뒤 얼마?
  E.dripBox = add(root, h('details', 'bdgj4-box bdgj4-fold'));
  add(E.dripBox, h('summary', '', '재투자하면 몇 년 뒤 얼마?'));
  var dw = add(E.dripBox, h('div', 'bdgj4-dwrap'));
  var dL = add(dw, h('div', '')), dR = add(dw, h('div', ''));
  E.dLead = add(dL, h('p', 'bdgj4-dlead'));
  var df = add(dL, h('div', 'bdgj4-dform')), df1 = add(df, h('div', '')), df2 = add(df, h('div', ''));
  var lM = add(df1, h('label', 'bdgj4-lab', '매달 더 넣을 돈(원, 없으면 0)')); lM.setAttribute('for', 'bdgj4-dm');
  E.dM = add(df1, h('input', 'bdgj4-inp bdgj4-sm')); E.dM.id = 'bdgj4-dm'; E.dM.type = 'text'; E.dM.setAttribute('inputmode', 'numeric'); E.dM.setAttribute('autocomplete', 'off'); E.dM.setAttribute('placeholder', '0');
  add(df2, h('div', 'bdgj4-lab', '기간'));
  E.dY = add(df2, h('div', 'bdgj4-chips'));
  E.dAs = add(dL, h('details', 'bdgj4-det')); add(E.dAs, h('summary', '', '가정 바꾸기'));
  var lg = add(E.dAs, h('label', 'bdgj4-lab', '배당이 해마다 늘어나는 비율(%)')); lg.setAttribute('for', 'bdgj4-dg'); lg.style.marginTop = '0';
  E.dg = add(E.dAs, h('input', 'bdgj4-inp bdgj4-sm')); E.dg.id = 'bdgj4-dg'; E.dg.type = 'text'; E.dg.setAttribute('inputmode', 'decimal'); E.dg.setAttribute('autocomplete', 'off'); E.dg.setAttribute('placeholder', '0');
  E.dGp = add(E.dAs, h('div', 'bdgj4-gp'));
  var lp = add(E.dAs, h('label', 'bdgj4-lab', '주가가 해마다 변하는 비율(%, 0 = 그대로)')); lp.setAttribute('for', 'bdgj4-dpg');
  E.dpg = add(E.dAs, h('input', 'bdgj4-inp bdgj4-sm')); E.dpg.id = 'bdgj4-dpg'; E.dpg.type = 'text'; E.dpg.setAttribute('inputmode', 'text'); E.dpg.setAttribute('autocomplete', 'off');
  var lr0 = add(E.dAs, h('label', 'bdgj4-lab', '배당률(%)')); lr0.setAttribute('for', 'bdgj4-dr');
  E.dr = add(E.dAs, h('input', 'bdgj4-inp bdgj4-sm')); E.dr.id = 'bdgj4-dr'; E.dr.type = 'text'; E.dr.setAttribute('inputmode', 'decimal'); E.dr.setAttribute('autocomplete', 'off');
  E.dWarn = add(dR, h('div', ''));
  E.dTtl = add(dR, h('p', 'bdgj4-dttl'));
  E.dRes = add(dR, h('div', 'bdgj4-dres'));
  E.dNote = add(dR, h('div', 'bdgj4-hint'));
  E.dYr = add(dR, h('details', 'bdgj4-det')); add(E.dYr, h('summary', '', '해마다 보기'));
  E.dTbl = add(E.dYr, h('div', 'bdgj4-tblwrap bdgj4-ytbl'));
  add(dR, h('div', 'bdgj4-hint', '배당·주가·세금은 가정이라 실제와 달라져요. 수수료는 넣지 않았어요.'));
  E.dripBox.addEventListener('toggle', renderDrip);

  // 아래 두 줄기 (폰·글 안 = 한 줄기 그대로 · 사이트 PC = 왼쪽 종목 고르기 / 오른쪽 담은 종목·달력·섹터)
  var cols = add(root, h('div', 'bdgj4-cols'));
  var colL = add(cols, h('div', 'bdgj4-colL')), colR = add(cols, h('div', 'bdgj4-colR'));

  // 9 종목 고르기
  var s2 = add(colL, h('div', 'bdgj4-sec')); E.sec2 = s2;
  add(s2, h('h3', 'bdgj4-h2', TITLES[1]));
  add(s2, h('div', 'bdgj4-hint', '배당률이 높다고 좋은 종목은 아니에요.'));
  add(s2, h('div', 'bdgj4-lab', '주기'));
  E.cyChips = add(s2, h('div', 'bdgj4-chips'));
  add(s2, h('div', 'bdgj4-hint', '분기배당은 3개월마다, 반기배당은 6개월마다, 연배당은 1년에 한 번 받아요.'));
  add(s2, h('div', 'bdgj4-lab', '국내 / 미국'));
  E.mkChips = add(s2, h('div', 'bdgj4-chips'));
  var dsc = add(s2, h('details', 'bdgj4-det')); add(dsc, h('summary', '', '섹터(업종)로 거르기'));
  E.scChips = add(dsc, h('div', 'bdgj4-chips'));
  add(dsc, h('div', 'bdgj4-hint', '커버드콜 ETF는 주식을 들고 옵션을 팔아 배당을 늘린 상품이고, 리츠는 건물 임대료나 부동산 대출 이자로 번 돈을 나눠 주는 상품이에요.'));
  var smr = add(s2, h('div', 'bdgj4-sm-row')), sm1 = add(smr, h('div', '')), sm2 = add(smr, h('div', ''));
  var lq = add(sm1, h('label', 'bdgj4-lab', '이름 찾기')); lq.setAttribute('for', 'bdgj4-q2');
  E.q2 = add(sm1, h('input', 'bdgj4-inp bdgj4-sm')); E.q2.id = 'bdgj4-q2'; E.q2.type = 'text'; E.q2.setAttribute('autocomplete', 'off'); E.q2.setAttribute('placeholder', '이름이나 코드');
  var lr = add(sm2, h('label', 'bdgj4-lab', '배당률 몇 % 이상만 볼까요')); lr.setAttribute('for', 'bdgj4-minr');
  E.minR = add(sm2, h('input', 'bdgj4-inp bdgj4-sm')); E.minR.id = 'bdgj4-minr'; E.minR.type = 'text'; E.minR.setAttribute('inputmode', 'decimal'); E.minR.setAttribute('autocomplete', 'off'); E.minR.setAttribute('placeholder', '예: 5');
  add(s2, h('div', 'bdgj4-lab', '정렬'));
  E.sortChips = add(s2, h('div', 'bdgj4-chips'));
  E.count = add(s2, h('div', 'bdgj4-hint'));
  E.rdNote = add(s2, h('div', 'bdgj4-hint'));
  E.list = add(s2, h('div', 'bdgj4-list'));
  E.more = add(s2, h('div', ''));
  var dt = add(s2, h('details', 'bdgj4-det')); E.tblDet = dt; add(dt, h('summary', '', '전체 종목 표 보기'));
  E.tblHint = add(dt, h('p', 'bdgj4-hint', '표는 옆으로 밀어 볼 수 있어요')); E.tblHint.style.display = 'none';
  E.tblHold = add(dt, h('div', 'bdgj4-tblwrap')); dt.style.display = 'none';
  dt.addEventListener('toggle', checkTbl);

  // 10 담은 종목
  var s5 = add(colR, h('div', 'bdgj4-sec')); E.sec5 = s5;
  add(s5, h('h3', 'bdgj4-h2', TITLES[2]));
  E.bHead = add(s5, h('div', 'bdgj4-hint'));
  E.bList = add(s5, h('div', 'bdgj4-bklist'));
  E.avgLine = add(s5, h('div', 'bdgj4-hint')); E.avgLine.style.display = 'none';
  E.bTools = add(s5, h('div', 'bdgj4-btns'));
  add(E.bTools, btn('', '예시 담기', addExample));
  E.bCopy = add(E.bTools, btn('', '링크 복사', function(){ copyLink(E.cpMsg2); }));
  E.bClear = add(E.bTools, btn('bdgj4-ghost', '모두 지우기', function(){ S.minR = 0; S.shown = 20; E.minR.value = ''; S.basket = []; S.customs = []; rebuildCustoms(); fixSel(); saveState(); renderAll(); }));
  E.cpMsg2 = add(s5, h('div', ''));
  E.exNote = add(s5, h('div', 'bdgj4-hint'));
  E.goalBox = add(s5, h('div', 'bdgj4-box'));
  var lg2 = add(E.goalBox, h('label', 'bdgj4-lab', '목표: 담은 종목 그대로, 한 달 평균(세후) 얼마를 받고 싶나요?')); lg2.setAttribute('for', 'bdgj4-g2'); lg2.style.marginTop = '0';
  E.g2 = add(E.goalBox, h('input', 'bdgj4-inp')); E.g2.id = 'bdgj4-g2'; E.g2.type = 'text'; E.g2.setAttribute('inputmode', 'numeric'); E.g2.setAttribute('placeholder', '예: 300,000');
  E.g2Res = add(E.goalBox, h('div', 'bdgj4-hint'));
  var dc = add(s5, h('details', 'bdgj4-box')); add(dc, h('summary', '', '내 종목 직접 넣기'));
  var lc1 = add(dc, h('label', 'bdgj4-lab', '이름')); lc1.setAttribute('for', 'bdgj4-cn'); lc1.style.marginTop = '0';
  E.cn = add(dc, h('input', 'bdgj4-inp bdgj4-sm')); E.cn.id = 'bdgj4-cn'; E.cn.type = 'text';
  var lc2 = add(dc, h('label', 'bdgj4-lab', '1년 배당률(세전, %)')); lc2.setAttribute('for', 'bdgj4-cr');
  E.cr = add(dc, h('input', 'bdgj4-inp bdgj4-sm')); E.cr.id = 'bdgj4-cr'; E.cr.type = 'text'; E.cr.setAttribute('inputmode', 'decimal'); E.cr.setAttribute('placeholder', '예: 4.5');
  add(dc, h('div', 'bdgj4-lab', '국내 / 미국(하나를 골라 주세요)')); E.cmk = null;
  E.cmkChips = add(dc, h('div', 'bdgj4-chips bdgj4-seg'));
  add(dc, h('div', 'bdgj4-lab', '돈이 들어오는 달(여러 개)'));
  E.cmoChips = add(dc, h('div', 'bdgj4-chips')); E.cmo = {};
  E.cMsg = add(dc, h('div', 'bdgj4-warn')); E.cMsg.style.display = 'none';
  add(dc, btn('', '내 종목 담기', addCustom)).style.marginTop = '8px';
  renderCustomForm();

  // 11 달력
  var s6 = add(colR, h('div', 'bdgj4-sec')); E.sec6 = s6;
  add(s6, h('h3', 'bdgj4-h2', TITLES[3]));
  E.calHint = add(s6, h('div', 'bdgj4-hint'));
  E.cal = add(add(s6, h('div', 'bdgj4-calw')), h('div', 'bdgj4-cal'));
  E.mdet = add(s6, h('div', 'bdgj4-mdet')); E.mdet.style.display = 'none';
  E.sum = add(s6, h('div', 'bdgj4-dl'));
  E.gauge = add(s6, h('div', 'bdgj4-gauge')); E.gauge.style.display = 'none';
  E.over = add(s6, h('div', 'bdgj4-warn')); E.over.style.display = 'none';

  // 12 섹터별
  var s7 = add(colR, h('div', 'bdgj4-sec')); E.sec7 = s7;
  add(s7, h('h3', 'bdgj4-h2', TITLES[4]));
  E.secBars = add(s7, h('div', ''));
  E.cycLine = add(s7, h('div', 'bdgj4-note'));

  // 안내
  var f = add(root, h('div', 'bdgj4-foot'));
  add(f, h('p', '', '실제 입금액은 이 계산과 다를 수 있고, 투자 권유가 아니에요. 기준일과 출처는 계산 결과 맨 아래 줄과 종목 상세에서 볼 수 있어요.'));
  add(f, h('p', '', '넣은 값은 이 기기 브라우저에만 저장돼요. 다른 기기로 옮기려면 "링크 복사"를 누르세요.'));
  var clrArm = false, clrTimer = null;
  function clrDisarm(){ clrArm = false; if (clrTimer) { clearTimeout(clrTimer); clrTimer = null; } E.clr.textContent = '저장한 값 지우기'; }
  E.clr = add(f, btn('bdgj4-xs bdgj4-ghost', '저장한 값 지우기', function(){
    if (!clrArm) { clrArm = true; E.clr.textContent = '담은 종목과 넣은 값을 모두 지울까요? 한 번 더 누르면 지워요'; clrTimer = setTimeout(clrDisarm, 6000); return; }
    clrDisarm();
    var keepW = E.w3Opened, fl = S.fromLink;
    if (!fl) { clearState(); }
    S = freshS(); S.fromLink = fl; S.sel = itemOf('SCHD') ? 'SCHD' : DATA.items[0].tk; E.minR.value = ''; E.q2.value = ''; E.w3Opened = keepW;
    rebuildCustoms(); renderAll();
  })); E.clr.style.marginTop = '6px';

  // 아래 고정 띠
  E.band = add(root, h('div', 'bdgj4-band')); E.band.style.display = 'none';
  E.bandT = add(E.band, h('span', ''));
  add(E.band, btn('bdgj4-xs', '달력 보기', function(){ E.sec6.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

  bindEvents();
}

function bindEvents(){
  E.q1.addEventListener('focus', function(){ E.q1.select(); showSug(); });
  E.q1.addEventListener('input', showSug);
  E.q1.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); if (!pickFirst()) { E.q1.blur(); } } });
  E.q1.addEventListener('blur', function(){ setTimeout(function(){ if (document.activeElement === E.q1) { return; } E.sug.style.display = 'none'; if (!pickFirst()) { var it = itemOf(S.sel); if (it) { E.q1.value = it.nm; } } }, 200); });
  E.a1.addEventListener('input', function(){
    if (S.mode === 'sh') {
      var raw = E.a1.value, cl = cleanSh(raw), v = numSh(raw); if (v > 99999999) { v = 99999999; cl = String(v); }
      if (cl !== raw) { E.a1.value = cl; }
      S.sh = v;
    } else {
      var n = num(E.a1.value), cap = S.mode === 'amt' ? 99999999999 : 9999999999; if (n > cap) { n = cap; }
      if (S.mode === 'amt') { S.amt = n; } else { S.gl = n; }
      E.a1.value = n ? comma(n) : '';
    }
    saveState(); renderQuick();
  });
  E.a1.addEventListener('blur', function(){ if (S.mode === 'sh') { E.a1.value = S.sh ? fmtSh(S.sh).replace(/,/g, '') : ''; } });
  E.minR.addEventListener('input', function(){ var x = parseFloat(String(E.minR.value).replace(/[^0-9.]/g, '')); S.minR = x > 0 ? x : 0; S.shown = 20; renderList(); });
  E.g2.addEventListener('input', function(){ var v = num(E.g2.value); E.g2.value = v ? comma(v) : ''; renderGoalBasket(); });
  E.q2.addEventListener('input', function(){ S.q = E.q2.value; S.shown = 20; renderList(); });
  E.dM.addEventListener('input', function(){ var v = num(E.dM.value); if (v > 9999999999) { v = 9999999999; } E.dM.value = v ? comma(v) : ''; S.d.M = v; saveState(); renderDrip(); });
  E.dg.addEventListener('input', function(){ var v = numDec(E.dg.value); S.d.g = v === null ? 0 : Math.max(-50, Math.min(50, v)); saveState(); renderDripOut(); renderGp(); });
  E.dpg.addEventListener('input', function(){ var v = numDec(E.dpg.value); S.d.pg = v === null ? null : Math.max(-90, Math.min(50, v)); saveState(); renderDripOut(); });
  E.dr.addEventListener('input', function(){ var v = numDec(E.dr.value); S.d.r = v !== null && v > 0 ? Math.min(v, 1000) : null; saveState(); renderDripOut(); });
}

function renderAll(){
  rebuildCustoms();
  renderBase(); renderPick(); renderModeChips(); renderQuickInputs(); renderQuick(); renderFilters(); renderList(); renderBasket(); renderViews();
}

function renderBase(){
  var a = DATA.asof || {}, msgs = [], now = new Date();
  if (a.px && (now - new Date(a.px + 'T00:00:00')) / 86400000 > 10) { msgs.push('배당률이 ' + md(a.px) + ' 값이에요.'); }
  if (a.fx && (now - new Date(a.fx + 'T00:00:00')) / 86400000 > 10) { msgs.push('환율이 ' + md(a.fx) + ' 값이에요.'); }
  E.stale.style.display = msgs.length ? '' : 'none';
  E.stale.textContent = msgs.join(' ');
  E.lnk.style.display = S.fromLink ? '' : 'none';
}

// 맨 위 빠른 칩 (폰 4개 · 넓은 화면 6개 + '더 보기' = 아래 목록으로)
function renderPick(){
  E.pick.innerHTML = '';
  POP.forEach(function(k, i){
    var it = itemOf(k); if (!it) { return; }
    var c = chip('', S.sel === k, function(){ pickItem(it); });
    if (i >= 4) { c.className += ' bdgj4-p6'; }
    add(c, dotOf(it)); add(c, h('span', '', it.nm));
    add(E.pick, c);
  });
  var mo = add(E.pick, chip('더 보기', false, function(){ E.sec2.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  mo.className += ' bdgj4-pmore'; mo.removeAttribute('aria-pressed');
}

function renderModeChips(){
  E.tabs.innerHTML = '';
  [['amt', '투자금'], ['sh', '주 수'], ['goal', '목표 월배당']].forEach(function(o){
    add(E.tabs, chip(o[1], S.mode === o[0], function(){ if (S.mode === o[0]) { return; } S.mode = o[0]; saveState(); renderModeChips(); renderQuickInputs(); renderQuick(); }));
  });
}
function curV(){ return S.mode === 'amt' ? S.amt : (S.mode === 'sh' ? S.sh : S.gl); }
function renderQuickInputs(){
  var it = itemOf(S.sel);
  if (document.activeElement !== E.q1) { E.q1.value = it ? it.nm : ''; }
  E.amtLab.textContent = S.mode === 'amt' ? '투자금(원)' : (S.mode === 'sh' ? '주 수(주, 소수점 가능)' : '받고 싶은 한 달 배당금(세후, 원)');
  E.a1.setAttribute('inputmode', S.mode === 'sh' ? 'decimal' : 'numeric');
  var v = curV();
  E.a1.value = v ? (S.mode === 'sh' ? fmtSh(v).replace(/,/g, '') : comma(v)) : '';
  E.a1.setAttribute('placeholder', S.mode === 'amt' ? '예: 10,000,000' : (S.mode === 'sh' ? '예: 100' : '예: 300,000'));
  renderQuickBtns();
}
function renderQuickBtns(){
  E.quick.innerHTML = '';
  var arr = S.mode === 'amt' ? Q_AMT : (S.mode === 'goal' ? Q_GOAL : null);
  E.quick.style.display = arr ? '' : 'none';
  if (!arr) { return; }
  arr.forEach(function(q){
    var on = curV() === q[0];
    var b = add(E.quick, btn('bdgj4-xs' + (on ? ' bdgj4-on' : ''), q[1], function(){
      if (S.mode === 'amt') { S.amt = q[0]; } else { S.gl = q[0]; }
      E.a1.value = comma(q[0]); saveState(); renderQuick();
    }));
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', q[1] + '원');
  });
}
// 환율 줄 = '주 수' 탭 + 달러 종목일 때만 · 바꾼 값은 기기에 저장 X (링크에만)
function renderFx(it, force){
  var show = S.mode === 'sh' && it && !it.custom && it.cur === 'USD';
  E.fxRow.style.display = show ? '' : 'none';
  if (!show) { return; }
  if (!force && E.fxRow.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { return; }
  E.fxRow.innerHTML = '';
  var a = DATA.asof || {};
  var t = add(E.fxRow, h('span', ''));
  if (S.fx > 0) { setM(t, '환율 ' + comma(S.fx) + '원(내가 바꾼 값)'); }
  else { setM(t, '환율 ' + comma(Math.round(DATA.fx)) + '원' + (a.fx ? '(' + md(a.fx) + ')' : '')); }
  if (E.fxOpen) {
    var inp = add(E.fxRow, h('input', 'bdgj4-inp bdgj4-sm')); inp.type = 'text'; inp.setAttribute('inputmode', 'numeric'); inp.setAttribute('aria-label', '환율(원)'); inp.setAttribute('placeholder', comma(Math.round(DATA.fx)));
    inp.value = S.fx > 0 ? comma(S.fx) : '';
    inp.addEventListener('input', function(){ var v = num(inp.value); if (v > 99999) { v = 99999; } inp.value = v ? comma(v) : ''; S.fx = v >= 100 ? v : null; renderQuick(); renderViews(); renderBasketRes(); });
    add(E.fxRow, btn('bdgj4-xs', '원래대로', function(){ S.fx = null; E.fxOpen = false; renderFx(it, true); renderQuick(); renderViews(); renderBasketRes(); }));
  } else {
    add(E.fxRow, btn('bdgj4-xs', '환율 바꾸기', function(){ E.fxOpen = true; renderFx(it, true); var i = E.fxRow.querySelector('input'); if (i) { i.focus(); } }));
  }
}

function pickItem(it){
  S.sel = it.tk; S.d.r = null; E.dr.value = ''; saveState(); E.sug.style.display = 'none'; E.q1.value = it.nm;
  renderPick(); renderQuick();
  E.cards.classList.remove('bdgj4-go'); void E.cards.offsetWidth; E.cards.classList.add('bdgj4-go');
}
function pickFirst(){
  var q = E.q1.value, it = itemOf(S.sel);
  if (!q.replace(/\s/g, '') || (it && q === it.nm)) { return false; }
  var list = C.filter(listItems(), { q: q });
  if (!list.length) { return false; }
  pickItem(list[0]); E.q1.blur(); return true;
}
function showSug(){
  var q = E.q1.value, list = C.filter(listItems(), { q: q }).slice(0, 8);
  E.sug.innerHTML = '';
  if (!q.replace(/\s/g, '')) { E.sug.style.display = 'none'; return; }
  if (!list.length) { add(E.sug, h('div', 'bdgj4-sugnone', '찾는 종목이 없어요. 아래 "내 종목 직접 넣기"를 써 보세요.')); }
  list.forEach(function(it){
    var b = h('button', '', it.nm + (showCode(it) ? ' (' + it.tk + ')' : '') + ' ' + it.r + '%'); b.type = 'button';
    b.addEventListener('mousedown', function(e){ e.preventDefault(); });
    b.addEventListener('click', function(){ pickItem(it); E.q1.blur(); });
    E.sug.appendChild(b);
  });
  E.sug.style.display = '';
}

// 맨 위 계산 = 지금 탭 값을 '투자금(원)'으로 바꾼 V0와 한 종목 결과 p
function quickCalc(){
  var it = itemOf(S.sel); if (!it) { return null; }
  var v = curV(), fx = fxNow(), p = null, V0 = 0, need = null;
  if (!(v > 0)) { return { it: it, v: v, p: null, V0: 0, need: null }; }
  if (S.mode === 'goal') {
    need = C.goalOne ? C.goalOne(it, v) : C.goal([{ key: it.tk, mode: 'amt', v: 10000000 }], allItems(), fx, v);
    if (need > 0) { V0 = need; p = C.pay(it, { mode: 'amt', v: need }, fx); }
  } else {
    p = C.pay(it, { mode: S.mode, v: v }, fx);
    if (p) { V0 = S.mode === 'amt' ? v : (C.moneyOf ? C.moneyOf(it, { mode: 'sh', v: v }, p, fx) : 0); }
  }
  return { it: it, v: v, p: p, V0: V0, need: need };
}
function isCC(it){ return !!(it && !it.custom && /커버드콜/.test(String(it.sc || ''))); }
function pctTxt(x){ return (Math.round(x * 10) / 10) + '%'; }

function renderQuick(){
  var q = quickCalc(); if (!q) { return; }
  var it = q.it, p = q.p, v = q.v, fx = fxNow();
  var tax = TAXP[it.tx] || '15.4%';
  var t = tierOf(it);
  E.cards.style.setProperty('--bd-tc', (t && t.color) || GOLD);
  var cyn = CYN[it.cy] || '';
  E.tier.textContent = it.custom ? '직접 넣은 종목' : ((t ? (t.label || t.name) : '') + (t && cyn ? ' · ' : '') + cyn);
  E.tkNm.textContent = it.nm;
  var sn;
  if (it.custom) { sn = '직접 넣은 종목'; } else { sn = ((CTRY[it.tk] || MKN[it.mk] || '') + ' ' + it.sc).replace(/^ +/, ''); var mt = /\((최근 1년 \d+번)\)/.exec(cyText(it)); if (mt) { sn += ', ' + mt[1]; } }
  E.selNote.textContent = sn; E.selNote.style.display = it.custom ? 'none' : '';
  // 읽기 줄 (칸 안 오른쪽)
  E.amtHint.textContent = v ? (S.mode === 'sh' ? fmtSh(v) + '주' : fmtWon(v)) : '';
  renderQuickBtns(); renderFx(it);
  var rateTxt = (it.r !== null && it.r !== undefined) ? it.r + '%' : '-';
  E.cAvg.lab.textContent = S.mode === 'goal' ? '필요한 투자금' : '한 달 평균(세후)';
  E.dl.innerHTML = '';
  function row(a, b){ add(E.dl, h('span', '', a)); setM(add(E.dl, h('span', '')), b); }
  E.qMsg.style.display = 'none';
  if (!p) {
    E.cAvg.textContent = '-'; E.cYear.textContent = '-'; E.cRate.textContent = rateTxt; E.cMo.textContent = monthsText(it);
    E.fml.textContent = v ? '' : (S.mode === 'amt' ? '투자금을 넣어 주세요.' : (S.mode === 'sh' ? '주 수를 넣어 주세요.' : '받고 싶은 한 달 배당금을 넣어 주세요.'));
    E.fml.style.display = E.fml.textContent ? '' : 'none';
    if (v && S.mode === 'sh') { E.qMsg.textContent = '이 종목은 1주당 배당금 자료가 없어서 주 수로는 계산이 안 돼요. 투자금 탭으로 넣어 주세요.'; E.qMsg.style.display = ''; }
    else if (v && S.mode === 'goal') { E.qMsg.textContent = '이 종목은 목표 금액을 계산할 수 없어요.'; E.qMsg.style.display = ''; }
    row('1년 세전', '-'); row('한 번 받을 때(세후)', '-');
  } else {
    E.cAvg.textContent = S.mode === 'goal' ? fmtWon(q.need) : fmtWon(p.post / 12);
    E.cYear.textContent = fmtWon(p.post); E.cRate.textContent = rateTxt;
    setM(E.cMo, it.cy === 52 ? '매주 · 한 달 평균 ' + fmtWon(p.post / 12) + '(세후)' : monthsText(it) + ' · 한 번에 ' + fmtWon(p.perPayPost) + '(세후)');
    E.fml.style.display = '';
    setM(E.fml, formula(it, q, fx));
    row('1년 세전', fmtWon(p.pre));
    if (it.cy === 52) { row('받는 주기', '매주(한 달 평균 세후 ' + fmtWon(p.post / 12) + ')'); }
    else { row('한 번 받을 때(세후)', fmtWon(p.perPayPost) + ', 1년 ' + p.times + '번'); }
    if (p.pre > LIMIT) { E.qMsg.textContent = OVER_TXT; E.qMsg.style.display = ''; }
  }
  row('세금', tax + ' 뗀 값');
  var notes = []; (it.fl || []).forEach(function(f){ if (FLN[f]) { notes.push(FLN[f] + '.'); } });
  if (it.weq) { notes.push(WEQ_TXT); }
  if (it.cy !== 12 && it.cy !== 52 && it.mo) { notes.push('돈은 ' + monthsText(it) + '에 들어와요. 한 달 평균은 1년 치를 12로 나눈 값이에요.'); }
  if (notes.length) { var nl = add(E.dl, h('span', '', '참고')); nl.style.gridColumn = '1'; var nv = add(E.dl, h('span', '', notes.join(' '))); nv.style.textAlign = 'left'; nv.style.fontWeight = '400'; nv.style.gridColumn = '1 / -1'; }
  renderEvidence(it);
  E.cc.style.display = isCC(it) ? '' : 'none';
  var inb = inBasket(it.tk) >= 0;
  E.cAvg.className = 'bdgj4-card-v' + (E.cAvg.textContent.length >= 10 ? ' bdgj4-long' : '');
  E.bAdd.className = 'bdgj4-btn bdgj4-add ' + (inb ? 'bdgj4-inb' : 'bdgj4-pri');
  E.bAdd.textContent = inb ? (S.mode === 'sh' ? '담긴 주 수 바꾸기' : '담긴 금액 바꾸기') : '담기';
  renderSimilar(); renderDrip();
  fitAll();
}
// 계산식 줄 (설계도 C)
function formula(it, q, fx){
  var p = q.p, taxP = TAXP[it.tx] || '15.4%', taxW = fmtWon(p.pre - p.post);
  var tail = '세전 ' + fmtWon(p.pre) + ', 세금 ' + taxP + ' ' + taxW + '을 빼면 세후 ' + fmtWon(p.post);
  if (S.mode === 'amt') { return '계산식: ' + fmtWon(q.v) + ' × ' + it.r + '% = ' + tail; }
  if (S.mode === 'sh') {
    var usd = it.cur === 'USD';
    return '계산식: ' + fmtSh(q.v) + '주 × 1주 배당 ' + (usd ? '$' + it.dps : fmtWon(it.dps)) + (usd ? ' × 환율 ' + comma(Math.round(fx)) + '원' : '') + ' = ' + tail;
  }
  var keep = Math.round((1 - p.rate) * 1000) / 10;
  return '계산식: 한 달 ' + fmtWon(q.v) + ' × 12달 ÷ (배당률 ' + it.r + '% × 세후 ' + keep + '%) = 약 ' + fmtWon(q.need) + '(1만원 단위 올림)';
}
// 근거 줄 (종목별 기준일 · 공개 글이면 '리뷰 글 보기')
function renderEvidence(it){
  E.base.innerHTML = '';
  if (it.custom) { E.base.textContent = '배당률은 직접 넣은 값이에요. 실제 세금과 입금액은 다를 수 있어요.'; return; }
  var how = it.rh === '최근 지급분 1년 환산' ? '최근 한 번 받은 돈 × 1년 횟수' : '최근 12개월 실제 받은 배당';
  var t = '배당률 ' + it.r + '% = ' + how + ' ÷ ' + (it.rd ? md(it.rd) + ' ' : '') + '주가예요. 실제 세금과 입금액은 다를 수 있어요.';
  setM(add(E.base, h('span', '')), t);
  var u = linkOf(it);
  if (u) { E.base.appendChild(document.createTextNode(' ')); var a = add(E.base, h('a', '', '리뷰 글 보기')); a.href = u; a.target = '_blank'; a.rel = 'noopener'; }
}

// 7 비슷한 종목 (같은 섹터 안 배당률 가까운 순 3개 · 누르면 그 종목으로)
function renderSimilar(){
  if (!E.simBox || !E.simBox.open) { return; }
  E.simList.innerHTML = '';
  var q = quickCalc(); if (!q) { return; }
  if (!C.similar) { add(E.simList, h('div', 'bdgj4-hint', '비슷한 종목을 불러오지 못했어요.')); return; }
  var arr = []; try { arr = C.similar(q.it, allItems(), 3) || []; } catch (e) { arr = []; }
  var V0 = q.V0 > 0 ? q.V0 : DEF_AMT;
  if (!arr.length) { add(E.simList, h('div', 'bdgj4-hint', '비교할 비슷한 종목이 없어요.')); return; }
  arr.forEach(function(it){
    var p = C.pay(it, { mode: 'amt', v: V0 }, fxNow());
    var b = add(E.simList, h('button', 'bdgj4-simb')); b.type = 'button';
    add(b, dotOf(it)); add(b, h('b', '', it.nm));
    var s = add(b, h('span', '')); setM(s, ' · 한 달 ' + (p ? fmtWon(p.post / 12) : '-') + '(세후) · 배당률 ' + it.r + '%');
    b.addEventListener('click', function(){ pickItem(it); E.cards.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  });
  if (q.V0 > 0) { var nt = add(E.simList, h('div', 'bdgj4-hint')); setM(nt, fmtWon(V0) + '을 넣었을 때예요.'); }
}

// 8 재투자 (계산 = C.drip · 다시 사기와 현금 받기 둘 다)
function renderDrip(){
  if (!E.dripBox || !E.dripBox.open) { return; }
  var q = quickCalc(); if (!q) { return; }
  E.dLead.textContent = q.V0 > 0 ? q.it.nm + '에 ' + fmtWon(q.V0) + '을 넣고' : '위에서 금액을 넣으면 계산해요.';
  if (document.activeElement !== E.dM) { E.dM.value = S.d.M ? comma(S.d.M) : ''; }
  E.dY.innerHTML = '';
  YEARS.forEach(function(y){ add(E.dY, chip(y + '년', S.d.Y === y, function(){ S.d.Y = y; saveState(); renderDrip(); })); });
  if (document.activeElement !== E.dg) { E.dg.value = S.d.g ? String(S.d.g) : ''; }
  if (document.activeElement !== E.dpg) { E.dpg.value = S.d.pg === null ? '' : String(S.d.pg); }
  if (document.activeElement !== E.dr) { E.dr.value = S.d.r ? String(S.d.r) : ''; }
  E.dr.setAttribute('placeholder', String(q.it.r));
  E.dpg.setAttribute('placeholder', '0');
  // 변동큼·배당률 높음 = '가정 바꾸기'를 처음부터 엶 (주가 칸이 보이게)
  if (E.dAsFor !== q.it.tk) { E.dAsFor = q.it.tk; if (hasVol(q.it) || dripR(q.it) >= 20) { E.dAs.open = true; } }
  renderGp();
  renderDripOut();
}
function hasVol(it){ return (it.fl || []).indexOf('변동큼') >= 0; }
function dripR(it){ return S.d.r > 0 ? S.d.r : it.r; }
function renderGp(){
  E.dGp.innerHTML = '';
  var it = itemOf(S.sel); if (!it || !Array.isArray(it.gp) || !it.gp.length) { E.dGp.style.display = 'none'; return; }
  E.dGp.style.display = '';
  it.gp.forEach(function(g){ add(E.dGp, chip(g + '%', S.d.g === g, function(){ S.d.g = g; E.dg.value = String(g); saveState(); renderGp(); renderDripOut(); })); });
}
function renderDripOut(){
  var q = quickCalc(); if (!q) { return; }
  var it = q.it, Y = S.d.Y;
  E.dWarn.innerHTML = ''; E.dRes.innerHTML = ''; E.dTbl.innerHTML = ''; E.dNote.textContent = '';
  if (hasVol(it)) { add(E.dWarn, h('div', 'bdgj4-warn', DRIP_WARN_VOL)); }
  var pgBlank = S.d.pg === null, rr = dripR(it);
  E.dTtl.textContent = Y + '년째(배당 증가 ' + (S.d.g || 0) + '% · 주가 변화 ' + (pgBlank ? 0 : S.d.pg) + '% 가정)';
  E.dYr.style.display = 'none';
  if (!(q.V0 > 0)) { add(E.dRes, h('div', 'bdgj4-hint', '위에서 금액을 넣으면 계산해요.')); return; }
  if (rr >= 20) { E.dTtl.textContent = ''; add(E.dRes, h('div', 'bdgj4-warn', DRIP_NEED_PG)); return; }
  if (!C.drip) { add(E.dRes, h('div', 'bdgj4-hint', '재투자 계산을 불러오지 못했어요.')); return; }
  var o = { M: S.d.M || 0, Y: Y, g: S.d.g || 0, pg: pgBlank ? 0 : S.d.pg, r: S.d.r > 0 ? S.d.r : 0 };
  var a, b;
  try { a = C.drip(q.V0, it, mix(o, { re: true })); b = C.drip(q.V0, it, mix(o, { re: false })); } catch (e) { a = null; }
  if (!a || !b || !a.rows || !a.rows.length) { add(E.dRes, h('div', 'bdgj4-hint', '이 종목은 재투자를 계산할 수 없어요.')); return; }
  var la = a.rows[a.rows.length - 1], lb = b.rows[b.rows.length - 1];
  var bl = (a.warn && a.warn.blow) || null;
  if (bl) { add(E.dWarn, h('div', 'bdgj4-warn', '이 가정이면 ' + bl.y + '년째 배당률이 ' + pctTxt(bl.yl) + '예요. 배당만 늘고 주가가 그대로인 가정은 오래 갈수록 현실과 멀어져요.')); }
  function cell(l, val){ var c = add(E.dRes, h('div', 'bdgj4-dcell')); add(c, h('span', '', l)); setM(add(c, h('b', '')), val); }
  cell('배당을 다시 사면: 그해 한 달 평균(세후)', fmtWon(la.div / 12));
  cell('현금으로 받으면: 그해 한 달 평균(세후)', fmtWon(lb.div / 12));
  cell(Y + '년 동안 받은 배당(세후)', fmtWon(a.cum));
  cell(Y + '년 뒤 평가금액(주가 가정대로)', fmtWon(la.val));
  E.dNote.textContent = '넣은 돈 합계 ' + fmtWon(a.paid) + ' · 받은 배당과 평가금액은 배당을 다시 산 경우예요. 현금으로 받으면 ' + Y + '년 동안 받은 배당(세후)은 ' + fmtWon(b.cum) + '이에요.';
  setM(E.dNote, E.dNote.textContent);
  E.dYr.style.display = '';
  var tb = add(E.dTbl, h('table', '')), th = add(add(tb, h('thead')), h('tr'));
  ['해', '그해 배당(세후)', '한 달 평균', '평가금액'].forEach(function(x){ add(th, h('th', '', x)); });
  var tbd = add(tb, h('tbody'));
  a.rows.forEach(function(r){ var tr = add(tbd, h('tr')); add(tr, h('td', '', r.y + '년째')); add(tr, h('td', '', fmtWon(r.div))); add(tr, h('td', '', fmtWon(r.div / 12))); add(tr, h('td', '', fmtWon(r.val))); });
}
function mix(a, b){ var o = {}, k; for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) { o[k] = a[k]; } } for (k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) { o[k] = b[k]; } } return o; }

function addQuick(){
  var q = quickCalc(); if (!q) { return; }
  var it = q.it, v = curV();
  if (!(v > 0)) { E.addMsg.textContent = '먼저 ' + (S.mode === 'amt' ? '투자금을' : (S.mode === 'sh' ? '주 수를' : '받고 싶은 한 달 배당금을')) + ' 넣어 주세요.'; return; }
  var b = S.mode === 'goal' ? (q.need > 0 ? { key: it.tk, mode: 'amt', v: q.need } : null) : { key: it.tk, mode: S.mode, v: v };
  if (!b) { E.addMsg.textContent = '이 종목은 목표 금액을 계산할 수 없어요.'; return; }
  var i = inBasket(it.tk);
  if (i >= 0) { S.basket[i] = b; } else { S.basket.push(b); }
  saveState(); E.addMsg.textContent = it.nm + ' 담았어요. 담은 종목 ' + S.basket.length + '개';
  renderFilters(); renderQuick(); renderList(); renderBasket(); renderViews();
}

// ---------- 링크 복사 ----------
function linkState(){
  var st = { s: S.sel, m: S.mode, v: curV(), b: S.basket.map(function(b){ return { key: b.key, mode: b.mode, v: b.v }; }), c: S.customs, x: S.fx > 0 ? S.fx : null, d: null };
  var d = S.d;
  if (d.M > 0 || d.Y !== 10 || d.g || d.pg !== null || d.r > 0) { st.d = { M: d.M || 0, Y: d.Y, g: d.g || 0, pg: d.pg === null ? 0 : d.pg, r: d.r > 0 ? d.r : 0 }; }
  return st;
}
function dropHash(){ try { if (/^#bd=/.test(window.location.hash || '') && window.history && window.history.replaceState) { window.history.replaceState(null, '', window.location.href.split('#')[0]); } } catch (e) {} }
function copyLink(box){
  box.innerHTML = '';
  if (!C.encodeLink) { add(box, h('div', 'bdgj4-hint', '링크를 만들지 못했어요.')); return; }
  var url;
  try { url = window.location.href.split('#')[0] + C.encodeLink(linkState()); } catch (e) { add(box, h('div', 'bdgj4-hint', '링크를 만들지 못했어요.')); return; }
  function ok(){ box.innerHTML = ''; add(box, h('div', 'bdgj4-hint', COPY_OK)); }
  function show(){
    box.innerHTML = ''; add(box, h('div', 'bdgj4-hint', COPY_NO));
    var ro = add(box, h('input', 'bdgj4-inp bdgj4-ro')); ro.type = 'text'; ro.readOnly = true; ro.value = url; ro.setAttribute('aria-label', '계산 링크 주소');
    try { ro.focus(); ro.select(); } catch (e) {}
  }
  function legacy(){
    var ta = document.createElement('textarea'), done = false;
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0'; ta.style.fontSize = '16px';
    document.body.appendChild(ta);
    try { ta.select(); ta.setSelectionRange(0, url.length); done = document.execCommand('copy'); } catch (e) { done = false; }
    document.body.removeChild(ta);
    if (done) { ok(); } else { show(); }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(ok, legacy); return; }
  } catch (e) {}
  legacy();
}

// ---------- 종목 고르기 ----------
function sectorsAll(){ var a = [], seen = {}; allItems().forEach(function(it){ if (!seen[it.sc]) { seen[it.sc] = 1; a.push(it.sc); } }); return a; }
function keysOn(o){ return Object.keys(o).filter(function(k){ return o[k]; }); }
function renderFilters(){
  E.cyChips.innerHTML = ''; E.mkChips.innerHTML = ''; E.scChips.innerHTML = ''; E.sortChips.innerHTML = '';
  CY_ORDER.forEach(function(c){ add(E.cyChips, chip(CYN[c], !!S.cyOn[c], function(){ S.cyOn[c] = !S.cyOn[c]; S.shown = 20; renderFilters(); renderList(); })); });
  ['kr', 'us'].forEach(function(m){ add(E.mkChips, chip(MKN[m], !!S.mkOn[m], function(){ S.mkOn[m] = !S.mkOn[m]; S.shown = 20; renderFilters(); renderList(); })); });
  sectorsAll().forEach(function(s){ add(E.scChips, chip(s, !!S.scOn[s], function(){ S.scOn[s] = !S.scOn[s]; S.shown = 20; renderFilters(); renderList(); })); });
  [['pop', '인기순'], ['rdesc', '배당률 높은 순'], ['rasc', '낮은 순'], ['name', '이름순']].forEach(function(o){ add(E.sortChips, chip(o[1], S.sort === o[0], function(){ S.sort = o[0]; S.shown = 20; renderFilters(); renderList(); })); });
}
// 인기순 = 맨 위 칩 6개 먼저(칩 차례) · 나머지 이름순
function sortList(list){
  if (S.sort !== 'pop') { return C.rank(list, S.sort); }
  var head = [], rest = [];
  list.forEach(function(it){ if (POP.indexOf(it.tk) >= 0) { head.push(it); } else { rest.push(it); } });
  head.sort(function(a, b){ return POP.indexOf(a.tk) - POP.indexOf(b.tk); });
  return head.concat(C.rank(rest, 'name'));
}
function qAmt(){ return (S.mode === 'amt' && S.amt > 0) ? S.amt : DEF_AMT; }
function renderList(){
  var f = { cy: keysOn(S.cyOn).map(Number), mk: keysOn(S.mkOn), sc: keysOn(S.scOn), q: S.q, minR: S.minR };
  var list = sortList(C.filter(listItems(), f));
  E.count.textContent = '종목 ' + list.length + '개';
  var rg = dateRange();
  E.rdNote.textContent = rg ? '배당률은 종목마다 이 블로그가 종목 글(리뷰)을 쓴 날 값이에요(' + rg + ', 같은 날 값 아님).' : '';
  E.list.innerHTML = ''; E.more.innerHTML = '';
  if (!list.length) { add(E.list, h('div', 'bdgj4-hint', '조건에 맞는 종목이 없어요. 고른 조건을 줄여 보세요.')); return; }
  list.slice(0, S.shown).forEach(function(it, ix){
    var box = add(E.list, h('div', 'bdgj4-it' + (S.open === it.tk ? ' bdgj4-open' : '')));
    var top = add(box, h('div', 'bdgj4-it-top')); top.setAttribute('role', 'button'); top.setAttribute('tabindex', '0'); top.setAttribute('aria-expanded', S.open === it.tk ? 'true' : 'false');
    add(top, h('span', 'bdgj4-rk', String(ix + 1)));
    add(top, h('span', 'bdgj4-nm', it.nm));
    var rt = add(top, h('span', 'bdgj4-rt')); add(rt, dotOf(it)); rt.appendChild(document.createTextNode(it.r + '%'));
    var has = inBasket(it.tk) >= 0;
    add(top, btn('bdgj4-xs' + (has ? ' bdgj4-inb' : ''), has ? '담김' : '담기', function(e){ e.stopPropagation(); toggleBasket(it); }));
    function tog(){ S.open = S.open === it.tk ? null : it.tk; renderList(); }
    top.addEventListener('click', tog);
    top.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === top) { e.preventDefault(); tog(); } });
    var subTxt = it.sc + ', ' + cyText(it) + ', ' + monthsText(it) + (it.rd ? ', ' + md(it.rd) + ' 기준' : '');
    var sub = add(box, h('div', 'bdgj4-it-sub', subTxt)); var ar = add(sub, h('span', 'bdgj4-arw')); ar.setAttribute('aria-hidden', 'true'); sub.addEventListener('click', tog);
    if (S.open === it.tk) { box.appendChild(detailOf(it)); }
  });
  if (list.length > S.shown) { add(E.more, btn('bdgj4-xs bdgj4-ghost', '더 보기 (' + (list.length - S.shown) + '개 더)', function(){ S.shown += 20; renderList(); })).style.marginTop = '8px'; }
}
function detailOf(it){
  var d = h('div', 'bdgj4-it-det'); var miss = false, u = linkOf(it);
  function line(a, b){ var kv = add(d, h('div', 'bdgj4-kv')); add(kv, h('span', '', a)); add(kv, h('span', '', b)); }
  line('주기', cyText(it));
  line('지급 달', monthDates(it));
  if (it.la !== null && it.la !== undefined) { add(d, h('div', '', '최근 배당금(주식 1주에 ' + (it.cur === 'USD' ? it.la + '달러' : fmtWon(it.la)) + ')')); } else { miss = true; }
  if (it.lx) { line('배당락일(이날 전에 사야 받아요)', md(it.lx)); } else { miss = true; }
  if (it.lp) { line('지급일', md(it.lp) + (it.lpPlan ? ' 예정' : '')); } else { miss = true; }
  line('배당률', it.r + '%' + (it.rd ? '(' + md(it.rd) + ' 기준)' : ''));
  if (it.rh) { line('계산 방식', rhText(it.rh)); }
  line('세금', (TAXP[it.tx] || '15.4%') + ' 뗀 값');
  (it.fl || []).forEach(function(x){ if (FLN[x]) { add(d, h('div', '', '주의 : ' + FLN[x] + '.')); } });
  if (it.weq) { add(d, h('div', '', '주의 : ' + WEQ_TXT)); }
  if (miss && u) { add(d, h('div', '', '빈 칸은 리뷰 글에서 확인해 주세요.')); }
  var bt = add(d, h('div', 'bdgj4-btns'));
  if (u) { var a = h('a', 'bdgj4-btn bdgj4-xs', '리뷰 글 보기'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.style.textDecoration = 'none'; a.style.display = 'inline-flex'; a.style.alignItems = 'center'; bt.appendChild(a); }
  var has = inBasket(it.tk) >= 0;
  add(bt, btn('bdgj4-xs' + (has ? ' bdgj4-inb' : ''), has ? '담김' : '담기', function(){ toggleBasket(it); }));
  return d;
}
function fixSel(){ if (!itemOf(S.sel)) { S.sel = itemOf('SCHD') ? 'SCHD' : (DATA.items[0] ? DATA.items[0].tk : ''); } }
function dropCustom(key){
  var n = S.customs.length;
  S.customs = S.customs.filter(function(c){ return c.key !== key; });
  if (S.customs.length !== n) { rebuildCustoms(); fixSel(); }
}
function removeAt(idx){
  var b = S.basket[idx]; if (!b) { return; }
  S.basket.splice(idx, 1); dropCustom(b.key);
  saveState(); renderAll();
}
function toggleBasket(it){
  var i = inBasket(it.tk);
  if (i >= 0) { removeAt(i); return; }
  S.basket.push({ key: it.tk, mode: 'amt', v: qAmt() });
  saveState(); renderList(); renderBasket(); renderViews(); renderQuick();
}

// ---------- 담은 종목 ----------
var bkUpd = [];
function renderBasketRes(){ bkUpd.forEach(function(f){ f(); }); }
function renderBasket(){
  E.bList.innerHTML = ''; bkUpd = [];
  var n = S.basket.length;
  E.bHead.textContent = n ? '종목마다 금액이나 주 수를 고르고 넣으세요.' : '아직 담은 종목이 없어요. 위에서 "담기"를 누르거나 "예시 담기"를 눌러 보세요.';
  E.bClear.style.display = n ? '' : 'none';
  E.bCopy.style.display = n ? '' : 'none';
  E.goalBox.style.display = n ? '' : 'none';
  S.basket.forEach(function(b, idx){
    var it = itemOf(b.key); if (!it) { return; }
    var box = add(E.bList, h('div', 'bdgj4-bk'));
    var top = add(box, h('div', 'bdgj4-bk-top'));
    add(top, h('span', 'bdgj4-bk-nm', it.nm));
    var rm = add(top, btn('bdgj4-xs', '빼기', function(){ removeAt(idx); })); rm.setAttribute('aria-label', it.nm + ' 빼기');
    var row = add(box, h('div', 'bdgj4-bk-row'));
    var sg = add(row, h('span', 'bdgj4-seg'));
    add(sg, chip('금액', b.mode === 'amt', function(){ if (b.mode !== 'amt') { b.mode = 'amt'; b.v = 0; } saveState(); renderBasket(); renderViews(); }));
    add(sg, chip('주 수', b.mode === 'sh', function(){ if (b.mode !== 'sh') { b.mode = 'sh'; b.v = 0; } saveState(); renderBasket(); renderViews(); }));
    var inp = add(row, h('input', 'bdgj4-inp bdgj4-sm')); inp.type = 'text'; inp.setAttribute('inputmode', b.mode === 'sh' ? 'decimal' : 'numeric');
    inp.value = b.v > 0 ? (b.mode === 'sh' ? fmtSh(b.v).replace(/,/g, '') : comma(b.v)) : '';
    inp.setAttribute('placeholder', b.mode === 'amt' ? '금액(원)' : '주 수'); inp.setAttribute('aria-label', it.nm + (b.mode === 'amt' ? ' 금액(원)' : ' 주 수'));
    add(row, h('span', '', b.mode === 'amt' ? '원' : '주'));
    var res = add(box, h('div', 'bdgj4-bk-res'));
    function upd(){
      var p = C.pay(it, b, fxNow());
      setM(res, p ? '1년 세후 ' + fmtWon(p.post) : (b.v > 0 ? '1주당 배당금 자료가 없어 주 수로는 계산이 안 돼요. 금액으로 바꿔 주세요.' : (b.mode === 'amt' ? '금액을 넣어 주세요.' : '주 수를 넣어 주세요.')));
    }
    upd(); bkUpd.push(upd);
    inp.addEventListener('input', function(){
      var v;
      if (b.mode === 'sh') { var raw = inp.value, cl = cleanSh(raw); v = numSh(raw); if (v > 99999999) { v = 99999999; cl = String(v); } if (cl !== raw) { inp.value = cl; } }
      else { v = num(inp.value); if (v > 99999999999) { v = 99999999999; } inp.value = v ? comma(v) : ''; }
      b.v = v > 0 ? v : 0; saveState(); upd(); renderViews();
    });
  });
  E.exNote.textContent = '"예시 담기"는 원리 예시예요. BCE(1·4·7·10월), AT&T(2·5·8·11월), 존슨앤존슨(3·6·9·12월)을 1,000만원씩 담으면 12달이 모두 채워져요.';
  renderGoalBasket();
}
function validBasket(){ return S.basket.filter(function(b){ return b.v > 0 && itemOf(b.key); }); }
function renderGoalBasket(){
  var t = num(E.g2.value), bk = validBasket();
  if (!bk.length) { E.g2Res.textContent = ''; return; }
  if (!t) { E.g2Res.textContent = '목표 금액을 넣으면 지금 담은 비율 그대로 필요한 총 금액이 나와요.'; return; }
  var g = C.goal(bk, allItems(), fxNow(), t);
  setM(E.g2Res, g > 0 ? '지금 담은 비율 그대로면 총 약 ' + fmtWon(g) + '이 필요해요(1만원 단위로 올림).' : '계산할 수 없어요. 금액이나 주 수를 확인해 주세요.');
}
function addExample(){
  EX_KEYS.forEach(function(k){ if (itemOf(k) && inBasket(k) < 0) { S.basket.push({ key: k, mode: 'amt', v: DEF_AMT }); } });
  saveState(); renderBasket(); renderList(); renderViews(); renderQuick();
}
function renderCustomForm(){
  E.cmkChips.innerHTML = ''; E.cmoChips.innerHTML = '';
  ['kr', 'us'].forEach(function(m){ add(E.cmkChips, chip(MKN[m], E.cmk === m, function(){ E.cmk = m; renderCustomForm(); })); });
  var i; for (i = 1; i <= 12; i++) { (function(m){ add(E.cmoChips, chip(m + '월', !!E.cmo[m], function(){ E.cmo[m] = !E.cmo[m]; renderCustomForm(); })); })(i); }
}
function addCustom(){
  var nm = E.cn.value.replace(/^\s+|\s+$/g, ''), r = parseFloat(String(E.cr.value).replace(/[^0-9.]/g, '')), mo = [], i;
  for (i = 1; i <= 12; i++) { if (E.cmo[i]) { mo.push(i); } }
  var msg = '';
  if (!nm) { msg = '이름을 넣어 주세요.'; } else if (!(r > 0 && r <= 1000)) { msg = '1년 배당률(세전, %)을 숫자로 넣어 주세요.'; } else if (!E.cmk) { msg = '국내인지 미국인지 골라 주세요.'; } else if (!mo.length) { msg = '돈이 들어오는 달을 하나 이상 골라 주세요.'; }
  if (msg) { E.cMsg.textContent = msg; E.cMsg.style.display = ''; return; }
  E.cMsg.style.display = 'none';
  var n = 1; S.customs.forEach(function(c){ var x = Number(String(c.key).replace(/^c/, '')); if (x >= n) { n = x + 1; } });
  var key = 'c' + n;
  S.customs.push({ key: key, custom: true, nm: nm, r: r, mk: E.cmk, mo: mo, tx: E.cmk === 'us' ? 'us' : 'kr' });
  S.basket.push({ key: key, mode: 'amt', v: DEF_AMT });
  E.cn.value = ''; E.cr.value = ''; E.cmo = {}; E.cmk = null; renderCustomForm();
  saveState(); rebuildCustoms(); renderFilters(); renderList(); renderBasket(); renderViews();
}

// ---------- 달력·섹터·띠 ----------
function renderAvg(){
  var a = C.avgRate(validBasket(), allItems(), fxNow());
  if (a.rate === null) { E.avgLine.style.display = 'none'; E.avgLine.textContent = ''; return; }
  E.avgLine.textContent = '담은 비율대로 평균 배당률(세전) ' + a.rate.toFixed(1) + '%' + (a.skipped > 0 ? '. ' + a.skipped + '개는 금액을 몰라 뺐어요' : '');
  E.avgLine.style.display = '';
}
function renderViews(){ renderCalendar(); renderSector(); renderBand(); renderAvg(); }
function renderCalendar(){
  var bk = validBasket(), items = allItems(), cal = C.calendar(bk, items, fxNow()), s = C.summary(cal), m;
  E.cal.innerHTML = '';
  E.calHint.textContent = bk.length ? '달을 누르면 어떤 종목이 들어오는지 보여요. 똑같이 나눈 달도 1원 단위로 맞추느라 1원쯤 차이 날 수 있어요.' : '종목을 담으면 달력이 채워져요. 위에서 "담기"나 "예시 담기"를 눌러 보세요.';
  var mx = 0; for (m = 0; m < 12; m++) { if (cal[m].post > mx) { mx = cal[m].post; } }
  for (m = 0; m < 12; m++) {
    (function(m){
      var c = cal[m], has = c.list.length > 0;
      var b = h('button', 'bdgj4-cell' + (has ? ' bdgj4-has' : '') + (S.month === m ? ' bdgj4-sel' : '')); b.type = 'button'; b.setAttribute('aria-pressed', S.month === m ? 'true' : 'false');
      b.style.setProperty('--v', (has && mx > 0 ? Math.max(8, Math.round(c.post / mx * 100)) : 0) + '%');
      add(b, h('b', '', (m + 1) + '월'));
      if (has) { add(b, h('span', 'bdgj4-amt', fmtWon(c.post))); add(b, h('span', '', c.list.length + '종목')); }
      else { add(b, h('span', 'bdgj4-void', bk.length ? '들어오는 배당 없음' : '')); }
      b.addEventListener('click', function(){ S.month = S.month === m ? -1 : m; renderCalendar(); });
      E.cal.appendChild(b);
    })(m);
  }
  fitCal();
  if (S.month >= 0 && bk.length) {
    var c2 = cal[S.month]; E.mdet.innerHTML = ''; E.mdet.style.display = '';
    add(E.mdet, h('div', 'bdgj4-lab', (S.month + 1) + '월 들어오는 배당(세후)')).style.marginTop = '0';
    if (!c2.list.length) { add(E.mdet, h('div', '', '들어오는 배당 없음')); }
    c2.list.forEach(function(x){ setM(add(E.mdet, h('div', '')), x.nm + ', ' + (x.day ? x.day + '일쯤' : '날짜 미정') + ', 세후 ' + fmtWon(x.post)); });
  } else { E.mdet.style.display = 'none'; }
  E.sum.innerHTML = '';
  if (!bk.length) { E.over.style.display = 'none'; E.gauge.style.display = 'none'; return; }
  var maxM = -1, minM = -1, i;
  for (i = 0; i < 12; i++) { if (cal[i].list.length) { if (maxM < 0 || cal[i].post > cal[maxM].post) { maxM = i; } if (minM < 0 || cal[i].post < cal[minM].post) { minM = i; } } }
  function row(a, b){ add(E.sum, h('span', '', a)); setM(add(E.sum, h('span', '')), b); }
  row('1년 세전', fmtWon(s.preY)); row('세금(뗀 돈)', fmtWon(s.preY - s.postY)); row('1년 세후', fmtWon(s.postY)); row('한 달 평균(세후)', fmtWon(s.postY / 12));
  row('가장 많은 달', maxM >= 0 ? (maxM + 1) + '월 ' + fmtWon(cal[maxM].post) : '-');
  row('가장 적은 달(들어오는 달 가운데)', minM >= 0 ? (minM + 1) + '월 ' + fmtWon(cal[minM].post) : '-');
  var emp = 0; for (i = 0; i < 12; i++) { if (!cal[i].list.length) { emp++; } }
  row('배당이 없는 달', emp + '개월');
  renderGauge(s.preY);
  if (s.preY > LIMIT) { E.over.textContent = OVER_TXT; E.over.style.display = ''; } else { E.over.style.display = 'none'; }
}
// 2천만 막대 (담은 것만 셈 · 80% 넘으면 진한 갈색 · 빨강 안 씀)
function renderGauge(preY){
  E.gauge.innerHTML = '';
  if (!C.gauge || !(preY > 0)) { E.gauge.style.display = 'none'; return; }
  var g = C.gauge(preY); if (!g) { E.gauge.style.display = 'none'; return; }
  E.gauge.style.display = '';
  setM(add(E.gauge, h('div', 'bdgj4-gauge-t')), '금융소득 2,000만원 기준에 담은 배당(세전 1년)이 ' + g.pct + '% 찼어요');
  var bb = add(E.gauge, h('div', 'bdgj4-gauge-b')), i = add(bb, h('i'));
  bb.setAttribute('role', 'img'); bb.setAttribute('aria-label', '2,000만원 기준 ' + g.pct + '%');
  var fill = Number(g.fill); if (!(fill >= 0)) { fill = Math.min(100, Math.max(2, Number(g.pct) || 0)); }
  i.style.width = Math.min(100, Math.max(2, fill)) + '%';
  i.style.background = Number(g.pct) > 80 ? '#7A3E00' : '#1F5FBF';
  add(E.gauge, h('div', 'bdgj4-hint', GAUGE_NOTE));
}
function renderSector(){
  var bk = validBasket(); E.secBars.innerHTML = ''; E.cycLine.textContent = '';
  if (!bk.length) { add(E.secBars, h('div', 'bdgj4-hint', '종목을 담으면 섹터(업종)별 비중이 나와요.')); return; }
  var rows = C.bySector(bk, allItems(), fxNow()), tot = 0; rows.forEach(function(r){ tot += r.post; });
  rows.forEach(function(r){
    var pct = tot > 0 ? r.post / tot * 100 : 0;
    var d = add(E.secBars, h('div', 'bdgj4-bar')), t = add(d, h('div', 'bdgj4-bar-t'));
    add(t, h('span', '', r.sc)); add(t, h('span', '', fmtWon(r.post) + ' (' + Math.round(pct) + '%)'));
    var bb = add(d, h('div', 'bdgj4-bar-b')); var i = add(bb, h('i')); i.style.width = Math.max(2, Math.round(pct)) + '%';
  });
  var g = {}, ct = 0;
  bk.forEach(function(b){ var it = itemOf(b.key), p = it ? C.pay(it, b, fxNow()) : null; if (p) { g[it.cy] = (g[it.cy] || 0) + p.post; ct += p.post; } });
  var parts = []; CY_ORDER.forEach(function(c){ if (g[c]) { parts.push((CYN[c] || c) + ' ' + Math.round(g[c] / ct * 100) + '%'); } });
  E.cycLine.textContent = '주기별: ' + parts.join(', ');
}
function renderBand(){
  var bk = validBasket();
  if (!bk.length) { E.band.style.display = 'none'; return; }
  var cal = C.calendar(bk, allItems(), fxNow()), s = C.summary(cal);
  E.bandT.innerHTML = ''; add(E.bandT, h('span', '', '담은 ' + bk.length + '종목, 1년 세후')); add(E.bandT, h('span', 'bdgj4-band-a', fmtWon(s.postY)));
  E.band.style.display = '';
}

// ---------- 글 안 정적 표 · 자료 새로 받기 ----------
function tryMove(){
  var t = document.getElementById('bdgj4-table');
  if (!t || !E.tblHold || E.tblHold.contains(t)) { return; }
  E.tblHold.appendChild(t); E.tblDet.style.display = ''; checkTbl();
}
function fetchNew(){
  if (typeof fetch !== 'function') { return; }
  var ctl = null, tm = null;
  try { if (typeof AbortController === 'function') { ctl = new AbortController(); tm = setTimeout(function(){ try { ctl.abort(); } catch (e) {} }, 4000); } } catch (e) {}
  try {
    fetch(DATA_URL, ctl ? { cache: 'no-store', signal: ctl.signal } : { cache: 'no-store' }).then(function(r){ if (tm) { clearTimeout(tm); } return r.ok ? r.json() : null; }).then(function(d){
      if (!d || !Array.isArray(d.items) || !d.items.length || !(d.fx > 0) || !d.asof || !d.asof.made) { return; }
      var cur = (DATA.asof && DATA.asof.made) || '';
      if (String(d.asof.made) > String(cur)) { DATA = d; cleanBasket(); if (!itemOf(S.sel)) { S.sel = itemOf('SCHD') ? 'SCHD' : DATA.items[0].tk; } renderAll(); tryMove(); }
    }).catch(function(){});
  } catch (e) {}
}

if (document.getElementById('bdgj4-root')) { start(); }
else if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
})();
