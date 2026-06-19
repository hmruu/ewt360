// ==UserScript==
// @name         ewt360
// @namespace    https://github.com/linbyt/ewt360/blob/main/ewt360.js/
// @version      1145.14
// @description  使用方法:到https://teacher.ewt360.com/ewtbend/bend/index/index.html#/student/homework页面选择课程     试题类完成不了，也解决不了，就这样吧
// @match        https://gateway.ewt360.com/*
// @match        https://*.ewt360.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CFG = Object.freeze({
    TASK_API: '/api/homeworkprod/student/homework/task/pageHomeworkTasks',
    SUBMIT_API: 'https://gateway.ewt360.com/api/homeworkprod/homework/student/updateUserLessonTaskV2',
    DONE_TIME: 88888888,
    SLEEP_MS: 700,
    PANEL_ID: 'csp-panel',
  });

  const state = {
    token: null,
    homeworkId: null,
    lessons: [],
    busy: false,
    mounted: false,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getHeader(headers, name) {
    if (!headers) return null;
    const key = String(name).toLowerCase();

    if (typeof headers.get === 'function') {
      return headers.get(name) ?? headers.get(key);
    }

    if (Array.isArray(headers)) {
      for (const [k, v] of headers) {
        if (String(k).toLowerCase() === key) return v;
      }
      return null;
    }

    for (const k of Object.keys(headers)) {
      if (String(k).toLowerCase() === key) return headers[k];
    }
    return null;
  }

  function captureToken(headers) {
    const t = getHeader(headers, 'token') || getHeader(headers, 'Token');
    if (t && t !== state.token) {
      state.token = t;
      ui.setTokenState(true);
      ui.render();
      ui.log(' token 已捕获');
    }
  }

  function parseLessons(payload) {
    const list = payload?.data?.data;
    if (!Array.isArray(list)) return;

    state.lessons = list.map((x) => ({
      id: x.contentId,
      name: x.title,
      homeworkId: x.homeworkId,
      finished: !!x.finished,
      clientPlayTime: x.clientPlayTime,
    }));

    if (!state.homeworkId) {
      state.homeworkId = state.lessons.find((l) => l.homeworkId)?.homeworkId || null;
    }

    ui.render();
  }

  function getTodoList() {
    return state.lessons.filter((l) => !l.finished && l.clientPlayTime !== CFG.DONE_TIME);
  }

  async function sign(clientLessonTime, homeworkId, lessonId, playTime) {
    const s = `eo^nye1j#!wt2%v)${clientLessonTime}${homeworkId}${lessonId}${playTime}eo^nye1j#!wt2%v)`;
    return md5hex(s);
  }

  async function submitOne(lesson) {
    const playTime = CFG.DONE_TIME;
    const clientLessonTime = CFG.DONE_TIME;
    const s = await sign(clientLessonTime, state.homeworkId, lesson.id, playTime);

    const headers = {
      platform: '2',
      version: '99.9.9',
      token: state.token,
      secretId: '1',
      osVersion: '14',
      channel: 'ewt360',
      'device-type': 'phone',
      'device-brand': 'Redmi',
      'Content-Type': 'application/json; charset=UTF-8',
    };

    const body = JSON.stringify({
      homeworkId: state.homeworkId,
      lessonId: lesson.id,
      playTime,
      clientLessonTime,
      sign: s,
    });

    const resp = await fetch(CFG.SUBMIT_API, { method: 'POST', headers, body });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json };
  }

  async function submitAllTodo() {
    if (state.busy) return ui.log(' 正在提交中...');
    if (!state.token) return ui.log(' token 未捕获：先打开一次课程列表页');
    if (!state.homeworkId) return ui.log(' homeworkId 未捕获：先打开一次课程列表页');

    const list = getTodoList();
    if (!list.length) return ui.log(' 没有待完成课程');

    state.busy = true;
    ui.setBusy(true);

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      ui.log(` [${i + 1}/${list.length}] ${l.name}`);

      try {
        const r = await submitOne(l);
        if (r.ok) ok += 1;
        else fail += 1;
      } catch (_) {
        fail += 1;
      }

      await sleep(CFG.SLEEP_MS);
    }

    state.busy = false;
    ui.setBusy(false);
    ui.log(` 完成：成功 ${ok}，失败 ${fail}`);
  }

  function installXHRHook() {
    const open0 = XMLHttpRequest.prototype.open;
    const send0 = XMLHttpRequest.prototype.send;
    const setHeader0 = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__csp_url = url;
      this.__csp_reqHeaders = this.__csp_reqHeaders || {};
      return open0.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      this.__csp_reqHeaders = this.__csp_reqHeaders || {};
      this.__csp_reqHeaders[k] = v;
      return setHeader0.call(this, k, v);
    };

    XMLHttpRequest.prototype.send = function (body) {
      this.addEventListener('load', () => {
        const url = this.__csp_url || '';
        if (!url.includes(CFG.TASK_API)) return;
        captureToken(this.__csp_reqHeaders);
        try {
          parseLessons(JSON.parse(this.responseText));
        } catch (_) {}
      });
      return send0.call(this, body);
    };
  }

  function installFetchHook() {
    const fetch0 = window.fetch;

    window.fetch = async function (input, init) {
      const req = input instanceof Request ? input : null;
      const url = typeof input === 'string' ? input : (req ? req.url : '');

      captureToken((init && init.headers) || (req && req.headers));

      const resp = await fetch0.apply(this, arguments);
      if (url && url.includes(CFG.TASK_API)) {
        resp.clone().json().then(parseLessons).catch(() => {});
      }
      return resp;
    };
  }

  const ui = (() => {
    const el = {
      root: null,
      tokenBadge: null,
      total: null,
      todo: null,
      hw: null,
      btn: null,
list: null,
      dot: null,
    };

    const POS_KEY = `${CFG.PANEL_ID}:pos:v1`;

    function clampPos(left, top, root) {
      const margin = 8;
      const maxLeft = Math.max(margin, window.innerWidth - root.offsetWidth - margin);
      const maxTop = Math.max(margin, window.innerHeight - root.offsetHeight - margin);
      return {
        left: Math.min(Math.max(margin, left), maxLeft),
        top: Math.min(Math.max(margin, top), maxTop),
      };
    }

    function applyInitialPosition(root) {
      root.style.right = 'auto';
      let pos = null;
      try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (_) {}
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        const c = clampPos(pos.left, pos.top, root);
        root.style.left = `${c.left}px`;
        root.style.top = `${c.top}px`;
        return;
      }
      // default: stick to top-right (like old behavior)
      const margin = 12;
      const left = Math.max(margin, window.innerWidth - root.offsetWidth - margin);
      root.style.left = `${left}px`;
      root.style.top = `${margin}px`;
    }

    function initDrag(root) {
      const hd = root.querySelector('.hd');
      if (!hd) return;

      let dragging = false;
      let startX = 0, startY = 0;
      let startLeft = 0, startTop = 0;

      const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        dragging = true;
        root.classList.add('dragging');
        try { hd.setPointerCapture(e.pointerId); } catch (_) {}
        const r = root.getBoundingClientRect();
        startLeft = r.left;
        startTop = r.top;
        startX = e.clientX;
        startY = e.clientY;
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const c = clampPos(startLeft + dx, startTop + dy, root);
        root.style.left = `${c.left}px`;
        root.style.top = `${c.top}px`;
      };

      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        root.classList.remove('dragging');
        try {
          const r = root.getBoundingClientRect();
          localStorage.setItem(POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
        } catch (_) {}
      };

      hd.addEventListener('pointerdown', onDown, { passive: false });
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onUp, { passive: true });

      window.addEventListener('resize', () => {
        const r = root.getBoundingClientRect();
        const c = clampPos(r.left, r.top, root);
        root.style.left = `${c.left}px`;
        root.style.top = `${c.top}px`;
      }, { passive: true });
    }


    function mount() {
      if (state.mounted) return;
      state.mounted = true;

      const root = document.createElement('div');
      root.id = CFG.PANEL_ID;
      root.innerHTML = `
<style>
#${CFG.PANEL_ID}{
  --bg:#ffffff; --text:#202124; --muted:#5f6368; --border:#e0e0e0;
  --primary:#1a73e8; --primary2:#1558b0;
  --success:#34a853; --warn:#fbbc04; --danger:#ea4335;
  --shadow:0 12px 30px rgba(60,64,67,.15),0 4px 12px rgba(60,64,67,.12);
  position:fixed; top:12px; left:12px; width:340px; z-index:999999;
  background:var(--bg); color:var(--text); border:1px solid var(--border);
  border-radius:16px; box-shadow:var(--shadow);
  font:13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,"Noto Sans","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  overflow:hidden;
}
@media (prefers-color-scheme: dark){
  #${CFG.PANEL_ID}{
    --bg:#202124; --text:#e8eaed; --muted:#9aa0a6; --border:#3c4043;
    --shadow:0 18px 40px rgba(0,0,0,.45);
  }
}
#${CFG.PANEL_ID} .hd{
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 12px; border-bottom:1px solid var(--border);
  cursor:grab; user-select:none; -webkit-user-select:none; touch-action:none;
}
#${CFG.PANEL_ID}.dragging .hd{cursor:grabbing;}
#${CFG.PANEL_ID} .grip{color:var(--muted); font-weight:800; letter-spacing:1px;}

#${CFG.PANEL_ID} .title{
  display:flex; align-items:center; gap:8px; font-weight:700; font-size:14px;
}
#${CFG.PANEL_ID} .dot{
  width:10px; height:10px; border-radius:50%;
  background:var(--warn); box-shadow:0 0 0 3px rgba(251,188,4,.18);
}
#${CFG.PANEL_ID} .badge{
  font-size:12px; color:var(--muted);
  border:1px solid var(--border); border-radius:999px;
  padding:4px 8px; max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
#${CFG.PANEL_ID} .bd{ padding:12px; }
#${CFG.PANEL_ID} .kpis{ display:flex; gap:10px; margin:10px 0 8px; }
#${CFG.PANEL_ID} .kpi{
  flex:1; border:1px solid var(--border); border-radius:14px; padding:10px;
  background:rgba(26,115,232,.06);
}
@media (prefers-color-scheme: dark){
  #${CFG.PANEL_ID} .kpi{ background:rgba(26,115,232,.12); }
}
#${CFG.PANEL_ID} .kpi b{ font-size:18px; display:block; margin-top:2px; }
#${CFG.PANEL_ID} .sub{ color:var(--muted); margin-top:6px; font-size:12px; }
#${CFG.PANEL_ID} .btn{
  width:100%; border:0; border-radius:12px; padding:10px 12px;
  font-weight:800; cursor:pointer; color:#fff; background:var(--primary);
  box-shadow:0 6px 16px rgba(26,115,232,.25);
}
#${CFG.PANEL_ID} .btn:hover{ background:var(--primary2); }
#${CFG.PANEL_ID} .btn:disabled{ opacity:.6; cursor:not-allowed; box-shadow:none; }
#${CFG.PANEL_ID} .ghost{
  margin-top:8px; width:100%;
  border:1px solid var(--border); background:transparent; color:var(--text);
  border-radius:12px; padding:9px 12px; font-weight:700; cursor:pointer;
}
#${CFG.PANEL_ID} .ghost:hover{ background:rgba(60,64,67,.08); }

#${CFG.PANEL_ID} details{ margin-top:10px; }
#${CFG.PANEL_ID} summary{
  cursor:pointer; user-select:none; color:var(--muted);
  padding:6px 2px;
}
#${CFG.PANEL_ID} .list{ max-height:180px; overflow:auto; padding-right:2px; }
#${CFG.PANEL_ID} .item{
  border:1px solid var(--border); border-radius:12px; padding:8px 10px;
  margin:8px 0; background:rgba(60,64,67,.06);
}
#${CFG.PANEL_ID} .item.ok{ opacity:.65; }
#${CFG.PANEL_ID} .item .meta{ color:var(--muted); font-size:12px; margin-top:3px; }
</style>

<div class="hd">
  <div class="title">
    <span class="grip" aria-hidden="true">⋮⋮</span>
    <span class="dot" id="csp-dot"></span>
    <span>课程速刷</span>
  </div>
  <span class="badge" id="csp-token">token 未捕获</span>
</div>

<div class="bd">
  <div class="kpis">
    <div class="kpi"><span class="sub">总数</span><b id="csp-total">0</b></div>
    <div class="kpi"><span class="sub">待完成</span><b id="csp-todo">0</b></div>
  </div>

  <div class="sub">HomeworkId：<span id="csp-hw">等待捕获...</span></div>

  <button class="btn" id="csp-btn">一键提交未完成</button>
  <button class="ghost" id="csp-refresh">刷新面板</button>
  <details>
    <summary>课程列表</summary>
    <div class="list" id="csp-list"></div>
  </details>
</div>
      `;

      document.body.appendChild(root);
      applyInitialPosition(root);
      initDrag(root);

      el.root = root;
      el.tokenBadge = root.querySelector('#csp-token');
      el.total = root.querySelector('#csp-total');
      el.todo = root.querySelector('#csp-todo');
      el.hw = root.querySelector('#csp-hw');
      el.btn = root.querySelector('#csp-btn');
el.list = root.querySelector('#csp-list');
      el.dot = root.querySelector('#csp-dot');

      el.btn.addEventListener('click', submitAllTodo);
      root.querySelector('#csp-refresh').addEventListener('click', () => render(true));

      render(true);
    }

    function setBusy(b) {
      if (!el.btn) return;
      el.btn.disabled = !!b;
      el.btn.textContent = b ? '提交中...' : '一键提交未完成';
    }

    function setTokenState(ok) {
      if (!el.dot) return;
      el.dot.style.background = ok ? 'var(--success)' : 'var(--warn)';
      el.dot.style.boxShadow = ok
        ? '0 0 0 3px rgba(52,168,83,.18)'
        : '0 0 0 3px rgba(251,188,4,.18)';
      if (el.tokenBadge) el.tokenBadge.textContent = ok ? 'token 已捕获' : 'token 未捕获';
    }

    function log(_msg) {}

    function render(forceTokenUpdate = false) {
      if (!el.root) return;

      if (forceTokenUpdate) setTokenState(!!state.token);

      el.total.textContent = String(state.lessons.length);
      el.todo.textContent = String(getTodoList().length);
      el.hw.textContent = state.homeworkId || '等待捕获...';

      if (!el.list) return;
      el.list.textContent = '';
      const frag = document.createDocumentFragment();

      for (let i = 0; i < state.lessons.length; i++) {
        const l = state.lessons[i];
        const done = l.finished || l.clientPlayTime === CFG.DONE_TIME;

        const item = document.createElement('div');
        item.className = 'item' + (done ? ' ok' : '');

        const b = document.createElement('b');
        b.textContent = `${i + 1}. ${l.name || ''}`;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${done ? '已完成' : '未完成'} ｜ ID: ${l.id ?? ''}`;

        item.appendChild(b);
        item.appendChild(meta);
        frag.appendChild(item);
      }

      el.list.appendChild(frag);
    }

    return { mount, render, log, setBusy, setTokenState };
  })();

  function md5hex(str) {
    function rotateLeft(lValue, iShiftBits) {
      return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function addUnsigned(lX, lY) {
      const lX4 = lX & 0x40000000;
      const lY4 = lY & 0x40000000;
      const lX8 = lX & 0x80000000;
      const lY8 = lY & 0x80000000;
      const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
      if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
      if (lX4 | lY4) {
        return (lResult & 0x40000000)
          ? lResult ^ 0xc0000000 ^ lX8 ^ lY8
          : lResult ^ 0x40000000 ^ lX8 ^ lY8;
      }
      return lResult ^ lX8 ^ lY8;
    }
    function F(x, y, z) { return (x & y) | (~x & z); }
    function G(x, y, z) { return (x & z) | (y & ~z); }
    function H(x, y, z) { return x ^ y ^ z; }
    function I(x, y, z) { return y ^ (x | ~z); }
    function FF(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function GG(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function HH(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function II(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }

    function toWordArray(input) {
      const bytes = new TextEncoder().encode(input);
      const lWordCount = (((bytes.length + 8) >>> 6) + 1) * 16;
      const wordArray = new Array(lWordCount).fill(0);
      let i;
      for (i = 0; i < bytes.length; i++) {
        wordArray[i >> 2] |= bytes[i] << ((i % 4) * 8);
      }
      wordArray[i >> 2] |= 0x80 << ((i % 4) * 8);
      wordArray[lWordCount - 2] = bytes.length * 8;
      return wordArray;
    }

    function wordToHex(lValue) {
      let hex = '';
      for (let i = 0; i <= 3; i++) {
        hex += ('0' + ((lValue >>> (i * 8)) & 0xff).toString(16)).slice(-2);
      }
      return hex;
    }

    const x = toWordArray(str);
    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    for (let i = 0; i < x.length; i += 16) {
      const AA = a, BB = b, CC = c, DD = d;

      a = FF(a, b, c, d, x[i + 0], 7, 0xd76aa478);
      d = FF(d, a, b, c, x[i + 1], 12, 0xe8c7b756);
      c = FF(c, d, a, b, x[i + 2], 17, 0x242070db);
      b = FF(b, c, d, a, x[i + 3], 22, 0xc1bdceee);
      a = FF(a, b, c, d, x[i + 4], 7, 0xf57c0faf);
      d = FF(d, a, b, c, x[i + 5], 12, 0x4787c62a);
      c = FF(c, d, a, b, x[i + 6], 17, 0xa8304613);
      b = FF(b, c, d, a, x[i + 7], 22, 0xfd469501);
      a = FF(a, b, c, d, x[i + 8], 7, 0x698098d8);
      d = FF(d, a, b, c, x[i + 9], 12, 0x8b44f7af);
      c = FF(c, d, a, b, x[i + 10], 17, 0xffff5bb1);
      b = FF(b, c, d, a, x[i + 11], 22, 0x895cd7be);
      a = FF(a, b, c, d, x[i + 12], 7, 0x6b901122);
      d = FF(d, a, b, c, x[i + 13], 12, 0xfd987193);
      c = FF(c, d, a, b, x[i + 14], 17, 0xa679438e);
      b = FF(b, c, d, a, x[i + 15], 22, 0x49b40821);

      a = GG(a, b, c, d, x[i + 1], 5, 0xf61e2562);
      d = GG(d, a, b, c, x[i + 6], 9, 0xc040b340);
      c = GG(c, d, a, b, x[i + 11], 14, 0x265e5a51);
      b = GG(b, c, d, a, x[i + 0], 20, 0xe9b6c7aa);
      a = GG(a, b, c, d, x[i + 5], 5, 0xd62f105d);
      d = GG(d, a, b, c, x[i + 10], 9, 0x02441453);
      c = GG(c, d, a, b, x[i + 15], 14, 0xd8a1e681);
      b = GG(b, c, d, a, x[i + 4], 20, 0xe7d3fbc8);
      a = GG(a, b, c, d, x[i + 9], 5, 0x21e1cde6);
      d = GG(d, a, b, c, x[i + 14], 9, 0xc33707d6);
      c = GG(c, d, a, b, x[i + 3], 14, 0xf4d50d87);
      b = GG(b, c, d, a, x[i + 8], 20, 0x455a14ed);
      a = GG(a, b, c, d, x[i + 13], 5, 0xa9e3e905);
      d = GG(d, a, b, c, x[i + 2], 9, 0xfcefa3f8);
      c = GG(c, d, a, b, x[i + 7], 14, 0x676f02d9);
      b = GG(b, c, d, a, x[i + 12], 20, 0x8d2a4c8a);

      a = HH(a, b, c, d, x[i + 5], 4, 0xfffa3942);
      d = HH(d, a, b, c, x[i + 8], 11, 0x8771f681);
      c = HH(c, d, a, b, x[i + 11], 16, 0x6d9d6122);
      b = HH(b, c, d, a, x[i + 14], 23, 0xfde5380c);
      a = HH(a, b, c, d, x[i + 1], 4, 0xa4beea44);
      d = HH(d, a, b, c, x[i + 4], 11, 0x4bdecfa9);
      c = HH(c, d, a, b, x[i + 7], 16, 0xf6bb4b60);
      b = HH(b, c, d, a, x[i + 10], 23, 0xbebfbc70);
      a = HH(a, b, c, d, x[i + 13], 4, 0x289b7ec6);
      d = HH(d, a, b, c, x[i + 0], 11, 0xeaa127fa);
      c = HH(c, d, a, b, x[i + 3], 16, 0xd4ef3085);
      b = HH(b, c, d, a, x[i + 6], 23, 0x04881d05);
      a = HH(a, b, c, d, x[i + 9], 4, 0xd9d4d039);
      d = HH(d, a, b, c, x[i + 12], 11, 0xe6db99e5);
      c = HH(c, d, a, b, x[i + 15], 16, 0x1fa27cf8);
      b = HH(b, c, d, a, x[i + 2], 23, 0xc4ac5665);

      a = II(a, b, c, d, x[i + 0], 6, 0xf4292244);
      d = II(d, a, b, c, x[i + 7], 10, 0x432aff97);
      c = II(c, d, a, b, x[i + 14], 15, 0xab9423a7);
      b = II(b, c, d, a, x[i + 5], 21, 0xfc93a039);
      a = II(a, b, c, d, x[i + 12], 6, 0x655b59c3);
      d = II(d, a, b, c, x[i + 3], 10, 0x8f0ccc92);
      c = II(c, d, a, b, x[i + 10], 15, 0xffeff47d);
      b = II(b, c, d, a, x[i + 1], 21, 0x85845dd1);
      a = II(a, b, c, d, x[i + 8], 6, 0x6fa87e4f);
      d = II(d, a, b, c, x[i + 15], 10, 0xfe2ce6e0);
      c = II(c, d, a, b, x[i + 6], 15, 0xa3014314);
      b = II(b, c, d, a, x[i + 13], 21, 0x4e0811a1);
      a = II(a, b, c, d, x[i + 4], 6, 0xf7537e82);
      d = II(d, a, b, c, x[i + 11], 10, 0xbd3af235);
      c = II(c, d, a, b, x[i + 2], 15, 0x2ad7d2bb);
      b = II(b, c, d, a, x[i + 9], 21, 0xeb86d391);

      a = addUnsigned(a, AA);
      b = addUnsigned(b, BB);
      c = addUnsigned(c, CC);
      d = addUnsigned(d, DD);
    }

    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
  }

  function boot() {
    ui.mount();
    installXHRHook();
    installFetchHook();
    console.log(' ewt360 课程速刷助手已加载');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
