#!/usr/bin/env python3
"""
生成赞助解锁码(收款码 + 解锁码闭环用)。

用法:
    python3 scripts/gen_codes.py [单日码数量] [全程码数量]    # 默认 20 10

产出:
  - private/codes-private.txt  解锁码明文(已 gitignore,仅自己保存,千万不要提交/公开;
                               用户支付后从这里取一个码发给对方,用过的手动划掉)
  - data/codes.json            码的 SHA-256 哈希(公开,前端凭哈希校验,看源码拿不到明文)

之后运行 python3 scripts/build_data.py 并 push 生效。

已知局限(无后端核销):同一个码可被多人重复使用,请一人一码发放;
流量大了之后应迁移到商户 API + 后端核销(见 README)。
"""
import hashlib, json, os, secrets, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # 去掉易混淆的 I/L/O/0/1

def gen_code():
    return 'WC26-' + '-'.join(''.join(secrets.choice(ALPHABET) for _ in range(5)) for _ in range(2))

def norm(code):
    return ''.join(ch for ch in code.upper() if ch.isalnum())

def h(code):
    return hashlib.sha256(norm(code).encode()).hexdigest()

def main():
    n_day = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    n_season = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    codes_path = os.path.join(ROOT, 'data/codes.json')
    store = {'day': [], 'season': []}
    if os.path.exists(codes_path):
        store = json.load(open(codes_path))

    new_day = [gen_code() for _ in range(n_day)]
    new_season = [gen_code() for _ in range(n_season)]
    store['day'] += [h(c) for c in new_day]
    store['season'] += [h(c) for c in new_season]
    json.dump(store, open(codes_path, 'w'), indent=1)

    priv_dir = os.path.join(ROOT, 'private')
    os.makedirs(priv_dir, exist_ok=True)
    priv = os.path.join(priv_dir, 'codes-private.txt')
    with open(priv, 'a') as f:
        f.write('\n# ===== 新批次 =====\n')
        f.write('# 单日码(解锁当天全部预测,发码请一人一码,用过划掉):\n')
        for c in new_day:
            f.write(c + '\n')
        f.write('# 全程码(解锁整届赛事每日预测):\n')
        for c in new_season:
            f.write(c + '\n')

    print('生成 %d 个单日码 + %d 个全程码' % (n_day, n_season))
    print('明文: private/codes-private.txt (gitignore,勿公开)')
    print('哈希: data/codes.json (累计 day=%d, season=%d)' % (len(store['day']), len(store['season'])))
    print('下一步: python3 scripts/build_data.py && git add -A && git commit && git push')

if __name__ == '__main__':
    main()
