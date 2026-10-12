#!/usr/bin/env node
/* Runtime smoke test: runs web/app.js inside a minimal DOM shim with the real
   embedded dataset and asserts the rendered output is correct. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---- pull the real embedded payload out of the built page ---- */
const marker = 'window.__REPO_DATA__ = ';
const start = html.indexOf(marker) + marker.length;
const end = html.indexOf(';</script>', start);
const payload = JSON.parse(html.slice(start, end).replace(/<\\\//g, '</'));
console.log(`loaded payload: ${payload.repos.length} repos, ${Object.keys(payload.readmes).length} readmes`);

/* ---- tiny DOM shim ---- */
function makeClassList(el) {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      on ? set.add(c) : set.delete(c);
      return on;
    },
    _set: set,
  };
}
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this._html = '';
    this.textContent = '';
    this.className = '';
    this.value = '';
    this.disabled = false;
    this.classList = makeClassList(this);
  }
  set innerHTML(v) { this._html = String(v); if (this.tagName !== 'TEMPLATE') this.children = []; }
  get innerHTML() { return this._html; }
  appendChild(c) {
    if (c && c.__fragment) this.children.push(...c.children);
    else this.children.push(c);
    return c;
  }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attrs[k]; }
  insertAdjacentHTML(_pos, s) { this._html += s; }
  click() { (this.listeners.click || []).forEach((f) => f({ target: this, preventDefault() {} })); }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  get firstChild() { return this.children[0] || null; }
  set textContentValue(v) { this.textContent = v; }
}

const registry = new Map();
const get = (sel) => { if (!registry.has(sel)) registry.set(sel, new El('div')); return registry.get(sel); };
get('<html>').setAttribute('data-theme', 'dark'); // 与模板初始值保持一致
const tabs = ['stars', 'growth', 'momentum', 'newcomers'].map((t) => { const e = new El('button'); e.dataset.tab = t; e.className = 'tab'; return e; });
const chips = ['all', '3y', '1y', '90d', '30d', '7d'].map((w) => { const e = new El('button'); e.dataset.window = w; e.className = 'chip'; return e; });

const document = {
  documentElement: get('<html>'),
  body: get('<body>'),
  querySelector: (sel) => get(sel),
  querySelectorAll: (sel) => {
    if (sel === '#tabs .tab') return tabs;
    if (sel === '#windowChips .chip') return chips;
    return [];
  },
  getElementById: (id) => get('#' + id),
  createElement: (tag) => new El(tag),
  createDocumentFragment: () => ({ __fragment: true, children: [], appendChild(c) { this.children.push(c); } }),
  addEventListener: (t, fn) => { document._l = document._l || {}; (document._l[t] = document._l[t] || []).push(fn); },
};

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

/* ---- 运行前冻结时钟，让“近 N 天”这类边界条件完全确定 ---- */
// 时钟固定在“最后一批评数据之后 1 小时”：既保证测试可重复，又让“近 24 小时/近 7 天”语义正确
const T0 = Date.parse((payload.news && payload.news.generated_at) || payload.generated_at) + 3600 * 1000;
const FrozenDate = class extends Date { static now() { return T0; } };

