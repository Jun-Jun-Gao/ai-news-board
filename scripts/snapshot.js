#!/usr/bin/env node
/* Render a *static* snapshot of the app's real DOM output so the layout can be
   visually reviewed with a non-JS renderer (e.g. macOS QuickLook).
   Usage: node scripts/snapshot.js [outDir]  -> writes preview-main.html / preview-modal.html */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const OUT = process.argv[2] || '/tmp';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));

const mk = 'window.__REPO_DATA__ = ';
const s0 = html.indexOf(mk) + mk.length;
const payload = JSON.parse(html.slice(s0, html.indexOf(';</script>', s0)).replace(/<\\\//g, '</'));

/* ---- minimal DOM shim (only what rendering needs) ---- */
const makeCL = () => { const set = new Set(); return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c), toggle: (c, f) => { const on = f === undefined ? !set.has(c) : !!f; on ? set.add(c) : set.delete(c); return on; } }; };
class El {
  constructor(t) { this.tagName = String(t || 'div').toUpperCase(); this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.attrs = {}; this._html = ''; this.textContent = ''; this.className = ''; this.value = ''; this.classList = makeCL(); }
  set innerHTML(v) { this._html = String(v); } get innerHTML() { return this._html; }
  appendChild(c) { if (c && c.__fragment) this.children.push(...c.children); else this.children.push(c); return c; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k]; }
  insertAdjacentHTML(_p, x) { this._html += x; } click() {} closest() { return null; } focus() {}
  querySelector() { return null; } querySelectorAll() { return []; }
}
const reg = new Map(); const get = (x) => { if (!reg.has(x)) reg.set(x, new El()); return reg.get(x); };
get('<html>').setAttribute('data-theme', process.env.PREVIEW_THEME || 'dark');
const tabs = ['stars', 'growth', 'momentum', 'newcomers'].map((t) => { const e = new El('button'); e.dataset.tab = t; e.className = 'tab'; return e; });
const chips = ['all', '3y', '1y', '90d', '30d', '7d'].map((w) => { const e = new El('button'); e.dataset.window = w; e.className = 'chip'; return e; });
const document = {
  documentElement: get('<html>'), body: get('<body>'), querySelector: get,
  querySelectorAll: (sel) => (sel === '#tabs .tab' ? tabs : sel === '#windowChips .chip' ? chips : []),
  getElementById: (id) => get('#' + id), createElement: (t) => new El(t),
  createDocumentFragment: () => ({ __fragment: true, children: [], appendChild(c) { this.children.push(c); } }),
  addEventListener() {},
};
const T0 = Date.now();   // 预览用真实时间，避免相对时间显示成“刚刚”
const FD = class extends Date { static now() { return T0; } };
const sb = {
  console, document, Date: FD, __FrozenDate: FD,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {},
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  fetch: async () => ({ ok: true, json: async () => ({ items: [] }) }),
  setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {},
  JSON, Math, Number, String, Object, Array, RegExp, Error, Promise, encodeURIComponent,
};
sb.window = sb; sb.window.__REPO_DATA__ = payload; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext('globalThis.Date = __FrozenDate;', sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8'), sb);

/* ---- capture rendered fragments ---- */
const grid = get('#grid');
const cards = grid.children.slice(0, 6).map((c) => '<article class="card">' + c.innerHTML + '</article>').join('');
get('#sheet').innerHTML = '';
grid.children[1].listeners.click.forEach((f) => f({ target: { closest: () => null }, preventDefault() {} }));
const sheet = get('#sheet').innerHTML;

const newsHtml = get('#newsList').innerHTML;
const leaderHtml = get('#leaderList').innerHTML;
const glossHtml = get('#glossList').innerHTML;

const shell = (title, body) => `<!DOCTYPE html><html lang="zh-CN" data-theme="${get('<html>').attrs['data-theme']}">
<head><meta charset="utf-8"><title>${title}</title><style>${CSS}
/* 预览专用：强制桌面宽度，避免缩略图渲染器使用窄视口 */
html, body { width: 820px; }  /* 贴合缩略图渲染器的窄视口，避免被裁切 */
</style></head>
<body><div class="wrap">${body}</div></body></html>`;

const toolbar = `<div class="toolbar">
  <div class="tabs">${['⭐ 星光总榜', '🚀 增长最快', '🔥 当下最热', '✨ 潜力新星'].map((t, i) =>
    `<button class="tab${i === 0 ? ' active' : ''}">${t}</button>`).join('')}</div>
  <div class="filters">
    <label class="search"><span>🔍</span><input placeholder="搜索项目名 / 描述 / 主题标签"></label>
    <select><option>🌐 全部语言</option></select>
    <div class="chips">${['全部时间', '近 3 年', '近 1 年', '近 90 天', '近 30 天', '近 7 天'].map((w, i) =>
      `<button class="chip${i === 0 ? ' active' : ''}">${w}</button>`).join('')}</div>
    <select><option>按 Star 总数</option></select>
    <button class="btn sm">▦ 视图</button><button class="btn sm">重置</button>
  </div></div>`;

const BRAND_SVG = fs.readFileSync(path.join(ROOT, 'web', 'favicon.svg'), 'utf8').trim();
const hero = `<header class="hero"><div class="hero-top"><div class="brand"><div class="brand-mark" aria-hidden="true">${BRAND_SVG}</div>
  <div><h1>AI 每日情报站 &amp; <span class="grad">GitHub 风云榜</span></h1>
  <p class="sub">AI 厂商动态 · X 领军人物 · 星标与增长榜 &nbsp;|&nbsp; 数据来源：GitHub Search API 与各厂商公开订阅源</p></div></div>
  <div class="hero-actions"><button class="btn sm">🌙 主题</button><button class="btn sm">🔄 刷新实时数据</button>
  <button class="btn sm">🔑 Token</button><a class="btn sm primary">GitHub Trending ↗</a>
  <button class="btn sm">💾 导出 CSV</button></div></div>
  <div class="stat-row">${get('#statRow').innerHTML}</div></header>`;

const secnav = `<nav class="secnav">
  <a class="secnav-link active" href="#digest">🤖 AI 每日速览</a>
  <a class="secnav-link" href="#github">📊 GitHub 榜单</a>
  <a class="secnav-link" href="#news">🏢 AI 厂商动态</a>
  <a class="secnav-link" href="#x">🐦 X 领军人物</a>
  <span class="secnav-spacer"></span><span class="secnav-note">${get('#navNote').textContent}</span></nav>`;

const digestSection = `<section class="panel" id="digest">
  <div class="panel-head"><h2>🤖 AI 每日速览</h2><div class="panel-sub">${get('#digestSub').innerHTML}</div>
  <div class="panel-actions"><button class="btn sm">🔄 在线刷新动态</button><a class="btn sm">查看全部动态 →</a></div></div>
  <div class="digest">${get('#digestList').innerHTML}</div></section>`;

const githubSection = `<section class="panel" id="github">
  <div class="panel-head"><h2>📊 GitHub 项目风云榜</h2><div class="panel-sub">Star 最多的经典项目 &amp; 增长最快的新星</div></div>
  ${toolbar}
  <div class="result-line"><div>${get('#resultText').innerHTML}</div>
   <div class="legend-note">${get('#metricNote').textContent}</div></div>
   <main class="grid">${cards}</main></section>`;

const newsSection = `<section class="panel" id="news">
  <div class="panel-head"><h2>🏢 AI 厂商动态</h2><div class="panel-sub">${get('#newsSub').textContent || '各厂商官方博客 / 研究机构 / 科技媒体的最新动态'}</div>
  <div class="panel-actions"><button class="btn sm">💾 导出 CSV</button></div></div>
  <div class="result-line"><div>${get('#newsCount').innerHTML}</div>
  <div class="legend-note">ⓘ 数据来自各厂商官方博客 / 研究机构 / 科技媒体的公开订阅源</div></div>
  <div class="newslist">${newsHtml}</div></section>`;

const xSection = `<section class="panel" id="x">
  <div class="panel-head"><h2>🐦 X 领军人物 &amp; 官方账号</h2><div class="panel-sub">${get('#xSub').innerHTML}</div></div>
  <p class="x-note">${get('#xNote').innerHTML}</p>
  <div class="leadergrid">${leaderHtml}</div></section>`;

const glossSection = `<section class="panel" id="glossary">
  <div class="panel-head"><h2>📚 AI 术语中英对照</h2><div class="panel-sub">${get('#glossSub').innerHTML}</div></div>
  <p class="x-note">每个术语给出「英文写法 + 中文说法 + 一句话解释」，右侧数字表示它在当前动态库里出现了多少次。</p>
  <div class="glossgrid">${glossHtml}</div></section>`;

const main = shell('预览 · 总览', hero + secnav + digestSection + githubSection + newsSection + xSection + glossSection);
const newsPage = shell('预览 · AI 动态', hero.split('</div></header>')[0] + '</div></header>' + newsSection);
const xPage = shell('预览 · X 人物', xSection);
const modal = shell('预览 · 详情', `<div class="modal open" style="position:static;backdrop-filter:none;background:transparent;padding:0">
  <div class="sheet">${sheet}</div></div>`);

fs.writeFileSync(path.join(OUT, 'preview-gloss.html'), shell('预览 · 术语表', glossSection));
fs.writeFileSync(path.join(OUT, 'preview-main.html'), main);
fs.writeFileSync(path.join(OUT, 'preview-news.html'), newsPage);
fs.writeFileSync(path.join(OUT, 'preview-x.html'), xPage);
fs.writeFileSync(path.join(OUT, 'preview-modal.html'), modal);
for (const f of ['preview-main', 'preview-news', 'preview-x', 'preview-gloss', 'preview-modal']) {
  console.log(`wrote ${path.join(OUT, f + '.html')} (${(fs.statSync(path.join(OUT, f + '.html')).size / 1024).toFixed(0)} KB)`);
}
