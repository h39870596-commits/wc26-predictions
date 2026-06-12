#!/usr/bin/env python3
"""
WC26 赞助自动开通后端(单文件,标准库实现,Python ≥ 3.8)。

作用:用户在网站点「微信支付/支付宝」→ 本服务创建订单并返回收款二维码 →
用户扫码支付 → 本服务确认到账 → 签发 HMAC token → 前端凭 token 自动开通并拉取
当日预测内容(server/paid/<date>.json)。全程无需人工发码。

两种运行模式:
  本地联调(无需任何资质/依赖):
      MOCK=1 python3 server/app.py
      模拟支付: curl -X POST http://localhost:9000/api/mock/pay/<orderId>
  生产(需要商户资质,见 server/README.md):
      配置环境变量后部署到 腾讯云函数 / 任意可跑 Python 的主机

环境变量:
  PORT          监听端口(默认 9000)
  MOCK          =1 启用模拟支付模式
  TOKEN_SECRET  token 签名密钥(生产必须改成长随机串)
  ALLOW_ORIGIN  允许的前端来源(生产填站点域名,如 https://example.com;默认 *)
  PAID_DIR      付费内容目录(默认 server/paid,由 scripts/build_data.py 生成)
  SEASON_END    全程权益截止日(默认 2026-07-20)
  价格在 PRICES 常量中,单位:分(day=490 即 ¥4.9)

内置防护:
  - 下单限频:每 IP 每小时 10 单;查询限频:每 IP 每分钟 120 次(内存桶)
  - 订单 30 分钟过期;token 带签名与有效期,伪造/篡改即 401
  - CORS 限定来源;只接受白名单路由与参数格式
"""
import json, hmac, hashlib, base64, time, os, re, uuid, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG = {
    'port': int(os.environ.get('PORT', '9000')),
    'mock': os.environ.get('MOCK') == '1',
    'secret': os.environ.get('TOKEN_SECRET', 'dev-secret-change-me'),
    'origin': os.environ.get('ALLOW_ORIGIN', '*'),
    'paid_dir': os.environ.get('PAID_DIR', os.path.join(ROOT, 'paid')),
    'season_end': os.environ.get('SEASON_END', '2026-07-20'),
}
PRICES = {'day': 490, 'season': 4900}  # 分:¥4.9 / ¥49
ORDER_TTL = 30 * 60

ORDERS = {}
RATE = {}
LOCK = threading.Lock()

