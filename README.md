# WC26 AI 数据分析 · 2026 美加墨世界杯

**AI 大数据体育数据分析平台**(中英双语):基于「五维分析法」与多智能体联网调研的世界杯赛事数据分析站。定位为数据分析与研究参考,**非博彩网站**——不提供任何投注功能,公开字段禁用盘口/赔率措辞,全部结论带来源可溯。

纯静态站点,无后端依赖:`index.html`(壳层:安全策略+样式+骨架)+ `assets/app.js`(渲染层)+ `assets/data.js`(数据层)。

## 站点结构(三视图 SPA)

| 视图 | 内容 | 访问 |
|---|---|---|
| 今日预测 | 当日全部比赛:免费全要素分析(天气/场馆/身价/状态/伤病/市场预期)+ 赞助可见的 AI 预测报告(每场:比分/概率/置信度/深度分析) | 免费 + 赞助 |
| 数据分析 | 48 队实力评分、赛事格局分析、AI 模型展望(只展示冠军/四强/金靴名单,**不含逐场比分**)、历史数据统计(1930–2022)、专家观点(带原始来源) | 全部免费 |
| 赛果复盘 | 真实赛果、比赛复盘(双语叙事+时间线+数据)、AI 预测 × 实际对照(未完赛密封 🔒,完赛公开,可核验) | 免费 |

## 赞助模式(当前为演示支付)

核心原则:**任何人(包括赞助者)都只能看到「当日比赛」的预测,未来赛果绝不提前发布**。逐场未来推演数据(小组比分/对阵树等)在构建时就不会进入 `data.js`。

- **单日赞助 ¥9.9**:查看今日全部场次的 AI 预测报告,仅当日有效(localStorage 存日期,跨日自动失效)。
- **全程赞助 ¥98**:赛事期间每天自动解锁当天全部预测报告,按日推送直至决赛。
- 措辞规范:全站使用「赞助 / 支持 / 查看权益」,不使用「购买预测」;弹窗与页脚均注明"赞助属自愿支持行为,回馈为数据分析内容查看权益,非投注服务"。

### 接真实收款(已注册微信/支付宝商家收款码)

**资金流向**:用户扫收款码支付的钱**直接进入你的微信商户余额 / 支付宝账户**(收款码绑定的账户),与网站无关;网站只负责展示码与开通查看权益。静态收款码无法自动确认订单,因此采用「收款码 + 解锁码」闭环(已实现):

1. **放码**:把微信收款码截图存为 `assets/qr-wechat.png`、支付宝存为 `assets/qr-alipay.png`(任一存在即自动展示;都不存在时二维码区自动隐藏);
2. **关演示**:`scripts/build_data.py` 里 `'demo': True` 改为 `False`,重新 build——模拟支付按钮消失;
3. **生成解锁码**:`python3 scripts/gen_codes.py 20 10`(20 个单日码+10 个全程码)——明文在 `private/codes-private.txt`(已 gitignore,**勿公开**),前端只存 SHA-256 哈希;
4. **日常发码**:用户扫码支付(微信/支付宝会实时推送收款通知)→ 用户点弹窗「提交支付凭证」发邮件 → 你核对收款记录后回复一个未用过的解锁码(用过的在私密文件里划掉)→ 用户输入解锁码即开通(单日码=兑换当天,全程码=整届)。

已知局限(小流量可接受):无后端核销,同一码可被转发复用——发码请一人一码;预测内容仍在前端 `data.js` 中,查看源码可绕过。**流量起来后升级为商户 API + 云函数**:微信支付 Native/JSAPI + 支付宝当面付 → 后端创建订单 → 回调验签 → 发放 token,前端把 `WCPay.checkout` 替换为真实收银台,且付费数据移到服务端下发(需办理微信支付商户号/支付宝开放平台,一般要求营业执照)。

## BUG 反馈 / 访问统计(配置项在 `assets/app.js` 顶部 `SITE_CONFIG`)

- **BUG 反馈**:页脚「🐛 反馈问题」→ 弹窗。默认走邮件(`feedbackEmail`,会打开用户邮件应用,正文自动附环境信息);在 https://formspree.io 免费注册一个表单,把地址填入 `feedbackEndpoint`,弹窗即出现「直接提交」按钮(在线提交,Formspree 后台可看+邮件通知)。
- **访问统计**(访问量/停留时长/来源,二选一或都开):
  - **百度统计**(推荐,国内访客统计完整,有停留时长):https://tongji.baidu.com 注册站点 → 拿到 `hm.js?` 后面的 32 位 ID → 填入 `baiduTongji`;
  - **GoatCounter**(国外轻量,无 Cookie):https://www.goatcounter.com 注册 → 站点代码填入 `goatcounter`。
