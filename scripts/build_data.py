#!/usr/bin/env python3
"""
构建 assets/data.js —— 页面唯一的数据层。
自动化更新流程(每个比赛日跑一次):
  1. 完赛后:把真实比分写入 data/wc.json 对应场次的 "actual" 字段(如 "2-0");
  2. 复盘:编辑 data/review.json —— 填入 actual、hit(full=比分全中/dir=胜负方向命中/miss=未命中)、note/summary,state 改为 done;
  3. 新比赛日:生成 data/matchday-YYYY-MM-DD.json(结构见已有文件,由深度调研产出),
     并在 data/review.json 追加新的一天(predicted 填深度版比分);
  4. 运行: python3 scripts/build_data.py
"""
import json, re, glob, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(p):
    with open(os.path.join(ROOT, p)) as f:
        return json.load(f)

wc = load('data/wc.json')
pred = load('data/predictions.json')
site = load('data/site-data.json')
review = load('data/review.json')

# ---------- schedule ----------
schedule = [{'no': m['no'], 'date': m['date'], 'group': m['group'], 'home': m['home'], 'away': m['away'],
             'stadium': m.get('stadium', ''), 'city': m.get('city', ''),
             'status': 'played' if m.get('actual') else 'upcoming', 'actual': m.get('actual')}
            for m in wc['schedule']]

# ---------- full prediction (locked content) ----------
group_matches = {g: [{'no': x['no'], 'date': x['date'], 'home': x['home'], 'away': x['away'],
                      'hs': x['hs'], 'as': x['as'], 'actual': x['actual']} for x in ms]
                 for g, ms in pred['groupMatches'].items()}
finals = dict(pred['finals'])
finals['golden_boot'] = dict(finals['golden_boot'])
finals['golden_boot'].setdefault('player_zh', '姆巴佩')
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
    matches = []
    for r in md['results']:
        m, fin, ds = r['match'], r['final'], r['dossier']
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
        matches.append({
            'no': m['no'], 'group': m['group'], 'home': m['home'], 'away': m['away'],
            'stadium': m['stadium'], 'city': m['city'], 'kickoff_zh': kickoff_zh, 'status': 'upcoming',
            'value': {'home': short((v.get('home') or {}).get('total_value'), 12),
                      'away': short((v.get('away') or {}).get('total_value'), 12)},
            'env': env,
            'factors': fin['factors'],
            'free': {'headline': fin['headline_zh'], 'lean': fin['lean_zh']},
            'paid': {'score': fin['score'],
                     'probs': {k: round(fin['probs'][k]) for k in ('home', 'draw', 'away')},
                     'confidence': round(fin['confidence']), 'analysis': fin['analysis_zh']},
            'sources': fin.get('sources_used') or [],
        })
    mm, dd = date[5:7].lstrip('0'), date[8:10].lstrip('0')
    today = {'date': date, 'label': mm + ' 月 ' + dd + ' 日 · 比赛日', 'matches': matches,
             'note': '深度分析由当日多源联网调研生成并经事实核查,文中事实均可在「调研来源」中溯源;预测为模型输出,仅供参考。'}

data = {
    'meta': {'updated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M') + ' (UTC+8)'},
    'pay': {'demo': True, 'price': '¥9.9', 'period': '整届赛事'},
    'teams': site['teams'],
    'schedule': schedule,
    'pred': {'groupMatches': group_matches, 'tables': pred['tables'],
             'thirds': {'ranking': pred['thirds']['ranking'],
                        'qualified': [t['group'] for t in pred['thirds']['qualified']]},
             'ko': pred['ko'], 'finals': finals},
    'today': today,
    'review': review,
}
out = 'window.WC = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
with open(os.path.join(ROOT, 'assets/data.js'), 'w') as f:
    f.write(out)
print('assets/data.js written,', len(out), 'bytes; today =', today['date'] if today else None)
