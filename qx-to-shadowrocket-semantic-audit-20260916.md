# 独立 QX 重写/分流资源到 Shadowrocket Debug 映射审计

- 日期：2026-09-16
- 范围：仅审计 `modules/QuantumultX-去广告精确补充-rewrite.conf` 与 `modules/QuantumultX-去广告精确补充-filter.list` 的实际规则。
- 排除：没有把完整 Quantumult X 配置、其他本地模块、远程模块或既有主模块作为转换来源。
- 目标：生成独立的 `modules/Shadowrocket-去广告精确补充-Debug.sgmodule` 及两个本地 Debug 脚本；不得与主模块、同源 QX 资源同时启用。
- 重要边界：这是静态语义审计和观测模块，未做 Shadowrocket 真机、HTTPS 解密、脚本加载、UI 或网络回放验证；文中“对应实现”不等于真机已生效。

## 转换总则

| QX 语法 | Shadowrocket 实现 | 说明 |
| --- | --- | --- |
| `url reject-200` / `url reject-dict` / `url reject` | `[URL Rewrite]` 的 `regex - reject-200` / `regex - reject-dict` / `regex - reject` | 逐条保留 QX 原动作；三者的状态/响应体语义不同，需专项回归。 |
| `jsonjq-response-body` | `[Body Rewrite]` 的 `http-response-jq` | 保留两条 JSON jq 规则，不把它们误写成 URL Rewrite。 |
| `script-response-body` | `[Script]` 的 `type=http-response` | 两个 Debug 脚本均 `requires-body=true,max-size=-1,timeout=30,engine=jsc`，脚本从发布仓库 Raw URL 加载，只观测并永远返回原始 body。 |
| `host,...,reject` | `[Rule]` `DOMAIN,...,REJECT` | `host` 是精确主机映射，不扩大为 `DOMAIN-SUFFIX`。 |
| `host-suffix,...,reject` | `[Rule]` `DOMAIN-SUFFIX,...,REJECT` | 保留 QX 的后缀范围，不新增其他泛域名。 |
| `host,...,direct` | `[Rule]` `DOMAIN,...,DIRECT` | direct 例外置于对应拒绝规则之前，保留源文件顺序意图。 |

## rewrite.conf 逐条审计

依赖缩写：`URL`=请求 URL；`Resp`=响应 body；`Hdr`=请求/响应 header；`ReqBody`=请求 body。URL Rewrite 拒绝规则只依赖 URL；两条脚本还依赖 Resp/Hdr；两条 jq 依赖 Resp。

