/* 배당자판기 종합 배당 계산기 2판 widget.js · 글에는 <div id="bdgj4-root"></div> 와 이 파일을 부르는 script 두 줄만 넣으면 돎 */
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

  var api = {
    TAX: TAX, LIMIT: LIMIT, OVER_MSG: OVER_MSG,
    rnd: rnd, num: num, won: won,
    pay: pay, avgRate: avgRate, calendar: calendar, summary: summary,
    bySector: bySector, byCycle: byCycle, goal: goal,
    filter: filter, rank: rank
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.BDGJ4CALC = api; }
})(typeof window !== 'undefined' ? window : null);
var C = BDGJ4CALC;
var DATA = {"asof":{"px":null,"r":"종목마다 리뷰 글 기준일","fx":"2026-11-13","made":"2026-11-16 10:20"},"fx":1335,"items":[{"n":5,"tk":"DIS","tkReal":true,"nm":"디즈니","fn":"디즈니(DIS)","mk":"us","tx":"us","ty":"주식","sc":"미디어","cy":2,"mo":[1,7],"w":[0.5,0.0,0.0,0.0,0.0,0.0,0.5,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":1.5,"cur":"USD","px":null,"pxd":null,"r":1.41,"rd":"2026-09-11","rh":"최근 지급분 1년 환산","la":0.75,"lx":null,"lp":"2026-07-22","lpPlan":false,"pd":[15,null,null,null,null,null,22,null,null,null,null,null],"fl":[],"one":"2년 만에 배당 두 배","src":"티스토리 /5 · 03_완성본/004_DIS/02_티스토리원고.md"},{"n":6,"tk":"SCHD","tkReal":true,"nm":"SCHD","fn":"SCHD(슈드)","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":1.054,"cur":"USD","px":null,"pxd":null,"r":3.2,"rd":"2026-09-24","rh":"최근 12개월 실제 지급","la":0.2665,"lx":"2026-09-23","lp":"2026-09-28","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,28,null,null,null],"fl":[],"one":"천만원 넣고 3년이면 배당 121만원","src":"티스토리 /6 · 03_완성본/002_SCHD/02_티스토리원고.md"},{"n":7,"tk":"KO","tkReal":true,"nm":"코카콜라","fn":"코카콜라(KO)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[4,7,10,12],"w":[0.0,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.25],"weq":true,"times":4,"dps":2.12,"cur":"USD","px":null,"pxd":null,"r":2.4,"rd":"2026-09-25","rh":"최근 지급분 1년 환산","la":0.53,"lx":"2026-09-15","lp":"2026-10-01","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,1,null,null],"fl":[],"one":"64년 연속 배당 인상","src":"티스토리 /7 · 03_완성본/001_KO/02_티스토리원고.md"},{"n":8,"tk":"JEPI","tkReal":true,"nm":"JEPI","fn":"JEPI(제피)","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":4.58,"cur":"USD","px":null,"pxd":null,"r":8.1,"rd":"2026-09-25","rh":"최근 12개월 실제 지급","la":0.37,"lx":"2026-09-01","lp":"2026-09-03","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,3,null,null,null],"fl":["변동큼"],"one":"천만원이면 매달 6만 7천원","src":"티스토리 /8 · 03_완성본/003_JEPI/02_티스토리원고.md"},{"n":9,"tk":"T","tkReal":true,"nm":"AT&T","fn":"AT&T","mk":"us","tx":"us","ty":"주식","sc":"통신","cy":4,"mo":[2,5,8,11],"w":[0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0],"weq":true,"times":4,"dps":1.11,"cur":"USD","px":null,"pxd":null,"r":4.46,"rd":"2026-09-28","rh":"최근 12개월 실제 지급","la":0.2775,"lx":"2026-10-09","lp":"2026-11-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,2,null],"fl":[],"one":"천만원이면 한 달 3만 7천원꼴","src":"티스토리 /9 · 03_완성본/005_T/02_티스토리원고.md"},{"n":10,"tk":"MO","tkReal":true,"nm":"알트리아","fn":"알트리아(MO)","mk":"us","tx":"us","ty":"주식","sc":"담배","cy":4,"mo":[1,4,7,10],"w":[0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0],"weq":true,"times":4,"dps":4.44,"cur":"USD","px":null,"pxd":null,"r":6.42,"rd":"2026-09-28","rh":"최근 지급분 1년 환산","la":1.11,"lx":"2026-09-15","lp":"2026-10-09","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,9,null,null],"fl":[],"one":"천만원이면 한 달 5만 3천원꼴","src":"티스토리 /10 · 03_완성본/006_MO/02_티스토리원고.md"},{"n":11,"tk":"005930","tkReal":true,"nm":"삼성전자","fn":"삼성전자","mk":"kr","tx":"kr","ty":"주식","sc":"IT(반도체·전자)","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.336505,0.221165,0.0,0.0,0.222354,0.0,0.0,0.219976,0.0],"weq":false,"times":4,"dps":1682,"cur":"KRW","px":null,"pxd":null,"r":0.62,"rd":"2026-09-28","rh":"최근 12개월 실제 지급","la":374,"lx":null,"lp":null,"lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,null,null],"fl":[],"one":"3년 전 천만원이 지금 4009만원","src":"티스토리 /11 · 03_완성본/007_삼성전자/02_티스토리원고.md"},{"n":13,"tk":"033780","tkReal":true,"nm":"KT&G","fn":"KT&G","mk":"kr","tx":"kr","ty":"주식","sc":"담배","cy":2,"mo":[4,9],"w":[0.0,0.0,0.0,0.69697,0.0,0.0,0.0,0.0,0.30303,0.0,0.0,0.0],"weq":false,"times":2,"dps":6600,"cur":"KRW","px":null,"pxd":null,"r":3.72,"rd":"2026-09-29","rh":"최근 12개월 실제 지급","la":2000,"lx":null,"lp":"2026-09-07","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,7,null,null,null],"fl":[],"one":"4년 만에 배당 25% 인상","src":"티스토리 /13 · 03_완성본/008_KT&G/02_티스토리원고.md"},{"n":14,"tk":"BCE","tkReal":true,"nm":"BCE","fn":"BCE(벨캐나다)","mk":"us","tx":"us","ty":"주식","sc":"통신","cy":4,"mo":[1,4,7,10],"w":[0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0],"weq":true,"times":4,"dps":1.26,"cur":"USD","px":null,"pxd":null,"r":6.28,"rd":"2026-09-29","rh":"최근 12개월 실제 지급","la":null,"lx":"2026-09-15","lp":"2026-10-15","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,15,null,null],"fl":[],"one":"천만원이면 한 달 5만 2천원꼴","src":"티스토리 /14 · 03_완성본/009_BCE/02_티스토리원고.md"},{"n":15,"tk":"JNJ","tkReal":true,"nm":"존슨앤존슨","fn":"존슨앤존슨(JNJ)","mk":"us","tx":"us","ty":"주식","sc":"헬스케어","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":5.28,"cur":"USD","px":null,"pxd":null,"r":1.97,"rd":"2026-09-29","rh":"최근 12개월 실제 지급","la":1.34,"lx":"2026-08-25","lp":"2026-09-08","lpPlan":false,"pd":[null,null,null,null,null,9,null,null,8,null,null,null],"fl":[],"one":"64년 연속 배당 인상","src":"티스토리 /15 · 03_완성본/010_JNJ/02_티스토리원고.md"},{"n":16,"tk":"VZ","tkReal":true,"nm":"버라이즌","fn":"버라이즌(VZ)","mk":"us","tx":"us","ty":"주식","sc":"통신","cy":4,"mo":[2,5,8,11],"w":[0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0],"weq":true,"times":4,"dps":2.795,"cur":"USD","px":null,"pxd":null,"r":6.09,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":0.7075,"lx":"2026-10-09","lp":"2026-11-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,2,null],"fl":[],"one":"20년 연속 배당 인상","src":"티스토리 /16 · 03_완성본/011_VZ/02_티스토리원고.md"},{"n":17,"tk":"005935","tkReal":true,"nm":"삼성전자우","fn":"삼성전자우","mk":"kr","tx":"kr","ty":"주식","sc":"IT(반도체·전자)","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.336898,0.221034,0.0,0.0,0.222222,0.0,0.0,0.219846,0.0],"weq":false,"times":4,"dps":1683,"cur":"KRW","px":null,"pxd":null,"r":0.82,"rd":"2026-10-01","rh":"최근 12개월 실제 지급","la":374,"lx":null,"lp":null,"lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,null,null],"fl":[],"one":"3년 전 천만원이 지금 3830만원","src":"티스토리 /17 · 03_완성본/013_삼성전자우/02_티스토리원고.md"},{"n":18,"tk":"AGNC","tkReal":true,"nm":"AGNC","fn":"AGNC인베스트먼트(AGNC)","mk":"us","tx":"us","ty":"리츠","sc":"리츠","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":1.44,"cur":"USD","px":null,"pxd":null,"r":15.88,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":0.12,"lx":"2026-09-30","lp":"2026-10-09","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,9,null,null],"fl":[],"one":"천만원이면 매달 13만 2천원","src":"티스토리 /18 · 03_완성본/027_AGNC/02_티스토리원고.md"},{"n":19,"tk":"PEP","tkReal":true,"nm":"펩시코","fn":"펩시코(PEP)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[1,3,6,9],"w":[0.25,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.0],"weq":true,"times":4,"dps":5.805,"cur":"USD","px":null,"pxd":null,"r":4.58,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":1.48,"lx":"2026-09-04","lp":"2026-09-30","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,30,null,null,null],"fl":[],"one":"4년 만에 배당 32% 인상","src":"티스토리 /19 · 03_완성본/014_PEP/02_티스토리원고.md"},{"n":20,"tk":"APLY","tkReal":true,"nm":"APLY","fn":"APLY","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":52,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":3.92,"cur":"USD","px":null,"pxd":null,"r":33.31,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":0.0679,"lx":"2026-10-01","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","주배당"],"one":"천만원이면 한 달 평균 27만 8천원","src":"티스토리 /20 · 03_완성본/036_APLY/02_티스토리원고.md"},{"n":21,"tk":"COST","tkReal":true,"nm":"코스트코","fn":"코스트코(COST)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[2,5,8,11],"w":[0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0],"weq":true,"times":4,"dps":5.54,"cur":"USD","px":null,"pxd":null,"r":0.61,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":1.47,"lx":"2026-07-24","lp":"2026-08-07","lpPlan":false,"pd":[null,13,null,null,15,null,null,7,null,null,14,null],"fl":[],"one":"3년 전 천만원이 지금 1664만원","src":"티스토리 /21 · 03_완성본/016_COST/02_티스토리원고.md"},{"n":22,"tk":"XOM","tkReal":true,"nm":"엑슨모빌","fn":"엑슨모빌(XOM)","mk":"us","tx":"us","ty":"주식","sc":"에너지","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":4.12,"cur":"USD","px":null,"pxd":null,"r":2.53,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":1.03,"lx":"2026-08-17","lp":"2026-09-10","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,10,null,null,null],"fl":[],"one":"43년 연속 배당 인상","src":"티스토리 /22 · 03_완성본/017_XOM/02_티스토리원고.md"},{"n":23,"tk":"289480","tkReal":true,"nm":"TIGER 200커버드콜","fn":"TIGER 200커버드콜","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":922,"cur":"KRW","px":null,"pxd":null,"r":7.03,"rd":"2026-09-30","rh":"최근 12개월 실제 지급","la":94,"lx":"2026-09-29","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","세금넉넉"],"one":"천만원이면 매달 평균 5만 9천원","src":"티스토리 /23 · 03_완성본/066_TIGER 200커버드콜/02_티스토리원고.md"},{"n":24,"tk":"MA","tkReal":true,"nm":"마스터카드","fn":"마스터카드(MA)","mk":"us","tx":"us","ty":"주식","sc":"금융(결제망)","cy":4,"mo":[2,5,8,11],"w":[0.0,0.258161,0.0,0.0,0.25816,0.0,0.0,0.25816,0.0,0.0,0.225519,0.0],"weq":false,"times":4,"dps":3.37,"cur":"USD","px":null,"pxd":null,"r":0.61,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":0.87,"lx":"2026-07-09","lp":"2026-08-07","lpPlan":false,"pd":[null,9,null,null,8,null,null,7,null,null,9,null],"fl":[],"one":"천만원이 3년 만에 1417만원","src":"티스토리 /24 · 03_완성본/019_MA/02_티스토리원고.md"},{"n":25,"tk":"000270","tkReal":true,"nm":"기아","fn":"기아","mk":"kr","tx":"kr","ty":"주식","sc":"자동차","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":6800,"cur":"KRW","px":null,"pxd":null,"r":6.02,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":6800,"lx":"2026-03-24","lp":"2026-04-20","lpPlan":false,"pd":[null,null,null,20,null,null,null,null,null,null,null,null],"fl":[],"one":"3년 새 배당 94% 인상","src":"티스토리 /25 · 03_완성본/023_기아/02_티스토리원고.md"},{"n":26,"tk":"441640","tkReal":true,"nm":"KODEX 미국배당커버드콜액티브","fn":"KODEX 미국배당커버드콜액티브","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":1184,"cur":"KRW","px":null,"pxd":null,"r":9.77,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":96,"lx":"2026-09-14","lp":"2026-09-17","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,17,null,null,null],"fl":["변동큼","세금넉넉"],"one":"천만원이면 한 달 평균 8만 1천원","src":"티스토리 /26 · 03_완성본/069_KODEX 미국배당커버드콜액티브/02_티스토리원고.md"},{"n":27,"tk":"005380","tkReal":true,"nm":"현대차","fn":"현대차","mk":"kr","tx":"kr","ty":"주식","sc":"자동차","cy":4,"mo":[4,6,9,12],"w":[0.0,0.0,0.0,0.25,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":false,"times":4,"dps":10000,"cur":"KRW","px":null,"pxd":null,"r":2.89,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":2500,"lx":"2026-08-28","lp":"2026-09-30","lpPlan":false,"pd":[null,null,null,24,null,30,null,null,30,null,null,31],"fl":[],"one":"3년 만에 천만원이 1998만원","src":"티스토리 /27 · 03_완성본/020_현대차/02_티스토리원고.md"},{"n":29,"tk":"024110","tkReal":true,"nm":"기업은행","fn":"기업은행","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":2,"mo":[4,8],"w":[0.0,0.0,0.0,0.833068,0.0,0.0,0.0,0.166932,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":1258,"cur":"KRW","px":null,"pxd":null,"r":6.23,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":210,"lx":"2026-07-30","lp":"2026-08-28","lpPlan":false,"pd":[null,null,null,23,null,null,null,28,null,null,null,null],"fl":[],"one":"결산 1048원+2분기 210원","src":"티스토리 /29 · 03_완성본/077_기업은행/02_티스토리원고.md"},{"n":30,"tk":"JEPQ","tkReal":true,"nm":"JEPQ","fn":"JEPQ(젭큐)","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":6.885,"cur":"USD","px":null,"pxd":null,"r":11.28,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":0.56687,"lx":"2026-10-01","lp":"2026-10-05","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,5,null,null],"fl":["변동큼"],"one":"나스닥 커버드콜","src":"티스토리 /30 · 03_완성본/159_JEPQ/02_티스토리원고.md"},{"n":31,"tk":"017670","tkReal":true,"nm":"SK텔레콤","fn":"SK텔레콤","mk":"kr","tx":"kr","ty":"주식","sc":"통신","cy":4,"mo":[6,9],"w":[0.0,0.0,0.0,0.0,0.0,0.5,0.0,0.0,0.5,0.0,0.0,0.0],"weq":false,"times":2,"dps":1660,"cur":"KRW","px":null,"pxd":null,"r":1.88,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":830,"lx":"2026-08-28","lp":"2026-09-17","lpPlan":false,"pd":[null,null,null,null,null,18,null,null,17,null,null,null],"fl":[],"one":"쉬었다가 6월 다시 시작","src":"티스토리 /31 · 03_완성본/942_SK텔레콤/02_티스토리원고.md"},{"n":32,"tk":"088980","tkReal":true,"nm":"맥쿼리인프라","fn":"맥쿼리인프라","mk":"kr","tx":"kr","ty":"인프라펀드","sc":"인프라","cy":2,"mo":[2,8],"w":[0.0,0.520548,0.0,0.0,0.0,0.0,0.0,0.479452,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":730,"cur":"KRW","px":null,"pxd":null,"r":7.46,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":350,"lx":"2026-06-29","lp":"2026-08-28","lpPlan":false,"pd":[null,27,null,null,null,null,null,28,null,null,null,null],"fl":[],"one":"380원에서 350원으로","src":"티스토리 /32 · 03_완성본/047_맥쿼리인프라/02_티스토리원고.md"},{"n":33,"tk":"TSLY","tkReal":true,"nm":"TSLY","fn":"TSLY","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":52,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":18.2122,"cur":"USD","px":null,"pxd":null,"r":81.85,"rd":"2026-10-02","rh":"최근 12개월 실제 지급","la":0.23,"lx":"2026-10-01","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","주배당"],"one":"테슬라 커버드콜","src":"티스토리 /33 · 03_완성본/186_TSLY/02_티스토리원고.md"},{"n":34,"tk":"DGRO","tkReal":true,"nm":"DGRO","fn":"DGRO","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":true,"times":4,"dps":1.4937,"cur":"USD","px":null,"pxd":null,"r":1.96,"rd":"2026-10-07","rh":"최근 12개월 실제 지급","la":0.385,"lx":"2026-09-15","lp":"2026-09-18","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,18,null,null,null],"fl":[],"one":"배당 성장 ETF","src":"티스토리 /34 · 03_완성본/151_DGRO/02_티스토리원고.md"},{"n":35,"tk":"016360","tkReal":true,"nm":"삼성증권","fn":"삼성증권","mk":"kr","tx":"kr","ty":"주식","sc":"증권","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":4000,"cur":"KRW","px":null,"pxd":null,"r":4.67,"rd":"2026-10-08","rh":"최근 12개월 실제 지급","la":4000,"lx":"2025-12-29","lp":"2026-04-10","lpPlan":false,"pd":[null,null,null,10,null,null,null,null,null,null,null,null],"fl":[],"one":"1년에 한 번 4000원","src":"티스토리 /35 · 03_완성본/068_삼성증권/02_티스토리원고.md"},{"n":36,"tk":"NVDY","tkReal":true,"nm":"NVDY","fn":"NVDY","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":52,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":6.3325,"cur":"USD","px":null,"pxd":null,"r":50.38,"rd":"2026-10-09","rh":"최근 12개월 실제 지급","la":0.0761,"lx":"2026-10-08","lp":"2026-10-09","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,9,null,null],"fl":["변동큼","주배당"],"one":"엔비디아 커버드콜","src":"티스토리 /36 · 03_완성본/183_NVDY/02_티스토리원고.md"},{"n":37,"tk":"006800","tkReal":true,"nm":"미래에셋증권","fn":"미래에셋증권","mk":"kr","tx":"kr","ty":"주식","sc":"증권","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":300,"cur":"KRW","px":null,"pxd":null,"r":1.09,"rd":"2026-10-13","rh":"최근 12개월 실제 지급","la":300,"lx":"2026-03-16","lp":"2026-04-22","lpPlan":false,"pd":[null,null,null,22,null,null,null,null,null,null,null,null],"fl":[],"one":"현금 300원+주식","src":"티스토리 /37 · 03_완성본/353_미래에셋증권/02_티스토리원고.md"},{"n":38,"tk":"O","tkReal":true,"nm":"리얼티인컴","fn":"리얼티인컴(O)","mk":"us","tx":"us","ty":"리츠","sc":"리츠","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":3.243,"cur":"USD","px":null,"pxd":null,"r":5.93,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":0.2715,"lx":"2026-09-30","lp":"2026-10-15","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,15,null,null],"fl":[],"one":"31년 넘게 배당 인상","src":"티스토리 /38 · 03_완성본/233_O/02_티스토리원고.md"},{"n":39,"tk":"QYLD","tkReal":true,"nm":"QYLD","fn":"QYLD","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":2.1309,"cur":"USD","px":null,"pxd":null,"r":11.41,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":0.1767,"lx":"2026-09-21","lp":"2026-09-24","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,24,null,null,null],"fl":["변동큼"],"one":"나스닥100 커버드콜","src":"티스토리 /39 · 03_완성본/165_QYLD/02_티스토리원고.md"},{"n":40,"tk":"WMT","tkReal":true,"nm":"월마트","fn":"월마트(WMT)","mk":"us","tx":"us","ty":"주식","sc":"필수소비재","cy":4,"mo":[1,4,5,9],"w":[0.240409,0.0,0.0,0.253197,0.253197,0.0,0.0,0.0,0.253197,0.0,0.0,0.0],"weq":false,"times":4,"dps":0.9775,"cur":"USD","px":null,"pxd":null,"r":0.86,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":0.2475,"lx":"2026-08-21","lp":"2026-09-08","lpPlan":false,"pd":[5,null,null,6,26,null,null,null,8,null,null,null],"fl":[],"one":"53년 연속 인상","src":"티스토리 /40 · 03_완성본/037_WMT/02_티스토리원고.md"},{"n":41,"tk":"086790","tkReal":true,"nm":"하나금융지주","fn":"하나금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.297863,0.249673,0.0,0.0,0.251853,0.0,0.0,0.200611,0.0],"weq":false,"times":4,"dps":4586,"cur":"KRW","px":null,"pxd":null,"r":3.69,"rd":"2026-10-12","rh":"최근 12개월 실제 지급","la":1155,"lx":null,"lp":"2026-08-21","lpPlan":false,"pd":[null,null,null,10,22,null,null,21,null,null,28,null],"fl":[],"one":"4년 새 32.4% 늘어","src":"티스토리 /41 · 03_완성본/065_하나금융지주/02_티스토리원고.md"},{"n":44,"tk":"VIG","tkReal":true,"nm":"VIG","fn":"VIG","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.228573,0.0,0.0,0.273936,0.0,0.0,0.25493,0.0,0.0,0.242561],"weq":false,"times":4,"dps":3.6461,"cur":"USD","px":null,"pxd":null,"r":1.51,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.9295,"lx":"2026-09-28","lp":"2026-09-30","lpPlan":false,"pd":[null,null,31,null,null,30,null,null,30,null,null,24],"fl":[],"one":"배당 성장 ETF","src":"티스토리 /44 · 03_완성본/154_VIG/02_티스토리원고.md"},{"n":45,"tk":"SPYI","tkReal":true,"nm":"SPYI","fn":"SPYI","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":6.3403,"cur":"USD","px":null,"pxd":null,"r":11.88,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.5338,"lx":"2026-09-16","lp":"2026-09-18","lpPlan":false,"pd":[null,null,null,null,null,18,24,21,18,null,null,null],"fl":["변동큼"],"one":"S&P500 커버드콜","src":"티스토리 /45 · 03_완성본/174_SPYI/02_티스토리원고.md"},{"n":46,"tk":"316140","tkReal":true,"nm":"우리금융지주","fn":"우리금융지주","mk":"kr","tx":"kr_일부비과세","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.542857,0.157143,0.0,0.0,0.157143,0.0,0.0,0.142857,0.0],"weq":false,"times":4,"dps":1400,"cur":"KRW","px":null,"pxd":null,"r":4.47,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":220,"lx":"2026-08-07","lp":"2026-08-31","lpPlan":false,"pd":[null,null,null,8,29,null,null,31,null,null,28,null],"fl":["일부비과세","세금넉넉"],"one":"4년 새 51.1% 늘어","src":"티스토리 /46 · 03_완성본/080_우리금융지주/02_티스토리원고.md"},{"n":47,"tk":"VYM","tkReal":true,"nm":"VYM","fn":"VYM","mk":"us","tx":"us","ty":"ETF","sc":"배당 ETF","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.234444,0.0,0.0,0.266494,0.0,0.0,0.241301,0.0,0.0,0.257761],"weq":false,"times":4,"dps":3.6755,"cur":"USD","px":null,"pxd":null,"r":2.29,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.8869,"lx":"2026-09-18","lp":"2026-09-22","lpPlan":false,"pd":[null,null,24,null,null,23,null,null,22,null,null,23],"fl":[],"one":"고배당 ETF","src":"티스토리 /47 · 03_완성본/148_VYM/02_티스토리원고.md"},{"n":48,"tk":"105560","tkReal":true,"nm":"KB금융","fn":"KB금융","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.332092,0.236499,0.0,0.0,0.238982,0.0,0.0,0.192427,0.0],"weq":false,"times":4,"dps":4833,"cur":"KRW","px":null,"pxd":null,"r":3.02,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":1155,"lx":"2026-08-06","lp":"2026-08-21","lpPlan":false,"pd":[null,null,null,15,21,null,null,21,null,null,27,null],"fl":[],"one":"4년 새 48.5% 늘어","src":"티스토리 /48 · 03_완성본/050_KB금융/02_티스토리원고.md"},{"n":49,"tk":"TLTW","tkReal":true,"nm":"TLTW","fn":"TLTW","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[2,3,4,5,6,7,8,9,10,11,12],"w":[0.0,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.083333,0.16667],"weq":false,"times":12,"dps":2.387675,"cur":"USD","px":null,"pxd":null,"r":11.57,"rd":"2026-10-16","rh":"최근 12개월 실제 지급","la":0.2886,"lx":"2026-10-02","lp":"2026-10-07","lpPlan":false,"pd":[null,null,null,null,null,null,8,7,8,7,null,null],"fl":["변동큼"],"one":"미국 장기국채 커버드콜","src":"티스토리 /49 · 03_완성본/267_TLTW/02_티스토리원고.md"},{"n":52,"tk":"055550","tkReal":true,"nm":"신한지주","fn":"신한지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.300341,0.25256,0.0,0.0,0.25256,0.0,0.0,0.194539,0.0],"weq":false,"times":4,"dps":2930,"cur":"KRW","px":null,"pxd":null,"r":3.33,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":740,"lx":"2026-07-29","lp":"2026-08-28","lpPlan":false,"pd":[null,null,null,3,29,null,null,28,null,null,28,null],"fl":[],"one":"4년 새 32.1% 올라","src":"티스토리 /52 · 03_완성본/056_신한지주/02_티스토리원고.md"},{"n":53,"tk":"V","tkReal":true,"nm":"비자","fn":"비자(V)","mk":"us","tx":"us","ty":"주식","sc":"금융(결제망)","cy":4,"mo":[3,6,9,12],"w":[0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25,0.0,0.0,0.25],"weq":false,"times":4,"dps":2.68,"cur":"USD","px":null,"pxd":null,"r":0.66,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":0.67,"lx":"2026-08-11","lp":"2026-09-01","lpPlan":false,"pd":[null,null,2,null,null,1,null,null,1,null,null,1],"fl":[],"one":"결제망","src":"티스토리 /53 · 03_완성본/022_V/02_티스토리원고.md"},{"n":54,"tk":"037710","tkReal":true,"nm":"광주신세계","fn":"광주신세계","mk":"kr","tx":"kr","ty":"주식","sc":"유통(백화점)","cy":4,"mo":[4,6,9],"w":[0.0,0.0,0.0,0.666666,0.0,0.166667,0.0,0.0,0.166667,0.0,0.0,0.0],"weq":false,"times":3,"dps":3600,"cur":"KRW","px":null,"pxd":null,"r":10.91,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":600,"lx":"2026-08-28","lp":"2026-09-18","lpPlan":false,"pd":[null,null,null,20,null,19,null,null,18,null,null,null],"fl":[],"one":"결산 2400원+분기 600원 두 번","src":"티스토리 /54 · 03_완성본/221_광주신세계/02_티스토리원고.md"},{"n":55,"tk":"032830","tkReal":true,"nm":"삼성생명","fn":"삼성생명","mk":"kr","tx":"kr","ty":"주식","sc":"보험","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":5300,"cur":"KRW","px":null,"pxd":null,"r":2.16,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":5300,"lx":"2025-12-29","lp":"2026-04-17","lpPlan":false,"pd":[null,null,null,17,null,null,null,null,null,null,null,null],"fl":[],"one":"1년에 한 번 5300원","src":"티스토리 /55 · 03_완성본/074_삼성생명/02_티스토리원고.md"},{"n":56,"tk":"446720","tkReal":true,"nm":"SOL 미국배당다우존스","fn":"SOL 미국배당다우존스","mk":"kr","tx":"kr","ty":"ETF","sc":"배당 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":408,"cur":"KRW","px":null,"pxd":null,"r":3.01,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":37,"lx":"2026-09-29","lp":"2026-10-01","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,1,null,null],"fl":[],"one":"국내 상장 미국 배당 ETF","src":"티스토리 /56 · 03_완성본/260_SOL 미국배당다우존스/02_티스토리원고.md"},{"n":57,"tk":"458760","tkReal":true,"nm":"TIGER 미국배당다우존스타겟커버드콜2호","fn":"TIGER 미국배당다우존스타겟커버드콜2호","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":1093,"cur":"KRW","px":null,"pxd":null,"r":10.15,"rd":"2026-10-23","rh":"최근 12개월 실제 지급","la":91,"lx":"2026-09-29","lp":"2026-10-02","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,2,null,null],"fl":["변동큼","세금넉넉"],"one":"국내 상장 커버드콜","src":"티스토리 /57 · 03_완성본/348_TIGER 미국배당다우존스타겟커버드콜2호/02_티스토리원고.md"},{"n":71,"tk":"175330","tkReal":true,"nm":"JB금융지주","fn":"JB금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.456747,0.215225,0.0,0.0,0.217301,0.0,0.0,0.110727,0.0],"weq":false,"times":4,"dps":1445,"cur":"KRW","px":null,"pxd":null,"r":5.58,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":317,"lx":"2026-11-10","lp":"2026-11-25","lpPlan":true,"pd":[null,null,null,10,26,null,null,27,null,null,25,null],"fl":[],"one":"분기 317원 · 11월 25일 지급","src":"티스토리 /71 · 03_완성본/242_JB금융지주/02_티스토리원고.md"},{"n":72,"tk":"005387","tkReal":true,"nm":"현대차2우B","fn":"현대차2우B","mk":"kr","tx":"kr","ty":"주식","sc":"자동차","cy":4,"mo":[4,6,9,12],"w":[0.0,0.0,0.0,0.257425,0.0,0.247525,0.0,0.0,0.247525,0.0,0.0,0.247525],"weq":false,"times":4,"dps":10100,"cur":"KRW","px":null,"pxd":null,"r":6.74,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":2500,"lx":"2026-11-27","lp":"2026-12-30","lpPlan":true,"pd":[null,null,null,24,null,30,null,null,30,null,null,30],"fl":[],"one":"분기 2,500원·결산 2,600원","src":"티스토리 /72 · 03_완성본/122_현대차2우B/02_티스토리원고.md"},{"n":73,"tk":"000810","tkReal":true,"nm":"삼성화재","fn":"삼성화재","mk":"kr","tx":"kr","ty":"주식","sc":"보험","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":19500,"cur":"KRW","px":null,"pxd":null,"r":2.96,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":19500,"lx":"2026-03-26","lp":"2026-04-20","lpPlan":false,"pd":[null,null,null,20,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 19,500원 · 4월 지급","src":"티스토리 /73 · 03_완성본/059_삼성화재/02_티스토리원고.md"},{"n":74,"tk":"DIVO","tkReal":true,"nm":"DIVO","fn":"DIVO","mk":"us","tx":"us","ty":"ETF","sc":"커버드콜 ETF","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":2.29584,"cur":"USD","px":null,"pxd":null,"r":4.85,"rd":"2026-10-30","rh":"최근 지급분 1년 환산","la":0.19132,"lx":"2026-10-29","lp":"2026-10-30","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,30,null,null],"fl":["변동큼"],"one":"매달 0.19132달러(10월분)","src":"티스토리 /74 · 03_완성본/200_DIVO/02_티스토리원고.md"},{"n":75,"tk":"039490","tkReal":true,"nm":"키움증권","fn":"키움증권","mk":"kr","tx":"kr","ty":"주식","sc":"증권","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":11500,"cur":"KRW","px":null,"pxd":null,"r":5.24,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":11500,"lx":"2025-12-29","lp":"2026-04-10","lpPlan":false,"pd":[null,null,null,10,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 11,500원 · 4월 지급","src":"티스토리 /75 · 03_완성본/029_키움증권/02_티스토리원고.md"},{"n":76,"tk":"066570","tkReal":true,"nm":"LG전자","fn":"LG전자","mk":"kr","tx":"kr","ty":"주식","sc":"IT(반도체·전자)","cy":2,"mo":[4,8],"w":[0.0,0.0,0.0,0.62963,0.0,0.0,0.0,0.37037,0.0,0.0,0.0,0.0],"weq":false,"times":2,"dps":1350,"cur":"KRW","px":null,"pxd":null,"r":0.9,"rd":"2026-10-30","rh":"최근 12개월 실제 지급","la":500,"lx":"2026-08-12","lp":"2026-08-28","lpPlan":false,"pd":[null,null,null,22,null,null,null,28,null,null,null,null],"fl":[],"one":"결산 850원 + 중간 500원","src":"티스토리 /76 · 03_완성본/944_LG전자/02_티스토리원고.md"},{"n":80,"tk":"329200","tkReal":true,"nm":"TIGER 리츠부동산인프라","fn":"TIGER 리츠부동산인프라","mk":"kr","tx":"kr_해외","ty":"ETF","sc":"리츠","cy":12,"mo":[1,2,3,4,5,6,7,8,9,10,11,12],"w":[0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333,0.083333333],"weq":true,"times":12,"dps":396,"cur":"KRW","px":null,"pxd":null,"r":10.69,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":33,"lx":"2026-10-29","lp":"2026-11-03","lpPlan":false,"pd":[null,null,null,null,null,null,null,null,null,null,3,null],"fl":["세금넉넉"],"one":"매달 33원 · 12번 같음","src":"티스토리 /80 · 03_완성본/443_TIGER 리츠부동산인프라/02_티스토리원고.md"},{"n":81,"tk":"051600","tkReal":true,"nm":"한전KPS","fn":"한전KPS","mk":"kr","tx":"kr","ty":"주식","sc":"발전소 정비","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":1651,"cur":"KRW","px":null,"pxd":null,"r":4.4,"rd":"2026-11-10","rh":"최근 12개월 실제 지급","la":1651,"lx":"2025-12-29","lp":"2026-04-30","lpPlan":false,"pd":[null,null,null,30,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 1,651원 · 4월 지급","src":"티스토리 /81 · 03_완성본/955_한전KPS/02_티스토리원고.md"},{"n":82,"tk":"138930","tkReal":true,"nm":"BNK금융지주","fn":"BNK금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":4,"mo":[4,5,8,11],"w":[0.0,0.0,0.0,0.471699,0.188679,0.0,0.0,0.188679,0.0,0.0,0.150943,0.0],"weq":false,"times":4,"dps":795,"cur":"KRW","px":null,"pxd":null,"r":6.16,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":150,"lx":"2026-11-09","lp":"2026-11-25","lpPlan":true,"pd":[null,null,null,9,29,null,null,27,null,null,25,null],"fl":[],"one":"분기 150원 · 결산 375원","src":"티스토리 /82 · 03_완성본/957_BNK금융지주/02_티스토리원고.md"},{"n":83,"tk":"086280","tkReal":true,"nm":"현대글로비스","fn":"현대글로비스","mk":"kr","tx":"kr","ty":"주식","sc":"물류·해운","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":5800,"cur":"KRW","px":null,"pxd":null,"r":2.94,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":5800,"lx":"2026-03-30","lp":"2026-04-24","lpPlan":false,"pd":[null,null,null,24,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 5,800원 · 4월 지급","src":"티스토리 /83 · 03_완성본/945_현대글로비스/02_티스토리원고.md"},{"n":84,"tk":"139130","tkReal":true,"nm":"iM금융지주","fn":"iM금융지주","mk":"kr","tx":"kr","ty":"주식","sc":"은행·금융지주","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":700,"cur":"KRW","px":null,"pxd":null,"r":4.59,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":700,"lx":"2026-02-26","lp":"2026-04-10","lpPlan":false,"pd":[null,null,null,10,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 700원 · 4월 지급","src":"티스토리 /84 · 03_완성본/960_iM금융지주/02_티스토리원고.md"},{"n":85,"tk":"035250","tkReal":true,"nm":"강원랜드","fn":"강원랜드","mk":"kr","tx":"kr","ty":"주식","sc":"카지노","cy":1,"mo":[4],"w":[0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"weq":false,"times":1,"dps":950,"cur":"KRW","px":null,"pxd":null,"r":6.58,"rd":"2026-11-06","rh":"최근 12개월 실제 지급","la":950,"lx":"2026-03-31","lp":"2026-04-24","lpPlan":false,"pd":[null,null,null,24,null,null,null,null,null,null,null,null],"fl":[],"one":"결산 950원 · 4월 지급","src":"티스토리 /85 · 03_완성본/143_강원랜드/02_티스토리원고.md"},{"n":86,"tk":"000150","tkReal":true,"nm":"두산","fn":"두산","mk":"kr","tx":"kr","ty":"주식","sc":"지주사","cy":4,"mo":[4,5,8],"w":[0.0,0.0,0.0,0.666666,0.166667,0.0,0.0,0.166667,0.0,0.0,0.0,0.0],"weq":false,"times":3,"dps":6000,"cur":"KRW","px":null,"pxd":null,"r":0.98,"rd":"2026-11-13","rh":"최근 12개월 실제 지급","la":1000,"lx":"2026-11-23","lp":"2026-12-09","lpPlan":true,"pd":[null,null,null,30,28,null,null,25,null,null,null,null],"fl":[],"one":"결산 4,000원+분기 1,000원","src":"티스토리 /86 · 06_특별글/발표글_두산_2026-11-15/02_티스토리원고.md"}]};
var DATA_URL = 'https://bsw44822-max.github.io/dividend-calc/data.json';
var BLOG = 'https://dividendvending.tistory.com/';
var STORE = 'bdgj4_v1';
var LIMIT = 20000000;
var WEQ_TXT = '실제로는 회차마다 금액이 달라요. 여기서는 1년 치를 똑같이 나눠 보여 줘요.';

var CYN = { 52: '주배당', 12: '월배당', 4: '분기배당', 2: '반기배당', 1: '연배당' };
var CY_ORDER = [52, 12, 4, 2, 1];
var MKN = { kr: '국내', us: '미국' };
var TAXP = { kr: '15.4%', kr_해외: '15.4%', kr_일부비과세: '15.4%', us: '15%' };
var FLN = { 변동큼: '분배금(ETF가 주는 돈)과 주가가 크게 움직일 수 있어요', 주배당: '매주 받는 돈을 달별로 묶어 보여요', 세금넉넉: '세금은 15.4%를 다 뗀 값이고, 실제 세금은 더 적을 수 있어요', 일부비과세: '일부 비과세 배당이 섞여 있을 수 있어요' };
var OVER_TXT = '세전 1년 배당이 2천만원을 넘어요. 이자·배당 같은 금융소득이 2천만원을 넘으면 다른 소득과 합쳐 세금을 매기는 종합과세 대상이 될 수 있어요. 이 계산기는 그 세금을 계산하지 않아요.';
var DEF_AMT = 10000000, DEF_SH = 100;
var EX_KEYS = ['BCE', 'T', 'JNJ'];

var CSS = [
  '.bdgj4-root{max-width:760px;margin:16px auto;padding:10px;background:#fff;color:#1f2937;font:16px/1.55 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;box-sizing:border-box;word-break:keep-all;overflow-wrap:anywhere;text-align:left;border:1px solid #e5e7eb;border-radius:14px;}',
  '.bdgj4-root *{box-sizing:border-box;font-family:inherit;}',
  '.bdgj4-root h2,.bdgj4-root h3,.bdgj4-root p{margin:0;padding:0;}',
  '.bdgj4-h{font-size:22px;line-height:1.3;font-weight:800;color:#111827;margin:0 0 4px;}',
  '.bdgj4-h2{font-size:19px;line-height:1.35;font-weight:800;color:#111827;margin:0 0 6px;}',
  '.bdgj4-base{font-size:16px;color:#4b5563;margin:0 0 10px;}',
  '.bdgj4-stale{font-size:16px;color:#b45309;font-weight:700;margin:0 0 8px;}',
  '.bdgj4-sec{margin:18px 0 0;padding-top:16px;border-top:2px solid #e5e7eb;}',
  '.bdgj4-lab{display:block;font-size:16px;font-weight:700;color:#374151;margin:10px 0 4px;}',
  '.bdgj4-inp{display:block;width:100%;height:50px;font-size:18px;font-weight:700;color:#111827;background:#fff;border:2px solid #9ca3af;border-radius:10px;padding:0 12px;}',
  '.bdgj4-inp:focus{outline:3px solid #99f6e4;border-color:#0f766e;}',
  '.bdgj4-inp.bdgj4-sm{height:44px;font-size:16px;}',
  '.bdgj4-hint{font-size:16px;color:#4b5563;margin:4px 0 0;}',
  '.bdgj4-wrap{position:relative;}',
  '.bdgj4-sug{position:absolute;left:0;right:0;top:100%;z-index:20;background:#fff;border:2px solid #0f766e;border-radius:10px;margin-top:2px;max-height:300px;overflow-y:auto;box-shadow:0 6px 18px rgba(0,0,0,.18);}',
  '.bdgj4-sug button{display:block;width:100%;text-align:left;font-size:16px;color:#111827;background:#fff;border:0;border-bottom:1px solid #e5e7eb;padding:11px 12px;min-height:44px;cursor:pointer;}',
  '.bdgj4-sug button:hover{background:#ecfdf5;}',
  '.bdgj4-sug .bdgj4-sugnone{padding:11px 12px;color:#4b5563;}',
  '.bdgj4-cards{display:grid;grid-template-columns:1fr;gap:8px;margin:12px 0 0;}',
  '.bdgj4-card{background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:8px 12px;}',
  '.bdgj4-card-l{font-size:16px;color:#374151;font-weight:700;}',
  '.bdgj4-card-v{font-size:30px;line-height:1.25;font-weight:800;color:#0f766e;}',
  '.bdgj4-card.bdgj4-sub .bdgj4-card-v{font-size:28px;color:#111827;}',
  '.bdgj4-btns{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;}',
  '.bdgj4-btn{font-size:16px;font-weight:700;min-height:44px;padding:8px 14px;border-radius:10px;border:2px solid #0f766e;background:#fff;color:#0f766e;cursor:pointer;}',
  '.bdgj4-btn.bdgj4-pri{background:#0f766e;color:#fff;}',
  '.bdgj4-btn[disabled]{opacity:.55;cursor:default;}',
  '.bdgj4-btn.bdgj4-xs{min-height:40px;padding:6px 10px;}',
  '.bdgj4-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px;}',
  '.bdgj4-chip{font-size:16px;min-height:40px;padding:6px 12px;border-radius:999px;border:2px solid #9ca3af;background:#fff;color:#111827;cursor:pointer;}',
  '.bdgj4-chip.bdgj4-on{background:#0f766e;border-color:#0f766e;color:#fff;font-weight:700;}',
  '.bdgj4-box{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin:10px 0 0;background:#f9fafb;}',
  '.bdgj4-box summary,.bdgj4-det summary{font-size:16px;font-weight:700;color:#0f766e;cursor:pointer;min-height:40px;display:block;padding:8px 0;}',
  '.bdgj4-warn{font-size:16px;color:#92400e;background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;padding:8px 12px;margin:10px 0 0;}',
  '.bdgj4-note{font-size:16px;color:#4b5563;margin:8px 0 0;}',
  '.bdgj4-it{border-bottom:1px solid #e5e7eb;}',
  '.bdgj4-it-top{display:flex;align-items:center;gap:8px;padding:10px 0 2px;cursor:pointer;}',
  '.bdgj4-rk{flex:none;width:28px;text-align:right;color:#6b7280;font-weight:700;}',
  '.bdgj4-nm{flex:1 1 auto;min-width:0;font-weight:800;color:#111827;}',
  '.bdgj4-rt{flex:none;font-weight:800;color:#0f766e;}',
  '.bdgj4-arw{flex:none;width:18px;text-align:center;color:#4b5563;font-size:16px;}',
  '.bdgj4-it-sub{padding:0 0 10px 36px;color:#4b5563;font-size:16px;}',
  '.bdgj4-it-det{margin:0 0 10px 36px;padding:10px 12px;background:#f0fdfa;border-radius:10px;font-size:16px;}',
  '.bdgj4-it-det div{margin:0 0 2px;}',
  '.bdgj4-it-det .bdgj4-btns{margin-top:8px;}',
  '.bdgj4-it-det a{color:#0f766e;font-weight:700;}',
  '.bdgj4-bk{border:1px solid #d1d5db;border-radius:12px;padding:10px 12px;margin:8px 0 0;background:#fff;}',
  '.bdgj4-bk-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
  '.bdgj4-bk-nm{font-weight:800;color:#111827;min-width:0;}',
  '.bdgj4-bk-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0 0;}',
  '.bdgj4-bk-row .bdgj4-inp{width:150px;flex:none;}',
  '.bdgj4-bk-res{font-weight:700;color:#0f766e;margin:6px 0 0;}',
  '.bdgj4-cal{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 0;}',
  '.bdgj4-cell{font-size:16px;text-align:left;border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:10px;padding:6px 3px 6px 6px;min-height:92px;cursor:pointer;min-width:0;}',
  '.bdgj4-cell.bdgj4-has{border-color:#0f766e;background:#f0fdfa;}',
  '.bdgj4-cell.bdgj4-sel{background:#0f766e;color:#fff;border-color:#0f766e;}',
  '.bdgj4-cell b{display:block;font-size:17px;}',
  '.bdgj4-cell .bdgj4-amt{display:block;font-weight:800;letter-spacing:-.3px;}',
  '.bdgj4-cell .bdgj4-void{display:block;color:#6b7280;}',
  '.bdgj4-cell.bdgj4-sel .bdgj4-void{color:#e5e7eb;}',
  '.bdgj4-mdet{margin:8px 0 0;padding:10px 12px;border:2px solid #0f766e;border-radius:10px;background:#fff;}',
  '.bdgj4-dl{display:grid;grid-template-columns:1fr auto;gap:2px 12px;margin:10px 0 0;}',
  '.bdgj4-dl span:nth-child(odd){color:#4b5563;}',
  '.bdgj4-dl span:nth-child(even){font-weight:800;text-align:right;color:#111827;}',
  '.bdgj4-bar{margin:8px 0 0;}',
  '.bdgj4-bar-t{display:flex;justify-content:space-between;gap:8px;}',
  '.bdgj4-bar-t span:last-child{font-weight:700;white-space:nowrap;}',
  '.bdgj4-bar-b{height:14px;background:#e5e7eb;border-radius:7px;overflow:hidden;margin-top:2px;}',
  '.bdgj4-bar-b i{display:block;height:100%;background:#0f766e;border-radius:7px;}',
  '.bdgj4-sm-row{display:flex;gap:8px;flex-wrap:wrap;}',
  '.bdgj4-sm-row>*{flex:1 1 140px;min-width:0;}',
  '.bdgj4-tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e5e7eb;border-radius:10px;margin:6px 0 0;}',
  '.bdgj4-tblwrap table{border-collapse:collapse;min-width:560px;width:100%;font-size:16px;}',
  '.bdgj4-tblwrap small,.bdgj4-tblwrap td *,.bdgj4-tblwrap th *{font-size:16px;}',
  '.bdgj4-tblwrap th,.bdgj4-tblwrap td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:16px;}',
  '.bdgj4-band{position:sticky;bottom:0;z-index:15;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px -4px 0;padding:8px 10px;background:#0f766e;color:#fff;border-radius:12px;font-weight:700;box-shadow:0 -2px 10px rgba(0,0,0,.2);}',
  '.bdgj4-band .bdgj4-btn{background:#fff;color:#0f766e;border-color:#fff;white-space:nowrap;}',
  '.bdgj4-foot{margin:16px 0 0;padding-top:12px;border-top:2px solid #e5e7eb;font-size:16px;color:#4b5563;}',
  '.bdgj4-foot p{margin:0 0 4px;}',
  '@media (min-width:640px){.bdgj4-root{padding:20px;}.bdgj4-cards{grid-template-columns:repeat(3,1fr);}.bdgj4-cal{grid-template-columns:repeat(4,1fr);}.bdgj4-card-v{font-size:30px;}.bdgj4-card.bdgj4-sub .bdgj4-card-v{font-size:28px;}}'
].join('');

function h(tag, cls, text){ var e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined && text !== null) { e.textContent = text; } return e; }
function add(p, c){ p.appendChild(c); return c; }
function btn(cls, text, fn){ var b = h('button', 'bdgj4-btn ' + cls, text); b.type = 'button'; if (fn) { b.addEventListener('click', fn); } return b; }
function chip(text, on, fn){ var b = h('button', 'bdgj4-chip' + (on ? ' bdgj4-on' : ''), text); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.addEventListener('click', fn); return b; }
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
var S = { sel: 'SCHD', mode: 'amt', amt: DEF_AMT, sh: DEF_SH, minR: 0, basket: [], customs: [], cyOn: {}, mkOn: {}, scOn: {}, q: '', sort: 'rdesc', shown: 20, open: null, month: -1 };
var customItems = [];
function loadState(){
  try {
    var o = JSON.parse(window.localStorage.getItem(STORE) || 'null');
    if (!o || typeof o !== 'object') { return; }
    if (typeof o.s === 'string') { S.sel = o.s; }
    if (o.m === 'amt' || o.m === 'sh') { S.mode = o.m; }
    if (o.a > 0) { S.amt = Number(o.a); }
    if (o.h > 0) { S.sh = Number(o.h); }
    if (Array.isArray(o.c)) { S.customs = o.c.filter(function(c){ return c && c.key && !/^o_/.test(String(c.key)) && c.nm && c.r > 0 && Array.isArray(c.mo) && c.mo.length; }); }
    if (Array.isArray(o.b)) { S.basket = o.b.filter(function(b){ return b && b.key && !/^o_/.test(String(b.key)) && (b.mode === 'amt' || b.mode === 'sh') && b.v > 0; }).map(function(b){ return { key: String(b.key), mode: b.mode, v: Number(b.v) }; }); }
  } catch (e) {}
}
function saveState(){
  try { window.localStorage.setItem(STORE, JSON.stringify({ s: S.sel, m: S.mode, a: S.amt, h: S.sh, c: S.customs, b: S.basket })); } catch (e) {}
}
function clearState(){ try { window.localStorage.removeItem(STORE); } catch (e) {} }

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

// ---------- 뼈대 ----------
var root, E = {};
function start(){
  root = document.getElementById('bdgj4-root');
  if (!root) { return; }
  if (root.getAttribute('data-bdgj4-init')) { return; }
  root.setAttribute('data-bdgj4-init', '1');
  if (!/(^| )bdgj4-root( |$)/.test(root.className)) { root.className = (root.className + ' bdgj4-root').replace(/^ /, ''); }
  if (!document.getElementById('bdgj4-style')) { var st = document.createElement('style'); st.id = 'bdgj4-style'; st.appendChild(document.createTextNode(CSS)); (document.head || document.documentElement).appendChild(st); }
  root.removeAttribute('style');
  loadState(); rebuildCustoms(); cleanBasket();
  if (!itemOf(S.sel)) { S.sel = itemOf('SCHD') ? 'SCHD' : (DATA.items[0] ? DATA.items[0].tk : ''); }
  build();
  renderAll();
  tryMove();
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', tryMove); }
  window.addEventListener('load', tryMove);
  fetchNew();
}

function build(){
  root.innerHTML = '';
  // 0·1 빠른 계산
  add(root, h('h2', 'bdgj4-h', '배당금 계산기'));
  E.base = add(root, h('p', 'bdgj4-base'));
  E.stale = add(root, h('p', 'bdgj4-stale')); E.stale.style.display = 'none';

  var w1 = add(root, h('div', 'bdgj4-wrap'));
  var l1 = add(w1, h('label', 'bdgj4-lab', '종목 찾기')); l1.setAttribute('for', 'bdgj4-q1');
  E.q1 = add(w1, h('input', 'bdgj4-inp')); E.q1.id = 'bdgj4-q1'; E.q1.type = 'text'; E.q1.setAttribute('autocomplete', 'off'); E.q1.setAttribute('placeholder', '이름이나 코드 (예: SCHD, 기업은행)');
  E.sug = add(w1, h('div', 'bdgj4-sug')); E.sug.style.display = 'none';
  E.selNote = add(root, h('div', 'bdgj4-hint'));

  E.amtLab = add(root, h('label', 'bdgj4-lab', '투자금(원)')); E.amtLab.setAttribute('for', 'bdgj4-a1');
  E.a1 = add(root, h('input', 'bdgj4-inp')); E.a1.id = 'bdgj4-a1'; E.a1.type = 'text'; E.a1.setAttribute('inputmode', 'numeric'); E.a1.setAttribute('autocomplete', 'off');
  E.amtHint = add(root, h('div', 'bdgj4-hint'));

  E.cards = add(root, h('div', 'bdgj4-cards'));
  function card(cls, label){ var c = add(E.cards, h('div', 'bdgj4-card ' + cls)); add(c, h('div', 'bdgj4-card-l', label)); return add(c, h('div', 'bdgj4-card-v', '-')); }
  E.cAvg = card('', '한 달 평균(세후)');
  E.cYear = card('bdgj4-sub', '1년(세후)');
  E.cRate = card('bdgj4-sub', '배당률');
  add(root, h('div', 'bdgj4-hint', '세후는 세금(국내 15.4%, 미국 15%) 뗀 뒤 금액이고, 배당률은 1년 배당금 ÷ 주가예요.'));
  E.qMsg = add(root, h('div', 'bdgj4-warn')); E.qMsg.style.display = 'none';

  var br = add(root, h('div', 'bdgj4-btns'));
  E.bDet = btn('', '자세히(주 수로 넣기, 목표 금액)', function(){ var open = E.det.style.display === 'none'; E.det.style.display = open ? '' : 'none'; E.bDet.setAttribute('aria-expanded', open ? 'true' : 'false'); }); E.bDet.setAttribute('aria-expanded', 'false'); add(br, E.bDet);
  E.bAdd = btn('bdgj4-pri', '담기', addQuick); add(br, E.bAdd);
  add(root, h('div', 'bdgj4-hint', '담으면 1~12월 내 배당 달력에 들어가요.'));
  E.addMsg = add(root, h('div', 'bdgj4-hint'));

  E.det = add(root, h('div', 'bdgj4-box')); E.det.style.display = 'none';
  add(E.det, h('div', 'bdgj4-lab', '넣는 방법')).style.marginTop = '0';
  E.modeChips = add(E.det, h('div', 'bdgj4-chips'));
  E.dl = add(E.det, h('div', 'bdgj4-dl'));
  var lg = add(E.det, h('label', 'bdgj4-lab', '목표: 한 달 평균(세후) 얼마를 받고 싶나요?')); lg.setAttribute('for', 'bdgj4-g1');
  E.g1 = add(E.det, h('input', 'bdgj4-inp')); E.g1.id = 'bdgj4-g1'; E.g1.type = 'text'; E.g1.setAttribute('inputmode', 'numeric'); E.g1.setAttribute('placeholder', '예: 300,000');
  E.gRes = add(E.det, h('div', 'bdgj4-hint'));

  // 2·3·4 종목 고르기
  var s2 = add(root, h('div', 'bdgj4-sec')); E.sec2 = s2;
  add(s2, h('h3', 'bdgj4-h2', '월배당 계산기, 내 배당 달력 만들기'));
  add(s2, h('div', 'bdgj4-hint', '배당률이 높다고 좋은 종목은 아니에요.'));
  add(s2, h('div', 'bdgj4-lab', '주기'));
  E.cyChips = add(s2, h('div', 'bdgj4-chips'));
  add(s2, h('div', 'bdgj4-hint', '분기배당은 3개월마다, 반기배당은 6개월마다, 연배당은 1년에 한 번 받아요.'));
  add(s2, h('div', 'bdgj4-lab', '국내 / 미국'));
  E.mkChips = add(s2, h('div', 'bdgj4-chips'));
  var dsc = add(s2, h('details', 'bdgj4-det')); add(dsc, h('summary', '', '섹터(업종)로 거르기'));
  E.scChips = add(dsc, h('div', 'bdgj4-chips'));
  add(dsc, h('div', 'bdgj4-hint', '커버드콜 ETF는 주식을 들고 옵션을 팔아 배당을 늘린 상품이고, 리츠는 건물 임대료나 부동산 대출 이자로 번 돈을 나눠 주는 상품이에요.'));
  var lq = add(s2, h('label', 'bdgj4-lab', '이름 찾기')); lq.setAttribute('for', 'bdgj4-q2');
  E.q2 = add(s2, h('input', 'bdgj4-inp bdgj4-sm')); E.q2.id = 'bdgj4-q2'; E.q2.type = 'text'; E.q2.setAttribute('autocomplete', 'off'); E.q2.setAttribute('placeholder', '이름이나 코드');
  var lr = add(s2, h('label', 'bdgj4-lab', '배당률 몇 % 이상만 볼까요')); lr.setAttribute('for', 'bdgj4-minr');
  E.minR = add(s2, h('input', 'bdgj4-inp bdgj4-sm')); E.minR.id = 'bdgj4-minr'; E.minR.type = 'text'; E.minR.setAttribute('inputmode', 'decimal'); E.minR.setAttribute('autocomplete', 'off'); E.minR.setAttribute('placeholder', '예: 5');
  add(s2, h('div', 'bdgj4-lab', '정렬'));
  E.sortChips = add(s2, h('div', 'bdgj4-chips'));
  E.count = add(s2, h('div', 'bdgj4-hint'));
  E.rdNote = add(s2, h('div', 'bdgj4-hint'));
  E.list = add(s2, h('div', 'bdgj4-list'));
  E.more = add(s2, h('div', ''));
  var dt = add(s2, h('details', 'bdgj4-det')); E.tblDet = dt; add(dt, h('summary', '', '전체 종목 표 보기'));
  E.tblHold = add(dt, h('div', 'bdgj4-tblwrap')); dt.style.display = 'none';

  // 5 담은 종목
  var s5 = add(root, h('div', 'bdgj4-sec')); E.sec5 = s5;
  add(s5, h('h3', 'bdgj4-h2', '담은 종목'));
  E.bHead = add(s5, h('div', 'bdgj4-hint'));
  E.bList = add(s5, h('div', ''));
  E.avgLine = add(s5, h('div', 'bdgj4-hint')); E.avgLine.style.display = 'none';
  E.bTools = add(s5, h('div', 'bdgj4-btns'));
  add(E.bTools, btn('', '예시 담기', addExample));
  E.bClear = add(E.bTools, btn('', '모두 지우기', function(){ S.minR = 0; S.shown = 20; E.minR.value = ''; S.basket = []; S.customs = []; rebuildCustoms(); fixSel(); saveState(); renderAll(); }));
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
  E.cmkChips = add(dc, h('div', 'bdgj4-chips'));
  add(dc, h('div', 'bdgj4-lab', '돈이 들어오는 달(여러 개)'));
  E.cmoChips = add(dc, h('div', 'bdgj4-chips')); E.cmo = {};
  E.cMsg = add(dc, h('div', 'bdgj4-warn')); E.cMsg.style.display = 'none';
  add(dc, btn('bdgj4-pri', '내 종목 담기', addCustom)).style.marginTop = '8px';
  renderCustomForm();

  // 6 달력
  var s6 = add(root, h('div', 'bdgj4-sec')); E.sec6 = s6;
  add(s6, h('h3', 'bdgj4-h2', '내 배당 달력'));
  E.calHint = add(s6, h('div', 'bdgj4-hint'));
  E.cal = add(s6, h('div', 'bdgj4-cal'));
  E.mdet = add(s6, h('div', 'bdgj4-mdet')); E.mdet.style.display = 'none';
  E.sum = add(s6, h('div', 'bdgj4-dl'));
  E.over = add(s6, h('div', 'bdgj4-warn')); E.over.style.display = 'none';

  // 7 섹터별
  var s7 = add(root, h('div', 'bdgj4-sec')); E.sec7 = s7;
  add(s7, h('h3', 'bdgj4-h2', '섹터(업종)별 금액과 비중'));
  E.secBars = add(s7, h('div', ''));
  E.cycLine = add(s7, h('div', 'bdgj4-note'));

  // 8 안내
  var f = add(root, h('div', 'bdgj4-foot'));
  add(f, h('p', '', '실제 입금액은 이 계산과 다를 수 있고, 투자 권유가 아니에요. 기준일과 출처는 맨 위 줄과 종목 상세에서 볼 수 있어요.'));
  add(f, h('p', '', '넣은 값은 이 기기 브라우저에만 저장돼요.'));
  var clrArm = false, clrTimer = null;
  function clrDisarm(){ clrArm = false; if (clrTimer) { clearTimeout(clrTimer); clrTimer = null; } E.clr.textContent = '저장한 값 지우기'; }
  E.clr = add(f, btn('bdgj4-xs', '저장한 값 지우기', function(){
    if (!clrArm) { clrArm = true; E.clr.textContent = '담은 종목과 넣은 값을 모두 지울까요? 한 번 더 누르면 지워요'; clrTimer = setTimeout(clrDisarm, 6000); return; }
    clrDisarm();
    clearState(); S.basket = []; S.customs = []; S.amt = DEF_AMT; S.sh = DEF_SH; S.mode = 'amt'; S.sel = itemOf('SCHD') ? 'SCHD' : DATA.items[0].tk; S.month = -1; S.minR = 0; S.shown = 20; E.minR.value = '';
    rebuildCustoms(); renderAll();
  })); E.clr.style.marginTop = '6px';

  // 9 아래 고정 띠
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
    var v = num(E.a1.value); if (S.mode === 'amt') { if (v > 99999999999) { v = 99999999999; } S.amt = v; } else { if (v > 99999999) { v = 99999999; } S.sh = v; }
    E.a1.value = v ? comma(v) : ''; saveState(); renderQuick();
  });
  E.minR.addEventListener('input', function(){ var x = parseFloat(String(E.minR.value).replace(/[^0-9.]/g, '')); S.minR = x > 0 ? x : 0; S.shown = 20; renderList(); });
  E.g1.addEventListener('input', function(){ var v = num(E.g1.value); E.g1.value = v ? comma(v) : ''; renderGoalQuick(); });
  E.g2.addEventListener('input', function(){ var v = num(E.g2.value); E.g2.value = v ? comma(v) : ''; renderGoalBasket(); });
  E.q2.addEventListener('input', function(){ S.q = E.q2.value; S.shown = 20; renderList(); });
}

