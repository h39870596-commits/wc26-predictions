#!/usr/bin/env python3
"""
构建 assets/data.js —— 页面唯一的数据层。
自动化更新流程(每个比赛日跑一次):
  1. 完赛后:把真实比分写入 data/wc.json 对应场次的 "actual" 字段(如 "2-0");
  2. 复盘:编辑 data/review.json —— 填入 actual、hit(full/dir/miss)、note(+ 英文 *_en 字段),state 改为 done;
     并为完赛场次在 data/recaps.json 追加复盘档案(双语,带来源);
  3. 新比赛日:生成 data/matchday-YYYY-MM-DD.json(深度调研产出,结构见已有文件;每场附 "en" 英文块;
     行文禁用盘口/赔率/博彩措辞,市场信息一律写成「隐含胜率 X%」「市场预期」),
     并在 data/review.json 追加新的一天(predicted 填深度版比分);
  4. 运行: python3 scripts/build_data.py

付费模型:每日仅精选 1 场发布付费 AI 预测报告(置信度最高的一场,可在 matchday 文件用
"featured_no" 覆盖);其余场次只输出免费要素分析,精确预测赛后在复盘中公开。
"""
import json, re, glob, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(p, optional=False):
    fp = os.path.join(ROOT, p)
    if optional and not os.path.exists(fp):
        return None
    with open(fp) as f:
        return json.load(f)

wc = load('data/wc.json')
pred = load('data/predictions.json')
site = load('data/site-data.json')
review = load('data/review.json')
history = load('data/history.json', optional=True)
experts = load('data/experts.json', optional=True)
recaps = load('data/recaps.json', optional=True)

# ---------- 去博彩化兜底:公开字段不得出现盘口/赔率措辞 ----------
def sanitize_text(s):
    if not isinstance(s, str):
        return s
    s = s.replace('盘口信号', '市场预期').replace('盘口', '市场预期')
    s = re.sub(r'[+-]\d{3,4}[，,]?\s*去水(?:后)?隐含', '隐含胜率 ', s)
    s = re.sub(r'去水(?:后)?隐含', '隐含胜率 ', s)
    s = re.sub(r'FanDuel|DraftKings|bet365|威廉希尔', '市场数据', s)
    return s

def sanitize(obj):
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(x) for x in obj]
    return sanitize_text(obj)

# 赔率字符串(分数式 a/b 或美式 +N/-N)→ 市场隐含概率百分比;前端只展示概率,不出现赔率格式
def implied_pct(odds):
    if not odds:
        return None
    odds = str(odds).strip()
    v = None
    m = re.match(r'^(\d+)\s*/\s*(\d+)$', odds)
    if m:
        v = int(m.group(2)) / (int(m.group(1)) + int(m.group(2))) * 100
    else:
        m = re.match(r'^\+(\d+)$', odds)
        if m:
            v = 100 / (int(m.group(1)) + 100) * 100
        else:
            m = re.match(r'^-(\d+)$', odds)
            if m:
                v = int(m.group(1)) / (int(m.group(1)) + 100) * 100
    if v is None:
        return None
    return ('%.1f%%' % v) if v < 10 else ('%d%%' % round(v))

teams = {}
for _name, _t in site['teams'].items():
    _t = dict(_t)
    _mkt = implied_pct(_t.pop('odds', None))
    if _mkt:
        _t['mkt'] = _mkt
    teams[_name] = _t

# ---------- schedule ----------
schedule = [{'no': m['no'], 'date': m['date'], 'group': m['group'], 'home': m['home'], 'away': m['away'],
             'stadium': m.get('stadium', ''), 'city': m.get('city', ''),
             'status': 'played' if m.get('actual') else 'upcoming', 'actual': m.get('actual')}
            for m in wc['schedule']]

# ---------- full prediction (season-pass content) ----------
group_matches = {g: [{'no': x['no'], 'date': x['date'], 'home': x['home'], 'away': x['away'],
                      'hs': x['hs'], 'as': x['as'], 'actual': x['actual']} for x in ms]
                 for g, ms in pred['groupMatches'].items()}
finals = dict(pred['finals'])
finals['golden_boot'] = dict(finals['golden_boot'])
finals['golden_boot'].setdefault('player_zh', '姆巴佩')
finals.setdefault('young_star_en', 'Lamine Yamal (Spain)')
finals.pop('summary_zh', None)

# ---------- today (latest matchday file) ----------
def short(s, n=22):
    if not s: return ''
    return re.split(r'[（(:：,，;；]', s)[0].strip()[:n]

def cap_chip(s):
    m = re.search(r'(\d[\d,\.]{2,})', s or '')
    return m.group(1) if m else None

def roof_chip(s):
    s = s or ''
    if '露天' in s: return '露天'
    if '固定' in s or '不可开合' in s: return '固定顶棚'
    if '可开合' in s or '伸缩' in s: return '可开合顶棚'
    if '顶棚' in s or '封闭' in s or '室内' in s: return '有顶棚'
    return short(s, 8) or None