| 行 | QX 原规则 | 功能 | 依赖数据 | Shadowrocket 对应实现 | 兼容性风险 | 验证方法 |
| ---: | --- | --- | --- | --- | --- | --- |
| 9 | `^https?:\/\/ad\.baihemob\.com\/(infoConfig\|checkCd\|setGInfo)\/ url reject-200` | 小蚕广告配置/内容接口 | URL | `[URL Rewrite]` 同 regex，动作保留为 QX 原规则末尾动作 | reject-200 与 reject 的状态/正文不同 | 静态 regex 编译；真机检查该路径与业务功能 |
| 10 | `^https?:\/\/inner\.baihemob\.com\/ad2(\/\|\?\|$) url reject-200` | 小蚕 ad2 接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上；查询串边界需回放 | URL 样本覆盖 `/ad2`、`/ad2/`、`?` |
| 12 | `^https?:\/\/gw\.xiaocantech\.com\/rpc(?:\?.*)?$ url script-response-body .../xiaocan-matchplacement.js` | 小蚕 RPC 响应脚本 | URL+Hdr+Resp | `[Script]` `xiaocan_debug` + `xiaocan-matchplacement-shadowrocket-debug.js` | QX 与 Shadowrocket 对同一 `/rpc` 的 request-header 关联能力不同；Debug 脚本不修改 | 真机专门确认脚本调用、`methodname` 可见性；不能以静态通过代替 |
| 15 | `^https?:\/\/cgcr\.wtzw\.com\/client\/api\/v1\/config(?:\?.*)?$ url script-response-body .../qimao-qm-focus-debug.js` | 七猫 qm_focus 编码观察 | URL+Resp+响应 Hdr | `[Script]` `qimao_debug` + `qimao-qm-focus-shadowrocket-debug.js` | 脚本加载和编码解码能力依客户端；不假设可解密 | 真机记录 status/content-type/长度和分类；比对 body 原样 |
| 18 | `^https?:\/\/ads-bid\.leadmoad\.com\/api\/adx\/(?:server\|config) url reject-200` | 小蚕 SDK 配置/竞价 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | reject 语义变化 | 精确路径请求回放 |
| 19 | `^https?:\/\/ads-bid\.leadmoad\.com\/api\/v1\/ad\/config url reject-200` | 小蚕广告配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 20 | `^https?:\/\/ad-api\.adn-plus\.com\.cn\/mb\/sdk1\/json url reject-200` | 小蚕 SDK 广告配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 21 | `^https?:\/\/adprolink\.xwpbj\.com\/mediation\/sdk\/getPlacementMappingIos url reject-200` | iOS 广告 placement 映射 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 22 | `^https?:\/\/de\.ad\.gameley\.com\/delivery\/request\/getad\/(?:config\|adn) url reject-200` | Gameley 广告投放配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 两个末端路径回放 |
| 23 | `^https?:\/\/sdkapi\.richmob\.cn\/sylas\/sdk\/v2\/ads\/conf url reject-200` | RichMob 广告配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 24 | `^https?:\/\/adsdk\.richmob\.cn\/sdk\/rtb\/v3 url reject-200` | RichMob RTB | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 25 | `^https?:\/\/sdkconf\.adbiding\.com\/sdk_config\/v3\/config url reject-200` | AdBiding SDK 配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 26 | `^https?:\/\/bid\.adbiding\.com\/bid url reject-200` | AdBiding 竞价 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 精确路径请求回放 |
| 29 | `^https?:\/\/vdn-ad\.vzuu\.com\/HD\/ad_bidding_ob\/.*(?:\?.*)?$ url reject-200` | 开屏视频/广告对象 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | `.*` 范围大但来源规则如此 | URL 正/负样本回放 |
| 30 | `^https?:\/\/nexorax\.datads\.cn\/dsp-files\/.*\.(?:jpg\|png)(?:\?.*)?$ url reject-200` | 广告图片素材 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 图片响应状态变化 | jpg/png 路径回放并确认业务图片未命中 |
| 31 | `^https?:\/\/p11-sign\.douyinpic\.com\/tos-cn-v-0051\/.*~tplv-noop\.image(?:\?.*)?$ url reject-200` | 抖音广告图片 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 与其他抖音图片规则的边界需实测 | 正负 URL 回放 |
| 32 | `^https?:\/\/lf-cdn-tos\.bytescm\.com\/obj\/static\/ad\/play-comp\/playable-component-sdk\/package\.ugen\.json(?:\?.*)?$ url reject-200` | 可执行广告组件包 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 组件失败可能影响广告容器；不扩大到整域 | 精确包 URL 回放 |
| 35 | `^https?:\/\/p6sops-cn\.p6sai\.com:2390\/static\/advert\.json(?:\?.*)?$ url reject-200` | 睿博士静态广告开关 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 端口匹配需客户端确认 | 带 `:2390` URL 回放 |
| 38 | `^https?:\/\/api\.wtzw\.com\/api\/free\/dd(?:\?.*)?$ url jsonjq-response-body '.data.ad={}'` | 七猫 free 接口清空广告字段 | Resp | `[Body Rewrite] http-response-jq` 同 URL + `'.data.ad={}'` | jq 引擎/JSON schema 差异；这是实际改写而非 Debug 观测 | 静态检查 jq；用 JSON fixture 比较仅 `.data.ad` 变化 |
| 39 | `^https:\/\/api-cfg\.wtzw\.com\/v\d\/splash\/ url reject-dict` | 七猫开屏接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | reject-dict 与 reject 不等价 | 版本路径回放 |
| 40 | `^https:\/\/api-cfg\.wtzw\.com\/v\d\/adv\/ url reject` | 七猫广告接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 原 reject 语义基本接近，但仍需客户端确认 | 版本路径回放 |
| 41 | `^https:\/\/api-cfg\.wtzw\.com\/v\d\/offline-adv\/index url reject-dict` | 七猫离线广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | reject-dict 差异 | 精确路径回放 |
| 42 | `^https:\/\/api-cfg\.wtzw\.com\/v\d\/operation\/index\?ad_personal_switch url reject-dict` | 七猫个性化广告开关接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 查询串条件需验证 Shadowrocket regex 行为 | 带/不带查询参数回放 |
| 43 | `^https:\/\/api-cfg\.wtzw\.com\/v\d\/reward\/ url reject` | 七猫激励广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 可能影响奖励流程 | 业务负向回归 |
| 44 | `^https:\/\/api-bc\.wtzw\.com\/api\/v4\/search\/dispose url reject-dict` | 七猫搜索广告处理 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 返回类型差异 | 精确路径回放 |
| 45 | `^https:\/\/api-bc\.wtzw\.com\/api\/v\d\/book-store\/config url reject-dict` | 七猫书城配置广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 书城配置可能依赖响应结构 | 版本路径回放 |
| 46 | `^https:\/\/api-bc\.wtzw\.com\/api\/v\d\/book-store\/push-book url reject-dict` | 七猫推书广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 业务推送误伤风险 | 精确路径回放 |
| 47 | `^https:\/\/api-bc\.wtzw\.com\/api\/v\d\/operation url reject-dict` | 七猫运营接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 运营数据兼容性风险 | 版本路径回放 |
| 48 | `^https:\/\/api-gw\.wtzw\.com\/welf\/app\/v\d\/task\/red-packet url reject-dict` | 七猫红包任务广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 可能影响任务/福利功能 | 业务负向回归 |
| 50 | `^https?:\/\/a6-remad\.qm989\.com\/v\d\/(?:get-splash\|get-contract\|preload\|get-bid-price\|get-ads)\/index(?:\?.*)?$ url reject-200` | 七猫开屏投放接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 5 个动作共享规则；状态体差异 | 各动作路径回放 |
| 51 | `^https?:\/\/cdn-new-ad\.wtzw\.com\/commerce\/images\/offline\/(?:chapter\|bottom)_\d+\.jpg(?:\?.*)?$ url reject-200` | 七猫章节/底部素材 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 资源失败可能影响占位 | chapter/bottom 正负样本 |
| 54 | `^https?:\/\/cn-acs\.m\.cainiao\.com\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.(show\|mshow)\.cn\/ url reject-200` | 菜鸟广告接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 仅路径拒绝；不应扩大为 cainiao 整域 | show/mshow 回放及业务首页 |
| 55 | `^https?:\/\/guoguo-cdn\.cainiao\.com\/cnn_guide_ads\/.*\/guide_ads_main_page\/bundle\.zip url reject-200` | 菜鸟广告组件包 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | `.*` 中间层级需验证 | 组件包正负样本 |
| 56 | `^https?:\/\/netflow-mtop\.cainiao\.com\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.(batch\.show\.v2\|index\|mshow\|show)\.cn\/ url reject-dict` | 菜鸟广告投放接口 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | reject-dict 差异；不整域拒绝 | 4 个方法回放并检查首页 |
| 59 | `^https?:\/\/umestartup\.umetrip\.com\/gateway\/api\/umetrip\/native(?:\?.*)?$ url reject-200` | 航旅纵横开屏 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 状态体差异 | native 路径回放 |
| 60 | `^https?:\/\/(discardrp\|startup\|appmsg\|sns)\.umetrip\.com\/gateway\/api\/umetrip\/native url reject-200` | 航旅纵横广告资源 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 4 主机共享规则；需检查非广告 native | 4 主机路径回放 |
| 61 | `^https?:\/\/oss\.umetrip\.com\/fs\/advert\/polite\/ url reject-200` | 航旅纵横 polite 素材 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 路径下资源可能多样 | 资源路径正负样本 |
| 62 | `^https?:\/\/oss\.umetrip\.com\/fs\/advert\/icon\/ url reject-200` | 航旅纵横广告图标 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 同上 | 资源路径正负样本 |
| 65 | `^https?:\/\/a\.cpic\.com\.cn\/api\/app\/appservice\/configCenter\/getFloorStartOpenPage.* url reject-200` | 太平洋保险开屏配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 尾部通配可能覆盖非广告参数 | 参数正负样本 |
| 66 | `^https?:\/\/a\.cpic\.com\.cn\/api\/app\/appservice\/configCenter\/getFloorGlobalWindows url reject-dict` | 太平洋保险窗口配置 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 返回类型差异 | 精确路径回放 |
| 67 | `^https?:\/\/tklife\.mobile\.taikang\.com\/bu-homepage\/popups\/common\/v2 url reject-dict` | 泰康弹窗 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 可能包含业务弹窗 | 精确路径回放 |
| 68 | `^https?:\/\/tklife\.mobile\.taikang\.com\/bu-digistrathub\/data-platform\/advertise\/recommend\/native\/getRecommendAds url reject-dict` | 泰康推荐广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 返回类型差异 | 精确路径回放 |
| 69 | `^https?:\/\/tklife\.mobile\.taikang\.com\/bu-digistrathub\/data-platform\/advertise\/recommend\/native\/getLaunchRecommendAds.* url reject-200` | 泰康启动推荐广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 尾部通配风险 | 启动推荐路径回放 |
| 72 | `^https?:\/\/m\.ctrip\.com\/restapi\/soa2\/\d+\/scjson\/tripAds url reject-200` | 携程 tripAds | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 数字版本段需确认 | 多版本路径回放 |
| 73 | `^https?:\/\/m\.ctrip\.com\/restapi\/soa2\/13916\/json\/tripAds.* url reject-200` | 携程固定接口广告 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 尾部通配风险 | 固定接口参数回放 |
| 74 | `^https?:\/\/ma-adx\.ctrip\.com\/_ma\.gif.* url reject-200` | 携程监测像素 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 像素拒绝通常安全但需确认 | gif URL 回放 |
| 75 | `^https?:\/\/app-sh\.catlinks\.cn\/api\/token\/banner\/listOnDevicePage.* url reject-200` | Catlinks banner | URL | 同 regex，动作保留为 QX 原规则末尾动作 | banner API 可能承载非广告字段 | 正负请求回放 |
| 76 | `^https?:\/\/static\.catlinks\.cn\/image\/exchange20260807\.jpg.* url reject-200` | Catlinks 静态广告图 | URL | 同 regex，动作保留为 QX 原规则末尾动作 | 日期文件名可能更新 | 文件 URL 回放 |
| 79 | `^https?:\/\/api\.qeeniao\.com\/nap\/ad url jsonjq-response-body '.data={}'` | 既有本地模块的最小 JSON 广告字段处理 | Resp | `[Body Rewrite] http-response-jq` 同 URL + `'.data={}'` | JSON schema/客户端 jq 支持风险 | JSON fixture 检查 `.data` 被清空且其他顶层字段保持 |