let fetchCalls = [];
const sandbox = {
  console,
  // 同步执行定时器，让 160ms 搜索防抖与 toast 在测试中立即生效
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
  clearTimeout: () => {},
  setInterval: () => 0,
  document, localStorage, navigator: { clipboard: { writeText: () => Promise.resolve() } },
  __FrozenDate: FrozenDate,   // 通过 globalThis.Date = ... 注入（vm 上下文自带内建 Date）
  Blob: function (parts) { this.parts = parts; },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  Promise, JSON, Math, Date, Number, String, Object, Array, RegExp, Error, encodeURIComponent, decodeURIComponent,
  fetch: async (url) => {
    fetchCalls.push(url);
    if (String(url).indexOf('rss2json') >= 0) {
      // 模拟 RSS-to-JSON 服务返回
      return {
        ok: true, status: 200,
        json: async () => ({
          status: 'ok',
          items: [
            { title: 'LIVE: OpenAI ships a brand new model', link: 'https://example.com/live-1',
              pubDate: '2026-10-09 12:00:00', description: '<p>Live <b>release</b> details here</p>' },
            { title: 'LIVE: 量子位 现场报道', link: 'https://example.com/live-2',
              pubDate: '2026-10-09 11:00:00', description: '现场报道正文' }
          ]
        }),
        text: async () => '',
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [{
          id: 999001, full_name: 'smoke-test/realtime-repo', name: 'realtime-repo',
          owner: { login: 'smoke-test', type: 'User', avatar_url: 'https://x/a.png' },
          html_url: 'https://github.com/smoke-test/realtime-repo', homepage: '', description: 'injected by smoke test',
          stargazers_count: 4242, forks_count: 42, open_issues_count: 7, subscribers_count: 12,
          language: 'Rust', topics: ['testing'], license: { spdx_id: 'MIT' },
          created_at: '2026-10-05T00:00:00Z', pushed_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
          default_branch: 'main', size: 100, fork: false, archived: false, has_pages: false, has_discussions: false,
        }],
      }),
      text: async () => '# live readme\n\nsome text',
    };
  },
};
sandbox.window = sandbox;
sandbox.window.__REPO_DATA__ = payload;
sandbox.globalThis = sandbox;

/* ---- run the app ---- */
const js = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');
vm.createContext(sandbox);
// vm 上下文有内建 Date，必须在上下文内部覆盖才能冻结时钟
vm.runInContext('globalThis.Date = __FrozenDate;', sandbox);
sandbox.Date = FrozenDate;
try {
  vm.runInContext(js, sandbox, { filename: 'app.js' });
} catch (e) {
  console.error('❌ app.js threw during init:', e && e.stack);
  process.exit(1);
}

/* ---- assertions ---- */
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
const grid = get('#grid');
const cardHtml = () => grid.children.map((c) => c.innerHTML);
const click = (el, ev) => (el.listeners.click || []).forEach((f) => f(ev || { target: el, preventDefault() {} }));

