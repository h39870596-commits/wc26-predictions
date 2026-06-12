# 赞助自动开通后端(server/app.py)

让用户**支付后自动解锁**(单日/全程),无需人工发码。单文件、零依赖(模拟模式),生产部署只需配置商户参数。

## 工作原理

```
前端点「微信支付/支付宝」
  → POST /api/order          创建订单,返回收款二维码
  → 用户扫码支付
  → GET /api/order/:id/status 前端每 2.5 秒轮询;后端向微信/支付宝查单
  → 确认到账 → 返回签名 token(单日=绑定当日;全程=有效期至赛事结束)
  → 前端存 token,GET /api/content?date=&token= 拉取当日预测内容并渲染
```

付费内容(`server/paid/<date>.json`)由 `scripts/build_data.py` 每日生成,**不入 git**;
上线本后端后,把 `build_data.py` 里 `PAID_IN_CLIENT` 改为 `False` 并把 `pay.demo` 改为 `False`,
此后预测内容不再打包进前端 `data.js`,只能凭有效 token 从后端获取——看源码也拿不到。

## 本地联调(无需任何资质)

```bash
MOCK=1 python3 server/app.py                       # 启动模拟后端 :9000
# assets/app.js 里 SITE_CONFIG.payApi 填 'http://localhost:9000/api'
# 网页下单后,用订单号模拟支付:
curl -X POST http://localhost:9000/api/mock/pay/<orderId>
# 页面 2.5 秒内自动开通
```

## 生产部署(三步)

**前提资质**(因此现在还没上线):
- 微信:微信支付商户号(pay.weixin.qq.com)。如果你的"商家收款码"是通过微信收款商业版开通的,登录商户平台查看是否已有商户号;无营业执照可申请"小微商户"。开通 **Native 支付** 产品,获取:商户号、APIv3 密钥、商户证书序列号、商户私钥。
- 支付宝:开放平台(open.alipay.com)创建应用,签约**当面付**;获取 APPID、应用私钥、支付宝公钥。

**第一步:接渠道**。`pip install wechatpayv3 python-alipay-sdk qrcode`,在 app.py 的
`create_provider_order`(下单→码串→二维码 dataURL)与 `query_provider_paid`(查单)里
按注释填入 SDK 调用——采用"查单"而非回调,云函数无状态也可靠;回调路由位已留好可选加。

**第二步:部署**。推荐腾讯云函数(SCF,Web 函数,Python 3.10,基本免费),也可用任意能跑
Python 的服务器。环境变量:`TOKEN_SECRET`(长随机串,必改)、`ALLOW_ORIGIN`(填站点域名)、
`MOCK` 删除。把每日构建产物 `server/paid/` 同步到函数(或让定时任务在部署环境跑 build)。

**第三步:接前端**。`assets/app.js` 的 `SITE_CONFIG.payApi` 填后端地址(如
`https://pay.你的域名/api`),并把该域名加进 `index.html` CSP 的 `connect-src`;
`build_data.py` 里 `pay.demo=False`、`PAID_IN_CLIENT=False`,重新 build + push。

## 内置防护

- 下单限频(每 IP 每小时 10 单)、查询限频(每 IP 每分钟 120 次)
- 订单 30 分钟过期自动回收;参数/路由白名单校验;请求体上限 4KB
- token 为 HMAC-SHA256 签名,伪造/篡改/过期一律 401/403
- CORS 限定站点来源;响应带 nosniff
- 生产清单:TOKEN_SECRET 用 32+ 位随机串;ALLOW_ORIGIN 填精确域名;启用 HTTPS;
  回调(若启用)必须验签;金额以服务端 PRICES 为准,不信任前端