## filter.list 逐条审计

| 行 | QX 原规则 | 功能 | 依赖数据 | Shadowrocket 对应实现 | 兼容性风险 | 验证方法 |
| ---: | --- | --- | --- | --- | --- | --- |
| 5 | `host, ad.shunchangzhixing.com, reject` | 睿博士广告主机 | URL/Host | `DOMAIN,ad.shunchangzhixing.com,REJECT` | 精确主机拒绝 | 规则解析与命中日志 |
| 6 | `host, inner.shunchangzhixing.com, reject` | 睿博士广告内层主机 | URL/Host | `DOMAIN,inner.shunchangzhixing.com,REJECT` | 同上 | 规则解析与命中日志 |
| 7 | `host, admin.hzjizhun.cn, reject` | 睿博士管理广告主机 | URL/Host | `DOMAIN,admin.hzjizhun.cn,REJECT` | 业务接口共域风险 | 命中日志和业务回归 |
| 8 | `host, static.shunchangzhixing.com, reject` | 睿博士静态广告主机 | URL/Host | `DOMAIN,static.shunchangzhixing.com,REJECT` | 静态资源共域风险 | 命中日志和业务回归 |
| 11 | `host, sdk.1rtb.net, reject` | RTB SDK | URL/Host | `DOMAIN,sdk.1rtb.net,REJECT` | SDK 可能被业务复用 | 命中日志 |
| 12 | `host, s.1rtb.net, reject` | RTB 辅助主机 | URL/Host | `DOMAIN,s.1rtb.net,REJECT` | 同上 | 命中日志 |
| 13 | `host, sdk.zhangyuyidong.cn, reject` | SDK 投放主机 | URL/Host | `DOMAIN,sdk.zhangyuyidong.cn,REJECT` | 同上 | 命中日志 |
| 14 | `host, adx-cfg-u1.ubixioe.com, reject` | ADX 配置主机 | URL/Host | `DOMAIN,adx-cfg-u1.ubixioe.com,REJECT` | 同上 | 命中日志 |
| 15 | `host, entry-su1.ubixioe.com, reject` | ADX 入口主机 | URL/Host | `DOMAIN,entry-su1.ubixioe.com,REJECT` | 同上 | 命中日志 |
| 18 | `host, cdn-new-ad.wtzw.com, reject` | 七猫广告 CDN | URL/Host | `DOMAIN,cdn-new-ad.wtzw.com,REJECT` | 与 rewrite 精确素材规则重叠 | 规则顺序/命中日志 |
| 19 | `host, a6-remad.qm989.com, reject` | 七猫广告投放主机 | URL/Host | `DOMAIN,a6-remad.qm989.com,REJECT` | 与 rewrite 重叠且范围更宽 | 规则命中及七猫章节回归 |
| 20 | `host, ad.wtzw.com, reject` | 七猫广告主机 | URL/Host | `DOMAIN,ad.wtzw.com,REJECT` | 可能存在共域业务 | 命中日志和七猫业务回归 |
| 23 | `host, webcast-open.douyin.com, reject` | Pangle 直播广告配置 | URL/Host | `DOMAIN,webcast-open.douyin.com,REJECT` | 抖音直播业务共域风险 | 抖音直播负向回归 |
| 24 | `host, webcast5-open-lf.douyin.com, reject` | Pangle CDN/配置 | URL/Host | `DOMAIN,webcast5-open-lf.douyin.com,REJECT` | 同上 | 命中日志 |
| 25 | `host, is.snssdk.com, reject` | 字节广告/配置 | URL/Host | `DOMAIN,is.snssdk.com,REJECT` | 共用基础服务风险 | 抖音业务回归 |
| 26 | `host, gecko.zijieapi.com, reject` | 字节 Gecko 资源 | URL/Host | `DOMAIN,gecko.zijieapi.com,REJECT` | 可能影响非广告组件 | 资源加载回归 |
| 27 | `host, vod-license-m.volccdn.com, reject` | 视频广告授权 | URL/Host | `DOMAIN,vod-license-m.volccdn.com,REJECT` | 视频授权共域风险 | 播放回归 |
| 28 | `host, lf9-webcast-cdn-tos-ncdn.bytegecko.com, reject` | Pangle CDN 回源 | URL/Host | `DOMAIN,lf9-webcast-cdn-tos-ncdn.bytegecko.com,REJECT` | CDN 共域风险 | 素材/直播回归 |
| 29 | `host, n98-lf-webcast-cdn-tos-ncdn.bytegecko.com, reject` | Pangle CDN 回源 | URL/Host | `DOMAIN,n98-lf-webcast-cdn-tos-ncdn.bytegecko.com,REJECT` | 同上 | 素材/直播回归 |
| 30 | `host, p3-sign.douyinpic.com, reject` | 抖音签名广告图 | URL/Host | `DOMAIN,p3-sign.douyinpic.com,REJECT` | 与 direct 例外不同主机；需确认图片边界 | 图片加载回归 |
| 31 | `host, p26-sign.douyinpic.com, reject` | 抖音签名广告图 | URL/Host | `DOMAIN,p26-sign.douyinpic.com,REJECT` | 同上 | 图片加载回归 |
| 32 | `host-suffix, bjmxy.net, reject` | 广告后缀域 | URL/Host | `DOMAIN-SUFFIX,bjmxy.net,REJECT` | 后缀范围广，沿用来源且不扩展 | 后缀命中日志 |
| 33 | `host-suffix, ydycdn.com, reject` | 广告 CDN 后缀 | URL/Host | `DOMAIN-SUFFIX,ydycdn.com,REJECT` | 后缀范围广 | 后缀命中日志 |
| 34 | `host-suffix, dahhxxttxs.com, reject` | 广告后缀域 | URL/Host | `DOMAIN-SUFFIX,dahhxxttxs.com,REJECT` | 后缀范围广 | 后缀命中日志 |
| 37 | `host, adx-ad-prod.wkanx.com, reject` | 红果下一集广告 | URL/Host | `DOMAIN,adx-ad-prod.wkanx.com,REJECT` | 仅主机粒度，路径信息在 QX filter 中不可用 | 命中日志与红果下一集回归 |
| 40 | `host, p3-item.ecombdimg.com, direct` | 抖音业务图片直连例外 | URL/Host | `DOMAIN,p3-item.ecombdimg.com,DIRECT` | 例外必须先于外部泛拒绝规则 | 规则顺序与图片加载 |
| 41 | `host, p9-item.ecombdimg.com, direct` | 抖音业务图片直连例外 | URL/Host | `DOMAIN,p9-item.ecombdimg.com,DIRECT` | 同上 | 规则顺序与图片加载 |
| 42 | `host, p26-item.ecombdimg.com, direct` | 抖音业务图片直连例外 | URL/Host | `DOMAIN,p26-item.ecombdimg.com,DIRECT` | 同上 | 规则顺序与图片加载 |
| 43 | `host, p3-aio.ecombdimg.com, direct` | 抖音业务图片直连例外 | URL/Host | `DOMAIN,p3-aio.ecombdimg.com,DIRECT` | 同上 | 规则顺序与图片加载 |
| 44 | `host, p3-webcast.douyinpic.com, direct` | 抖音直播业务图片直连例外 | URL/Host | `DOMAIN,p3-webcast.douyinpic.com,DIRECT` | 必须位于可能拒绝图片的规则之前 | 规则顺序与直播图片加载 |

