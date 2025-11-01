

# tsugu-bangdream-bot 


*✨ BanG Dream！少女乐团派对 多功能 BOT ✨*



[![npm](https://img.shields.io/npm/v/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot) [![npm](https://img.shields.io/npm/l/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot) [![npm](https://img.shields.io/npm/dt/koishi-plugin-tsugu-bangdream-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-tsugu-bangdream-bot)

*此 Backend 为群 邦烤休闲小屋☆山吹町 Bot 所运行的版本。*

## 🚪 注意

本项目合并了部分来自 https://github.com/yyf-0404/tsugu-bangdream-bot 的优化或特性。

1. 合并更改模糊匹配逻辑
2. 新增支持按照notes查曲
3. 合并按照技能加成查卡
4. 合并修复了查曲相关bug（修复了 查曲e 不会获取exist的bug）
5. 合并查岗
6. 合并优化了*Fix.json的加载
7. 合并查曲界面新增NOTE显示，优化查曲界面布局


## 🚪 MAY DO

1. 预测线有点自己的想法
2. 你告诉我

## 🚪 WON'T DO

1. 预测线，原版够用，我也有点自己的想法，可能单独在TsuguBot外实现一个预测线。
2. 组队组曲，因为我不知道怎么用

## 🏠 后端部署

> 需要 `nodejs` 18+ 环境以及 `npm` 等包管理工具

  [![nodejs官网](https://img.shields.io/badge/nodejs官网-18.16.0+-green?style=flat-square)](https://nodejs.org/zh-cn/download/)

```bash
cd tsugu-bangdream-bot
cd backend
npm install -g ts-node
npm install -g pm2
npm install 
# 此时安装时间可能较长，并且需要可以完善编译 canvas 的环境
# 启动后端
npm start
```

## 📖 文章

> 相关文章: https://www.bilibili.com/read/cv24464090 




## 🐧 QQ 官方机器人
> 点击链接了解机器人详情 [🔗Tsugu](https://qun.qq.com/qunpro/robot/qunshare?robot_uin=3889000770&robot_appid=102076262&biz_type=0)


## 📚 后端 API 文档

> 详细文档请查看 [🔗文档](https://github.com/Yamamoto-2/tsugu-bangdream-bot/blob/master/docs/api.md)

## 📦 数据支持

| 项目 | 传送门 |
| --- | --- |
| 数据支持 | [🔗bestdori](https://bestdori.com/) |
| 车牌数据 | [🔗bandoristation](https://bandoristation.com) |