def b64u(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
def b64ud(s): return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

def sign_token(payload):
    p = b64u(json.dumps(payload, separators=(',', ':')).encode())
    sig = b64u(hmac.new(CFG['secret'].encode(), p.encode(), hashlib.sha256).digest())
    return p + '.' + sig

def verify_token(tok):
    try:
        p, sig = str(tok).split('.')
        good = b64u(hmac.new(CFG['secret'].encode(), p.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        return json.loads(b64ud(p))
    except Exception:
        return None

def latest_matchday():
    """当前可交付的比赛日 = paid 目录里最新的内容文件。"""
    try:
        days = sorted(f[:-5] for f in os.listdir(CFG['paid_dir'])
                      if re.match(r'^\d{4}-\d{2}-\d{2}\.json$', f))
        return days[-1] if days else None
    except OSError:
        return None

def make_token(product):
    if product == 'season':
        exp = int(time.mktime(time.strptime(CFG['season_end'], '%Y-%m-%d')) * 1000) + 86400000
        return sign_token({'p': 'season', 'exp': exp})
    d = latest_matchday() or time.strftime('%Y-%m-%d', time.gmtime(time.time() + 8 * 3600))
    return sign_token({'p': 'day', 'd': d, 'exp': int(time.time() * 1000) + 2 * 86400000})

def rate_ok(ip, bucket, limit, window):
    now = time.time()
    key = (ip, bucket)
    with LOCK:
        arr = [t for t in RATE.get(key, []) if now - t < window]
        if len(arr) >= limit:
            RATE[key] = arr
            return False
        arr.append(now)
        RATE[key] = arr
        return True

def gc_orders():
    now = time.time()
    with LOCK:
        for oid in [k for k, v in ORDERS.items() if now - v['t'] > ORDER_TTL]:
            del ORDERS[oid]

# ---------- 支付渠道适配(生产模式;商户参数见 server/README.md) ----------
def create_provider_order(oid, product, channel):
    """返回 {'qr': dataURL 或 None, 'qrText': 码串}。
    微信:Native 下单(POST /v3/pay/transactions/native)→ code_url
    支付宝:当面付 alipay.trade.precreate → qr_code
    推荐 pip 依赖:wechatpayv3 / python-alipay-sdk / qrcode(惰性导入)。"""
    raise RuntimeError('未配置商户参数 —— 接入步骤见 server/README.md;本地调试请用 MOCK=1')

def query_provider_paid(oid, order):
    """向渠道查单(微信 GET /v3/pay/transactions/out-trade-no/{oid} / 支付宝 alipay.trade.query),
    返回 True/False。生产用「查单」而非依赖回调,云函数实例无状态也能工作。"""
    raise RuntimeError('未配置商户参数')

# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = 'WC26Pay/1.0'

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', CFG['origin'])
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('X-Content-Type-Options', 'nosniff')

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.end_headers()

    def do_POST(self):
        ip = self.client_address[0]
        gc_orders()
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if 0 < length <= 4096 else b'{}'

        if self.path == '/api/order':
            if not rate_ok(ip, 'order', 10, 3600):
                return self._json(429, {'error': 'rate_limited'})
            try:
                body = json.loads(raw)
            except Exception:
                return self._json(400, {'error': 'bad_json'})
            product, channel = body.get('product'), body.get('channel')
            if product not in PRICES or channel not in ('wechat', 'alipay'):
                return self._json(400, {'error': 'bad_params'})
            oid = uuid.uuid4().hex
            ORDERS[oid] = {'product': product, 'channel': channel, 'paid': False,
                           't': time.time(), 'amount': PRICES[product]}
            if CFG['mock']:
                return self._json(200, {'orderId': oid, 'qr': None,
                                        'qrText': 'MOCK-PAY:' + oid, 'amount': PRICES[product]})
            try:
                qr = create_provider_order(oid, product, channel)
            except Exception as e:
                return self._json(500, {'error': 'provider', 'detail': str(e)})
            return self._json(200, {'orderId': oid, 'amount': PRICES[product], **qr})

        m = re.match(r'^/api/mock/pay/([0-9a-f]{32})$', self.path)
        if m and CFG['mock']:
            order = ORDERS.get(m.group(1))
            if not order:
                return self._json(404, {'error': 'no_order'})
            order['paid'] = True
            return self._json(200, {'ok': True})

        # 生产回调位:/api/notify/wechat /api/notify/alipay(必须验签后再置 paid,见 README)
        return self._json(404, {'error': 'not_found'})

    def do_GET(self):
        ip = self.client_address[0]
        if not rate_ok(ip, 'get', 120, 60):
            return self._json(429, {'error': 'rate_limited'})

        m = re.match(r'^/api/order/([0-9a-f]{32})/status$', self.path)
        if m:
            order = ORDERS.get(m.group(1))
            if not order:
                return self._json(404, {'error': 'no_order'})
            if not order['paid'] and not CFG['mock']:
                try:
                    order['paid'] = bool(query_provider_paid(m.group(1), order))
                except Exception:
                    pass
            if order['paid']:
                return self._json(200, {'paid': True, 'token': make_token(order['product'])})
            return self._json(200, {'paid': False})

        if self.path.startswith('/api/content'):
            q = parse_qs(urlparse(self.path).query)
            tok = (q.get('token') or [''])[0]
            date = (q.get('date') or [''])[0]
            claims = verify_token(tok)
            if not claims:
                return self._json(401, {'error': 'bad_token'})
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
                return self._json(400, {'error': 'bad_date'})
            now_ms = int(time.time() * 1000)
            if claims.get('exp', 0) < now_ms:
                return self._json(403, {'error': 'expired'})
            if claims.get('p') == 'day' and claims.get('d') != date:
                return self._json(403, {'error': 'not_entitled'})
            if claims.get('p') not in ('day', 'season'):
                return self._json(403, {'error': 'not_entitled'})
            fp = os.path.join(CFG['paid_dir'], date + '.json')
            if not os.path.isfile(fp):
                return self._json(404, {'error': 'no_content'})
            with open(fp) as f:
                return self._json(200, json.load(f))

        return self._json(404, {'error': 'not_found'})

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    print('WC26 pay server :%d  mock=%s  paid_dir=%s' % (CFG['port'], CFG['mock'], CFG['paid_dir']))
    ThreadingHTTPServer(('0.0.0.0', CFG['port']), Handler).serve_forever()