## Debug 脚本语义与数据最小化

### 小蚕 `MatchPlacement`

- 触发模式只覆盖 `gw.xiaocantech.com/rpc`；脚本记录 `pattern-hit`、`script-invoked`、URL path、header key names、`methodname`/`servername` 两个值和 body-readable length。
- 模块通过发布仓库的 Raw `script-path` 加载脚本；导入后必须在小火箭脚本详情/日志确认两个 URL 下载成功，Raw 可访问不是本次静态检查的既成事实。
- 当请求 header 缺失时，记录 `correlation=unavailable, original`；同一 `/rpc` 的 header 关联一律记录为 `requires-real-device-adaptation`，不宣称在 Shadowrocket 上可靠关联。
- 只有 `methodname === AdMobileService.MatchPlacement` 且 `status.code === 0`、`data` 为对象、`data.ad_open === 1` 时记录 `would-modify=true` 和实际存在的精确字段名；脚本绝不修改字段，始终 `$done({body: originalBody})`。
- 不记录完整 URL query、完整 header、body 内容或字段值；解析/异常均 fail-open。

### 七猫 `qm_focus`

- 只观察 `cgcr.wtzw.com/client/api/v1/config`；记录 URL path、`modules`、`project`、响应 status、content-type、body length。
- 七猫脚本同样依赖 Raw `script-path` 下载；脚本未下载或未触发时，不能把无日志解释为“没有 qm_focus”。
- 记录外层 JSON parse 结果；如果 `data` 为字符串，记录 data length、prefix classification（`base64`/`hex`/`other`）和 decode classification。
- 解码只用于分类，不代表已解密或已识别协议；脚本不写回响应，始终返回原始 body。不得据此假设可以安全修改 `qm_focus`。

