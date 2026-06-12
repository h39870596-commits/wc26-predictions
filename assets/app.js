/* WC26 AI 数据分析 · 渲染层(全部脚本外置,配合 CSP 禁止内联脚本) */
'use strict';

/* ---- 防点击劫持(GitHub Pages 无法设置 frame-ancestors 响应头,用脚本兜底) ---- */
try { if (window.top !== window.self) window.top.location = window.self.location; } catch (e) {}

/* ================= 站点配置(接入统计/反馈时只改这里) =================
   goatcounter   : GoatCounter 站点代码(https://www.goatcounter.com 注册,如 'wc26' → wc26.goatcounter.com)
   baiduTongji   : 百度统计代码(https://tongji.baidu.com 注册,hm.js? 后面那串 32 位 ID)
   feedbackEndpoint: Formspree 等表单服务的提交地址(如 'https://formspree.io/f/xxxxxxx'),配置后反馈弹窗出现「直接提交」
   feedbackEmail : 接收 BUG 反馈的邮箱(换域名/邮箱别名后改这里) */
const SITE_CONFIG = {
  goatcounter: '',
  baiduTongji: '',
  feedbackEndpoint: '',
  feedbackEmail: 'h39870596@gmail.com',
};

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const T = n => WC.teams[n] || {};
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : '#';
const storeGet = k => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
const storeSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) {} };
const storeDel = k => { try { window.localStorage.removeItem(k); } catch (e) {} };

/* legacy demo key → season */
if (storeGet('wc26_unlocked') === '1') { storeSet('wc26_season', '1'); storeDel('wc26_unlocked'); }