- CSP 已预放行上述域名,填好 ID 即生效,无需改其他代码。

## 安全加固

- **CSP**(index.html `<meta>`):`default-src 'none'`,脚本仅允许本站与已声明统计域名,**全站无内联脚本**(JS 全部外置 app.js);
- **XSS**:所有数据驱动字符串经 `esc()` 全量转义(含引号),外链 URL 经 `safeUrl()` 白名单(仅 http/https);
- **点击劫持**:GitHub Pages 无法设置 `frame-ancestors` 响应头,app.js 内置 frame-busting 兜底;
- **隐私**:`referrer` 策略 strict-origin-when-cross-origin,外链 `rel="noopener noreferrer"`;无 Cookie、无敏感数据,localStorage 仅存语言与查看权益标记;
- **HTTPS**:GitHub Pages 强制(仓库 Settings → Pages → Enforce HTTPS 保持勾选);
- 静态站无后端攻击面;支付接入后端后需另做订单验签与限流。

## 目录结构

```
index.html              壳层(CSP/meta/样式/骨架,无内联脚本)
assets/app.js           渲染层(双语 i18n、赞助、反馈、统计槽;SITE_CONFIG 在顶部)
assets/data.js          数据层 —— 页面唯一数据来源(脚本生成,勿手改)
scripts/build_data.py   构建脚本:data/*.json → assets/data.js(含去博彩化兜底清洗)
data/wc.json            48 队基础信息 + 72 场小组赛赛程(actual = 真实比分)
data/predictions.json   全程推演源数据(仅 finals 出库为「模型展望」,逐场比分不出库)
data/matchday-*.json    每个比赛日的深度调研档案(含来源;每场附 "en" 英文块)
data/review.json        预测 × 实际复盘(中文字段 + *_en;pending 日的 note 不写概率/置信度)
data/recaps.json        已赛场次复盘档案(双语,逐日追加)
data/history.json       世界杯历史数据(1930–2022,带来源)
data/experts.json       专家与模型观点(双语+name_en/org_en/pick_en,带原始链接)
data/site-data.json     球队展示数据(中文名/旗帜/五维/综合分/odds→构建时转隐含概率)
```

## 每日自动化更新

已配置 Claude Code 定时任务(每天北京时间 14:00,此时前一比赛日已全部完赛),自动执行:

1. **回填赛果**:联网核查昨日完赛比分 → 写入 `data/wc.json` 对应场次 `actual`;
2. **复盘**:更新 `data/review.json`(actual/hit/note+note_en,state→done;pending 日不写概率),并把双语复盘档案(叙事/时间线/转折点/数据/来源)追加进 `data/recaps.json`;
3. **新比赛日**:深度调研今日全部比赛(天气/场馆/身价/伤病/状态/市场隐含概率,多源核查带来源),生成 `data/matchday-YYYY-MM-DD.json`(每场含 en 英文块;**禁用盘口/赔率/博彩公司措辞**),并在 `review.json` 追加今日条目;
4. **构建发布**:`python3 scripts/build_data.py` → `git commit` → `git push`(GitHub Pages 自动上线)。

手动执行同样流程即一条命令链:

```bash
python3 scripts/build_data.py
git add -A && git commit -m "update: matchday YYYY-MM-DD" && git push
```

> 定时任务管理:在 Claude Code 里说"查看/暂停/修改定时任务"即可;任务在本机执行,需电脑当时处于开机状态(睡眠中的 Mac 一般会在唤醒后补跑,见任务设置)。

## 合规定位

- 全站标注「AI 大数据体育数据分析平台 / 非博彩 / 不构成投注建议 / 拒绝赌球」(页头横幅、赞助弹窗、报告脚注、页脚)。
- 体育赛事预测在微信小程序属受限类目;境内有偿赛事预测有监管风险,赞助模式正式上线前建议咨询专业合规意见。

## 免责声明

本站全部预测为统计模型与公开资料分析结果,仅供研究参考与观赛娱乐,不构成任何投注建议;请理性观赛,拒绝赌球。已赛比分为真实赛果;事实性资料带来源标注,生成时间见页脚。

---

🤖 由 [Claude Code](https://claude.com/claude-code) 多智能体调研与构建