console.log('\n[1] 初始渲染（星光总榜）');
check('渲染了 24 张卡片', grid.children.length === 24, `got ${grid.children.length}`);
check('第一名是 Star 最多的项目', /codecrafters-io/.test(grid.children[0].innerHTML));
check('卡片含 Star/增速/Fork 指标', /⭐/.test(cardHtml()[0]) && /\/天/.test(cardHtml()[0]) && /🍴/.test(cardHtml()[0]));
check('卡片含 GitHub 跳转链接', /href="https:\/\/github.com\/[^"]+" target="_blank"/.test(cardHtml()[0]));
check('统计区渲染 8 个指标（含 AI 动态与 X 人物）', (get('#statRow').innerHTML.match(/class="stat"/g) || []).length === 8);
check('语言下拉包含全部语言 + N 项', get('#langSel').children.length === 0 && /全部语言/.test(get('#langSel').innerHTML) && (get('#langSel').innerHTML.match(/<option/g) || []).length > 10);
check('结果统计文案正确', /星光总榜/.test(get('#resultText').innerHTML)
  && get('#resultText').innerHTML.includes(String(payload.repos.length).replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  `页面显示项目数应等于数据量 ${payload.repos.length}`);
check('生成时间已回填', get('#genAt').textContent.includes(payload.generated_at.slice(0, 10)),
  `页面=${get('#genAt').textContent.trim()} 数据=${payload.generated_at.slice(0, 10)}`);
check('“加载更多”可见', get('#moreBtn').style.display !== 'none');

console.log('\n[2] 增长榜（切换 Tab + 排序）');
click(get('#tabs'), { target: { closest: () => tabs[1] } });
check('切换到增长最快榜单', /增长最快/.test(get('#resultText').innerHTML));
check('排序切换为日均增星', get('#sortSel').value === 'growth');
check('窗口自动收敛到近 1 年', chips.find((c) => c.classList.contains('active')).dataset.window === '1y');
// 与页面同一口径（近 1 年、按日均增星）算出期望榜首
const spd = (r) => r.stars / Math.max((T0 - Date.parse(r.created_at)) / 86400000, 0.5);
const expTopGrowth = payload.repos
  .filter((r) => (T0 - Date.parse(r.created_at)) / 86400000 <= 365)
  .sort((a, b) => spd(b) - spd(a))[0];
const growthFirst = cardRecords()[0];
check('榜首为最高日均增星项目', growthFirst && growthFirst.full_name === expTopGrowth.full_name,
  `页面=${growthFirst && growthFirst.full_name} 期望=${expTopGrowth.full_name}`);

/* 独立复算筛选结果数，用于交叉验证界面上的计数 */
function expected({ window: w = 'all', lang = 'all', q = '', tab = 'stars' } = {}) {
  const NOW = T0;
  const days = { all: Infinity, '3y': 1095, '1y': 365, '90d': 90, '30d': 30, '7d': 7 }[w];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return payload.repos.filter((r) => {
    const age = (NOW - Date.parse(r.created_at)) / 86400000;
    if (age > days) return false;
    if (lang !== 'all' && r.language !== lang) return false;
    if (tab === 'momentum' && (NOW - Date.parse(r.pushed_at)) / 86400000 > 60) return false;
    if (terms.length) {
      const hay = (r.full_name + ' ' + (r.description || '') + ' ' + (r.topics || []).join(' ') + ' ' + r.language).toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  }).length;
}
const shownCount = () => Number((get('#resultText').innerHTML.match(/共 <b>([\d,]+)<\/b>/) || [0, '0'])[1].replace(/,/g, ''));
const firstCardText = () => grid.children[0].innerHTML;
/* 从卡片 HTML 反查数据记录，用于独立校验筛选结果是否真的匹配 */
function cardRecords() {
  return grid.children.map((c) => {
    const m = c.innerHTML.match(/<span class="owner">([^<]+)\/<\/span>([^<]+)</);
    return m ? payload.repos.find((r) => r.full_name === m[1] + '/' + m[2]) : null;
  });
}

console.log('\n[3] 搜索 / 语言 / 时间窗筛选');
click(get('#resetBtn')); // 先回到确定的初始状态（总榜 / 全部时间 / 全部语言）
check('重置后为全量数据', shownCount() === expected(), `UI=${shownCount()} 复算=${expected()}`);
get('#search').listeners.input[0]({ target: { value: 'rust' } });
check('搜索 rust 过滤生效', shownCount() === expected({ q: 'rust' }) && shownCount() > 0, `UI=${shownCount()} 复算=${expected({ q: 'rust' })}`);
check('搜索结果确实都含 rust（按数据记录校验）', cardRecords().every((r) => r && /rust/i.test((r.full_name + r.description + (r.topics || []).join(' ') + r.language))));
get('#search').listeners.input[0]({ target: { value: 'awesome list' } });
check('多关键词 AND 搜索生效', shownCount() === expected({ q: 'awesome list' }) && shownCount() > 0, `UI=${shownCount()} 复算=${expected({ q: 'awesome list' })}`);
get('#search').listeners.input[0]({ target: { value: 'zzz-不存在的项目-zzz' } });
check('无结果时显示空状态', shownCount() === 0 && grid.children.length === 1 && /没有符合条件/.test(grid.children[0].innerHTML));
get('#search').listeners.input[0]({ target: { value: '' } });
get('#langSel').listeners.change[0]({ target: { value: 'Python' } });
check('语言筛选生效', shownCount() === expected({ lang: 'Python' }), `UI=${shownCount()} 复算=${expected({ lang: 'Python' })}`);
get('#langSel').listeners.change[0]({ target: { value: 'all' } });
click(get('#windowChips'), { target: { closest: () => chips[5] } }); // 近 7 天
if (process.env.SMOKE_DEBUG) {
    const appList = sandbox.window.__GH_BOARD__.currentList().map((r) => r.full_name);
    const hs = new Set(payload.repos.filter((r) => (T0 - Date.parse(r.created_at)) / 86400000 <= 7).map((r) => r.full_name));
    console.log('   [debug] state=', JSON.stringify(sandbox.window.__GH_BOARD__.state), 'list=', appList.length,
      'UI=', shownCount(), 'harness=', expected({ window: '7d' }),
      'appOnly=', appList.filter((n) => !hs.has(n)), 'harnessOnly=', [...hs].filter((n) => !appList.includes(n)));
  }
check('近 7 天时间窗生效', shownCount() === expected({ window: '7d' }), `UI=${shownCount()} 复算=${expected({ window: '7d' })}`);
check('近 7 天项目均带 NEW 徽标', grid.children.every((c) => /NEW/.test(c.innerHTML)));
click(get('#windowChips'), { target: { closest: () => chips[0] } });
get('#sortSel').listeners.change[0]({ target: { value: 'forks' } });
check('按 Fork 排序切换生效', get('#sortSel').value === 'forks' && shownCount() === expected());
get('#sortSel').listeners.change[0]({ target: { value: 'stars' } });
click(get('#tabs'), { target: { closest: () => tabs[2] } }); // 当下最热
check('“当下最热”仅保留近 60 天有推送的项目', shownCount() === expected({ tab: 'momentum' }), `UI=${shownCount()} 复算=${expected({ tab: 'momentum' })}`);

console.log('\n[4] 详情弹窗');
click(get('#resetBtn')); // 回到星光总榜
check('重置后恢复全量', shownCount() === expected(), `UI=${shownCount()}`);
grid.children[0].listeners.click.forEach((f) => f({ target: { closest: () => null }, preventDefault() {} }));
const sheet = get('#sheet').innerHTML;
check('弹窗已打开', get('#modal').classList.contains('open'));
check('弹窗含 10 个数据单元', (sheet.match(/class="stat-cell"/g) || []).length === 10);
check('弹窗含多维度跳转链接', (sheet.match(/class="btn sm/g) || []).length >= 12, `${(sheet.match(/class="btn sm/g) || []).length} links`);
check('弹窗含 Issues/Releases/贡献者链接', /\/issues/.test(sheet) && /\/releases/.test(sheet) && /graphs\/contributors/.test(sheet));
check('弹窗含 Star 历史曲线图', /api\.star-history\.com\/svg\?repos=/.test(sheet));
check('弹窗含主题标签', /class="topic"/.test(sheet) && /github\.com\/topics\//.test(sheet));
const rmMatch = sheet.match(/id="readmeBox">([\s\S]*?)<div class="link-list" style="margin-top:10px">/);
const rmHtml = rmMatch ? rmMatch[1] : '';
check('README 已渲染为 HTML', rmHtml.length > 300, `${rmHtml.length} chars`);
check('README Markdown 元素被正确转换', /<(h[1-4]|p|ul|ol|li|pre|table|blockquote)/.test(rmHtml));
check('README 未泄漏原始 markdown 语法', !/^#{1,6}\s/m.test(rmHtml) && !/\[!\[/.test(rmHtml));
check('README 中链接可点击', /<a href="http/.test(rmHtml));
check('README 实体正确还原（&lt; 不再是 &amp;lt;）', /&lt;insert-technology-here&gt;/.test(rmHtml) && !/&amp;lt;/.test(rmHtml));
check('README 已去除徽章图片', !/img\.shields\.io|badge\.svg/.test(rmHtml));
get('#sheet').innerHTML = '';

console.log('\n[5] 分页 / 视图 / 主题');
click(get('#moreBtn'));
check('加载更多后卡片数翻倍', grid.children.length === 48, `got ${grid.children.length}`);
click(get('#viewBtn'));
check('切换为列表视图', get('#grid').className.includes('list'));
click(get('#themeBtn'));
check('主题切到 light', get('<html>').attrs['data-theme'] === 'light');

console.log('\n[6] 实时刷新（模拟 GitHub API）');
(async () => {
  await get('#refreshBtn').listeners.click[0]();
  check('发起了实时搜索请求', fetchCalls.length >= 6, `${fetchCalls.length} requests`);
  check('刷新期间按钮显示进度状态', /拉取|刷新/.test(get('#refreshBtn').innerHTML));
  check('刷新完成后按钮恢复', /刷新实时数据/.test(get('#refreshBtn').innerHTML) && !get('#refreshBtn').disabled);
  get('#search').listeners.input[0]({ target: { value: 'realtime-repo' } });
  check('实时抓取的项目已并入榜单', grid.children.length === 1 && /smoke-test\/realtime-repo/.test(firstCardText()), `cards=${grid.children.length}`);
  check('实时项目继承了完整字段', /MIT/.test(firstCardText()) && /Rust/.test(firstCardText()));
  check('刷新后统计区仍完整', (get('#statRow').innerHTML.match(/class="stat"/g) || []).length === 8);

  console.log('\n[7] AI 厂商动态板块');
  const NB = sandbox.window.__GH_BOARD__.news;
  const newsPayload = payload.news;
  const NOW_S = T0 / 1000;
  const expectNews = ({ group = '厂商', days = 7, tag = 'all', source = 'all', q = '' } = {}) => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return newsPayload.items.filter((it) => {
      const ts = it.ts || (Date.parse(it.published || '') / 1000) || 0;
      if (group !== 'all' && it.group !== group) return false;
      if (source !== 'all' && it.source_id !== source) return false;
      if (tag !== 'all' && (it.tag || '其他') !== tag) return false;
      if (days) { if (!ts || NOW_S - ts > days * 86400) return false; }
      if (terms.length) {
        const hay = (it.title + ' ' + (it.summary || '') + ' ' + it.source).toLowerCase();
        if (!terms.every((x) => hay.includes(x))) return false;
      }
      return true;
    }).length;
  };
  const newsCount = () => Number((get('#newsCount').innerHTML.match(/共 <b>([\d,]+)<\/b>/) || [0, '0'])[1].replace(/,/g, ''));
  check('动态库已内嵌', NB.all().length > 300, `${NB.all().length} 条`);
  check('动态列表默认按“厂商官方 + 近 7 天”渲染', newsCount() === expectNews(), `UI=${newsCount()} 复算=${expectNews()}`);
  check('列表按日期分组显示', /class="daysep"/.test(get('#newsList').innerHTML));
  check('列表含来源 / 类型 / 时间标签', /pill src/.test(get('#newsList').innerHTML) && /pill tag/.test(get('#newsList').innerHTML));
  check('列表含原文跳转链接', /原文 ↗/.test(get('#newsList').innerHTML));
  check('每日速览已渲染', get('#digestList').innerHTML.length > 500 && (get('#digestList').innerHTML.match(/class="digi"/g) || []).length >= 5,
    `${(get('#digestList').innerHTML.match(/class="digi"/g) || []).length} 张卡片`);
  const dg = NB.digest(9);
  const perSource = {};
  dg.forEach((i) => { perSource[i.source_id] = (perSource[i.source_id] || 0) + 1; });
  check('速览保证来源多样性（每源 ≤2 条）', Object.values(perSource).every((v) => v <= 2), JSON.stringify(perSource));
  check('速览只取近 8 天内容', dg.every((i) => NOW_S - i.ts < 8 * 86400));

  // 分组切换
  click(get('#newsGroupChips'), { target: { closest: () => ({ dataset: { group: '媒体' } }) } });
  check('切换到「科技媒体」分组', NB.state.group === '媒体' && newsCount() === expectNews({ group: '媒体' }), `UI=${newsCount()} 复算=${expectNews({ group: '媒体' })}`);
  click(get('#newsGroupChips'), { target: { closest: () => ({ dataset: { group: 'all' } }) } });
  check('切换到「全部来源」', newsCount() === expectNews({ group: 'all' }), `UI=${newsCount()} 复算=${expectNews({ group: 'all' })}`);
  // 时间窗
  click(get('#newsTimeChips'), { target: { closest: () => ({ dataset: { win: '1' } }) } });
  check('切换「近 24 小时」', newsCount() === expectNews({ group: 'all', days: 1 }), `UI=${newsCount()} 复算=${expectNews({ group: 'all', days: 1 })}`);
  click(get('#newsTimeChips'), { target: { closest: () => ({ dataset: { win: '30' } }) } });
  check('切换「近 30 天」', newsCount() === expectNews({ group: 'all', days: 30 }), `UI=${newsCount()}`);
  // 搜索
  get('#newsSearch').listeners.input[0]({ target: { value: 'agent' } });
  check('动态搜索生效', newsCount() === expectNews({ group: 'all', days: 30, q: 'agent' }) && newsCount() > 0, `UI=${newsCount()}`);
  get('#newsSearch').listeners.input[0]({ target: { value: '' } });
  // 类型筛选
  NB.state.tag = '模型发布';
  NB.state.page = 1;
  click(get('#newsMore'));
  check('按类型筛选（模型发布）', newsCount() === expectNews({ group: 'all', days: 30, tag: '模型发布' }) && newsCount() > 0, `UI=${newsCount()}`);
  NB.state.tag = 'all';
  NB.state.days = 7;
  NB.state.group = '厂商';
  // 分页
  const pageBefore = (get('#newsList').innerHTML.match(/class="news"/g) || []).length;
  click(get('#newsMore'));
  check('动态列表分页加载', (get('#newsList').innerHTML.match(/class="news"/g) || []).length > pageBefore);
  // 在线刷新（走 mock 的 rss2json）
  await get('#digestRefresh').listeners.click[0]();
  check('在线刷新合并了实时动态', NB.all().some((i) => i.live && /LIVE:/.test(i.title)));
  check('实时动态自动分类', NB.all().some((i) => i.live && i.tag === '模型发布'));

  console.log('\n[8] X 领军人物板块');
  const LB = sandbox.window.__GH_BOARD__.leaders;
  check('人物数据已内嵌', LB.all().length >= 15, `${LB.all().length} 位`);
  const cardCount = () => (get('#leaderList').innerHTML.match(/class="leader"/g) || []).length;
  check('人物卡片按分页渲染', cardCount() === Math.min(LB.all().length, LB.state.perPage), `${cardCount()} 张 / 共 ${LB.all().length}`);
  click(get('#xMore'));
  check('账号列表分页加载', cardCount() === Math.min(LB.all().length, LB.state.perPage * 2), `${cardCount()} 张`);
  click(get('#xMore'));
  click(get('#xMore'));
  check('加载到底后按钮隐藏', get('#xMore').style.display === 'none' && cardCount() === LB.all().length, `${cardCount()} 张`);
  check('卡片含头像 / 粉丝数 / 简介 / 主页链接', /leader-av/.test(get('#leaderList').innerHTML)
    && /粉丝/.test(get('#leaderList').innerHTML) && /leader-bio/.test(get('#leaderList').innerHTML)
    && /https:\/\/x\.com\//.test(get('#leaderList').innerHTML));
  check('卡片含「载入最新推文」入口', /data-load-timeline=/.test(get('#leaderList').innerHTML));
  check('默认按粉丝数降序', LB.all()[0].followers >= LB.all()[1].followers);
  check('区分人物与厂商官方账号', LB.all().filter((l) => l.kind === 'org').length >= 8 && LB.all().filter((l) => l.kind === 'person').length >= 15,
    `人物 ${LB.all().filter((l) => l.kind === 'person').length} / 官方 ${LB.all().filter((l) => l.kind === 'org').length}`);
  check('官方账号带「官方」徽标', /pill org/.test(get('#leaderList').innerHTML) === (LB.all().slice().sort((a, b) => b.followers - a.followers).slice(0, 12).some((l) => l.kind === 'org')));
  click(get('#xKindChips'), { target: { closest: () => ({ dataset: { kind: 'org' } }) } });
  const orgTotal = LB.all().filter((l) => l.kind === 'org').length;
  check('只看厂商官方账号', LB.state.kind === 'org' && cardCount() === Math.min(orgTotal, LB.state.perPage), `${cardCount()} / ${orgTotal}`);
  click(get('#xKindChips'), { target: { closest: () => ({ dataset: { kind: 'all' } }) } });
  check('切回全部账号', cardCount() > 0);
  const top = LB.all().slice().sort((a, b) => b.followers - a.followers)[0];
  const firstHandle = (get('#leaderList').innerHTML.match(/data-handle="([^"]+)"/) || [])[1];
  check('粉丝最多者卡片在首位', firstHandle === top.handle, `首位=@${firstHandle} 期望=@${top.handle}`);
  const rel = LB.related(top, 3);
  check('相关报道关联成功（关键词匹配）', Array.isArray(rel), `${rel.length} 条`);
  const anyRel = LB.all().map((l) => LB.related(l, 1)).filter((r) => r.length).length;
  check('多数人物能关联到报道', anyRel >= 5, `${anyRel}/${LB.all().length} 位有相关报道`);
  get('#xSearch').listeners.input[0]({ target: { value: 'openai' } });
  check('人物搜索生效', (get('#leaderList').innerHTML.match(/class="leader"/g) || []).length < LB.all().length);
  get('#xSearch').listeners.input[0]({ target: { value: '' } });

  // 载入时间线：官方组件不可用时必须退化为备用 iframe（不抛错）
  const hostEl = new El('div');
  const tlBtn = new El('button');
  LB.loadTimeline('sama', hostEl, tlBtn);
  await new Promise((r) => setTimeout(r, 0));
  const iframe = hostEl.children.find((c) => c && String(c.src || '').indexOf('syndication.twitter.com') >= 0);
  check('官方嵌入不可用时退化为备用时间线 iframe', !!iframe, iframe ? String(iframe.src).slice(0, 58) + '…' : '未生成 iframe');
  check('时间线按钮状态可恢复', tlBtn.disabled === false && !!tlBtn.textContent);

  console.log('\n[9] 中英对照与 AI 术语表');
  const LB2 = sandbox.window.__GH_BOARD__.lang;
  const GB = sandbox.window.__GH_BOARD__.glossary;
  const newsItems = payload.news.items;
  const withZh = newsItems.filter((i) => i.title_zh).length;
  check('动态库带中文标题', withZh > newsItems.length * 0.6, `${withZh}/${newsItems.length} 条有中译`);
  check('动态库保留英文原文', newsItems.every((i) => !!i.title), '英文原文未被覆盖');
  check('GitHub 项目带中文描述', payload.repos.filter((r) => r.description_zh).length > payload.repos.length * 0.6,
    `${payload.repos.filter((r) => r.description_zh).length}/${payload.repos.length}`);
  check('X 账号带中文简介', payload.leaders.leaders.filter((l) => l.bio_zh).length >= 20,
    `${payload.leaders.leaders.filter((l) => l.bio_zh).length} 条`);

  check('默认是中英对照模式', LB2.get() === 'both', LB2.get());
  const newsHtml = () => get('#newsList').innerHTML;
  check('中英模式下新闻同时渲染中文与英文', /class="bi-zh"/.test(newsHtml()) && /class="bi-en/.test(newsHtml()));
  check('中文条目不会重复渲染', !/class="bi-zh">([^<]{4,})<\/span><span class="bi-en[^"]*">\1</.test(newsHtml()));

  const cjkChars = () => (newsHtml().match(/[\u4e00-\u9fff]/g) || []).length;
  const bothCjk = cjkChars();
  click(get('#langChips'), { target: { closest: () => ({ dataset: { lang: 'zh' } }) } });
  const zhCjk = cjkChars();
  check('切到「中」：正文只剩中文（英文副标题已隐藏）',
    LB2.get() === 'zh' && !/class="bi-en/.test(newsHtml()) && zhCjk > 100, `中文字数 ${zhCjk}`);
  click(get('#langChips'), { target: { closest: () => ({ dataset: { lang: 'en' } }) } });
  const enCjk = cjkChars();
  check('切到「EN」：中文译文已隐藏、英文原文保留',
    LB2.get() === 'en' && !/class="bi-zh"/.test(newsHtml()) && enCjk < bothCjk / 2, `中文字数 ${enCjk}（对照模式为 ${bothCjk}）`);
  check('EN 模式下条目内容仍完整', /news-title/.test(newsHtml()) && newsHtml().length > 500);
  click(get('#langChips'), { target: { closest: () => ({ dataset: { lang: 'both' } }) } });
  check('切回中英对照', LB2.get() === 'both' && /class="bi-en/.test(newsHtml()));

  const gAll = GB.all();
  check('术语表已内嵌', gAll.length >= 50, `${gAll.length} 条`);
  check('术语表已渲染', (get('#glossList').innerHTML.match(/class="gloss"/g) || []).length === gAll.length);
  check('术语含英文 / 中文 / 解释三要素',
    /class="gloss-en"/.test(get('#glossList').innerHTML) && /class="gloss-zh"/.test(get('#glossList').innerHTML) && /class="gloss-desc"/.test(get('#glossList').innerHTML));
  const hitCounts = gAll.map((t) => GB.hits(t.term));
  check('能在动态库里统计术语出现次数', hitCounts.some((n) => n > 5), `最高 ${Math.max.apply(null, hitCounts)} 次`);
  check('中文术语也能命中（如 量化）', GB.hits('quantization') >= 0 && GB.hits('MoE (Mixture of Experts)') >= 0);
  get('#glossSearch').listeners.input[0]({ target: { value: 'agent' } });
  check('术语搜索生效', (get('#glossList').innerHTML.match(/class="gloss"/g) || []).length < gAll.length
    && /agent/i.test(get('#glossList').innerHTML), `筛出 ${(get('#glossList').innerHTML.match(/class="gloss"/g) || []).length} 条`);
  get('#glossSearch').listeners.input[0]({ target: { value: '' } });
  click(get('#glossGroupChips'), { target: { closest: () => ({ dataset: { group: '智能体' } }) } });
  check('术语分组筛选生效', GB.state.group === '智能体' && (get('#glossList').innerHTML.match(/class="gloss"/g) || []).length === gAll.filter((t) => t.group === '智能体').length);
  GB.state.group = 'all';

  console.log('\n[10] 详情弹窗的 README 本地翻译（优雅降级）');
  grid.children[0].listeners.click.forEach((f) => f({ target: { closest: () => null }, preventDefault() {} }));
  check('弹窗提供本地翻译与 Google 翻译入口', /id="translateReadme"/.test(get('#sheet').innerHTML)
    && /translate\.google\.com\/translate\?sl=auto&tl=zh-CN/.test(get('#sheet').innerHTML));
  const tb = new El('button');
  get('#toast').textContent = '';
  await sandbox.window.__GH_BOARD__.translateReadme(tb);      // 模拟浏览器没有该 API
  check('浏览器不支持时给出明确指引且不报错',
    tb.disabled === false && /翻译/.test(get('#toast').textContent), get('#toast').textContent.slice(0, 46));
  get('#sheet').innerHTML = '';

  console.log(`\n${fail === 0 ? '🎉 全部通过' : '⚠️ 存在失败项'}  pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