def pitch_chip(s):
    s = s or ''
    if '混合草' in s: return '混合草'
    if '天然' in s: return '天然草'
    if '人工' in s or '人造' in s: return '人造草'
    return None

today = None
md_files = sorted(glob.glob(os.path.join(ROOT, 'data/matchday-*.json')))
if md_files:
    md = json.load(open(md_files[-1]))
    date = md['matchday']
    # 每日精选:featured_no 显式指定,否则取置信度最高的一场
    featured_no = md.get('featured_no')
    if featured_no is None:
        featured_no = max(md['results'], key=lambda r: r['final'].get('confidence', 0))['match']['no']
    actuals = {x['no']: x.get('actual') for x in wc['schedule']}
    matches = []
    for r in md['results']:
        m, fin, ds = r['match'], sanitize(r['final']), sanitize(r['dossier'])
        w, v = ds.get('weather', {}), ds.get('money', {})
        wx, vn = w.get('weather', {}), w.get('venue', {})
        kk = m.get('kickoff', '')
        t = re.search(r'(\d{2}:\d{2}) 当地时间', kk)
        bj = re.search(r'北京时间([^)）]+)', kk)
        kickoff_zh = ('当地 ' + t.group(1) if t else '') + (' · 北京时间' + bj.group(1) if bj else '')
        env = [x for x in [
            ('🌡 ' + short(wx.get('temp_c'), 12)) if wx.get('temp_c') else None,
            ('☁️ ' + short(wx.get('condition'), 10)) if wx.get('condition') else None,
            ('💨 ' + short(wx.get('wind'), 16)) if wx.get('wind') else None,
            ('🏟 ' + '·'.join(x for x in [roof_chip(vn.get('roof')), pitch_chip(vn.get('pitch'))] if x)) if vn.get('roof') else None,
            ('👥 ' + cap_chip(vn.get('capacity'))) if cap_chip(vn.get('capacity')) else None,
        ] if x]
        entry = {
            'no': m['no'], 'group': m['group'], 'home': m['home'], 'away': m['away'],
            'stadium': m['stadium'], 'city': m['city'], 'kickoff_zh': kickoff_zh,
            'status': 'played' if actuals.get(m['no']) else 'upcoming',
            'actual': actuals.get(m['no']),
            'value': {'home': short((v.get('home') or {}).get('total_value'), 12),
                      'away': short((v.get('away') or {}).get('total_value'), 12)},
            'env': env,
            'factors': fin['factors'],
            'free': {'headline': fin['headline_zh'], 'lean': fin['lean_zh']},
            'sources': fin.get('sources_used') or [],
        }
        # 付费报告只随精选场次出库;其余场次的精确预测留在 data/ 源文件,赛后经 review 公开
        if m['no'] == featured_no:
            entry['paid'] = {'score': fin['score'],
                             'probs': {k: round(fin['probs'][k]) for k in ('home', 'draw', 'away')},
                             'confidence': round(fin['confidence']), 'analysis': fin['analysis_zh']}
        if r.get('en'):
            entry['en'] = sanitize(r['en'])
        matches.append(entry)
    mm, dd = date[5:7].lstrip('0'), date[8:10].lstrip('0')
    today = {'date': date, 'label': mm + ' 月 ' + dd + ' 日 · 比赛日', 'featured': featured_no, 'matches': matches,
             'note': '深度分析由当日多源联网调研生成并经事实核查,文中事实均可在「调研来源」中溯源;预测为模型输出,仅供研究参考,不构成任何投注建议。',
             'note_en': 'In-depth analysis is generated from same-day multi-source web research and fact-checked; every claim is traceable in Research Sources. Predictions are model output for research reference only — not betting advice.'}

data = {
    'meta': {'updated': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M') + ' (UTC+8)'},
    'pay': {'demo': True, 'products': {
        'day': {'price': '¥9.9'},
        'season': {'price': '¥98'},
    }},
    'teams': teams,
    'schedule': schedule,
    'pred': {'groupMatches': group_matches, 'tables': pred['tables'],
             'thirds': {'ranking': pred['thirds']['ranking'],
                        'qualified': [t['group'] for t in pred['thirds']['qualified']]},
             'ko': pred['ko'], 'finals': finals},
    'today': today,
    'review': sanitize(review),
    'recaps': sanitize((recaps or {}).get('matches', [])),
    'analytics': {
        'history': sanitize({k: v for k, v in history.items() if k != 'meta'}) if history else None,
        'experts': sanitize({k: v for k, v in experts.items() if k != 'meta'}) if experts else None,
    },
}
out = 'window.WC = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
with open(os.path.join(ROOT, 'assets/data.js'), 'w') as f:
    f.write(out)
print('assets/data.js written,', len(out), 'bytes; today =', (today or {}).get('date'),
      '; featured =', (today or {}).get('featured'),
      '; recaps =', len(data['recaps']),
      '; experts =', len((data['analytics']['experts'] or {}).get('experts', [])))