## 空分类与跨语义风险

| 分类 | 审计结论 |
| --- | --- |
| Header Rewrite | 源文件没有 Header Rewrite；本模块不新增。小蚕的 `methodname` 仅用于 Debug 观测，不伪造请求 header。 |
| Request Body | 源文件没有 request-body 规则；本模块不新增。 |
| Binary Body / binary-body-mode | 源文件没有二进制改写；本模块不新增 `binary-body-mode`。七猫只做编码形态分类，不能宣称解码或解密。 |
| QUIC / UDP/443 | 源文件没有 QUIC/UDP 规则；本模块不新增 UDP/443 拦截、核心域名全拒绝或 `h2=true`。 |
| 请求-响应关联 | QX 小蚕脚本依赖 request header 的 `methodname`；Shadowrocket response script 是否能稳定取得同一 `/rpc` 请求的 header 必须真机专项适配，Debug 日志明确标记为不可靠候选。 |
| MITM | 使用 `[MITM] hostname = %APPEND%`，包含 rewrite.conf 的完整 39 项 hostname；不会覆盖既有 MITM 清单。 |
| HTTPS decrypt | 模块注释已明确：用户必须在活跃配置开启 HTTPS 解密并信任 MITM 证书；静态文件不能证明证书、证书锁定或设备策略通过。 |
| HTTP/2 | 不写 `h2=true`；只说明用户按需在活跃配置启用 HTTP/2 MITM，不能声称模块自动启用。 |
| requires-body / max-size | 两个 Debug 脚本均显式 `requires-body=true,max-size=-1`，并设 `timeout=30,engine=jsc`；真机仍需确认脚本加载和 body 可见性。 |
| 模块冲突 | 本模块是独立 Debug 方案，不得与主 Shadowrocket 模块、同源 QX rewrite/filter 或其他会同时改写同一响应的脚本一起启用；否则命中顺序、重复改写和日志归因均不可控。 |

## 静态验证方法（未宣称已执行真机结果）

1. 对两个新 JS 运行 `node --check`。
2. 检查模块仅包含预期 `[Rule]`、`[URL Rewrite]`、`[Body Rewrite]`、`[Script]`、`[MITM]` 章节；确认 `h2=true`、UDP/443/QUIC 拦截、泛域名新增拒绝和更新地址均不存在。
3. 从源文件重新计数：rewrite.conf 实际规则 49 条、filter.list 实际规则 30 条、rewrite.conf `hostname` 39 项；逐条核对本审计表和模块。
4. 用脱敏 fixture 回放两个 Debug 脚本：MatchPlacement 命中、非命中、缺 header、坏 JSON、七猫外层 JSON 失败和 data 的 base64/hex/other 分类；每个场景都必须保持原始 body 字节内容。
5. 真机验证仍需用户在活跃配置开启 HTTPS 解密、信任证书并按需启用 HTTP/2 MITM，单独启用本 Debug 模块后采集脚本日志；不得把上述静态检查描述为真机成功。