function renderAll(){
  rebuildCustoms();
  renderBase(); renderModeChips(); renderQuickInputs(); renderQuick(); renderFilters(); renderList(); renderBasket(); renderViews();
}

function renderBase(){
  var a = DATA.asof || {}, fx = DATA.fx, msgs = [], now = new Date();
  var t = (a.px ? '배당률은 ' + md(a.px) + ' 종가 기준이에요.' : '배당률은 이 블로그가 종목 글(리뷰)을 쓴 날 주가로 계산했어요.') + ' 환율은 ' + comma(Math.round(fx)) + '원' + (a.fx ? '(' + md(a.fx) + ')' : '') + '이에요.';
  E.base.textContent = t;
  if (a.px && (now - new Date(a.px + 'T00:00:00')) / 86400000 > 10) { msgs.push('배당률이 ' + md(a.px) + ' 값이에요.'); }
  if (a.fx && (now - new Date(a.fx + 'T00:00:00')) / 86400000 > 10) { msgs.push('환율이 ' + md(a.fx) + ' 값이에요.'); }
  E.stale.style.display = msgs.length ? '' : 'none';
  E.stale.textContent = msgs.join(' ');
}

function renderModeChips(){
  E.modeChips.innerHTML = '';
  add(E.modeChips, chip('금액으로', S.mode === 'amt', function(){ if (S.mode !== 'amt') { S.mode = 'amt'; S.amt = 0; } saveState(); renderModeChips(); renderQuickInputs(); renderQuick(); }));
  add(E.modeChips, chip('주 수로', S.mode === 'sh', function(){ if (S.mode !== 'sh') { S.mode = 'sh'; S.sh = 0; } saveState(); renderModeChips(); renderQuickInputs(); renderQuick(); }));
}
function renderQuickInputs(){
  var it = itemOf(S.sel);
  if (document.activeElement !== E.q1) { E.q1.value = it ? it.nm : ''; }
  E.amtLab.textContent = S.mode === 'amt' ? '투자금(원)' : '주 수(주)';
  var v = S.mode === 'amt' ? S.amt : S.sh;
  E.a1.value = v ? comma(v) : '';
}

