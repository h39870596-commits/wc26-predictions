# WC26 预测站 · 2026 美加墨世界杯

基于「五维分析法」与多智能体联网调研的世界杯预测站:今日赛场深度预测(天气/温度/场馆/身价/伤病/盘口等全要素)、赛果与预测复盘、全程 104 场推演(付费解锁,当前为演示模式)。

纯静态站点,无后端依赖:`index.html`(渲染层)+ `assets/data.js`(数据层)。

## 目录结构

```
index.html              渲染层(三视图 SPA:今日赛场 / 赛果复盘 / 全程预测)
assets/data.js          数据层 —— 页面唯一数据来源,自动化更新只改这个文件(由脚本生成)
scripts/build_data.py   数据层构建脚本(把 data/*.json 编译为 assets/data.js)
data/wc.json            48 队基础信息 + 72 场小组赛赛程(actual 字段 = 真实比分)
data/predictions.json   全程推演结果(五维评分/小组/淘汰赛/冠军)
data/matchday-*.json    每个比赛日的深度调研与预测档案(含来源)
data/review.json        预测 × 实际结果复盘记录(手工/自动维护)
data/site-data.json     球队展示数据(中文名/旗帜/五维/综合分)
```

## 每日自动化更新流程

比赛日结束后执行(可交给 Claude Code 定时任务或任意 cron + 脚本):

1. **回填赛果**:把真实比分写入 `data/wc.json` 对应场次的 `actual`(如 `"2-0"`);
2. **复盘**:编辑 `data/review.json` —— 填入 `actual`、`hit`(`full` 比分全中 / `dir` 胜负方向命中 / `miss` 未命中)、`note`,该日 `state` 改为 `done`;
3. **新比赛日**:生成 `data/matchday-YYYY-MM-DD.json`(深度调研档案,结构参照已有文件),并在 `data/review.json` 追加新的一天(`predicted` 填深度版比分);
4. **构建并发布**:

```bash
python3 scripts/build_data.py
git add -A && git commit -m "update: matchday YYYY-MM-DD" && git push   # GitHub Pages 自动发布
```

> 第 1、3 步需要联网调研(抓比分、查天气/伤病/盘口),适合由 Claude Code 的定时任务(scheduled task)整体代办:调研 → 写文件 → 构建 → push 一条龙。

## 付费墙(当前为演示模式)

- 前端入口已就位:`window.WCPay.checkout(channel)`(index.html 内),演示模式延时后直接返回成功,**不产生真实扣款**,页面与弹窗均有"演示模式"标注。
- 接真实支付需要:
  1. 后端创建订单接口(商户号:微信支付 Native/JSAPI、支付宝当面付/手机网站支付);
  2. 支付回调由后端验签后发放解锁凭证(token / 会员态);
  3. 前端把 `WCPay.checkout` 替换为「创建订单 → 拉起收银台 → 轮询/回调拿 token」。
- ⚠️ **当前演示版的"付费内容"仍打包在前端 `data.js` 里,任何人查看源码即可绕过,不可直接商用**。正式上线必须把付费数据移到服务端,凭 token 下发。

## 微信小程序迁移

- 数据层(`assets/data.js` 的 JSON 结构)可直接复用为小程序云开发数据或接口返回;视图层按 WXML/WXSS 重写,三视图对应三个 tab 页。
- 支付预留:`WCPay.checkout('wechat')` 对应小程序内 `wx.requestPayment`(需小程序支付商户号 + 后端统一下单)。
- ⚠️ **合规风险提示**:体育赛事预测属微信小程序受限类目,"付费购买比分预测"很可能被审核认定为竞猜/博彩类信息服务而拒审或下架;境内对有偿提供赛事预测亦有监管风险。建议小程序版本仅保留免费资讯与复盘内容,付费功能上线前咨询专业合规意见。

## 免责声明

本站全部预测为统计模型与公开资料分析结果,仅供参考与娱乐,不构成任何投注建议;请理性观赛,拒绝赌球。已赛比分为真实赛果;深度分析中的事实均带来源标注,生成时间见页面页脚。

---

🤖 由 [Claude Code](https://claude.com/claude-code) 多智能体调研与构建