const state = {
  lang: storeGet('wc26_lang') || ((navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'),
  view: 'today',
  paySel: 'season',
  payBusy: false,
};
const L = (zh, en) => state.lang === 'zh' ? zh : en;
const tn = n => state.lang === 'zh' ? (T(n).zh || n) : n;
const fl = n => esc(T(n).flag || '');
const fmtD = d => d.slice(5).replace('-', '.');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dLong = d => { const m = +d.slice(5, 7), dd = +d.slice(8, 10); return state.lang === 'zh' ? (m + ' 月 ' + dd + ' 日') : (MON[m - 1] + ' ' + dd); };
const CITY_ZH = {'Mexico City':'墨西哥城','Guadalajara':'瓜达拉哈拉','Zapopan':'瓜达拉哈拉','Monterrey':'蒙特雷','Guadalupe (Monterrey)':'蒙特雷','Atlanta':'亚特兰大','Toronto':'多伦多','Toronto, Canada':'多伦多','Vancouver':'温哥华','Seattle':'西雅图','Santa Clara':'旧金山湾区','San Francisco Bay':'旧金山湾区','Inglewood':'洛杉矶','Inglewood (Los Angeles), USA':'洛杉矶','Los Angeles':'洛杉矶','East Rutherford':'纽约/新泽西','New York/New Jersey':'纽约/新泽西','Foxborough':'波士顿','Boston':'波士顿','Philadelphia':'费城','Houston':'休斯敦','Arlington':'达拉斯','Dallas':'达拉斯','Miami Gardens':'迈阿密','Miami':'迈阿密','Kansas City':'堪萨斯城'};
const CITY_EN = {'Zapopan':'Guadalajara','Guadalupe (Monterrey)':'Monterrey','Toronto, Canada':'Toronto','Inglewood':'Los Angeles','Inglewood (Los Angeles), USA':'Los Angeles','East Rutherford':'New York/New Jersey','Foxborough':'Boston','Santa Clara':'SF Bay Area','San Francisco Bay':'SF Bay Area','Miami Gardens':'Miami','Arlington':'Dallas'};
const city = c => state.lang === 'zh' ? (CITY_ZH[c] || c) : (CITY_EN[c] || c);
const GC = ['var(--mx)','var(--us)','var(--ca)'];
const DIM_Z = ['实力','状态','阵容','底蕴','环境'];
const DIM_E = ['Strength','Form','Squad','Pedigree','Env'];
const DIM_S = ['STR','FRM','SQD','PED','ENV'];
/* flags for historical nations (incl. teams not in WC26) */
const XFLAG = {'Brazil':'🇧🇷','Germany':'🇩🇪','West Germany':'🇩🇪','Italy':'🇮🇹','Argentina':'🇦🇷','Uruguay':'🇺🇾','France':'🇫🇷','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Spain':'🇪🇸','Netherlands':'🇳🇱','Hungary':'🇭🇺','Sweden':'🇸🇪','Croatia':'🇭🇷','Czechoslovakia':'🇨🇿','Poland':'🇵🇱','Portugal':'🇵🇹'};
const xfl = n => { n = String(n || ''); return XFLAG[n] || XFLAG[n.split('(')[0].trim()] || esc(T(n).flag || ''); };
const vEn = s => {
  if (!s) return s;
  let m = /€([\d.]+)亿/.exec(s);
  if (m) return '€' + (parseFloat(m[1]) * 100).toFixed(1).replace(/\.0$/, '') + 'M';
  m = /€([\d.]+)万/.exec(s);
  if (m) return '€' + (parseFloat(m[1]) / 100).toFixed(1).replace(/\.0$/, '') + 'M';
  return s;
};
const kickEn = s => s ? s.replace('当地', 'Local').replace(/\s*·?\s*北京时间/, ' · Beijing ').replace(/(\d{1,2})月(\d{1,2})日/g, (_, a, b) => MON[+a - 1] + ' ' + b) : '';
const P = (WC.pay && WC.pay.products) || { day: { price: '¥9.9' }, season: { price: '¥98' } };

const ent = () => storeGet('wc26_season') === '1' ? 'season'
  : (WC.today && storeGet('wc26_day') === WC.today.date ? 'day' : null);

const played = WC.schedule.filter(m => m.actual);

/* ================= chrome (hero/tabs/notice/footer) ================= */
function renderChrome() {
  document.documentElement.lang = L('zh-CN', 'en');
  document.title = L('WC26 AI 数据分析 · 2026世界杯 AI 大数据预测与赛事数据分析', 'WC26 AI Analytics · 2026 World Cup AI predictions & data analysis');
  const md = $('#metaDesc');
  if (md) md.content = L('WC26 AI 数据分析:基于人工智能与大数据的 2026 美加墨世界杯赛事数据分析平台。AI 五维建模、球队实力评分、历史数据统计、比赛复盘与专家观点,全部结论来源可溯。非博彩网站,不提供任何投注功能。',
    'WC26 AI Analytics: an AI & big-data analytics platform for the 2026 FIFA World Cup. Five-dimension team modelling, power ratings, historical stats, match recaps and expert views — fully sourced. Not a betting site.');
  $('#kicker').textContent = 'FIFA WORLD CUP 26™ · ' + L('美国 / 加拿大 / 墨西哥', 'USA / CANADA / MEXICO');
  $('#langBtn').textContent = state.lang === 'zh' ? 'EN' : '中文';
  $('#h1t').innerHTML = 'WC26 <span class="y">' + L('AI 数据分析', 'AI Analytics') + '</span>';
  $('#heroSub').textContent = L('人工智能 × 大数据驱动的世界杯赛事数据分析平台:多智能体联网调研、多源事实核查,全部结论可溯源。',
    'An AI & big-data World Cup analytics platform: multi-agent web research with multi-source fact-checking — every claim traceable.');
  $('#badges').innerHTML = [
    '🤖 ' + L('AI 模型驱动', 'AI-model driven'),
    '📊 ' + L('大数据 · 多源核查', 'Big data · cross-checked'),
    '🔍 ' + L('来源可溯', 'Traceable sources'),
    '🚫 ' + L('非博彩 · 拒绝赌球', 'Not a betting site'),
  ].map(b => '<span class="badge">' + b + '</span>').join('');
  $('#heroMeta').innerHTML = '<span>' + L('AI 五维建模 · 48 队 · 104 场', 'AI 5-dim model · 48 teams · 104 matches') + '</span>' +
    '<span>' + L('已赛 ', 'Played ') + '<b class="num">' + played.length + '</b>' + L(' 场', '') + '</span>' +
    '<span>' + L('更新 ', 'Updated ') + '<b class="num">' + esc(WC.meta.updated) + '</b></span>';
  const tabs = [
    ['today', L('今日预测', "Today's Forecast") + '<span class="dot"></span>'],
    ['data', L('数据分析', 'Analytics')],
    ['review', L('赛果复盘', 'Results & Review')],
  ];
  $('#tabs').innerHTML = tabs.map(t => '<button class="tab' + (state.view === t[0] ? ' on' : '') + '" data-v="' + t[0] + '">' + t[1] + '</button>').join('');
  $('#noticeTxt').innerHTML = '🛡 ' + L('本站为 <b>AI 大数据体育数据分析平台</b>:所有内容由统计模型与公开数据生成,仅供研究与观赛参考 · 不提供任何投注功能,不构成投注建议 · 拒绝赌球,理性观赛',
    'This is an <b>AI sports data-analytics platform</b>: all content is generated by statistical models from public data, for research & viewing reference only · No betting features, no betting advice · Watch responsibly');
  $('#footWrap').innerHTML =
    '<p><b>' + L('免责声明', 'Disclaimer') + '</b> ' + L('本站为 AI 大数据体育数据分析平台。所有预测与分析均由统计模型与公开资料生成,仅供研究参考与观赛娱乐,不构成任何投注建议;本站不提供任何形式的投注、竞猜功能。请理性观赛,拒绝赌球。已赛比分为真实赛果,事实性资料带来源标注,截至页面更新时间。赞助为自愿支持行为,当前为演示模式,未接入真实支付。',
      'This site is an AI sports data-analytics platform. All predictions and analysis are generated by statistical models from public data, for research and entertainment only — never betting advice. No betting or wagering features are offered. Completed scores are real results; factual material is source-annotated as of the page update time. Sponsorship is voluntary support and currently runs in demo mode.') + '</p>' +
    '<div class="compliance">' +
      '<span>📊 ' + L('数据来源公开可溯', 'Open, traceable data sources') + '</span>' +
      '<span>🚫 ' + L('不提供投注渠道', 'No betting channels') + '</span>' +
      '<span>🤝 ' + L('赞助为数据分析内容查看权益', 'Sponsorship = analytics access') + '</span>' +
      '<span>🧠 ' + L('18+ 理性观赛', 'Watch responsibly') + '</span>' +
      '<button class="linklike fb-open">🐛 ' + L('反馈问题', 'Report a bug') + '</button>' +
    '</div>' +
    '<div class="fin"><span>WC26 AI ' + L('数据分析', 'ANALYTICS') + ' · FIFA WORLD CUP 26™</span>' +
    '<span>' + L('数据更新 ', 'Updated ') + esc(WC.meta.updated) + ' · ' + L('AI 多智能体联网调研生成', 'Generated by multi-agent AI research') + '</span></div>';
}

/* ================= tabs / lang / reveal ================= */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (!b) return;
  state.view = b.dataset.v;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  const v = $('#v-' + state.view);
  v.classList.add('on');
  bindReveal(v);
  animateBars(v);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  storeSet('wc26_lang', state.lang);
  renderAll();
});
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
function bindReveal(root) { (root || document).querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el)); }
function animateBars(root) { setTimeout(() => (root || document).querySelectorAll('.bar i').forEach(b => { b.style.width = b.dataset.w + '%'; }), 80); }

