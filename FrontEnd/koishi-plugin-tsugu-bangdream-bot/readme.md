


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

---

- [后端 API](https://github.com/Yamamoto-2/tsugu-bangdream-bot/blob/master/docs/api.md)
- ...

---