function pickItem(it){ S.sel = it.tk; saveState(); E.sug.style.display = 'none'; E.q1.value = it.nm; renderQuick(); }
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

function quickItems(){
  var it = itemOf(S.sel); if (!it) { return { it: null, items: allItems() }; }
  return { it: it, items: allItems() };
}

function renderQuick(){
  var qi = quickItems(), it = qi.it;
  if (!it) { return; }
  var base = itemOf(S.sel) || it;
  var tax = TAXP[it.tx] || '15.4%';
  E.selNote.textContent = base.nm + (base.custom ? '' : ' (' + (MKN[base.mk] || '') + ' ' + base.sc + ', ' + cyText(base) + ')');
  var v = S.mode === 'amt' ? S.amt : S.sh;
  E.amtHint.textContent = v ? (S.mode === 'amt' ? fmtWon(v) : comma(v) + '주') : (S.mode === 'amt' ? '투자금을 넣어 주세요.' : '주 수를 넣어 주세요.');
  var p = v ? C.pay(it, { mode: S.mode, v: v }, DATA.fx) : null;
  var rateTxt = (it.r !== null && it.r !== undefined) ? it.r + '%' : '-';
  E.dl.innerHTML = '';
  function row(a, b){ add(E.dl, h('span', '', a)); add(E.dl, h('span', '', b)); }
  E.qMsg.style.display = 'none';
  if (!p) {
    E.cAvg.textContent = '-'; E.cYear.textContent = '-'; E.cRate.textContent = rateTxt;
    if (v && S.mode === 'sh') { E.qMsg.textContent = '이 종목은 1주당 배당금 자료가 없어서 주 수로는 계산이 안 돼요. 금액으로 넣어 주세요.'; E.qMsg.style.display = ''; }
    row('1년 세전', '-'); row('한 번 받을 때(세후)', '-');
  } else {
    E.cAvg.textContent = fmtWon(p.post / 12); E.cYear.textContent = fmtWon(p.post); E.cRate.textContent = rateTxt;
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
  var inb = inBasket(base.tk) >= 0;
  E.bAdd.textContent = inb ? (S.mode === 'amt' ? '담김 · 금액 바꾸기' : '담김 · 주 수 바꾸기') : '담기';
  renderGoalQuick();
}

function renderGoalQuick(){
  var it = itemOf(S.sel), t = num(E.g1.value);
  if (!it || !t) { E.gRes.textContent = '목표 금액을 넣으면 필요한 투자금이 나와요.'; return; }
  var qi = quickItems();
  var g = C.goal([{ key: it.tk, mode: 'amt', v: 10000000 }], qi.items, DATA.fx, t);
  E.gRes.textContent = g > 0 ? '이 종목 하나로 받으려면 약 ' + fmtWon(g) + '이 필요해요(1만원 단위로 올림).' : '이 종목은 계산할 수 없어요.';
}

function addQuick(){
  var it = itemOf(S.sel), v = S.mode === 'amt' ? S.amt : S.sh;
  if (!it) { return; }
  if (!(v > 0)) { E.addMsg.textContent = '먼저 ' + (S.mode === 'amt' ? '투자금' : '주 수') + '을 넣어 주세요.'; return; }
  var key = it.tk, msg = it.nm + ' 담았어요. 담은 종목 ';
  var i = inBasket(key), b = { key: key, mode: S.mode, v: v };
  if (i >= 0) { S.basket[i] = b; } else { S.basket.push(b); }
  saveState(); E.addMsg.textContent = msg + S.basket.length + '개';
  renderFilters(); renderQuick(); renderList(); renderBasket(); renderViews();
}

// ---------- 종목 고르기 ----------
function sectorsAll(){ var a = [], seen = {}; allItems().forEach(function(it){ if (!seen[it.sc]) { seen[it.sc] = 1; a.push(it.sc); } }); return a; }
function keysOn(o){ return Object.keys(o).filter(function(k){ return o[k]; }); }
function renderFilters(){
  E.cyChips.innerHTML = ''; E.mkChips.innerHTML = ''; E.scChips.innerHTML = ''; E.sortChips.innerHTML = '';
  CY_ORDER.forEach(function(c){ add(E.cyChips, chip(CYN[c], !!S.cyOn[c], function(){ S.cyOn[c] = !S.cyOn[c]; S.shown = 20; renderFilters(); renderList(); })); });
  ['kr', 'us'].forEach(function(m){ add(E.mkChips, chip(MKN[m], !!S.mkOn[m], function(){ S.mkOn[m] = !S.mkOn[m]; S.shown = 20; renderFilters(); renderList(); })); });
  sectorsAll().forEach(function(s){ add(E.scChips, chip(s, !!S.scOn[s], function(){ S.scOn[s] = !S.scOn[s]; S.shown = 20; renderFilters(); renderList(); })); });
  [['rdesc', '배당률 높은 순'], ['rasc', '낮은 순'], ['name', '이름순']].forEach(function(o){ add(E.sortChips, chip(o[1], S.sort === o[0], function(){ S.sort = o[0]; S.shown = 20; renderFilters(); renderList(); })); });
}
function qAmt(){ return (S.mode === 'amt' && S.amt > 0) ? S.amt : DEF_AMT; }
function renderList(){
  var f = { cy: keysOn(S.cyOn).map(Number), mk: keysOn(S.mkOn), sc: keysOn(S.scOn), q: S.q, minR: S.minR };
  var list = C.rank(C.filter(listItems(), f), S.sort);
  E.count.textContent = '종목 ' + list.length + '개';
  var rg = dateRange();
  E.rdNote.textContent = rg ? '배당률은 종목마다 이 블로그가 종목 글(리뷰)을 쓴 날 값이에요(' + rg + ', 같은 날 값 아님).' : '';
  E.list.innerHTML = ''; E.more.innerHTML = '';
  if (!list.length) { add(E.list, h('div', 'bdgj4-hint', '조건에 맞는 종목이 없어요. 고른 조건을 줄여 보세요.')); return; }
  list.slice(0, S.shown).forEach(function(it, ix){
    var box = add(E.list, h('div', 'bdgj4-it'));
    var top = add(box, h('div', 'bdgj4-it-top')); top.setAttribute('role', 'button'); top.setAttribute('tabindex', '0'); top.setAttribute('aria-expanded', S.open === it.tk ? 'true' : 'false');
    add(top, h('span', 'bdgj4-rk', String(ix + 1)));
    add(top, h('span', 'bdgj4-nm', it.nm));
    add(top, h('span', 'bdgj4-rt', it.r + '%'));
    var has = inBasket(it.tk) >= 0;
    var bb = add(top, btn('bdgj4-xs' + (has ? '' : ' bdgj4-pri'), has ? '담김' : '담기', function(e){ e.stopPropagation(); toggleBasket(it); }));
    var ar = add(top, h('span', 'bdgj4-arw', S.open === it.tk ? '▴' : '▾')); ar.setAttribute('aria-hidden', 'true');
    function tog(){ S.open = S.open === it.tk ? null : it.tk; renderList(); }
    top.addEventListener('click', tog);
    top.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === top) { e.preventDefault(); tog(); } });
    var subTxt = it.sc + ', ' + cyText(it) + ', ' + monthsText(it) + (it.rd ? ', ' + md(it.rd) + ' 기준' : '');
    add(box, h('div', 'bdgj4-it-sub', subTxt));
    if (S.open === it.tk) { box.appendChild(detailOf(it)); }
  });
  if (list.length > S.shown) { add(E.more, btn('bdgj4-xs', '더 보기 (' + (list.length - S.shown) + '개 더)', function(){ S.shown += 20; renderList(); })).style.marginTop = '8px'; }
}
function detailOf(it){
  var d = h('div', 'bdgj4-it-det'); var miss = false;
  function line(a, b){ add(d, h('div', '', a + ' : ' + b)); }
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
  if (miss && it.n) { add(d, h('div', '', '빈 칸은 리뷰 글에서 확인해 주세요.')); }
  var bt = add(d, h('div', 'bdgj4-btns'));
  if (it.n) { var a = h('a', 'bdgj4-btn bdgj4-xs', '리뷰 글 보기'); a.href = BLOG + it.n; a.target = '_blank'; a.rel = 'noopener'; a.style.textDecoration = 'none'; a.style.display = 'inline-flex'; a.style.alignItems = 'center'; bt.appendChild(a); }
  var has = inBasket(it.tk) >= 0;
  add(bt, btn('bdgj4-xs' + (has ? '' : ' bdgj4-pri'), has ? '담김' : '담기', function(){ toggleBasket(it); }));
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
function renderBasket(){
  E.bList.innerHTML = '';
  var n = S.basket.length;
  E.bHead.textContent = n ? '종목마다 금액이나 주 수를 고르고 넣으세요.' : '아직 담은 종목이 없어요. 위에서 "담기"를 누르거나 "예시 담기"를 눌러 보세요.';
  E.bClear.style.display = n ? '' : 'none';
  E.goalBox.style.display = n ? '' : 'none';
  S.basket.forEach(function(b, idx){
    var it = itemOf(b.key); if (!it) { return; }
    var box = add(E.bList, h('div', 'bdgj4-bk'));
    var top = add(box, h('div', 'bdgj4-bk-top'));
    add(top, h('span', 'bdgj4-bk-nm', it.nm));
    add(top, btn('bdgj4-xs', '빼기', function(){ removeAt(idx); }));
    var row = add(box, h('div', 'bdgj4-bk-row'));
    add(row, chip('금액', b.mode === 'amt', function(){ if (b.mode !== 'amt') { b.mode = 'amt'; b.v = 0; } saveState(); renderBasket(); renderViews(); }));
    add(row, chip('주 수', b.mode === 'sh', function(){ if (b.mode !== 'sh') { b.mode = 'sh'; b.v = 0; } saveState(); renderBasket(); renderViews(); }));
    var inp = add(row, h('input', 'bdgj4-inp bdgj4-sm')); inp.type = 'text'; inp.setAttribute('inputmode', 'numeric'); inp.value = b.v > 0 ? comma(b.v) : ''; inp.setAttribute('placeholder', b.mode === 'amt' ? '금액(원)' : '주 수'); inp.setAttribute('aria-label', it.nm + (b.mode === 'amt' ? ' 금액(원)' : ' 주 수'));
    add(row, h('span', '', b.mode === 'amt' ? '원' : '주'));
    var res = add(box, h('div', 'bdgj4-bk-res'));
    function upd(){
      var p = C.pay(it, b, DATA.fx);
      res.textContent = p ? '1년 세후 ' + fmtWon(p.post) : (b.v > 0 ? '1주당 배당금 자료가 없어 주 수로는 계산이 안 돼요. 금액으로 바꿔 주세요.' : (b.mode === 'amt' ? '금액을 넣어 주세요.' : '주 수를 넣어 주세요.'));
    }
    upd();
    inp.addEventListener('input', function(){
      var v = num(inp.value), cap = b.mode === 'amt' ? 99999999999 : 99999999; if (v > cap) { v = cap; }
      inp.value = v ? comma(v) : ''; b.v = v > 0 ? v : 0; saveState(); upd(); renderViews();
    });
  });
  var hasEx = S.basket.length === 0;
  E.exNote.textContent = '"예시 담기"는 원리 예시예요. BCE(1·4·7·10월), AT&T(2·5·8·11월), 존슨앤존슨(3·6·9·12월)을 1,000만원씩 담으면 12달이 모두 채워져요.';
  renderGoalBasket();
}
function validBasket(){ return S.basket.filter(function(b){ return b.v > 0 && itemOf(b.key); }); }
function renderGoalBasket(){
  var t = num(E.g2.value), bk = validBasket();
  if (!bk.length) { E.g2Res.textContent = ''; return; }
  if (!t) { E.g2Res.textContent = '목표 금액을 넣으면 지금 담은 비율 그대로 필요한 총 금액이 나와요.'; return; }
  var g = C.goal(bk, allItems(), DATA.fx, t);
  E.g2Res.textContent = g > 0 ? '지금 담은 비율 그대로면 총 약 ' + fmtWon(g) + '이 필요해요(1만원 단위로 올림).' : '계산할 수 없어요. 금액이나 주 수를 확인해 주세요.';
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
  var a = C.avgRate(validBasket(), allItems(), DATA.fx);
  if (a.rate === null) { E.avgLine.style.display = 'none'; E.avgLine.textContent = ''; return; }
  E.avgLine.textContent = '담은 비율대로 평균 배당률(세전) ' + a.rate.toFixed(1) + '%' + (a.skipped > 0 ? ' · ' + a.skipped + '개는 금액을 몰라 뺐어요' : '');
  E.avgLine.style.display = '';
}
function renderViews(){ renderCalendar(); renderSector(); renderBand(); renderAvg(); }
function renderCalendar(){
  var bk = validBasket(), items = allItems(), cal = C.calendar(bk, items, DATA.fx), s = C.summary(cal), m;
  E.cal.innerHTML = '';
  E.calHint.textContent = bk.length ? '달을 누르면 어떤 종목이 들어오는지 보여요. 똑같이 나눈 달도 1원 단위로 맞추느라 1원쯤 차이 날 수 있어요.' : '종목을 담으면 달력이 채워져요. 위에서 "담기"나 "예시 담기"를 눌러 보세요.';
  for (m = 0; m < 12; m++) {
    (function(m){
      var c = cal[m], has = c.list.length > 0;
      var b = h('button', 'bdgj4-cell' + (has ? ' bdgj4-has' : '') + (S.month === m ? ' bdgj4-sel' : '')); b.type = 'button'; b.setAttribute('aria-pressed', S.month === m ? 'true' : 'false');
      add(b, h('b', '', (m + 1) + '월'));
      if (has) { add(b, h('span', 'bdgj4-amt', fmtWon(c.post))); add(b, h('span', '', c.list.length + '종목')); }
      else { add(b, h('span', 'bdgj4-void', bk.length ? '들어오는 배당 없음' : '')); }
      b.addEventListener('click', function(){ S.month = S.month === m ? -1 : m; renderCalendar(); });
      E.cal.appendChild(b);
    })(m);
  }
  if (S.month >= 0 && bk.length) {
    var c2 = cal[S.month]; E.mdet.innerHTML = ''; E.mdet.style.display = '';
    add(E.mdet, h('div', 'bdgj4-lab', (S.month + 1) + '월 들어오는 배당(세후)')).style.marginTop = '0';
    if (!c2.list.length) { add(E.mdet, h('div', '', '들어오는 배당 없음')); }
    c2.list.forEach(function(x){ add(E.mdet, h('div', '', x.nm + ', ' + (x.day ? x.day + '일쯤' : '날짜 미정') + ', 세후 ' + fmtWon(x.post))); });
  } else { E.mdet.style.display = 'none'; }
  E.sum.innerHTML = '';
  if (!bk.length) { E.over.style.display = 'none'; return; }
  var maxM = -1, minM = -1, i;
  for (i = 0; i < 12; i++) { if (cal[i].list.length) { if (maxM < 0 || cal[i].post > cal[maxM].post) { maxM = i; } if (minM < 0 || cal[i].post < cal[minM].post) { minM = i; } } }
  function row(a, b){ add(E.sum, h('span', '', a)); add(E.sum, h('span', '', b)); }
  row('1년 세전', fmtWon(s.preY)); row('1년 세후', fmtWon(s.postY)); row('한 달 평균(세후)', fmtWon(s.postY / 12));
  row('가장 많은 달', maxM >= 0 ? (maxM + 1) + '월 ' + fmtWon(cal[maxM].post) : '-');
  row('가장 적은 달(들어오는 달 가운데)', minM >= 0 ? (minM + 1) + '월 ' + fmtWon(cal[minM].post) : '-');
  var emp = 0; for (i = 0; i < 12; i++) { if (!cal[i].list.length) { emp++; } }
  row('배당이 없는 달', emp + '개월');
  if (s.preY > LIMIT) { E.over.textContent = OVER_TXT; E.over.style.display = ''; } else { E.over.style.display = 'none'; }
}
function renderSector(){
  var bk = validBasket(); E.secBars.innerHTML = ''; E.cycLine.textContent = '';
  if (!bk.length) { add(E.secBars, h('div', 'bdgj4-hint', '종목을 담으면 섹터(업종)별 비중이 나와요.')); return; }
  var rows = C.bySector(bk, allItems(), DATA.fx), tot = 0; rows.forEach(function(r){ tot += r.post; });
  rows.forEach(function(r){
    var pct = tot > 0 ? r.post / tot * 100 : 0;
    var d = add(E.secBars, h('div', 'bdgj4-bar')), t = add(d, h('div', 'bdgj4-bar-t'));
    add(t, h('span', '', r.sc)); add(t, h('span', '', fmtWon(r.post) + ' (' + Math.round(pct) + '%)'));
    var bb = add(d, h('div', 'bdgj4-bar-b')); var i = add(bb, h('i')); i.style.width = Math.max(2, Math.round(pct)) + '%';
  });
  var g = {}, ct = 0;
  bk.forEach(function(b){ var it = itemOf(b.key), p = it ? C.pay(it, b, DATA.fx) : null; if (p) { g[it.cy] = (g[it.cy] || 0) + p.post; ct += p.post; } });
  var parts = []; CY_ORDER.forEach(function(c){ if (g[c]) { parts.push((CYN[c] || c) + ' ' + Math.round(g[c] / ct * 100) + '%'); } });
  E.cycLine.textContent = '주기별: ' + parts.join(', ');
}
function renderBand(){
  var bk = validBasket();
  if (!bk.length) { E.band.style.display = 'none'; return; }
  var cal = C.calendar(bk, allItems(), DATA.fx), s = C.summary(cal);
  E.bandT.textContent = '담은 ' + bk.length + '종목, 1년 세후 ' + fmtWon(s.postY);
  E.band.style.display = '';
}

// ---------- 글 안 정적 표 · 자료 새로 받기 ----------
function tryMove(){
  var t = document.getElementById('bdgj4-table');
  if (!t || !E.tblHold || E.tblHold.contains(t)) { return; }
  E.tblHold.appendChild(t); E.tblDet.style.display = '';
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