/* ================= today ================= */
function statusPill(st) {
  if (st === 'played') return '<span class="stat-pill">' + L('已完赛', 'FT') + '</span>';
  if (st === 'live') return '<span class="stat-pill live">' + L('进行中', 'LIVE') + '</span>';
  return '<span class="stat-pill">' + L('未开赛', 'Upcoming') + '</span>';
}
function probBars(p, home, away) {
  const rows = [[L(esc(tn(home)) + ' 胜', esc(tn(home)) + ' win'), p.home, 'var(--mx)'], [L('战平', 'Draw'), p.draw, '#B8B3A4'], [L(esc(tn(away)) + ' 胜', esc(tn(away)) + ' win'), p.away, 'var(--us)']];
  return '<div class="probs">' + rows.map(r =>
    '<div class="prob"><span>' + r[0] + '</span><span class="bar"><i data-w="' + r[1] + '" style="background:' + r[2] + '"></i></span><b class="num">' + r[1] + '%</b></div>').join('') + '</div>';
}
function renderToday() {
  const el = $('#v-today'), td = WC.today;
  let h = '<section><div class="sec-kicker">MATCH DAY · AI FORECAST</div><div class="sec-title">' + L('今日赛场 · AI 深度预测', "Today's Matches · AI Deep Forecast") + '</div>' +
    '<p class="sec-desc">' + L('AI 多智能体当日联网调研:综合天气温度、场馆条件、阵容身价、硬实力、近期状态、伤病情况与市场数据等全要素建模分析;事实经多源核查,来源可溯。预测仅在当日发布,不提前展示未来赛果。',
      'Same-day multi-agent AI research: weather, venue, squad value, raw strength, form, injuries and market data — modelled end to end, fact-checked across sources, fully traceable. Forecasts publish on matchday only; future calls are never shown in advance.') + '</p>';
  if (!td || !td.matches || !td.matches.length) {
    h += '<div class="gen-note">' + L('今日暂无比赛或深度分析生成中,请稍后刷新。', 'No matches today, or the analysis is still generating — check back soon.') + '</div></section>';
    el.innerHTML = h; return;
  }
  h += '<div class="day-head reveal"><span class="day-pill num">' + (state.lang === 'zh' ? esc(td.label) : dLong(td.date) + ' · Matchday') + '</span>' +
    '<span class="day-sub">' + L('共 ' + td.matches.length + ' 场 · 时间为当地时间 · 赞助后可查看当日全部 AI 预测报告', td.matches.length + ' matches · local kick-off times · sponsors see all of today’s AI reports') + '</span></div>';
  td.matches.forEach((m, i) => {
    const f = m.free || {}, en = m.en || {};
    const headline = state.lang === 'zh' ? f.headline : (en.headline || f.headline);
    const lean = state.lang === 'zh' ? f.lean : (en.lean || f.lean);
    const env = state.lang === 'zh' ? m.env : ((en.env && en.env.length) ? en.env : m.env);
    h += '<div class="mcard reveal" style="transition-delay:' + i * .12 + 's">' +
      '<div class="mtop"><span class="gtag" style="background:' + GC[i % 3] + '">' + L(m.group + ' 组', 'Group ' + m.group) + '</span>' +
      '<span class="num">⏱ ' + esc(state.lang === 'zh' ? m.kickoff_zh : kickEn(m.kickoff_zh)) + '</span><span>🏟 ' + esc(m.stadium) + ' · ' + esc(city(m.city)) + '</span>' + statusPill(m.status) + '</div>' +
      '<div class="mteams">' +
        '<div class="mteam"><div class="f">' + fl(m.home) + '</div><div class="n">' + esc(tn(m.home)) + '</div><div class="v num">FIFA #' + T(m.home).rank + (m.value && m.value.home ? ' · ' + L('身价 ', '') + esc(state.lang === 'zh' ? m.value.home : vEn(m.value.home)) : '') + '</div></div>' +
        '<div class="mvs">VS' + (headline ? '<span class="hl">' + esc(headline) + '</span>' : '') + '</div>' +
        '<div class="mteam"><div class="f">' + fl(m.away) + '</div><div class="n">' + esc(tn(m.away)) + '</div><div class="v num">FIFA #' + T(m.away).rank + (m.value && m.value.away ? ' · ' + L('身价 ', '') + esc(state.lang === 'zh' ? m.value.away : vEn(m.value.away)) : '') + '</div></div>' +
      '</div>';
    if (env && env.length) h += '<div class="envrow">' + env.map(e => '<span class="env">' + esc(e) + '</span>').join('') + '</div>';
    if (m.factors && m.factors.length) {
      h += '<div class="facwrap"><div class="fhead">FACTORS · ' + L('全要素对比', 'Full factor comparison') + '</div>' + m.factors.map((fc, fi) => {
        const fe = (en.factors && en.factors[fi]) || {};
        const name = state.lang === 'zh' ? fc.name : (fe.name || fc.name);
        const hv = state.lang === 'zh' ? fc.home : (fe.home || fc.home);
        const av = state.lang === 'zh' ? fc.away : (fe.away || fc.away);
        const note = state.lang === 'zh' ? fc.note : (fe.note || fc.note);
        const eh = fc.edge === 'home', ea = fc.edge === 'away';
        return '<div class="fac"><span class="l ' + (eh ? 'edge h' : '') + '">' + esc(hv) + (eh ? ' ●' : '') + '</span><span class="c">' + esc(name) + '</span><span class="r ' + (ea ? 'edge a' : '') + '">' + (ea ? '● ' : '') + esc(av) + '</span>' + (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (lean) h += '<div class="lean">📌 ' + L('免费速览:', 'Free read: ') + esc(lean) + '</div>';
    h += '<div class="paid-zone' + (ent() ? ' unlocked' : '') + '"><div class="pz-title">AI PREDICTION REPORT · ' + L('AI 预测报告', 'AI Prediction Report') +
      (ent() ? '<span class="ent-tag">' + (ent() === 'season' ? L('全程赞助已激活', 'Season sponsor') : L('单日赞助 · 当日有效', 'Day sponsor · today only')) + '</span>' : '') + '</div>';
    if (ent() && m.paid) {
      const p = m.paid;
      const analysis = state.lang === 'zh' ? p.analysis : (en.analysis || p.analysis);
      h += '<div class="pz-score"><span class="sc num">' + esc(tn(m.home)) + ' ' + esc(p.score) + ' ' + esc(tn(m.away)) + '</span><span class="cf">' + L('模型置信度', 'Model confidence') + '<br><b class="num">' + p.confidence + '%</b></span></div>' +
        probBars(p.probs, m.home, m.away) +
        '<div class="analysis">' + esc(analysis) + '</div>' +
        '<div class="pz-foot">' + L('本报告为统计模型输出,仅供研究参考,不构成任何投注建议。', 'Model output for research reference only — not betting advice.') + '</div>';
    } else {
      h += '<div class="pz-locked"><div class="blur-score num">2 - 1</div><p>' + L('赞助支持本站后查看:精确比分 · 胜平负概率 · 模型置信度 · 深度数据分析报告', 'Sponsor the site to view: exact score · outcome probabilities · model confidence · full data-analysis report') + '</p>' +
        '<div class="pz-actions"><button class="btn-gold pay-open" data-prod="day">☕ ' + L('单日赞助 ', 'Sponsor today ') + esc(P.day.price) + '</button>' +
        '<button class="btn-ghost pay-open" data-prod="season">' + L('全程赞助 ', 'Season sponsor ') + esc(P.season.price) + '</button></div></div>';
    }
    h += '</div>';
    if (m.sources && m.sources.length) h += '<details class="srcs"><summary>' + L('调研来源 ', 'Research sources · ') + m.sources.length + L(' 条', '') + '</summary>' + m.sources.map(s => '<a href="' + esc(safeUrl(s)) + '" target="_blank" rel="noopener noreferrer">' + esc(s) + '</a>').join('') + '</details>';
    h += '</div>';
  });
  const note = state.lang === 'zh' ? td.note : (td.note_en || td.note);
  if (note) h += '<p class="sec-desc" style="font-size:12px">' + esc(note) + '</p>';
  h += '</section>';
  el.innerHTML = h;
  animateBars(el);
}

/* ================= analytics view ================= */
function radarSVG(dims) {
  const cx = 56, cy = 52, R = 40, N = 5;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); };
  let s = '<svg width="112" height="104" viewBox="0 0 112 104">';
  for (const f of [1, .66, .33]) s += '<polygon points="' + [0,1,2,3,4].map(i => pt(i, R * f)).join(' ') + '" fill="none" stroke="#E4E0D4" stroke-width="1"/>';
  for (let i = 0; i < N; i++) s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + pt(i, R).replace(',', '" y2="') + '" stroke="#EEEAE0" stroke-width="1"/>';
  s += '<polygon points="' + dims.map((v, i) => pt(i, R * v / 100)).join(' ') + '" fill="rgba(201,162,39,.22)" stroke="var(--gold-deep)" stroke-width="1.8"/>';
  const lp = [[56,8],[102,41],[88,100],[24,100],[10,41]];
  const lbl = state.lang === 'zh' ? DIM_Z : DIM_S;
  lbl.forEach((l, i) => s += '<text x="' + lp[i][0] + '" y="' + lp[i][1] + '" font-size="' + (state.lang === 'zh' ? 9 : 8) + '" fill="#9a9484" text-anchor="middle">' + l + '</text>');
  return s + '</svg>';
}
function countUps(root) {
  root.querySelectorAll('[data-cnt]').forEach(el => {
    const target = parseFloat(el.dataset.cnt); const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 900); el.textContent = (target * (1 - Math.pow(1 - k, 3))).toFixed(1); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function renderData() {
  const el = $('#v-data');
  const A = WC.analytics || {};
  const entries = Object.entries(WC.teams);
  const sorted = entries.slice().sort((a, b) => b[1].overall - a[1].overall);

  /* --- team ratings --- */
  let h = '<section><div class="sec-kicker">TEAM RATINGS · AI MODEL</div><div class="sec-title">' + L('球队实力评分', 'Team Power Ratings') + '</div>' +
    '<p class="sec-desc">' + L('三个独立 AI 评分视角(量化数据 / 状态体能 / 战术专家)对 48 队五维打分取均值,加权得到综合评分;评分随赛事进程滚动校准。',
      'Three independent AI scoring lenses (quant data / fitness & form / tactics) rate all 48 teams on five dimensions; the weighted average gives the overall rating, recalibrated as the tournament unfolds.') + '</p>';
  h += '<div class="method-chips reveal">' + [
    [L('硬实力', 'Strength'), '30%'], [L('当前状态', 'Form'), '25%'], [L('阵容厚度', 'Squad depth'), '20%'], [L('大赛底蕴', 'Pedigree'), '15%'], [L('环境适应', 'Environment'), '10%'],
  ].map(c => '<span class="mchip">' + c[0] + ' <b>' + c[1] + '</b></span>').join('') + '<span class="mchip">' + L('3 视角独立评分取均值', '3 lenses, averaged') + '</span></div>';
  const top8 = sorted.slice(0, 8);
  h += '<div class="contenders">' + top8.map(([n, t], i) =>
    '<div class="cont reveal" style="transition-delay:' + i * .05 + 's">' + radarSVG(t.dims) +
    '<div class="info"><div class="nm">' + esc(t.flag) + ' ' + esc(tn(n)) + '</div><div class="meta num">FIFA #' + t.rank + (t.mkt ? ' · ' + L('市场夺冠预期 ', 'Mkt title prob ') + esc(t.mkt) : '') + '</div><div class="ov num" data-cnt="' + t.overall + '">0</div><div class="ovl">' + L('综合评分', 'OVERALL') + '</div></div></div>').join('') + '</div>';
  h += '<div class="rate-card reveal"><table class="gtable"><tr><th>#</th><th>' + L('球队', 'Team') + '</th><th>' + L('组', 'Grp') + '</th><th>FIFA</th>' +
    (state.lang === 'zh' ? DIM_Z : DIM_S).map(d => '<th>' + d + '</th>').join('') + '<th>' + L('综合', 'OVR') + '</th></tr>' +
    sorted.map(([n, t], i) => '<tr' + (i < 3 ? ' class="q3y"' : '') + '><td class="num">' + (i + 1) + '</td><td>' + esc(t.flag) + ' ' + esc(tn(n)) + '</td><td>' + t.group + '</td><td class="num">' + t.rank + '</td>' +
      t.dims.map(d => '<td class="num dim">' + d + '</td>').join('') + '<td class="num ov">' + t.overall.toFixed(1) + '</td></tr>').join('') + '</table></div>';

  /* --- tournament analysis --- */
  h += '<div class="subsec reveal"><div class="sec-kicker">TOURNAMENT ANALYSIS</div><div class="sec-title">' + L('世界杯赛事分析', 'Tournament Analysis') + '</div>' +
    '<p class="sec-desc">' + L('基于 AI 评分模型的赛事格局量化分析:小组强度指数、争冠集团与市场预期对比。', 'Quantified tournament landscape from the AI rating model: group strength index, title race and market expectations.') + '</p>';
  const groups = {};
  entries.forEach(([n, t]) => { (groups[t.group] = groups[t.group] || []).push([n, t]); });
  const gAvg = Object.keys(groups).sort().map(g => ({ g, teams: groups[g], avg: groups[g].reduce((s, x) => s + x[1].overall, 0) / groups[g].length }));
  gAvg.sort((a, b) => b.avg - a.avg);
  const maxAvg = gAvg[0].avg, minAvg = gAvg[gAvg.length - 1].avg;
  h += '<div class="two-col"><div class="hcardx"><div class="fhead">' + L('小组强度指数(平均综合评分)', 'GROUP STRENGTH INDEX (avg overall)') + '</div>' +
    gAvg.map((x, i) => '<div class="hbar"><span><b>' + x.g + '</b> <span class="sub">' + x.teams.map(t => esc(t[1].flag)).join(' ') + '</span>' + (i === 0 ? ' <span class="sub">☠️ ' + L('死亡之组', 'Group of death') + '</span>' : '') + '</span>' +
      '<span class="bar"><i data-w="' + Math.round(20 + (x.avg - minAvg) / (maxAvg - minAvg + .01) * 80) + '" style="background:' + (i === 0 ? 'var(--ca)' : 'var(--gold)') + '"></i></span><span class="val num">' + x.avg.toFixed(1) + '</span></div>').join('') + '</div>';
  h += '<div class="hcardx"><div class="fhead">' + L('争冠集团 · 模型评分 × 市场预期', 'TITLE RACE · model vs market') + '</div><table class="gtable"><tr><th>#</th><th>' + L('球队', 'Team') + '</th><th>' + L('综合', 'OVR') + '</th><th>FIFA</th><th>' + L('市场夺冠预期', 'Mkt title prob') + '</th></tr>' +
    sorted.slice(0, 10).map(([n, t], i) => '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(t.flag) + ' ' + esc(tn(n)) + '</td><td class="num pts">' + t.overall.toFixed(1) + '</td><td class="num">' + t.rank + '</td><td class="num">' + (esc(t.mkt) || '—') + '</td></tr>').join('') + '</table></div></div>';
  const stories = (A.experts && A.experts.storylines) || [];
  if (stories.length) {
    h += '<div style="height:18px"></div><div class="scards">' + stories.map(s =>
      '<div class="scard reveal"><div class="st">' + esc(L(s.title_zh, s.title_en)) + '</div><div class="sb">' + esc(L(s.body_zh, s.body_en)) + '</div>' +
      (s.source ? '<a class="src-link" href="' + esc(safeUrl(s.source)) + '" target="_blank" rel="noopener noreferrer">' + L('来源', 'Source') + ' ↗</a>' : '') + '</div>').join('') + '</div>';
  }
  h += '</div>';

  /* --- model outlook (finals only — 不展示任何逐场未来比分) --- */
  const F = WC.pred && WC.pred.finals;
  if (F) {
    h += '<div class="subsec reveal"><div class="sec-kicker">MODEL OUTLOOK</div><div class="sec-title">' + L('AI 模型展望', 'AI Model Outlook') + '</div>' +
      '<p class="sec-desc">' + L('模型对赛事最终走向的当前展望,随真实赛果滚动修正。本站不提前发布逐场未来比分——每天的比赛预测仅在当日发布于「今日预测」。',
        'The model’s current read on how the tournament ends, recalibrated as results land. No future match-by-match scores are published — each day’s forecasts appear on matchday only, under Today’s Forecast.') + '</p>';
    h += '<div class="honors">' +
      '<div class="hcard gold reveal"><div class="hl">' + L('冠军展望', 'PROJECTED CHAMPION') + '</div><div class="hf">' + fl(F.champion) + '</div><div class="hn">' + esc(tn(F.champion)) + '</div><div class="hs">' + L('模型推演当前指向的冠军', 'Where the simulation currently lands') + '</div></div>' +
      '<div class="hcard reveal"><div class="hl">' + L('亚军展望', 'RUNNER-UP') + '</div><div class="hf">' + fl(F.runner_up) + '</div><div class="hn">' + esc(tn(F.runner_up)) + '</div></div>' +
      '<div class="hcard reveal"><div class="hl">' + L('季军展望', 'THIRD PLACE') + '</div><div class="hf">' + fl(F.third_place) + '</div><div class="hn">' + esc(tn(F.third_place)) + '</div></div>' +
      '<div class="hcard reveal"><div class="hl">' + L('金靴展望', 'GOLDEN BOOT') + '</div><div class="hf">👟</div><div class="hn">' + esc(state.lang === 'zh' ? (F.golden_boot.player_zh || F.golden_boot.player) : F.golden_boot.player) + '</div><div class="hs">' + fl(F.golden_boot.team_en) + ' ' + esc(tn(F.golden_boot.team_en)) + ' · ' + F.golden_boot.goals + L(' 球', ' goals') + '<br>' + L('最佳新秀:', 'Young star: ') + esc(state.lang === 'zh' ? F.young_star : (F.young_star_en || F.young_star)) + '</div></div>' +
      '</div></div>';
  }

  /* --- history --- */
  const H = A.history;
  if (H) {
    h += '<div class="subsec reveal"><div class="sec-kicker">HISTORY DATA</div><div class="sec-title">' + L('历史数据统计', 'Historical Statistics') + '</div>' +
      '<p class="sec-desc">' + L('1930–2022 共 22 届世界杯的核验数据:冠军谱系、夺冠榜、历史射手榜与关键纪录,数据来源见底部。', 'Verified data across all 22 World Cups, 1930–2022: champions, title counts, all-time scorers and key records — sources below.') + '</p>';
    if (H.facts && H.facts.length) h += '<div class="facts-grid">' + H.facts.map(f =>
      '<div class="fact reveal"><div class="fl">' + esc(L(f.label_zh, f.label_en)) + '</div><div class="fv">' + esc(L(f.value_zh, f.value_en)) + '</div></div>').join('') + '</div>';
    h += '<div class="two-col" style="margin-top:14px"><div class="hcardx"><div class="fhead">' + L('夺冠次数榜', 'TITLES BY NATION') + '</div>' +
      (H.titles || []).map(t => '<div class="hbar"><span>' + xfl(t.team_en) + ' <b>' + esc(L(t.team_zh, t.team_en)) + '</b></span><span class="bar"><i data-w="' + (t.count / 5 * 100) + '" style="background:var(--gold)"></i></span><span class="val num">× ' + t.count + '</span></div>' +
        '<div class="hbar" style="padding:0 0 6px"><span></span><span class="sub" style="grid-column:2/4">' + esc(t.years) + '</span></div>').join('') + '</div>';
    h += '<div class="hcardx"><div class="fhead">' + L('世界杯历史射手榜', 'ALL-TIME TOP SCORERS') + '</div>' +
      (H.scorers || []).map(s => '<div class="hbar"><span>' + xfl(s.team_en) + ' <b>' + esc(L(s.player_zh, s.player)) + '</b> <span class="sub num">' + esc(s.span) + '</span></span>' +
        '<span class="bar"><i data-w="' + (s.goals / 16 * 100) + '" style="background:var(--us)"></i></span><span class="val num">' + s.goals + L(' 球', '') + '</span></div>').join('') + '</div></div>';
    if (H.champions && H.champions.length) {
      h += '<div style="height:18px"></div><div class="fhead">' + L('历届冠军 1930–2022', 'CHAMPIONS 1930–2022') + '</div><div class="champ-grid">' +
        H.champions.map(c => '<div class="champ-cell reveal"><div class="yr num">' + c.year + '</div><div class="wn">' + xfl(c.winner_en) + ' ' + esc(L(c.winner_zh, c.winner_en)) + '</div>' +
          '<div class="rs num">' + esc(c.score) + ' · ' + esc(L(c.runner_zh, c.runner_en)) + '</div><div class="rs">' + L('主办:', 'Host: ') + esc(L(c.host_zh, c.host_en)) + '</div></div>').join('') + '</div>';
    }
    if (H.sources && H.sources.length) h += '<details class="srcs"><summary>' + L('数据来源 ', 'Data sources · ') + H.sources.length + L(' 条', '') + '</summary>' + H.sources.map(s => '<a href="' + esc(safeUrl(s)) + '" target="_blank" rel="noopener noreferrer">' + esc(s) + '</a>').join('') + '</details>';
    h += '</div>';
  }

  /* --- expert views --- */
  const X = A.experts;
  if (X) {
    h += '<div class="subsec reveal"><div class="sec-kicker">EXPERT VIEWS</div><div class="sec-title">' + L('专家观点', 'Expert Views') + '</div>' +
      '<p class="sec-desc">' + L('引自公开报道的分析师、名宿与量化模型观点,全部附原始来源链接;观点仅代表原作者。', 'Analyst, pundit and quant-model views quoted from public reporting, each linked to its original source; views belong to their authors.') + '</p>';
    h += '<div class="consensus reveal"><div class="cl">CONSENSUS · ' + L('共识扫描', 'Consensus scan') + '</div>' + esc(L(X.consensus_zh, X.consensus_en)) +
      '<br><span style="color:#A8A498;font-size:12px">' + L('本站模型当前展望冠军:', 'Our model currently projects the champion as: ') + esc(tn(WC.pred.finals.champion)) + L('(见上方「模型展望」)', ' (see Model Outlook above)') + '</span></div>';
    h += '<div class="xgrid">' + (X.experts || []).map((x, i) =>
      '<div class="xcard reveal" style="transition-delay:' + i * .05 + 's"><div class="xq">“' + esc(L(x.view_zh, x.view_en)) + '”</div>' +
      '<div class="xwho"><b>' + esc(state.lang === 'zh' ? x.name : (x.name_en || x.name)) + '</b> · ' + esc(state.lang === 'zh' ? x.org : (x.org_en || x.org)) + ' · <span class="num">' + esc(x.date) + '</span>' +
      (x.pick ? '<span class="xpick">🏆 ' + esc(state.lang === 'zh' ? x.pick : (x.pick_en || x.pick)) + '</span>' : '') +
      (x.source ? '<a class="src-link" href="' + esc(safeUrl(x.source)) + '" target="_blank" rel="noopener noreferrer">' + L('来源', 'Source') + ' ↗</a>' : '') + '</div></div>').join('') + '</div></div>';
  }
  h += '</section>';
  el.innerHTML = h;
  countUps(el);
  animateBars(el);
}

/* ================= review & recaps ================= */
const EVT_ICON = { goal: '⚽', red: '🟥', yellow: '🟨', var: '📺', pen: '🎯', sub: '🔁', substitution: '🔁', disallowed: '🚫', save: '🧤' };
function renderReview() {
  const el = $('#v-review');
  let h = '<section><div class="sec-kicker">RESULTS & REVIEW</div><div class="sec-title">' + L('赛果与预测复盘', 'Results & Prediction Review') + '</div>' +
    '<p class="sec-desc">' + L('每个比赛日结束后,真实赛果在此更新,并与当日发布的 AI 预测逐场对照;未完赛场次的预测处于密封状态,完赛后自动公开,保证可核验。',
      'After each matchday, real results land here and are checked against the AI calls published that day; predictions stay sealed until full time, then go public for verifiability.') + '</p>';
  h += '<div class="res-list">' + played.map(m =>
    '<div class="res reveal"><span class="d num">' + fmtD(m.date) + '</span><span>' + fl(m.home) + ' <b>' + esc(tn(m.home)) + '</b></span><span class="sc num">' + esc(m.actual) + '</span><span><b>' + esc(tn(m.away)) + '</b> ' + fl(m.away) + '</span></div>').join('') + '</div>';

  /* --- match recaps --- */
  const recaps = WC.recaps || [];
  if (recaps.length) {
    h += '<div class="subsec"><div class="sec-kicker">MATCH REVIEW</div><div class="sec-title" style="font-size:18px">' + L('比赛复盘', 'Match Recaps') + '</div>';
    recaps.forEach(r => {
      h += '<div class="recap reveal"><div class="recap-head">' +
        '<span class="f">' + fl(r.home) + '</span><span class="n">' + esc(tn(r.home)) + '</span><span class="sc num">' + esc(r.score) + '</span><span class="n">' + esc(tn(r.away)) + '</span><span class="f">' + fl(r.away) + '</span>' +
        '<span class="meta num">' + dLong(r.date) + (r.attendance ? '<br>👥 ' + esc(r.attendance) : '') + '</span></div>';
      h += '<div class="recap-body">' + esc(L(r.narrative_zh, r.narrative_en)) + '</div>';
      if (r.events && r.events.length) h += '<div class="tl">' + r.events.map(e =>
        '<div class="tl-row"><span class="tl-min num">' + esc(e.min) + '’</span><span>' + (EVT_ICON[e.type] || '·') + ' ' + esc(L(e.text_zh, e.text_en)) + '</span></div>').join('') + '</div>';
      if (r.stats && r.stats.length) h += '<div class="rstats">' + r.stats.map(s =>
        '<div class="fac"><span class="l num">' + esc(s.home) + '</span><span class="c">' + esc(L(s.name_zh, s.name_en)) + '</span><span class="r num">' + esc(s.away) + '</span></div>').join('') + '</div>';
      if (r.turning_zh || r.turning_en) h += '<div class="turn">🔄 <b>' + L('转折点', 'Turning point') + '</b> · ' + esc(L(r.turning_zh, r.turning_en)) + '</div>';
      if (r.sources && r.sources.length) h += '<details class="srcs"><summary>' + L('报道来源 ', 'Report sources · ') + r.sources.length + L(' 条', '') + '</summary>' + r.sources.map(s => '<a href="' + esc(safeUrl(s)) + '" target="_blank" rel="noopener noreferrer">' + esc(s) + '</a>').join('') + '</details>';
      h += '</div>';
    });
    h += '</div>';
  }

  /* --- prediction vs result --- */
  h += '<div style="height:26px"></div><div class="sec-kicker">PREDICTION vs RESULT</div><div class="sec-title" style="font-size:18px">' + L('AI 预测 × 实际结果', 'AI Calls × Actual Results') + '</div>';
  (WC.review || []).slice().reverse().forEach(day => {
    const done = day.state === 'done';
    h += '<div class="rev-day reveal"><div class="rev-head"><span class="d num">' + dLong(day.date) + '</span><span class="s">' + esc(L(day.title, day.title_en || day.title)) + '</span><span class="tag ' + (done ? 'tag-done' : 'tag-wait') + '">' + (done ? L('已复盘', 'Reviewed') : L('待完赛更新', 'Awaiting FT')) + '</span></div>';
    day.items.forEach(it => {
      let hitTag = '<span class="hit wait">' + L('待开赛', 'Pending') + '</span>';
      if (it.hit === 'full') hitTag = '<span class="hit full">' + L('比分全中', 'Exact score') + '</span>';
      else if (it.hit === 'dir') hitTag = '<span class="hit dir">' + L('胜负方向命中', 'Right call') + '</span>';
      else if (it.hit === 'miss') hitTag = '<span class="hit miss">' + L('未命中', 'Missed') + '</span>';
      else if (it.hit === 'na') hitTag = '<span class="hit wait">' + L('不计入', 'Excluded') + '</span>';
      const sealed = !done && it.predicted && !it.actual;
      const predCell = it.predicted
        ? (sealed ? '<span class="spill p num" title="' + L('赛后公开', 'Revealed after FT') + '">🔒 ● - ●</span>' : '<span class="spill p num">' + esc(it.predicted) + '</span>')
        : '<span class="spill na">—</span>';
      /* 未完赛的注记可能含概率/置信度等赞助内容,与比分一同密封 */
      const noteV = sealed ? '' : (state.lang === 'zh' ? it.note : (it.note_en || it.note));
      h += '<div class="rev-item"><span class="mt">' + esc(state.lang === 'zh' ? it.label : (it.label_en || it.label)) + '</span>' +
        '<span class="pillbox">' + L('预测 ', 'Call ') + predCell +
        ' ' + L('实际 ', 'Actual ') + (it.actual ? '<span class="spill a num">' + esc(it.actual) + '</span>' : '<span class="spill na">' + L('待更新', 'TBD') + '</span>') + '</span>' + hitTag +
        (noteV ? '<span class="nt">' + esc(noteV) + '</span>' : '') + '</div>';
    });
    const sm = state.lang === 'zh' ? day.summary : (day.summary_en || day.summary);
    if (sm) h += '<div class="rev-item"><span class="nt">📋 ' + esc(sm) + '</span></div>';
    h += '</div>';
  });
  h += '</section>';
  el.innerHTML = h;
}

/* ================= sponsorship (demo) ================= */
window.WCPay = {
  /* 真实收款接入点(用户已注册微信/支付宝商家收款,正式接入见 README):
     1) 后端创建订单 → 2) 拉起微信/支付宝收银台 → 3) 回调验签后发放查看权益。
     演示模式:延时后直接成功。 */
  checkout(channel, product) { return new Promise(res => setTimeout(() => res({ ok: true, channel, product }), 1400)); }
};
function renderPayModal() {
  const sel = state.paySel;
  $('#payBody').innerHTML =
    '<div class="mi">🤝</div><h3>' + L('赞助支持 WC26', 'Sponsor WC26') + '</h3>' +
    '<div class="sub">' + L('赞助用于支持数据调研与运营成本,回馈为当日预测内容查看权益 · 非投注服务,不构成任何投注建议', 'Sponsorship covers research & running costs; the perk is access to matchday forecasts · not a betting service, no betting advice') + '</div>' +
    '<div class="prods">' +
      '<div class="prod' + (sel === 'day' ? ' sel' : '') + '" data-prod="day"><div class="pn">☀️ ' + L('单日赞助', 'Day Sponsor') + '</div><div class="pp num">' + esc(P.day.price) + ' <small>/ ' + L('当日', 'today') + '</small></div>' +
        '<div class="pd">' + L('查看今日全部场次的 AI 预测报告:精确比分、胜平负概率、置信度与深度分析。仅当日有效。', "View all of today's AI prediction reports: exact scores, outcome probabilities, confidence and full analysis. Valid today only.") + '</div></div>' +
      '<div class="prod' + (sel === 'season' ? ' sel' : '') + '" data-prod="season"><span class="rec">' + L('推荐', 'BEST') + '</span><div class="pn">🏆 ' + L('全程赞助', 'Season Sponsor') + '</div><div class="pp num">' + esc(P.season.price) + ' <small>/ ' + L('整届赛事', 'tournament') + '</small></div>' +
        '<div class="pd">' + L('赛事期间每天查看当日全部预测报告,按日更新推送——未来赛果不会提前展示。', 'Every matchday’s full reports through the final, unlocked day by day — future calls are never shown in advance.') + '</div></div>' +
    '</div>' +
    '<div class="demo-note">' + L('演示环境:点击支付将模拟成功,不产生真实扣款。正式版接入微信支付 / 支付宝商户收单后生效(接入说明见 README)。', 'Demo mode: payment is simulated, nothing is charged. Production requires the WeChat Pay / Alipay merchant integration (see README).') + '</div>' +
    '<div class="payrow">' +
      '<button class="paybtn wx" data-ch="wechat">' + L('微信支付', 'WeChat Pay') + '</button>' +
      '<button class="paybtn ali" data-ch="alipay">' + L('支付宝', 'Alipay') + '</button>' +
    '</div>' +
    '<div class="comp-note">' + L('赞助属自愿支持行为;内容为统计模型输出的数据分析报告,仅供研究参考,不构成投注建议;查看权益开通后不支持退款。', 'Sponsorship is voluntary support; content is model-generated data analysis for research reference only, not betting advice; access is non-refundable once granted.') + '</div>' +
    '<button class="close" id="payClose">' + L('暂不赞助', 'Not now') + '</button>';
}
function openPay(pre) { if (pre) state.paySel = pre; renderPayModal(); $('#payModal').classList.add('on'); }
function closePay() { $('#payModal').classList.remove('on'); }
$('#payModal').addEventListener('click', async e => {
  if (state.payBusy) return; /* 支付进行中:禁止改选/关闭/重复支付 */
  if (e.target === e.currentTarget) return closePay();
  if (e.target.closest('#payClose')) return closePay();
  const prod = e.target.closest('.prod');
  if (prod) { state.paySel = prod.dataset.prod; renderPayModal(); return; }
  const btn = e.target.closest('.paybtn');
  if (btn) {
    const product = state.paySel;
    state.payBusy = true;
    document.querySelectorAll('.paybtn').forEach(x => { x.disabled = true; });
    btn.textContent = L('正在拉起支付…', 'Opening payment…');
    try {
      const r = await WCPay.checkout(btn.dataset.ch, product);
      if (r.ok) {
        if (product === 'season') storeSet('wc26_season', '1');
        else if (WC.today) storeSet('wc26_day', WC.today.date);
        closePay();
        toast('🎉 ' + (product === 'season' ? L('感谢赞助!<span class="g">全程查看权益已开启</span>', 'Thank you! <span class="g">Season access unlocked</span>') : L('感谢赞助!<span class="g">今日预测已开启</span>', 'Thank you! <span class="g">Today’s forecasts unlocked</span>')));
        renderChrome(); renderToday(); bindReveal();
      }
    } finally { state.payBusy = false; }
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('.pay-open');
  if (b) return openPay(b.dataset.prod);
  if (e.target.closest('.fb-open')) return openFb();
});
let toastTimer;
function toast(html) { const t = $('#toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600); }

/* ================= bug feedback ================= */
function renderFbModal() {
  $('#fbBody').innerHTML =
    '<div class="mi">🐛</div><h3>' + L('反馈问题', 'Report a Bug') + '</h3>' +
    '<div class="sub">' + L('描述你遇到的问题(在哪个页面、做了什么、看到了什么),我们会尽快处理。', 'Tell us what went wrong — which page, what you did, what you saw.') + '</div>' +
    '<textarea id="fbText" class="fb-text" rows="5" placeholder="' + L('例如:手机上「数据分析」页的表格显示不全……', 'e.g. the ratings table is cut off on my phone…') + '"></textarea>' +
    '<input id="fbContact" class="fb-input" placeholder="' + L('联系方式(选填:邮箱 / 微信)', 'Contact (optional)') + '">' +
    '<div class="payrow">' +
      (SITE_CONFIG.feedbackEndpoint ? '<button class="paybtn wx" id="fbSend">📨 ' + L('直接提交', 'Submit') + '</button>' : '') +
      '<button class="paybtn ali" id="fbMail">📧 ' + L('通过邮件发送', 'Send via email') + '</button>' +
    '</div>' +
    '<div class="comp-note">' + L('邮件方式会打开你的邮件应用,发送前可编辑;请勿包含敏感个人信息。', 'Email opens your mail app and is editable before sending. Please avoid sensitive personal info.') + '</div>' +
    '<button class="close" id="fbClose">' + L('关闭', 'Close') + '</button>';
}
function openFb() { renderFbModal(); $('#fbModal').classList.add('on'); }
function closeFb() { $('#fbModal').classList.remove('on'); }
$('#fbModal').addEventListener('click', async e => {
  if (e.target === e.currentTarget || e.target.closest('#fbClose')) return closeFb();
  const txt = ($('#fbText') ? $('#fbText').value : '').trim();
  const contact = ($('#fbContact') ? $('#fbContact').value : '').trim();
  if (e.target.closest('#fbMail')) {
    const body = L('问题描述:', 'Issue: ') + txt + '\n' + L('联系方式:', 'Contact: ') + contact +
      '\n\n--- ' + L('环境信息(请保留,便于排查)', 'Environment (please keep)') + ' ---\n' +
      navigator.userAgent + '\nlang=' + state.lang + ' · data=' + ((WC.meta && WC.meta.updated) || '');
    location.href = 'mailto:' + SITE_CONFIG.feedbackEmail + '?subject=' + encodeURIComponent('[WC26 ' + L('反馈', 'feedback') + ']') + '&body=' + encodeURIComponent(body);
    return;
  }
  const send = e.target.closest('#fbSend');
  if (send) {
    if (!txt) { toast(L('请先填写问题描述', 'Please describe the issue first')); return; }
    send.disabled = true;
    try {
      const resp = await fetch(SITE_CONFIG.feedbackEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ message: txt, contact: contact, ua: navigator.userAgent, lang: state.lang, dataVersion: (WC.meta && WC.meta.updated) || '' }),
      });
      if (!resp.ok) throw new Error('status ' + resp.status);
      closeFb();
      toast('✅ ' + L('反馈已提交,感谢!', 'Feedback sent — thank you!'));
    } catch (err) {
      toast(L('提交失败,请改用邮件发送', 'Failed — please use email instead'));
      send.disabled = false;
    }
  }
});

/* ================= visitor analytics (填好 SITE_CONFIG 即生效) ================= */
function initAnalytics() {
  try {
    if (SITE_CONFIG.goatcounter) {
      const s = document.createElement('script');
      s.async = true;
      s.dataset.goatcounter = 'https://' + SITE_CONFIG.goatcounter + '.goatcounter.com/count';
      s.src = 'https://gc.zgo.at/count.js';
      document.body.appendChild(s);
    }
    if (SITE_CONFIG.baiduTongji) {
      window._hmt = window._hmt || [];
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://hm.baidu.com/hm.js?' + SITE_CONFIG.baiduTongji;
      document.body.appendChild(s);
    }
  } catch (e) {}
}

/* ================= boot ================= */
function renderAll() { renderChrome(); renderToday(); renderData(); renderReview(); bindReveal(); animateBars(document); }
renderAll();
initAnalytics();
