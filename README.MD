

# tsugu-bangdream-bot 


*✨ BanG Dream！少女乐团派对 多功能 BOT ✨*



[![npm](https://img.shields.io/npm/v/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot) [![npm](https://img.shields.io/npm/l/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot) [![npm](https://img.shields.io/npm/dt/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot)

*此 Backend 为群 邦烤休闲小屋☆山吹町 Bot 所运行的版本。*

## 🚪 注意

本项目合并了部分来自 https://github.com/yyf-0404/tsugu-bangdream-bot 的优化或特性。

## 🚪 MAY DO

1. 你告诉我

## 🚪 IN PROGRESS

暂时应该没什么要搞了

## 🚪 WON'T DO

1. 组队组曲，因为我不知道怎么用

## 🏠 后端部署

> 需要Extra后端，为预测线2提供服务，可自行去除预测线2功能，则不需要Extra后端

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
npx tsc && npx tsc-alias
```

## 📖 文章

> 相关文章: https://www.bilibili.com/read/cv24464090 


## 📖 性能监测

```bash
npm run cpu
```

查活动 >1 零缓存下40s出图（异步优化后）



## 🐧 QQ 官方机器人
> 点击链接了解机器人详情 [🔗Tsugu](https://qun.qq.com/qunpro/robot/qunshare?robot_uin=3889000770&robot_appid=102076262&biz_type=0)


## 📚 后端 API 文档

> 详细文档请查看 [🔗文档](https://github.com/Yamamoto-2/tsugu-bangdream-bot/blob/master/docs/api.md)

## 📦 数据支持

| 项目 | 传送门 |
| --- | --- |
| 数据支持 | [🔗bestdori](https://bestdori.com/) |
| 车牌数据 | [🔗bandoristation](https://bandoristation.com) |