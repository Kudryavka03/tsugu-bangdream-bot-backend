


<h1 align="center">Tsugu BangDream Bot</h1>

<div align="center">

*✨ BanG Dream！少女乐团派对 多功能 BOT ✨*


[![](https://img.shields.io/npm/dt/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot)
[![](https://img.shields.io/npm/v/koishi-plugin-tsugu-bangdream-bot?logo=npm&style=flat-square)](https://www.npmjs.org/package/node-telegram-bot-api)
[![](https://img.shields.io/badge/📦%20data-bestdori-blue)](https://bestdori.com/) 
[![](https://img.shields.io/badge/📦%20data-bandoristation-yellowgreen)](https://bandoristation.com/) 
[![](https://img.shields.io/badge/💬%20chat-QQ%20Group-blue)](https://qm.qq.com/q/pMXaWVefzG)
[![](https://img.shields.io/badge/🤖%20bot-QQ%20Bot-pink)](https://qun.qq.com/qunpro/robot/qunshare?robot_uin=3889000770&robot_appid=102076262&biz_type=0)
</div>

---

<h2 align="center"> 🧩 前端插件 </h2>


### **[Koishi](https://koishi.chat/zh-CN/)**
> Koishi 是一个跨平台、可扩展、高性能的聊天机器人框架

本仓库根目录部分为 Koishi 前端插件, 插件基于 Koishi 内置指令系统开发, 原生支持跨平台使用.  
插件可以在 Koishi [插件市场](https://koishi.chat/zh-CN/market/)中安装.  

---

> 得益于前后端分离的设计, 除了官方的 Koishi 插件外, 社区还提供了其余主流平台的插件支持


### **[NoneBot](https://nonebot.dev/)** 
> NoneBot2 是一个现代、跨平台、可扩展的 Python 聊天机器人框架

[nonebot-plugin-tsugu-bangdream-bot](https://github.com/WindowsSov8forUs/nonebot-plugin-tsugu-bangdream-bot) 是由 WindowsSov8 维护的 NoneBot2 前端插件, 旨在于 NoneBot 上还原 koishi-plugin-tsugu-bangdream-bot 的行为.  
基于 [tsugu-api-python](https://github.com/WindowsSov8forUs/tsugu-api-python) 实现后端的连接, 基于 [NoneBot-Plugin-Alconna](https://github.com/nonebot/plugin-alconna) 和 [nonebot-plugin-userinfo](https://github.com/noneplugin/nonebot-plugin-userinfo) 实现跨平台支持.  
插件可以在 NoneBot [插件商店](https://nonebot.dev/store/plugins)中通过以下命令安装.  

```bash
nb plugin install nonebot-plugin-tsugu-bangdream-bot
```

---

### **[Entari](https://arclet.top/tutorial/entari/)**

> Entari 是 Arclet Project 下一个基于 Satori 协议的即时通信框架

[entari-plugin-tsugu](https://github.com/kumoSleeping/entari-plugin-tsugu) 是由 kumoSleeping 维护的 Entari 前端插件, 由 Python 编写,直接集成了 [tsugu-b3](https://github.com/kumoSleeping/tsugu-b3), 基于 [tsugu-api-python](https://github.com/WindowsSov8forUs/tsugu-api-python) 实现后端的连接, 基于 [Alconna](https://arclet.top/tutorial/alconna/v1.html) 的命令匹配系统.  
本插件同时为 `QQ官方机器人` 提供支持, 为适配平台限制与其造成的用户需求, 行为上与主分支版本[稍有差异](https://github.com/kumoSleeping/tsugu-b3/blob/main/README.md#-feat).  
插件可以通过 Python 包管理器安装
```bash
pip install entari-plugin-tsugu
```

---

<h2 align="center">🛠️ 后端部署</h2>

通常情况下, 如果您是分布式部署用户, Tsugu 后端**不是必须部署**的, 当您默认部署好前端插件时, 将会先使用**公共API**.  
即使选择自建后端, 但我们仍然**建议您使用在User服务部分使用公共API**, 这样可以让用户体验到任何`Tsugu`客户端一次绑定, 多处使用的便利性.  

Tsugu 后端位于本仓库的 `backend` 目录下.

```bash
git clone git@github.com:Yamamoto-2/tsugu-bangdream-bot.git
cd tsugu-bangdream-bot
cd backend
```
后端部署需要 [NodeJS](https://img.shields.io/badge/nodejs官网-18.16.0+-green?style=flat-square) 18+ 环境以及 `npm` 等包管理工具

> Tsugu 后端服务独立启动前需要进行 npm install 安装依赖项, 其中值得注意的是, 在安装过程中, **请保证您的终端可以正常拉取 Github Release 的资源**, 否则会导致 pre-build 的包无法安装, 此时npm 会选择**第二种方案: 编译安装**

>如果您选择让 npm 自动进行编译安装, 在部分环境下 skia-canvas 的编译耗时可能特别特别长, 如果您系统没有 **rust 与基础的 C/C++ 编译环境**, 也会直接安装失败.

安装依赖
```bash
npm install --verbose
```

启动后端
```bash

npm start
```
> 部署完成后会默认开在 3000 端口, 根据选择的前端插件的配置方式, 将后端地址指向您自部署的后端地址即可.

使用 PM2 进行管理
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

---

<h2 align="center">📚 文档</h2>

### 角色生日查询

`查角色` 不带参数时会查询主服务器当天生日的角色；主服务器当天没有时会查询日服。两边都没有角色生日时，会提示查询方式并显示当前日期前后最近的生日角色，距离相同时优先显示未来生日。

可用 `查角色 +`、`查角色 ++` 或 `查角色 +N` 查询后续生日日期组，也可用 `查角色 -`、`查角色 --` 或 `查角色 -N` 查询之前的生日日期组。同一生日日期有多名角色时会一起显示。`+0` 和 `-0` 查询今天生日；今天无人生日时返回最近的生日日期组。这里的偏移按生日日期组计算，不按日历天数计算。

生日可使用 `10.27`、`1027`、`721`、`7.21`、`7月21日` 或 `7月21` 等格式查询角色。查卡生日查询必须带点，例如 `查卡 10.27`、`查卡 03.07`、`查卡 3.7`、`查卡 3.07`、`查卡 03.7`，只返回当天生日角色的生日限定卡牌；纯数字仍按卡牌 ID 查询。不带参数的 `查卡` 仍查询主服务器最新已开始活动期间的卡池卡牌和活动奖励卡牌。

2 月 29 日生日只会在闰年对应日期出现。

### 卡牌与歌曲查询

- `查卡 5x绿萝` 等同于 `查卡 5x 绿 萝`，查询 Roselia 的绿属性五星卡牌。连写的条件使用查卡词典分词，整段昵称可以用双引号保留。
- `查曲 latest` 查询主服务器最新发布的曲目，`查曲 latest jp` 查询日服最新发布的曲目。
- `songdiff paspal lv25` 用查曲的筛选条件比较两个服的已发布曲目。默认范围从 ID 1 开始，上限为两服最新发布曲目 ID 中的较小者。比较国服时，默认跳过国服已排期但尚未上线的曲目。`songdiff all` 比较全部当前可用曲目。`-s` 指定源服，默认日服。`-d` 指定目标服，默认主服，主服为日服时默认国服。图中 `+` 表示目标服独有，`−` 表示源服独有。也可使用 `songsdiff`、`songdiffs`、`songsdiffs` 或 `musicdiff`。
- `ycxmusic 10 789` 或 `gb 10 789` 按开赛时间查找主服务器最近一期包含歌曲 789 的单曲歌榜活动。`gb 10 767 320 cn` 查询国服 320 号活动中歌曲 767 的 T10。可用 `gb 10 cn -e 320` 只指定活动，旧写法 `gb 10 320 cn -s 767` 仍可使用。
- `gb all`、`ycxmusic all`、`gball` 和 `ycxmusicall` 查询最近一期歌榜的档线、预测与相对 T1 的占比。遇到多首歌曲时按提示选择一首。`gb all 789 329 cn` 查询国服 329 号活动歌曲 789 的歌榜总览，`gb all cn -e 329` 只指定活动。

### 前十活动分数变动

`查散点图 t10` 默认统计主服务器当前活动整个时段内第十名玩家可观测的分数变动。可以改用玩家 ID，或用 `查散点图 t3 300 日服` 指定活动和服务器。每个点取相邻两条记录的中间时刻，纵轴是这两条记录之间的分数增加量。可用 `-d 2` 查看活动第 2 天，或用 `-c 50` 查看最近 50 次变动。别名为 `散点图`、`分数图`、`查分数图`。

`查散点图 t10 15:00-17:00` 只绘制当天所选时段的散点，统计也使用这一时段内绘出的点。

`前十车速` 查询当前活动的即时车速。`前十车速 329 国服 11.20T15:00-17:00` 查询指定时段的前十车速，并列出该区间的总增分和每小时车速。`查岗` 查询总表时也可使用 `开始-结束`。

时间按所查询服务器的时区解释。也可继续用 `--from`、`--to`，只限制一端时只填对应选项。

- 只填时刻可用 `15`、`15:30`、`15：30` 或 `1530`。默认取服务器当天，另一端带日期时沿用另一端的日期。
- 日期支持 `2026-11-20`、`2026/11/20`、`2026.11.20` 和简写 `11/20`、`11.20`。省略年份时取服务器当年。只填日期时，`--from` 从当天零点起算，`--to` 统计到当天结束。
- 日期和时刻之间可用 `T`，也可用空格并把整段加引号。例如 `11.20T15:00-17:00` 和 `"11.20 15:00-17:00"`。跨天区间请分别写出两端日期。

---

- [后端 API](https://github.com/Yamamoto-2/tsugu-bangdream-bot/blob/master/docs/api.md)
- ...

---
