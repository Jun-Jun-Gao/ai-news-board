/* ===========================================================
   GitHub 项目风云榜 — 前端逻辑
   数据内嵌于 window.__REPO_DATA__（构建时注入），可离线双击打开
   =========================================================== */
(function () {
  'use strict';

  const RAW = window.__REPO_DATA__ || { repos: [], readmes: {}, generated_at: new Date().toISOString() };
  const READMES = RAW.readmes || {};
  const GEN_AT = RAW.generated_at || new Date().toISOString();
  let REPOS = (RAW.repos || []).slice();
  const NEWS_META = RAW.news || { items: [], sources: [], generated_at: '' };
  const NEWS = (NEWS_META.items || []).slice();
  const NEWS_SOURCES = NEWS_META.sources || [];
  const LEADER_META = RAW.leaders || { leaders: [], generated_at: '', note: '' };
  const LEADERS = (LEADER_META.leaders || []).slice();
  const GLOSSARY = ((RAW.glossary || {}).terms || []).slice();

  // 中英显示模式：both=中英对照（默认）· zh=只看中文 · en=只看英文
  const LANG_KEY = 'gh_lang_mode';
  let LANG_MODE = 'both';
  try { LANG_MODE = localStorage.getItem(LANG_KEY) || 'both'; } catch (e) { /* 忽略 */ }

  function setLangMode(mode) {
    LANG_MODE = mode;
    try { localStorage.setItem(LANG_KEY, mode); } catch (e) { /* 忽略 */ }
  }

  /** 把「中文 + 英文」渲染成对照结构；缺哪边就显示另一边，避免出现空白 */
  function bi(zh, en, cls) {
    const z = (zh || '').trim(), e = (en || '').trim();
    const same = z && e && z === e;
    if (LANG_MODE === 'zh') return escapeHtml(z || e);
    if (LANG_MODE === 'en') return escapeHtml(e || z);
    if (z && e && !same) {
      return `<span class="bi-zh">${escapeHtml(z)}</span>` +
             `<span class="bi-en${cls ? ' ' + cls : ''}">${escapeHtml(e)}</span>`;
    }
    return escapeHtml(z || e);
  }

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ---------------- 常量 ---------------- */
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
    Go: '#00ADD8', Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
    Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00',
    Jupyter: '#DA5B0B', 'Jupyter Notebook': '#DA5B0B', Markdown: '#083fa1', Zig: '#ec915c',
    Lua: '#000080', Perl: '#0298c3', Scala: '#c22d40', Haskell: '#5e5086', Elixir: '#6e4a7e',
    Clojure: '#db5855', R: '#198CE7', Julia: '#a270ba', Solidity: '#AA6746', Assembly: '#6E4C13',
    PowerShell: '#012456', 'Objective-C': '#438eff', MATLAB: '#e16737', TeX: '#3D6117',
    Nix: '#7e7eff', OCaml: '#ef7a08', Groovy: '#4298b8', 'F#': '#b845fc', 'Visual Basic .NET': '#945db7',
    Astro: '#ff5a03', MDX: '#fcb32c', Blade: '#f7523f', CoffeeScript: '#244776', Nim: '#ffc200',
    'Emacs Lisp': '#c065db', 'Vim Script': '#199f4b', Dockerfile: '#384d54', Makefile: '#427819',
    Other: '#8b949e'
  };
  const WINDOW_DAYS = { all: Infinity, '3y': 1095, '1y': 365, '90d': 90, '30d': 30, '7d': 7 };

  /* ---------------- 工具函数 ---------------- */
  const nf = (n) => Number(n || 0).toLocaleString('en-US');
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function relTime(iso) {
    const t = Date.parse(iso);
    if (!t) return '—';
    const d = (Date.now() - t) / 86400000;
    if (d < 1 / 24) return '刚刚';
    if (d < 1) return Math.round(d * 24) + ' 小时前';
    if (d < 30) return Math.round(d) + ' 天前';
    if (d < 365) return Math.round(d / 30) + ' 个月前';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + ' 年前';
  }
  function ageText(days) {
    if (days < 1) return Math.round(days * 24) + ' 小时';
    if (days < 60) return Math.round(days) + ' 天';
    if (days < 730) return (days / 30).toFixed(1).replace(/\.0$/, '') + ' 个月';
    return (days / 365).toFixed(1).replace(/\.0$/, '') + ' 年';
  }
  function sizeText(kb) {
    kb = Number(kb || 0);
    if (kb >= 1048576) return (kb / 1048576).toFixed(1).replace(/\.0$/, '') + ' GB';
    if (kb >= 1024) return (kb / 1024).toFixed(1).replace(/\.0$/, '') + ' MB';
    return Math.round(kb) + ' KB';
  }
  const langColor = (l) => LANG_COLORS[l] || '#8b949e';
  const fmtDate = (iso) => (iso || '').slice(0, 10);

  let toastTimer;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }

  /* ---------------- 轻量 Markdown 渲染 ---------------- */
  function mdToHtml(src) {
    if (!src) return '';
    let s = escapeHtml(src);
    // README 里合法使用的 HTML 实体（如 &lt;）需要还原为字符，否则会被二次转义显示
    s = s.replace(/&amp;(lt|gt|amp|quot|apos|#39|#x27|nbsp|mdash|ndash|hellip|copy|middot|times|rarr|laquo|raquo|check|warning);/g, '&$1;');
    s = s.replace(/&amp;#(\d{2,5});/g, '&#$1;');
    const blocks = [];
    s = s.replace(/```[a-zA-Z0-9_+-]*\n?([\s\S]*?)```/g, (m, code) => {
      blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n$1\n\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/gm, (m, h, t) => '\n<h' + h.length + '>' + t + '</h' + h.length + '>\n');
    s = s.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '\n<hr>\n');
    s = s.replace(/^\s*&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (m, inner) =>
      '<blockquote>' + inner.replace(/<\/blockquote>\s*<blockquote>/g, '<br>') + '</blockquote>');
    // 表格
    s = s.replace(/(^\|.+\|\s*$\n^\|[\s:|-]+\|\s*$\n(?:(?:^\|.*\|\s*$\n?)+))/gm, (m) => {
      const rows = m.trim().split('\n');
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      let html = '<table><thead><tr>' + cells(rows[0]).map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
      rows.slice(2).forEach((r) => { html += '<tr>' + cells(r).map((c) => '<td>' + c + '</td>').join('') + '</tr>'; });
      return html + '</tbody></table>\n';
    });
    // 列表
    s = s.replace(/(?:^[ \t]*(?:[-*+]|\d+[.)])[ \t]+.+(?:\n|$))+/gm, (block) => {
      const lines = block.replace(/\n$/, '').split('\n');
      const ordered = /^[ \t]*\d+[.)]/.test(lines[0]);
      const items = lines.map((l) => l.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, '').trim());
      return '\n<' + (ordered ? 'ol' : 'ul') + '>' + items.map((i) => '<li>' + i + '</li>').join('') +
        '</' + (ordered ? 'ol' : 'ul') + '>\n';
    });
    // 链接 / 强调
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\[([^\]\n]+)\]\((#[^)\s]*)\)/g, '$1');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    // 段落
    s = s.split(/\n{2,}/).map((p) => {
      const t = p.trim();
      if (!t) return '';
      if (/^<(h[1-6]|ul|ol|pre|blockquote|table|hr|div|\u0000)/.test(t) || /^\u0000\d+\u0000$/.test(t)) return t;
      return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i] || '');
    return s;
  }

  /* ---------------- 数据派生 ---------------- */
  const NOW = Date.now();
  function score(r) {
    const created = Date.parse(r.created_at) || NOW;
    const age = Math.max((NOW - created) / 86400000, 0.5);
    const spd = r.stars / age;
    return {
      age_days: age,
      stars_per_day: spd,
      momentum: spd * (1 + Math.min(age, 30) / 60)
    };
  }
  function normalize(list) {
    return list.filter((r) => r && !r.fork && !r.archived && r.full_name).map((r) => {
      // 统一按“打开页面的时刻”重算年龄与增速，保证“近 7 天”等时间窗始终精确
      const s = score(r);
      r.age_days = s.age_days;
      r.stars_per_day = s.stars_per_day;
      r.momentum = s.momentum;
      return r;
    });
  }
  REPOS = normalize(REPOS);

  let MAX_STARS = REPOS.reduce((m, r) => Math.max(m, r.stars), 1);

  /* ---------------- 状态 ---------------- */
  const STATE = {
    tab: 'stars', window: 'all', lang: 'all', sort: 'stars', q: '',
    page: 1, perPage: 24, view: 'grid', extra: []
  };
  const TAB_DEFAULTS = {
    stars: { sort: 'stars', window: 'all', note: '按 Star 总数排序的全站经典项目' },
    growth: { sort: 'growth', window: '1y', note: '按“日均增星”排序，聚焦近期高速成长的项目' },
    momentum: { sort: 'momentum', window: 'all', note: '热度指数 = 增速 × 新鲜度加权，并只看近 60 天有推送的项目' },
    newcomers: { sort: 'growth', window: '90d', note: '创建于近 90 天的潜力新星，按日均增星排序' }
  };

  /* ---------------- 筛选 + 排序 ---------------- */
  function allRepos() {
    // 内嵌数据与实时刷新结果合并（按 full_name 去重，取 Star 更高者）
    const seen = new Map();
    REPOS.concat(STATE.extra).forEach((r) => {
      const p = seen.get(r.full_name);
      if (!p || r.stars > p.stars) seen.set(r.full_name, r);
    });
    return Array.from(seen.values());
  }

  function currentList() {
    const pool = allRepos();
    const q = STATE.q.trim().toLowerCase();
    const maxAge = WINDOW_DAYS[STATE.window] ?? Infinity;
    const terms = q ? q.split(/[\s,]+/).filter(Boolean) : [];

    let out = pool.filter((r) => {
      if (r.age_days > maxAge) return false;
      if (STATE.lang !== 'all' && r.language !== STATE.lang) return false;
      if (STATE.tab === 'momentum') {
        const pushed = Date.parse(r.pushed_at) || 0;
        if ((NOW - pushed) / 86400000 > 60) return false;
      }
      if (terms.length) {
        const hay = (r.full_name + ' ' + (r.description || '') + ' ' + (r.topics || []).join(' ') + ' ' + r.language).toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });

    const cmp = {
      stars: (a, b) => b.stars - a.stars,
      growth: (a, b) => b.stars_per_day - a.stars_per_day,
      momentum: (a, b) => b.momentum - a.momentum,
      forks: (a, b) => b.forks - a.forks,
      pushed: (a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at),
      created: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    }[STATE.sort] || ((a, b) => b.stars - a.stars);

    return out.sort(cmp);
  }

  /* ---------------- 渲染 ---------------- */
  function renderStats(list) {
    const totalStars = allRepos().reduce((s, r) => s + r.stars, 0);
    const langs = new Set(allRepos().map((r) => r.language));
    const newest = allRepos().reduce((m, r) => (Date.parse(r.created_at) > Date.parse(m.created_at) ? r : m), allRepos()[0] || { created_at: GEN_AT, full_name: '—' });
    const now = Date.now() / 1000;
    const news = allNews();
    const newsToday = news.filter((i) => { const t = tsOf(i); return t && now - t < 86400; }).length;
    const newsWeek = news.filter((i) => { const t = tsOf(i); return t && now - t < 7 * 86400; }).length;
    const srcCount = new Set(news.map((i) => i.source_id)).size;
    const followers = LEADERS.reduce((s, l) => s + (l.followers || 0), 0);
    const cells = [
      ['收录项目', nf(allRepos().length), '个'],
      ['Star 总量', compact(totalStars), ''],
      ['今日 AI 动态', nf(newsToday), '条', '', '近 24 小时内发布'],
      ['近 7 天 AI 动态', nf(newsWeek), '条', '', '近 7 天内发布'],
      ['AI 信息源', nf(srcCount), '个', '', '厂商官方 / 研究机构 / 媒体 / 中文资讯'],
      ['X 关注账号', nf(LEADERS.length), '个', '', `人物与厂商官方账号合计粉丝 ${compact(followers)}`],
      ['覆盖语言', nf(langs.size), '种'],
      ['最新入库项目', escapeHtml(newest.full_name || '—'), '', 'name', `最近创建：${fmtDate(newest.created_at)} · ${ageText(newest.age_days || 0)}前`]
    ];
    $('#statRow').innerHTML = cells.map(([k, v, u, cls, title]) =>
      `<div class="stat"><div class="k">${k}</div>` +
      `<div class="v${cls ? ' ' + cls : ''}"${title ? ` title="${title}"` : ''}>${v}${u ? ' <small>' + u + '</small>' : ''}</div></div>`).join('');
    $('#genAt').textContent = GEN_AT.replace('T', ' ').replace('Z', ' UTC');
    $('#genCount').textContent = nf(allRepos().length);
    const gn = $('#genNews'), gl = $('#genLeaders');
    if (gn) gn.textContent = nf(news.length);
    if (gl) gl.textContent = nf(LEADERS.length);
    const nav = $('#navNote');
    if (nav) nav.textContent = `快照：${GEN_AT.slice(0, 10)} · 今日 AI 动态 ${nf(newsToday)} 条`;
  }

  function renderLangOptions() {
    const counts = {};
    allRepos().forEach((r) => { counts[r.language] = (counts[r.language] || 0) + 1; });
    const langs = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    $('#langSel').innerHTML = '<option value="all">🌐 全部语言</option>' +
      langs.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)} (${counts[l]})</option>`).join('');
    $('#langSel').value = STATE.lang;

    const topics = {};
    allRepos().forEach((r) => (r.topics || []).forEach((t) => { topics[t] = (topics[t] || 0) + 1; }));
    const top = Object.keys(topics).sort((a, b) => topics[b] - topics[a]).slice(0, 120);
    let dl = document.getElementById('topicList');
    if (!dl) { dl = el('datalist'); dl.id = 'topicList'; document.body.appendChild(dl); }
    dl.innerHTML = top.map((t) => `<option value="${escapeHtml(t)}">`).join('');
    $('#search').setAttribute('list', 'topicList');
  }

  function badges(r) {
    const out = [];
    if (r.age_days <= 30) out.push('<span class="badge new">NEW</span>');
    if (r.stars_per_day >= 1000) out.push('<span class="badge hot">🔥 神速</span>');
    else if (r.stars_per_day >= 200) out.push('<span class="badge">🚀 高增速</span>');
    if ((NOW - Date.parse(r.pushed_at)) / 86400000 <= 7) out.push('<span class="badge">活跃</span>');
    return out.join(' ');
  }

  function card(r, i) {
    const rankCls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    const pct = Math.max(2, Math.round((r.stars / MAX_STARS) * 100));
    const topics = (r.topics || []).slice(0, 4).map((t) => `<span class="topic">${escapeHtml(t)}</span>`).join('');
    const node = el('article', 'card');
    node.innerHTML = `
      <div class="card-head">
        <div class="rank ${rankCls}">${i + 1}</div>
        <img class="avatar" loading="lazy" src="${escapeHtml(r.avatar || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div class="title-box">
          <div class="repo-name"><span class="owner">${escapeHtml(r.owner)}/</span>${escapeHtml(r.name)}</div>
          <div class="repo-meta">
            <span><span class="lang-dot" style="background:${langColor(r.language)}"></span> ${escapeHtml(r.language)}</span>
            <span>创建于 ${fmtDate(r.created_at)}</span>
            ${r.license ? `<span>${escapeHtml(r.license)}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="desc">${(r.description || r.description_zh)
        ? bi(r.description_zh, r.description, 'clamp2')
        : '（作者未填写项目描述）'}</p>
      <div class="topics">${topics} ${badges(r)}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="card-foot">
        <span class="metric">⭐ <b>${compact(r.stars)}</b></span>
        <span class="metric">📈 <b>${compact(Math.round(r.stars_per_day))}</b>/天</span>
        <span class="metric">🍴 <b>${compact(r.forks)}</b></span>
        <span class="metric">🕒 ${relTime(r.pushed_at)}</span>
        <span class="card-actions">
          <a class="btn sm ghost" href="${escapeHtml(r.url)}" target="_blank" rel="noopener" data-stop="1">GitHub ↗</a>
          <button class="btn sm" data-detail="1">详情</button>
        </span>
      </div>`;
    node.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-stop]')) return;
      openDetail(r);
    });
    return node;
  }

  function render() {
    const list = currentList();
    const grid = $('#grid');
    grid.className = 'grid' + (STATE.view === 'list' ? ' list' : '');
    const shown = list.slice(0, STATE.page * STATE.perPage);
    grid.innerHTML = '';
    if (!shown.length) {
      grid.appendChild(el('div', 'empty', '<div>🔍</div><div>没有符合条件的项目，试试放宽筛选条件</div>'));
    } else {
      const frag = document.createDocumentFragment();
      shown.forEach((r, i) => frag.appendChild(card(r, i)));
      grid.appendChild(frag);
    }
    $('#moreBtn').style.display = shown.length < list.length ? '' : 'none';
    $('#moreBtn').textContent = `加载更多项目 ↓（还有 ${nf(list.length - shown.length)} 个）`;
    const tabName = { stars: '星光总榜', growth: '增长最快', momentum: '当下最热', newcomers: '潜力新星' }[STATE.tab];
    $('#resultText').innerHTML = `共 <b>${nf(list.length)}</b> 个项目 · 当前 ${tabName} · 已展示 ${nf(shown.length)} 个`;
    $('#metricNote').textContent = 'ⓘ ' + TAB_DEFAULTS[STATE.tab].note;
    $('#sortSel').value = STATE.sort;
    document.querySelectorAll('#windowChips .chip').forEach((c) =>
      c.classList.toggle('active', c.dataset.window === STATE.window));
    document.querySelectorAll('#tabs .tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === STATE.tab));
  }

  /* ---------------- 详情弹窗 ---------------- */
  function statCell(k, v) { return `<div class="stat-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

  function openDetail(r) {
    const g = (p) => `https://github.com/${r.full_name}${p}`;
    const rm = READMES[r.full_name];
    const readmeHtml = rm && rm.text
      ? mdToHtml(rm.text)
      : '<div class="readme-empty">内嵌摘要暂缺，点击下方按钮可在线抓取 README。</div>';
    const topics = (r.topics || []).map((t) =>
      `<a class="topic" href="https://github.com/topics/${encodeURIComponent(t)}" target="_blank" rel="noopener">#${escapeHtml(t)}</a>`).join(' ');
    const pushedDays = Math.round((NOW - Date.parse(r.pushed_at)) / 86400000);

    $('#sheet').innerHTML = `
      <div class="sheet-head">
        <img class="avatar" src="${escapeHtml(r.avatar || '')}" alt="">
        <div style="min-width:0">
          <h2><span>${escapeHtml(r.owner)} /</span> ${escapeHtml(r.name)}</h2>
          <p>${(r.description || r.description_zh)
            ? bi(r.description_zh, r.description, 'clamp2')
            : '（作者未填写项目描述）'}</p>
          <div class="repo-meta" style="margin-top:8px">
            <span><span class="lang-dot" style="background:${langColor(r.language)}"></span> ${escapeHtml(r.language)}</span>
            <span>创建于 ${fmtDate(r.created_at)}（${ageText(r.age_days)}前）</span>
            <span>最近推送 ${relTime(r.pushed_at)}</span>
            ${r.license ? `<span>许可：${escapeHtml(r.license)}</span>` : ''}
            ${badges(r)}
          </div>
        </div>
        <button class="close-x" id="closeModal" title="关闭">✕</button>
      </div>
      <div class="sheet-body">
        <div class="stat-grid">
          ${statCell('⭐ Star 总数', nf(r.stars))}
          ${statCell('📈 日均增星', nf(Math.round(r.stars_per_day)))}
          ${statCell('🍴 Fork', nf(r.forks))}
          ${statCell('🐛 待解决 Issue', nf(r.issues))}
          ${statCell('👀 Watcher', compact(r.watchers))}
          ${statCell('🔥 热度指数', compact(Math.round(r.momentum)))}
          ${statCell('📅 项目年龄', ageText(r.age_days))}
          ${statCell('📦 仓库体积', sizeText(r.size_kb))}
          ${statCell('🌿 默认分支', escapeHtml(r.default_branch))}
          ${statCell('⏱ 距上次推送', nf(pushedDays) + ' 天')}
        </div>

        <div class="section">
          <h3>快捷跳转</h3>
          <div class="link-list">
            <a class="btn sm primary" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">📦 仓库主页</a>
            ${r.homepage ? `<a class="btn sm" href="${escapeHtml(r.homepage)}" target="_blank" rel="noopener">🌐 项目官网</a>` : ''}
            <a class="btn sm" href="${g('/stargazers')}" target="_blank" rel="noopener">⭐ Star 列表</a>
            <a class="btn sm" href="${g('/forks')}" target="_blank" rel="noopener">🍴 Fork 列表</a>
            <a class="btn sm" href="${g('/releases')}" target="_blank" rel="noopener">🏷 版本发布</a>
            <a class="btn sm" href="${g('/issues')}" target="_blank" rel="noopener">🐛 Issues</a>
            <a class="btn sm" href="${g('/pulls')}" target="_blank" rel="noopener">🔀 Pull Requests</a>
            <a class="btn sm" href="${g('/graphs/contributors')}" target="_blank" rel="noopener">👥 贡献者</a>
            <a class="btn sm" href="${g('/commits')}" target="_blank" rel="noopener">📝 提交历史</a>
            <a class="btn sm" href="${g('/actions')}" target="_blank" rel="noopener">⚙️ Actions</a>
            ${r.has_discussions ? `<a class="btn sm" href="${g('/discussions')}" target="_blank" rel="noopener">💬 Discussions</a>` : ''}
            ${r.has_pages ? `<a class="btn sm" href="https://${r.owner}.github.io/${r.name}/" target="_blank" rel="noopener">📄 GitHub Pages</a>` : ''}
            <button class="btn sm" id="copyClone">📋 复制 clone 命令</button>
            <a class="btn sm" href="https://github.com/${escapeHtml(r.owner)}" target="_blank" rel="noopener">👤 作者主页</a>
            <a class="btn sm" href="https://github.com/search?q=${encodeURIComponent(r.language + ' stars:>1000')}&type=repositories" target="_blank" rel="noopener">🔎 同语言高星项目</a>
          </div>
        </div>

        ${topics ? `<div class="section"><h3>主题标签</h3><div class="topics">${topics}</div></div>` : ''}

        <div class="section">
          <h3>Star 增长曲线（真实历史）</h3>
          <img class="chart-img" alt="Star 增长曲线"
               src="https://api.star-history.com/svg?repos=${encodeURIComponent(r.full_name)}&type=Date"
               onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=&quot;readme-empty&quot;>曲线服务暂不可用，可点击下方链接在新窗口查看。</div>')">
          <div class="link-list" style="margin-top:10px">
            <a class="btn sm" href="https://star-history.com/#${encodeURIComponent(r.full_name)}&Date" target="_blank" rel="noopener">📊 在 star-history.com 查看</a>
            <a class="btn sm" href="https://api.star-history.com/svg?repos=${encodeURIComponent(r.full_name)}&type=Date" target="_blank" rel="noopener">🖼 打开原始 SVG</a>
          </div>
        </div>

        <div class="section">
          <h3>README 摘要${rm ? `<span style="color:var(--text-mute);font-weight:400;font-size:12.5px">（${escapeHtml(rm.file)}）</span>` : ''}</h3>
          <div class="readme" id="readmeBox">${readmeHtml}</div>
          <div class="link-list" style="margin-top:10px">
            <button class="btn sm" id="fetchReadme">⬇️ 在线抓取完整 README</button>
            <button class="btn sm" id="translateReadme">🌐 这段翻成中文（浏览器本地翻译）</button>
            <a class="btn sm" href="https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(r.url)}" target="_blank" rel="noopener">🔗 用 Google 翻译打开仓库页</a>
            <a class="btn sm" href="${g('#readme')}" target="_blank" rel="noopener">📖 在 GitHub 阅读</a>
          </div>
        </div>
      </div>`;

    $('#modal').classList.add('open');
    document.body.style.overflow = 'hidden';

    $('#closeModal').onclick = closeDetail;
    const cc = $('#copyClone');
    if (cc) cc.onclick = () => {
      const cmd = `git clone ${r.url}.git`;
      (navigator.clipboard ? navigator.clipboard.writeText(cmd) : Promise.reject())
        .then(() => toast('已复制：' + cmd))
        .catch(() => toast(cmd, 6000));
    };
    const fr = $('#fetchReadme');
    if (fr) fr.onclick = () => fetchReadmeLive(r, fr);
    const trBtn = $('#translateReadme');
    if (trBtn) trBtn.onclick = () => translateReadmeOnDevice(trBtn);
  }

  function closeDetail() {
    $('#modal').classList.remove('open');
    document.body.style.overflow = '';
    $('#sheet').innerHTML = '';
  }

  async function fetchReadmeLive(r, btn) {
    const names = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README', 'docs/README.md'];
    btn.disabled = true;
    btn.textContent = '抓取中…';
    for (const n of names) {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${r.full_name}/HEAD/${n}`, { cache: 'no-store' });
        if (!res.ok) continue;
        const txt = await res.text();
        if (txt.length < 40) continue;
        const box = document.getElementById('readmeBox');
        if (box) box.innerHTML = mdToHtml(txt.slice(0, 30000));
        btn.textContent = '✅ 已抓取 ' + n;
        toast('README 抓取成功');
        return;
      } catch (e) { /* try next */ }
    }
    btn.disabled = false;
    btn.textContent = '⬇️ 在线抓取完整 README';
    toast('抓取失败：可能是网络受限或该仓库无 README');
  }

  /** 用浏览器内置翻译（Chrome 138+ 的 Translator API，端上运行、免费无限制）翻译 README */
  async function translateReadmeOnDevice(btn) {
    const box = document.getElementById('readmeBox');
    if (!box) return;
    if (box.dataset.translated === '1') {          // 再点一次还原英文
      box.innerHTML = box.dataset.original || box.innerHTML;
      box.dataset.translated = '0';
      btn.textContent = '🌐 这段翻成中文（浏览器本地翻译）';
      return;
    }
    const api = window.Translator || (window.translation && window.translation.Translator);
    if (!api || typeof api.create !== 'function') {
      toast('当前浏览器不支持本地翻译：请右键页面选「翻译成中文」，或点上面的 Google 翻译链接', 5200);
      return;
    }
    btn.disabled = true;
    btn.textContent = '翻译中…（首次需下载语言包）';
    try {
      if (typeof api.availability === 'function') {
        const st = await api.availability({ sourceLanguage: 'en', targetLanguage: 'zh' });
        if (st === 'unavailable') throw new Error('unavailable');
      }
      const translator = await api.create({
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        monitor(m) { m.addEventListener('downloadprogress', (e) => {
          if (e.total) btn.textContent = `下载语言包 ${Math.round((e.loaded / e.total) * 100)}%`;
        }); }
      });
      const chunks = (box.textContent || '').split(/\n+/).map((x) => x.trim()).filter((x) => x.length > 1);
      const out = [];
      for (const c of chunks.slice(0, 60)) out.push(await translator.translate(c));
      if (!out.length) throw new Error('empty');
      box.dataset.original = box.innerHTML;
      box.dataset.translated = '1';
      box.innerHTML = out.map((t) => `<p>${escapeHtml(t)}</p>`).join('') +
        '<p style="color:var(--text-mute);font-size:12px">（以上为浏览器本地翻译，再点按钮可切回英文原文）</p>';
      btn.textContent = '↩︎ 显示英文原文';
    } catch (e) {
      toast('本地翻译不可用（可能语言包未就绪）：可右键页面选「翻译成中文」，或用上面的 Google 翻译链接', 5200);
      btn.textContent = '🌐 这段翻成中文（浏览器本地翻译）';
    }
    btn.disabled = false;
  }

  /* ---------------- 实时刷新（GitHub Search API） ---------------- */
  // 时间窗按当前日期动态计算，避免写死日期导致“近 7 天”过期
  function daysAgo(n) {
    const d = new Date(Date.now() - n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const LIVE_QUERIES = [
    { tag: 'stars', q: 'stars:>30000', sort: 'stars' },
    { tag: 'active', q: `stars:>20000 pushed:>${daysAgo(7)}`, sort: 'stars' },
    { tag: '1y', q: `created:>${daysAgo(365)} stars:>800`, sort: 'stars' },
    { tag: '90d', q: `created:>${daysAgo(90)} stars:>150`, sort: 'stars' },
    { tag: '30d', q: `created:>${daysAgo(30)} stars:>40`, sort: 'stars' },
    { tag: '7d', q: `created:>${daysAgo(7)} stars:>8`, sort: 'stars' }
  ];

  function getToken() { try { return localStorage.getItem('gh_token') || ''; } catch (e) { return ''; } }

  async function liveRefresh() {
    const btn = $('#refreshBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">🔄</span> 拉取中…';
    const token = getToken();
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = 'Bearer ' + token;

    let merged = 0, failed = 0;
    const collected = [];
    for (const item of LIVE_QUERIES) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(item.q)}&sort=${item.sort}&order=desc&per_page=60`;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          failed++;
          if (res.status === 403 || res.status === 429) {
            toast('GitHub 限流了：未登录每小时仅 10 次搜索，稍后再试或先点“🔑 Token”填入令牌', 5200);
            break;
          }
          continue;
        }
        const data = await res.json();
        (data.items || []).forEach((it) => {
          if (it.fork || it.archived) return;
          collected.push({
            id: it.id, full_name: it.full_name, owner: it.owner.login, owner_type: it.owner.type,
            avatar: it.owner.avatar_url, name: it.name, url: it.html_url,
            homepage: (it.homepage || '').trim(), description: (it.description || '').slice(0, 400),
            stars: it.stargazers_count, forks: it.forks_count, issues: it.open_issues_count,
            watchers: it.subscribers_count || it.stargazers_count, language: it.language || 'Other',
            topics: (it.topics || []).slice(0, 12), license: (it.license && it.license.spdx_id) || '',
            created_at: it.created_at, pushed_at: it.pushed_at, updated_at: it.updated_at,
            default_branch: it.default_branch || 'main', size_kb: it.size || 0,
            has_pages: !!it.has_pages, has_discussions: !!it.has_discussions
          });
        });
      } catch (e) { failed++; }
      await new Promise((s) => setTimeout(s, 350));
    }

    if (collected.length) {
      const fresh = normalize(collected);
      const known = new Set(allRepos().map((r) => r.full_name));
      merged = fresh.filter((r) => !known.has(r.full_name)).length;
      STATE.extra = collected;
      REPOS = normalize(REPOS); // 保持内嵌数据
      MAX_STARS = allRepos().reduce((m, r) => Math.max(m, r.stars), 1);
      Object.assign(RAW, { generated_at: new Date().toISOString() });
      renderStats(); renderLangOptions(); render();
      toast(`实时数据已更新：抓取 ${collected.length} 条，其中 ${merged} 个新项目`);
    } else if (failed) {
      toast('实时刷新失败：网络或限流问题，页面仍使用内嵌快照数据', 4200);
    } else {
      toast('未获取到数据');
    }
    btn.disabled = false;
    btn.innerHTML = '🔄 刷新实时数据';
  }

  /* ---------------- 导出 ---------------- */
  function exportCsv() {
    const list = currentList();
    const head = ['rank', 'full_name', 'stars', 'stars_per_day', 'forks', 'open_issues', 'language', 'created_at', 'pushed_at', 'license', 'url', 'description'];
    const rows = list.map((r, i) => [i + 1, r.full_name, r.stars, Math.round(r.stars_per_day), r.forks, r.issues,
      r.language, fmtDate(r.created_at), fmtDate(r.pushed_at), r.license, r.url, (r.description || '').replace(/"/g, "'")]);
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `github-ranking-${STATE.tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`已导出 ${list.length} 条数据`);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      const d = TAB_DEFAULTS[b.dataset.tab];
      STATE.tab = b.dataset.tab;
      STATE.sort = d.sort; STATE.window = d.window; STATE.page = 1;
      render();
    });
    $('#windowChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      STATE.window = c.dataset.window; STATE.page = 1; render();
    });
    $('#langSel').addEventListener('change', (e) => { STATE.lang = e.target.value; STATE.page = 1; render(); });
    $('#sortSel').addEventListener('change', (e) => { STATE.sort = e.target.value; STATE.page = 1; render(); });
    let qt;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(qt);
      qt = setTimeout(() => { STATE.q = e.target.value; STATE.page = 1; render(); }, 160);
    });
    $('#moreBtn').addEventListener('click', () => { STATE.page++; render(); });
    $('#viewBtn').addEventListener('click', () => {
      STATE.view = STATE.view === 'grid' ? 'list' : 'grid';
      toast(STATE.view === 'list' ? '已切换为列表视图' : '已切换为卡片视图');
      render();
    });
    $('#resetBtn').addEventListener('click', () => {
      Object.assign(STATE, { tab: 'stars', window: 'all', lang: 'all', sort: 'stars', q: '', page: 1 });
      $('#search').value = ''; $('#langSel').value = 'all';
      render();
      toast('已重置筛选条件');
    });
    $('#refreshBtn').addEventListener('click', liveRefresh);
    $('#themeBtn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('gh_theme', next); } catch (e) {}
      $('#themeBtn').textContent = next === 'dark' ? '🌙 主题' : '☀️ 主题';
    });
    $('#tokenBtn').addEventListener('click', () => {
      const cur = getToken();
      const t = window.prompt('可选：粘贴 GitHub Personal Access Token（只需 public_repo 读权限）。\n令牌仅保存在本机 localStorage，用于把实时刷新额度从 10 次/小时提升到 30 次/分钟。\n留空并确定可清除已保存的令牌。', cur ? '已保存（重新粘贴可覆盖）' : '');
      if (t === null) return;
      try {
        if (!t.trim() || t.startsWith('已保存')) { if (!t.trim()) { localStorage.removeItem('gh_token'); toast('已清除 Token'); } return; }
        localStorage.setItem('gh_token', t.trim());
        toast('Token 已保存到本机');
      } catch (e) { toast('浏览器禁用了 localStorage，无法保存'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetail();
      if (e.key === '/' && document.activeElement !== $('#search')) { e.preventDefault(); $('#search').focus(); }
    });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeDetail(); });
    // 导出按钮（插入到 hero 操作区）
    const ex = el('button', 'btn sm', '💾 导出 CSV');
    ex.title = '把当前筛选结果导出为 CSV';
    ex.onclick = exportCsv;
    document.querySelector('.hero-actions').appendChild(ex);
  }

  /* ===========================================================
     AI 资讯（厂商动态）与 X 领军人物
     =========================================================== */
  let LIVE_NEWS = [];   // 在线刷新得到的动态

  const TAG_PATTERNS = [
    ['模型发布', /releas|launch|introduc|unveil|announc|unpack|available now|generally available|发布|推出|上线|新模型/i],
    ['开源', /open[- ]?sourc|open[- ]?weight|weights|github repo|apache 2|mit licen|开源/i],
    ['研究论文', /paper|research|study|benchmark|arxiv|evaluat|experiment|论文|研究|基准/i],
    ['产品功能', /api|feature|update|improv|roll ?out|integrat|sdk|tool|agent|plugin|功能|插件|升级/i],
    ['政策安全', /regulat|policy|law|safety|safeguard|ethic|ban|compliance|监管|政策|安全|合规/i],
    ['商业资本', /fund|raise|valuat|acquir|partner|invest|revenue|ipo|deal|融资|收购|合作|投资|估值/i],
    ['硬件算力', /chip|gpu|tpu|data ?cent|supercomput|silicon|算力|芯片|数据中心/i]
  ];
  function classifyText(title, summary) {
    const t = ((title || '') + ' ' + (summary || ''));
    for (const [tag, re] of TAG_PATTERNS) if (re.test(t)) return tag;
    return '其他';
  }

  function allNews() {
    const seen = new Set(), out = [];
    for (const it of LIVE_NEWS.concat(NEWS)) {
      const k = (it.url || it.title || '').replace(/\/+$/, '').toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    return out;
  }

  function tsOf(it) {
    if (it.ts) return it.ts;
    const p = Date.parse(it.published || '');
    return Number.isFinite(p) ? Math.floor(p / 1000) : 0;
  }

  /* ---------------- 每日速览 ---------------- */
  function digestItems(n) {
    const now = Date.now() / 1000;
    const pool = allNews()
      .filter((it) => { const t = tsOf(it); return t && now - t < 8 * 86400; })
      .sort((a, b) => tsOf(b) - tsOf(a));
    const out = [], used = {};
    // 先保证“厂商官方”有代表，再用中文/研究补足，最后按时间填满
    const take = (pred, limit) => {
      for (const it of pool) {
        if (out.length >= n || limit <= 0) return;
        if (!pred(it) || out.indexOf(it) >= 0) continue;
        const c = used[it.source_id] || 0;
        if (c >= 1) continue;                 // 同一来源先只取 1 条，保证多样性
        used[it.source_id] = c + 1;
        out.push(it);
        limit--;
      }
    };
    take((it) => it.group === '厂商', 4);
    take((it) => it.group === '中文' || it.group === '研究', 2);
    take(() => true, n);
    return out.sort((a, b) => tsOf(b) - tsOf(a));   // 展示时仍按时间倒序
  }

  function renderDigest() {
    const box = $('#digestList');
    if (!box) return;
    const now = Date.now() / 1000;
    const items = digestItems(9);
    const all = allNews();
    const today = all.filter((i) => { const t = tsOf(i); return t && now - t < 86400; }).length;
    const week = all.filter((i) => { const t = tsOf(i); return t && now - t < 7 * 86400; }).length;
    const srcOk = new Set(all.map((i) => i.source_id)).size;
    $('#digestSub').innerHTML =
      `近 24 小时 <b>${nf(today)}</b> 条 · 近 7 天 <b>${nf(week)}</b> 条 · 覆盖 <b>${nf(srcOk)}</b> 个信息源 ` +
      `<span style="color:var(--text-mute)">（快照 ${(NEWS_META.generated_at || GEN_AT).slice(0, 16).replace('T', ' ')} UTC）</span>`;
    box.innerHTML = items.map((it) => {
      const t = tsOf(it);
      return `<a class="digi" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">
        <div class="digi-top">
          <span class="pill src">${escapeHtml(it.source)}</span>
          <span class="pill tag">${escapeHtml(it.tag || '其他')}</span>
          ${t && now - t < 86400 ? '<span class="pill hot">NEW</span>' : ''}
          <span class="pill time">${relTime(it.published)}</span>
        </div>
        <div class="digi-title">${bi(it.title_zh, it.title)}</div>
        ${(it.summary_zh || it.summary) ? `<div class="digi-sum">${bi(it.summary_zh, it.summary, 'clamp2')}</div>` : ''}
      </a>`;
    }).join('') || '<div class="empty"><div>📭</div><div>暂无动态</div></div>';
  }

  /* ---------------- 动态列表 ---------------- */
  const NEWS_STATE = { group: '厂商', source: 'all', tag: 'all', days: 7, q: '', page: 1, perPage: 20 };

  function filterNews() {
    const now = Date.now() / 1000;
    const terms = NEWS_STATE.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return allNews().filter((it) => {
      if (NEWS_STATE.group !== 'all' && it.group !== NEWS_STATE.group) return false;
      if (NEWS_STATE.source !== 'all' && it.source_id !== NEWS_STATE.source) return false;
      if (NEWS_STATE.tag !== 'all' && (it.tag || '其他') !== NEWS_STATE.tag) return false;
      if (NEWS_STATE.days) {
        const t = tsOf(it);
        if (!t || now - t > NEWS_STATE.days * 86400) return false;
      }
      if (terms.length) {
        const hay = (it.title + ' ' + (it.summary || '') + ' ' + it.source).toLowerCase();
        if (!terms.every((x) => hay.includes(x))) return false;
      }
      return true;
    }).sort((a, b) => tsOf(b) - tsOf(a));
  }

  function renderNewsFilters() {
    const all = allNews();
    const inGroup = NEWS_STATE.group === 'all' ? all : all.filter((i) => i.group === NEWS_STATE.group);
    const counts = {};
    inGroup.forEach((i) => { counts[i.source_id] = (counts[i.source_id] || 0) + 1; });
    const opts = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const nameOf = (id) => (inGroup.find((i) => i.source_id === id) || {}).source || id;
    $('#newsSourceSel').innerHTML = '<option value="all">📡 全部来源</option>' +
      opts.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(nameOf(id))} (${counts[id]})</option>`).join('');
    if (opts.indexOf(NEWS_STATE.source) < 0) NEWS_STATE.source = 'all';
    $('#newsSourceSel').value = NEWS_STATE.source;

    const tags = {};
    all.forEach((i) => { const t = i.tag || '其他'; tags[t] = (tags[t] || 0) + 1; });
    const tagList = Object.keys(tags).sort((a, b) => tags[b] - tags[a]);
    $('#newsTagSel').innerHTML = '<option value="all">🏷 全部类型</option>' +
      tagList.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${tags[t]})</option>`).join('');
    $('#newsTagSel').value = NEWS_STATE.tag;
  }

  function newsDayLabel(ts) {
    if (!ts) return '日期未知';
    const d = new Date(ts * 1000), now = new Date(), y = new Date(Date.now() - 86400000);
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, now)) return '今天 · ' + md;
    if (same(d, y)) return '昨天 · ' + md;
    return md + (d.getFullYear() !== now.getFullYear() ? ' · ' + d.getFullYear() : '');
  }

  function renderNews() {
    const list = filterNews();
    const shown = list.slice(0, NEWS_STATE.page * NEWS_STATE.perPage);
    const box = $('#newsList');
    const now = Date.now() / 1000;
    let html = '', lastDay = '';
    shown.forEach((it) => {
      const t = tsOf(it);
      const day = t ? new Date(t * 1000).toDateString() : 'unknown';
      if (day !== lastDay) {
        lastDay = day;
        const cnt = shown.filter((x) => (tsOf(x) ? new Date(tsOf(x) * 1000).toDateString() : 'unknown') === day).length;
        html += `<div class="daysep">${escapeHtml(newsDayLabel(t))}<span class="cnt">${cnt} 条</span></div>`;
      }
      const hhmm = t ? new Date(t * 1000).toTimeString().slice(0, 5) : '—';
      html += `<article class="news">
        <div class="news-time">${hhmm}</div>
        <div class="news-body">
          <a class="news-title" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">${bi(it.title_zh, it.title)}</a>
          ${(it.summary_zh || it.summary) ? `<p class="news-sum">${bi(it.summary_zh, it.summary, 'clamp2')}</p>` : ''}
          <div class="news-meta">
            <span class="pill src">${escapeHtml(it.source)}</span>
            <span class="pill tag">${escapeHtml(it.tag || '其他')}</span>
            ${it.stale ? '<span class="pill time">较早发布</span>' : ''}
            ${it.undated ? '<span class="pill time">源未提供日期</span>' : ''}
            ${it.live ? '<span class="pill hot">本次刷新</span>' : ''}
            <span class="pill time">${t && now - t < 86400 ? '24 小时内' : relTime(it.published)}</span>
          </div>
        </div>
        <a class="btn sm news-go" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">原文 ↗</a>
      </article>`;
    });
    box.innerHTML = html || '<div class="empty"><div>🔍</div><div>没有符合条件的动态，试试放宽来源或时间范围</div></div>';
    $('#newsMore').style.display = shown.length < list.length ? '' : 'none';
    $('#newsMore').textContent = `加载更多动态 ↓（还有 ${nf(list.length - shown.length)} 条）`;
    $('#newsCount').innerHTML = `共 <b>${nf(list.length)}</b> 条动态 · 已展示 ${nf(shown.length)} 条 · ` +
      `来源「${escapeHtml(NEWS_STATE.group === 'all' ? '全部' : NEWS_STATE.group)}」· 时间「${
        { 1: '近 24 小时', 3: '近 3 天', 7: '近 7 天', 30: '近 30 天', 0: '全部' }[NEWS_STATE.days]}」`;
  }

  function exportNewsCsv() {
    const list = filterNews();
    const head = ['published', 'source', 'group', 'tag', 'title', 'summary', 'url'];
    const rows = list.map((i) => [i.published || '', i.source, i.group, i.tag || '', i.title,
      (i.summary || '').replace(/"/g, "'"), i.url]);
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `ai-news-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`已导出 ${list.length} 条 AI 动态`);
  }

  /* ---------------- 在线刷新动态（尽力而为） ---------------- */
  const LIVE_FEEDS = [
    ['openai', 'OpenAI', 'https://openai.com/news/rss.xml'],
    ['google-ai', 'Google AI', 'https://blog.google/technology/ai/rss/'],
    ['huggingface', 'Hugging Face', 'https://huggingface.co/blog/feed.xml'],
    ['nvidia', 'NVIDIA', 'https://blogs.nvidia.com/feed/'],
    ['langchain', 'LangChain', 'https://www.langchain.com/blog/rss.xml'],
    ['techcrunch', 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'],
    ['decoder', 'The Decoder', 'https://the-decoder.com/feed/'],
    ['qbitai', '量子位', 'https://www.qbitai.com/feed']
  ];

  async function onlineRefreshNews() {
    const btn = $('#digestRefresh');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">🔄</span> 拉取中…';
    const out = [];
    let ok = 0, failed = 0;
    for (const [id, name, url] of LIVE_FEEDS) {
      try {
        const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url));
        const data = await res.json();
        if (data.status !== 'ok' || !Array.isArray(data.items)) { failed++; continue; }
        ok++;
        data.items.slice(0, 10).forEach((it) => {
          const title = String(it.title || '').trim();
          if (!title) return;
          const summary = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 320);
          const pub = it.pubDate ? new Date(it.pubDate.replace(' ', 'T') + 'Z') : null;
          out.push({
            title, url: it.link || '', source: name, source_id: id, group: '厂商',
            lang: 'en', published: pub && !isNaN(pub) ? pub.toISOString() : '',
            ts: pub && !isNaN(pub) ? Math.floor(pub.getTime() / 1000) : 0,
            summary, tag: classifyText(title, summary), live: true
          });
        });
      } catch (e) { failed++; }
      await new Promise((s) => setTimeout(s, 200));
    }
    btn.disabled = false;
    btn.innerHTML = '🔄 在线刷新动态';
    if (!out.length) {
      toast('在线刷新失败：浏览器跨域限制或服务不可用，已保留本地快照', 4200);
      return;
    }
    LIVE_NEWS = out;
    renderDigest();
    renderNewsFilters();
    renderNews();
    renderStats();
    toast(`在线刷新成功：${ok} 个源、${out.length} 条动态（含 ${LIVE_NEWS.length} 条最新）`);
  }

  /* ---------------- X 领军人物 ---------------- */
  const LEADER_STATE = { q: '', sort: 'followers', kind: 'all', page: 1, perPage: 12 };

  function relatedNews(leader, limit) {
    const keys = (leader.keywords || []).map((k) => k.toLowerCase());
    if (!keys.length) return [];
    const scored = [];
    for (const it of allNews()) {
      const title = (it.title || '').toLowerCase();
      const body = (title + ' ' + (it.summary || '')).toLowerCase();
      let score = 0;
      for (const k of keys) {
        if (title.indexOf(k) >= 0) score = Math.max(score, 2);      // 标题命中优先级最高
        else if (body.indexOf(k) >= 0) score = Math.max(score, 1);  // 仅摘要命中次之
      }
      if (score) scored.push({ it, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || tsOf(b.it) - tsOf(a.it))
      .slice(0, limit || 3)
      .map((x) => x.it);
  }

  function renderLeaders() {
    const q = LEADER_STATE.q.trim().toLowerCase();
    let list = LEADERS.map((l) => ({ l, rel: relatedNews(l, 3) }));
    if (LEADER_STATE.kind !== 'all') {
      list = list.filter(({ l }) => (l.kind || 'person') === LEADER_STATE.kind);
    }
    if (q) {
      list = list.filter(({ l }) =>
        (l.name + ' ' + l.handle + ' ' + (l.role || '') + ' ' + (l.keywords || []).join(' ')).toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (LEADER_STATE.sort === 'news') return b.rel.length - a.rel.length || b.l.followers - a.l.followers;
      if (LEADER_STATE.sort === 'name') return String(a.l.name).localeCompare(String(b.l.name), 'zh');
      return (b.l.followers || 0) - (a.l.followers || 0);
    });

    const noteEl = $('#xNote');
    if (noteEl) {
      noteEl.innerHTML = 'ⓘ ' + escapeHtml(LEADER_META.note || '') +
        ' 卡片里的头像 / 粉丝数 / 简介是公开数据快照；点「载入最新推文」会在浏览器内向 X 请求官方时间线（无需登录），' +
        '受 X 限流影响可能返回空白，此时请用「打开 X 主页」；「相关报道」由下方动态库按关键词自动匹配。';
    }
    const shownList = list.slice(0, LEADER_STATE.page * LEADER_STATE.perPage);
    const persons = LEADERS.filter((l) => (l.kind || 'person') === 'person').length;
    const orgs = LEADERS.length - persons;
    $('#xSub').innerHTML = `共 <b>${nf(LEADERS.length)}</b> 个账号（人物 ${nf(persons)} · 官方 ${nf(orgs)}） · ` +
      `当前展示 <b>${nf(shownList.length)}</b>/${nf(list.length)} · 总粉丝 <b>${compact(LEADERS.reduce((s, l) => s + (l.followers || 0), 0))}</b>`;
    $('#leaderList').innerHTML = shownList.map(({ l, rel }) => {
      const initial = escapeHtml((l.name || l.handle || 'X').slice(0, 1).toUpperCase());
      const tweets = (l.tweets || []).length
        ? `<div class="leader-sec-title">最新推文（${l.tweets.length} 条快照）</div>` + l.tweets.slice(0, 3).map((t) => {
            const bits = [];
            if (t.created_at) bits.push(escapeHtml(String(t.created_at).slice(0, 10)));
            if (t.likes) bits.push('♥ ' + compact(t.likes));
            if (t.retweets) bits.push('🔁 ' + compact(t.retweets));
            bits.push(`<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">查看原推 ↗</a>`);
            return `<div class="tweet">${escapeHtml(t.text)}<div class="tweet-meta">${bits.join(' · ')}</div></div>`;
          }).join('')
        : '';
      const related = rel.length
        ? `<div class="leader-sec-title">相关报道</div><ul class="related">${rel.map((n) =>
            `<li><span class="pill src">${escapeHtml(n.source)}</span><a href="${escapeHtml(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></li>`).join('')}</ul>`
        : '<div class="related" style="color:var(--text-mute);font-size:12.5px">近期动态中暂未匹配到相关报道</div>';
      return `<article class="leader" data-handle="${escapeHtml(l.handle)}">
        <div class="leader-head">
          <div class="leader-av"><span>${initial}</span>
            <img loading="lazy" src="${escapeHtml(l.avatar || '')}" alt="" onerror="this.style.display='none'">
          </div>
          <div class="leader-id">
            <div class="leader-name">${escapeHtml(l.name)} <span class="vf" title="公开资料快照">✔︎</span>
              ${(l.kind === 'org') ? '<span class="pill org">官方</span>' : ''}</div>
            <div class="leader-handle">@${escapeHtml(l.handle)}${l.location ? ' · ' + escapeHtml(l.location) : ''}</div>
            <div class="leader-role">${escapeHtml(l.role || '')}</div>
          </div>
        </div>
        <div class="leader-stats">
          <span>👥 <b>${compact(l.followers)}</b> 粉丝</span>
          <span>📝 <b>${compact(l.tweets_count || 0)}</b> 推文</span>
          <span>📰 <b>${rel.length}</b> 条相关报道</span>
        </div>
        ${(l.bio || l.bio_zh) ? `<p class="leader-bio">${bi(l.bio_zh, l.bio, 'clamp2')}</p>` : ''}
        <div class="leader-actions">
          <a class="btn sm primary" href="https://x.com/${escapeHtml(l.handle)}" target="_blank" rel="noopener">🐦 打开 X 主页</a>
          <button class="btn sm" data-load-timeline="${escapeHtml(l.handle)}">⬇️ 载入最新推文</button>
          <a class="btn sm" href="https://x.com/search?q=${encodeURIComponent('from:' + l.handle)}&f=live" target="_blank" rel="noopener">🔎 在 X 搜索</a>
          <a class="btn sm" href="https://x.com/intent/follow?screen_name=${encodeURIComponent(l.handle)}" target="_blank" rel="noopener">➕ 关注</a>
        </div>
        <div class="xframe-host" data-host="${escapeHtml(l.handle)}"></div>
        ${tweets}
        ${related}
      </article>`;
    }).join('') || '<div class="empty"><div>🔍</div><div>没有匹配的人物</div></div>';

    const moreBtn = $('#xMore');
    if (moreBtn) {
      moreBtn.style.display = shownList.length < list.length ? '' : 'none';
      moreBtn.textContent = `加载更多账号 ↓（还有 ${nf(list.length - shownList.length)} 个）`;
    }
    $('#leaderList').querySelectorAll('[data-load-timeline]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const handle = btn.getAttribute('data-load-timeline');
        const host = btn.closest('.leader').querySelector('.xframe-host');
        loadTimeline(handle, host, btn);
      });
    });
  }

  let twttrPromise = null;
  function loadTwitterWidgets() {
    if (window.twttr && window.twttr.widgets) return Promise.resolve(true);
    if (twttrPromise) return twttrPromise;
    twttrPromise = new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      const s = document.createElement('script');
      s.src = 'https://platform.twitter.com/widgets.js';
      s.async = true;
      s.charset = 'utf-8';
      s.onload = () => finish(!!(window.twttr && window.twttr.widgets));
      s.onerror = () => finish(false);
      (document.head || document.body).appendChild(s);
      setTimeout(() => finish(!!(window.twttr && window.twttr.widgets)), 9000);
    });
    return twttrPromise;
  }

  function loadTimeline(handle, host, btn) {
    if (!host) return;
    btn.disabled = true;
    btn.textContent = '载入中…';
    host.innerHTML = '<div class="readme-empty" style="padding:10px 0">正在向 X 请求时间线…若长时间空白，说明被 X 限流或网络不可达，请点「打开 X 主页」。</div>';
    const anchor = document.createElement('a');
    anchor.className = 'twitter-timeline';
    anchor.setAttribute('data-height', '460');
    anchor.setAttribute('data-dnt', 'true');
    anchor.setAttribute('data-chrome', 'noheader nofooter');
    anchor.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'dark');
    anchor.href = 'https://twitter.com/' + handle;
    anchor.textContent = 'Tweets by @' + handle;
    host.appendChild(anchor);
    loadTwitterWidgets().then((ok) => {
      btn.disabled = false;
      if (ok && window.twttr && window.twttr.widgets) {
        try { window.twttr.widgets.load(host); } catch (e) { /* 忽略 */ }
        btn.textContent = '✅ 已请求时间线';
      } else {
        host.innerHTML = '';
        const f = document.createElement('iframe');
        f.setAttribute('loading', 'lazy');
        f.setAttribute('title', '@' + handle + ' 的时间线');
        f.src = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/' + encodeURIComponent(handle) + '?showReplies=false';
        host.appendChild(f);
        const tip = el('div', 'readme-empty', '官方嵌入组件不可用，已改用备用时间线地址；若仍空白请直接打开 X 主页。');
        tip.style.padding = '8px 0';
        host.appendChild(tip);
        btn.textContent = '↻ 重新载入';
        toast('官方嵌入组件加载失败，已切换备用方式', 3600);
      }
    });
  }

  /* ---------------- AI 术语表 ---------------- */
  const GLOSS_STATE = { q: '', group: 'all' };

  function glossHits(term) {
    // 术语在动态库中出现的次数（用英文术语的主干部分匹配）
    const key = String(term).split(' (')[0].split(' / ')[0].trim().toLowerCase();
    if (key.length < 3) return 0;
    return allNews().filter((i) => ((i.title || '') + ' ' + (i.summary || '')).toLowerCase().indexOf(key) >= 0).length;
  }

  function renderGlossary() {
    if (!GLOSSARY.length) return;
    const groups = [];
    GLOSSARY.forEach((t) => { if (groups.indexOf(t.group) < 0) groups.push(t.group); });
    const chips = $('#glossGroupChips');
    if (chips && !chips.dataset.done) {
      chips.innerHTML = '<button class="chip active" data-group="all">全部</button>' +
        groups.map((g) => `<button class="chip" data-group="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('');
      chips.dataset.done = '1';
    }

    const q = GLOSS_STATE.q.trim().toLowerCase();
    const list = GLOSSARY.filter((t) => {
      if (GLOSS_STATE.group !== 'all' && t.group !== GLOSS_STATE.group) return false;
      if (!q) return true;
      return (t.term + ' ' + t.zh + ' ' + t.desc).toLowerCase().indexOf(q) >= 0;
    });
    const hits = list.map((t) => glossHits(t.term));
    const total = hits.reduce((a, b) => a + b, 0);
    $('#glossSub').innerHTML = `共 <b>${nf(GLOSSARY.length)}</b> 条常用术语 · 当前展示 <b>${nf(list.length)}</b> 条 · ` +
      `在动态库中累计命中 <b>${nf(total)}</b> 次`;
    $('#glossList').innerHTML = list.map((t, i) => {
      const n = hits[i];
      return `<article class="gloss">
        <div class="gloss-top">
          <span class="gloss-en">${escapeHtml(t.term)}</span>
          <span class="gloss-zh">${escapeHtml(t.zh)}</span>
        </div>
        <div class="gloss-desc">${escapeHtml(t.desc)}</div>
        <div class="gloss-meta">
          <span class="pill time">${escapeHtml(t.group)}</span>
          ${n ? `<span class="pill src">动态中出现 ${n} 次</span>` : '<span class="pill time">今日未见</span>'}
        </div>
      </article>`;
    }).join('') || '<div class="empty"><div>🔍</div><div>没有匹配的术语</div></div>';
  }

  /* ---------------- 板块导航 ---------------- */
  function initSectionNav() {
    const links = Array.prototype.slice.call(document.querySelectorAll('.secnav-link'));
    if (!links.length || typeof IntersectionObserver !== 'function') return;
    const map = {};
    links.forEach((a) => { map[a.getAttribute('href').slice(1)] = a; });
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((l) => l.classList.remove('active'));
        const a = map[en.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-70px 0px -60% 0px', threshold: 0 });
    Object.keys(map).forEach((id) => {
      const sec = document.getElementById(id);
      if (sec) obs.observe(sec);
    });
  }

  /* ---------------- 新板块事件绑定 ---------------- */
  function bindSections() {
    $('#newsGroupChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      NEWS_STATE.group = c.dataset.group;
      NEWS_STATE.page = 1;
      NEWS_STATE.source = 'all';                    // 切换分组时重置来源，避免空结果
      renderNewsFilters();
      renderNews();
    });
    $('#newsTimeChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      NEWS_STATE.days = Number(c.dataset.win);
      NEWS_STATE.page = 1;
      renderNews();
    });
    $('#newsSourceSel').addEventListener('change', (e) => { NEWS_STATE.source = e.target.value; NEWS_STATE.page = 1; renderNews(); });
    $('#newsTagSel').addEventListener('change', (e) => { NEWS_STATE.tag = e.target.value; NEWS_STATE.page = 1; renderNews(); });
    let nt;
    $('#newsSearch').addEventListener('input', (e) => {
      clearTimeout(nt);
      nt = setTimeout(() => { NEWS_STATE.q = e.target.value; NEWS_STATE.page = 1; renderNews(); }, 160);
    });
    $('#newsMore').addEventListener('click', () => { NEWS_STATE.page++; renderNews(); });
    $('#newsExport').addEventListener('click', exportNewsCsv);
    $('#digestRefresh').addEventListener('click', onlineRefreshNews);
    let xt;
    $('#xSearch').addEventListener('input', (e) => {
      clearTimeout(xt);
      xt = setTimeout(() => { LEADER_STATE.q = e.target.value; renderLeaders(); }, 160);
    });
    $('#xSortSel').addEventListener('change', (e) => { LEADER_STATE.sort = e.target.value; renderLeaders(); });
    $('#xKindChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      LEADER_STATE.kind = c.dataset.kind;
      LEADER_STATE.page = 1;
      renderLeaders();
    });
    const xMore = $('#xMore');
    if (xMore) xMore.addEventListener('click', () => { LEADER_STATE.page++; renderLeaders(); });

    // 中英显示模式：切换后重绘所有含对照文案的区域
    $('#langChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      setLangMode(c.dataset.lang);
      document.querySelectorAll('#langChips .chip').forEach((x) =>
        x.classList.toggle('active', x.dataset.lang === LANG_MODE));
      renderAll();
      toast({ zh: '只显示中文', both: '中英对照（推荐，方便学词汇）', en: '只显示英文' }[LANG_MODE]);
    });

    // 术语表
    const glossChips = $('#glossGroupChips');
    if (glossChips) {
      glossChips.addEventListener('click', (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        GLOSS_STATE.group = c.dataset.group;
        glossChips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.dataset.group === GLOSS_STATE.group));
        renderGlossary();
      });
    }
    let gt;
    const gs = $('#glossSearch');
    if (gs) {
      gs.addEventListener('input', (e) => {
        clearTimeout(gt);
        gt = setTimeout(() => { GLOSS_STATE.q = e.target.value; renderGlossary(); }, 150);
      });
    }
  }

  /** 语言模式变化时重绘所有板块 */
  function renderAll() {
    renderStats();
    render();
    renderDigest();
    renderNews();
    renderLeaders();
    renderGlossary();
  }

  /* ===========================================================
     启动
     =========================================================== */
  try {
    const saved = localStorage.getItem('gh_theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      $('#themeBtn').textContent = saved === 'dark' ? '🌙 主题' : '☀️ 主题';
    }
  } catch (e) {}

  renderStats();
  renderLangOptions();
  render();
  bind();
  renderDigest();
  renderNewsFilters();
  renderNews();
  renderLeaders();
  renderGlossary();
  bindSections();
  initSectionNav();
  document.querySelectorAll('#langChips .chip').forEach((x) =>
    x.classList.toggle('active', x.dataset.lang === LANG_MODE));
  // 调试 / 自动化钩子（只读，供自测脚本使用）
  window.__GH_BOARD__ = {
    state: STATE, allRepos, currentList, windowDays: WINDOW_DAYS,
    news: { state: NEWS_STATE, all: allNews, list: filterNews, digest: digestItems },
    leaders: { state: LEADER_STATE, all: () => LEADERS, related: relatedNews, loadTimeline },
    lang: { get: () => LANG_MODE, set: setLangMode, bi },
    glossary: { state: GLOSS_STATE, all: () => GLOSSARY, hits: glossHits },
    translateReadme: translateReadmeOnDevice
  };
  console.log('[GitHub 风云榜] 内嵌项目数：', REPOS.length, '· 生成时间：', GEN_AT);
})();
