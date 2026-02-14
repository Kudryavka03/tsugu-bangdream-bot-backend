

# tsugu-bangdream-bot 


*✨ BanG Dream！少女乐团派对 多功能 BOT ✨*



[![npm](https://img.shields.io/npm/v/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot) [![npm](https://img.shields.io/npm/l/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot) [![npm](https://img.shields.io/npm/dt/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot)

*此 Backend 为群 邦烤休闲小屋☆山吹町 Bot 所运行的版本。*

## 🚪 注意

> 本项目合并了部分来自 https://github.com/yyf-0404/tsugu-bangdream-bot (Saaya) 的优化或特性。

> 本项目参考了部分来自 https://github.com/StarFreedomX/tsugu-bangdream-bot/tree/starfx-main (闪耀香澄汁) 的功能

> 本项目预测线2的实现直接来源于 https://github.com/byydzh/MYCX_1000 (邦多利国服千线预测姬)

> 本项目做了非常多关于可能可以缩短网络IO等待上的优化，旨在为了更快的出图速度。在部分情况下可能会因为Bestdori API接口限流导致无法出图，同时因为较为激进的缓存策略，对硬盘空间有一定需求，且可能会导致部分数据需要在第二次查询才会同步最新。


## 🚪 TO DO

优化未来活动时间预测

## 🚪 IN PROGRESS

暂时应该没什么要搞了


## 🏠 后端部署

> 不再需要Extra后端

> 如果您对本项目满意，别忘了点一个KiraKira DokiDoki的星标哦~

> 需要 `nodejs` 18+ 环境以及 `npm` 等包管理工具

  [![nodejs官网](https://img.shields.io/badge/nodejs官网-18.16.0+-green?style=flat-square)](https://nodejs.org/zh-cn/download/)

```bash
cd tsugu-bangdream-bot-backend
npm install -g ts-node
npm install -g pm2
npm install 
# 此时安装时间可能较长，并且需要可以完善编译 canvas 的环境
# 编译并启动后端
# 对于Windows环境，请使用NodeJS 16 + Python 3.10 执行npm install后再升级到NodeJS 18+ + Python 3.13
npx tsc && npx tsc-alias
```
根目录下建议先执行complier.bat再执行run_windows_complied.bat

teamBuilder中的Lib，如果不依靠TSM解释器，需要自行移入dist目录中。

> 对于预测线2，请安装Python 3.13+版本，然后进入MYCX_1000目录运行predictMain.bat脚本
## 📖 文章

> 相关文章: https://www.bilibili.com/read/cv24464090 


## 📖 性能监测 / Debug

```bash
npm run cpu
```




## 🐧 QQ 官方机器人
> 点击链接了解机器人详情 [🔗Tsugu](https://qun.qq.com/qunpro/robot/qunshare?robot_uin=3889000770&robot_appid=102076262&biz_type=0)


## 📚 后端 API 文档

> 详细文档请查看 [🔗文档](https://github.com/Yamamoto-2/tsugu-bangdream-bot/blob/master/docs/api.md)

## 📦 数据支持

| 项目 | 传送门 |
| --- | --- |
| 数据支持 | [🔗bestdori](https://bestdori.com/) |
| 车牌数据 | [🔗bandoristation](https://bandoristation.com) |
