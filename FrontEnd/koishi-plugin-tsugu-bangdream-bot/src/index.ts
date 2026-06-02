// @ts-nocheck
import type { Context } from "koishi";
import type { Server } from "./types/Server";
import * as koishi_1 from "koishi";
import * as searchCard_1 from "./commands/searchCard";
import * as searchEvent_1 from "./commands/searchEvent";
import * as searchSong_1 from "./commands/searchSong";
import * as searchGacha_1 from "./commands/searchGacha";
import * as cutoffDetail_1 from "./commands/cutoffDetail";
import * as cutoffSong_1 from "./commands/cutoffSong";
import * as searchPlayer_1 from "./commands/searchPlayer";
import * as cutoffListOfRecentEvent_1 from "./commands/cutoffListOfRecentEvent";
import * as cutoffAll_1 from "./commands/cutoffAll";
import * as gachaSimulate_1 from "./commands/gachaSimulate";
import * as getCardIllustration_1 from "./commands/getCardIllustration";
import * as searchCharacter_1 from "./commands/searchCharacter";
import * as songMeta_1 from "./commands/songMeta";
import * as roomNumber_1 from "./commands/roomNumber";
import * as roomList_1 from "./commands/roomList";
import * as user_1 from "./commands/user";
import * as songChart_1 from "./commands/songChart";
import * as eventStage_1 from "./commands/eventStage";
import * as songRandom_1 from "./commands/songRandom";
import * as config_1 from "./config";
import * as utils_1 from "./utils";
import * as remoteDB_1 from "./api/remoteDB";
import * as fuzzySearch_1 from "./api/fuzzySearch";
import * as topRateDetail_1 from "./commands/topRateDetail";

declare module 'koishi' {
    interface User {
        tsugu: {
            userId: string;
            platform: string;
            mainServer: Server;
            displayedServerList: Server[];
            shareRoomNumber: boolean;
            userPlayerIndex: number;
            userPlayerList: {
                playerId: number;
                server: Server;
            }[];
        };
    }
    interface Channel {
        tsugu_gacha: boolean;
        tsugu_run: boolean;
    }
}

export interface Config {
    useEasyBG: boolean;
    compress: boolean;
    bandoriStationToken: string;
    backendUrl: string;
    RemoteDBSwitch: boolean;
    RemoteDBUrl: string;
    noSpace: boolean;
    reply: boolean;
    at: boolean;
}

export const name = 'tsugu-bangdream-bot';
export const inject = ['database'];
export const Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        useEasyBG: koishi_1.Schema.boolean().default(false).description('是否使用简易背景, 启用这将大幅提高速度, 关闭将使部分界面效果更美观'),
        compress: koishi_1.Schema.boolean().default(true).description('是否压缩图片, 启用会使图片质量下降, 大幅提高速度, 体积减小从而减少图片传输时所需的时间, 关闭会提高画面清晰度'),
        bandoriStationToken: koishi_1.Schema.string().description('BandoriStationToken, 用于发送车牌, 可以去 https://github.com/maborosh/BandoriStation/wiki/API%E6%8E%A5%E5%8F%A3 申请。缺失情况下, 视为Tsugu车牌'),
        reply: koishi_1.Schema.boolean().default(false).description('消息是否回复用户'),
        at: koishi_1.Schema.boolean().default(false).description('消息是否@用户'),
        noSpace: koishi_1.Schema.boolean().default(false).description('是否启用无需空格触发大部分指令, 启用这将方便一些用户使用习惯, 但会增加bot误判概率, 仍然建议使用空格'),
        backendUrl: koishi_1.Schema.string().required(false).default('http://tsugubot.com:8080').description('后端服务器地址, 用于处理指令。如果有自建服务器, 可以改成自建服务器地址。默认为Tsugu公共后端服务器。如果你在本机部署后端, 请写 "http://127.0.0.1:3000"'),
        RemoteDBSwitch: koishi_1.Schema.boolean().default(false).description('是否使用独立后端的数据库。启用后, 所有用户数据与车牌数据将使用远程数据库而不是koishi数据库'),
    }).description('Tsugu BangDream Bot 配置'),
    koishi_1.Schema.union([
        koishi_1.Schema.object({
            RemoteDBSwitch: koishi_1.Schema.const(true).required(),
            RemoteDBUrl: koishi_1.Schema.string().default('http://tsugubot.com:8080').description('后端服务器地址, 用于处理用户数据库。如果有自建服务器, 可以改成自建服务器地址。默认为Tsugu公共后端服务器。如果你在本机部署后端, 请写 "http://127.0.0.1:3000"')
        }),
        koishi_1.Schema.object({}),
    ]),
]);
export function apply(ctx: Context, config: Config) {
    // 扩展 user 表存储玩家绑定数据
    ctx.model.extend('user', {
        'tsugu.userId': 'string',
        'tsugu.platform': 'string',
        'tsugu.mainServer': { type: 'unsigned', initial: config_1.globalDefaultServer[0] },
        'tsugu.displayedServerList': { type: 'list', initial: config_1.globalDefaultServer },
        'tsugu.shareRoomNumber': { type: 'boolean', initial: true },
        'tsugu.userPlayerIndex': { type: 'unsigned', initial: 0 },
        'tsugu.userPlayerList': {
            type: 'json', initial: []
        }
    });
    // 扩展 channel 表存储群聊中的查卡开关
    ctx.model.extend("channel", {
        tsugu_gacha: { type: 'boolean', initial: true },
        tsugu_run: { type: 'boolean', initial: true },
    });
    //获取用户数据函数
    async function observeUserTsugu(session) {
        async function getLocalUserData(session) {
            const localResult = await session.observeUser(['tsugu']);
            //修复数据库中的displayedServerList为string数组的问题
            localResult.tsugu.displayedServerList = (0, utils_1.stringArrayToNumberArray)(localResult.tsugu.displayedServerList);
            return localResult.tsugu;
        }
        if (config.RemoteDBSwitch) {
            const platform = session.platform;
            const userId = session.userId;
            const remoteResult = await (0, remoteDB_1.getRemoteDBUserData)(config.RemoteDBUrl, platform, userId);
            if (remoteResult.status == 'success') {
                return remoteResult.data;
            }
            else {
                session.send(remoteResult.data);
                return (await getLocalUserData(session));
            }
        }
        else {
            return (await getLocalUserData(session));
        }
    }
    //判断是否为车牌
    ctx.middleware(async (session, next) => {
        const number = (0, utils_1.checkLeftDigits)(session.content);
        if (number != 0 && false) {
            await session.observeUser(['tsugu']);
            const tsuguUserData = await observeUserTsugu(session);
            await (0, roomNumber_1.roomNumber)(config, session, tsuguUserData, number, session.content);
            return next();
        }
        else {
            return next();
        }
    });
    // 使得打指令不需要加空格
    ctx.middleware((session, next) => {
        if (config.noSpace) {
            // 查卡面 一定要放在 查卡 前面
            const keywords = ['查询玩家', '查卡面', '查玩家', '查卡池','查卡', '查角色', '查活动', '查分数表', '查询分数榜', '查分数榜', '查曲', '查谱面', '查岗',  '查询分数表', 'ycx', 'ycxall', 'lsycx', '抽卡模拟', '绑定玩家', '解除绑定', '主服务器', '设置默认服务器', '玩家状态', '开启车牌转发', '关闭车牌转发'];
            const tierKeywords = ['前十', '十线', '百线', '千','K', 'k', '二千', '2k', '2K', '三千', '3k', '3K', '4k',  '四千', '4K', '2000', '1000', '3000', '4000', '5000', '5k', '5K', '万线', '10000线', 'w线','W线'];
            
            // 检查会话内容是否以列表中的任何一个词语开头
            const keyword = keywords.find(keyword => session.content.startsWith(keyword));
            if (keyword) {
                if (session.content[keyword.length] === ' ') {
                    return next();
                }
                else {
                    const content_cut = session.content.slice(keyword.length);
                    return session.execute(`${keyword} ${content_cut}`, next);
                }
            }
            else {
				let lineName = session.content.replace(" ", "").replace("K", "k")
				lineName = lineName.replace("榜","线")
				let snw = ''
				if (lineName.includes("cn") || lineName.includes("CN")|| lineName.includes("Cn")|| lineName.includes("cN")|| lineName.includes("国服")){
					lineName = lineName.replace("cn","").replace("CN","").replace("Cn","").replace("cN","").replace("国服","")
					snw = 'cn'
				}
				if (lineName.includes("jp") || lineName.includes("Jp")|| lineName.includes("jP")|| lineName.includes("JP")|| lineName.includes("日服")){
					lineName = lineName.replace("jp","").replace("Jp","").replace("jP","").replace("JP","").replace("日服","")
					snw = 'jp'
				}
				if (lineName == "前十" || lineName == "十线"||lineName == "前十线"||lineName == "10线"|| lineName == "t10") return session.execute(`ycx 10 ${snw}`, next);
								if (lineName == "前二十" || lineName == "二十线"||lineName == "前二十线"||lineName == "20线"|| lineName == "t20") return session.execute(`ycx 20 ${snw}`, next);
				if (lineName == "百线" || lineName == "100线"|| lineName == "t100") return session.execute(`ycx 100 ${snw}`, next);
				if (lineName == "五百线" || lineName == "500线"|| lineName == "0.5k"|| lineName == "t500"|| lineName == "500") return session.execute(`ycx 500 ${snw}`, next);
				if (lineName == "千线" || lineName == "干线" ||lineName == "1000线"||lineName == "k线"||lineName == "k") return session.execute(`ycx 1000 ${snw}`, next);
				if (lineName == "千五线" ||lineName == "一千五线"||lineName == "k5"|| lineName == "1k5"||lineName == "1.5k"||lineName == "一千五百线" || lineName == "千五百线" ||lineName == "千五" ||lineName == "1500线"||lineName == "k5线"||lineName == "1k5线") return session.execute(`ycx 1500 ${snw}`, next);
				if (lineName == "二千线" || lineName == "2000线"||lineName == "2k线"||lineName == "2千线"||lineName == "2k") return session.execute(`ycx 2000 ${snw}`, next);
				if (lineName == "三千线" || lineName == "3000线"||lineName == "3k线"||lineName == "3千线"||lineName == "3k") return session.execute(`ycx 3000 ${snw}`, next);
				if (lineName == "四千线" || lineName == "4000线"||lineName == "4k线"||lineName == "4千线"||lineName == "4k") return session.execute(`ycx 4000 ${snw}`, next);
				if (lineName == "五千线" || lineName == "5000线"||lineName == "5k线"||lineName == "5千线"||lineName == "5k") return session.execute(`ycx 5000 ${snw}`, next);
				if (lineName == "万线" || lineName == "1万线"||lineName == "10000线" || lineName == "一万线"|| lineName == "w线"|| lineName == "1w线") return session.execute(`ycx 10000 ${snw}`, next);
				if (lineName == "五万线" || lineName == "5万线"||lineName == "50000线" || lineName == "五万线"|| lineName == "5w线") return session.execute(`ycx 50000 ${snw}`, next);
                return next();
            }
        }
        else {
            return next();
        }
    });
    //群相关
    /*
    ctx.command("抽卡 <word:text>", '开关群聊抽卡功能').usage('开关群聊抽卡功能, 需要管理员权限')
      .example('开启抽卡 :开启群聊抽卡功能').example('关闭抽卡 :关闭群聊抽卡功能')
      .shortcut('开启抽卡', { args: ['on'] })
      .shortcut('关闭抽卡', { args: ['off'] })
      .channelFields(["tsugu_gacha"])
      .userFields(['authority'])
      .action(async ({ session }, text) => {
        // 获取 session.event.member.roles 和 session.author.roles
        const eventMemberRoles = session.event.member.roles || [];
        const authorRoles = session.author.roles || [];
        // 合并两个角色列表并去重
        const roles = Array.from(new Set([...eventMemberRoles, ...authorRoles]));
        // 检查是否有所需角色
        const hasRequiredRole = roles.includes('admin') || roles.includes('owner');
        // 检查用户是否有足够的权限：authority > 1 或者角色是 admin 或 owner
        if (session.user.authority > 1 || hasRequiredRole) {
          switch (text) {
            case "on":
            case "开启":
              session.channel.tsugu_gacha = true;
              return "开启成功";
            case "off":
            case "关闭":
              session.channel.tsugu_gacha = false;
              return "关闭成功";
            default:
              return "无效指令";
          }
        } else {
          return "您没有权限执行此操作";
        }
      })
      
    ctx.command("tsugu_swc <word:text>", '开关本频道tsugu')
      .usage('[试验性功能]\n发送tsugu_swc查看当前开关状态\n使用tsugu_swc on @tsugu 开启tsugu, 使用tsugu_swc off @tsugu 关闭tsugu, 试验性功能需要管理员权限')
      .channelFields(["tsugu_run"])
      .userFields(['authority'])
      .action(async ({ session }, text) => {
        if (session.event.message.content == 'tsugu_swc') {
          return `当前tsugu运行状态为 ${session.channel.tsugu_run}`
        }
        // 获取 session.event.member.roles 和 session.author.roles
        const eventMemberRoles = session?.event?.member?.roles || [];
        const authorRoles = session?.author?.roles || [];
        // 合并两个角色列表并去重
        const roles = Array.from(new Set([...eventMemberRoles, ...authorRoles]));
  
        // 检查是否有所需角色
        const hasRequiredRole = roles.includes('admin') || roles.includes('owner');
  
        // 检查用户是否有足够的权限：authority > 1 或者角色是 admin 或 owner
        if (session.user.authority > 1 || hasRequiredRole) {
          if (session.content.includes('on') && session.content.includes(session.selfId)) {
            session.channel.tsugu_run = true;
            return '开启成功';
          }
          else if (session.content.includes('off') && session.content.includes(session.selfId)) {
            session.channel.tsugu_run = false;
            return '关闭成功';
          } else {
            return '无效指令';
          }
        } else {
          return '您没有权限执行此操作';
        }
      })
      */
    //玩家相关
    ctx.command('开启车牌转发', '开启车牌转发', cmdConfig)
        .userFields(['tsugu'])
        .action(async ({ session }) => {
        return await (0, user_1.commandSwitchShareRoomNumberMode)(config, session, true);
    });
    ctx.command('关闭车牌转发', '关闭车牌转发', cmdConfig)
        .userFields(['tsugu'])
        .action(async ({ session }) => {
        return await (0, user_1.commandSwitchShareRoomNumberMode)(config, session, false);
    });
    ctx.command('绑定玩家 [serverName:text]', '绑定玩家信息', cmdConfig)
        .usage('开始玩家数据绑定流程, 请不要在"绑定玩家"指令后添加玩家ID。省略服务器名时, 默认为绑定到你当前的主服务器。请在获得临时验证数字后, 将玩家签名改为该数字, 并回复你的玩家ID')
        .userFields(['tsugu'])
        .action(async ({ session }, serverName) => {
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        return await (0, user_1.commandBindPlayer)(config, session, mainServer);
    });
    ctx.command('解除绑定 [serverName:text]', '解除当前服务器的玩家绑定', cmdConfig)
        .alias('解绑玩家')
        .usage('解除指定服务器的玩家数据绑定。省略服务器名时, 默认为当前的主服务器')
        .userFields(['tsugu'])
        .action(async ({ session }, serverName) => {
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        return await (0, user_1.commandUnbindPlayer)(config, session, mainServer);
    });
    ctx.command('主服务器 <serverName:text>', '设置主服务器', cmdConfig)
        .alias('服务器模式', '切换服务器')
        .usage('将指定的服务器设置为你的主服务器')
        .example('主服务器 cn : 将国服设置为主服务器')
        .example('日服模式 : 将日服设置为主服务器')
        .shortcut(/^(.+服)模式$/, { args: ['$1'] })
        .userFields(['tsugu'])
        .action(async ({ session }, serverName) => {
        let mainServer;
        if (serverName) {
			if (serverName.includes("已切换")) return null
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        else {
            //return usage help and example
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 主服务器`;
        }
        return await (0, user_1.commandSwitchServerMode)(config, session, mainServer);
    });
    ctx.command('设置显示服务器 <...serverList>', '设定信息显示中的默认服务器排序', cmdConfig)
        .alias('默认服务器', '设置默认服务器')
        .usage('使用空格分隔服务器列表')
        .example('设置默认服务器 国服 日服 : 将国服设置为第一服务器, 日服设置为第二服务器')
        .userFields(['tsugu'])
        .action(async ({ session }, ...serverList) => {
        return await (0, user_1.commandSwitchDisplayedServerList)(config, session, serverList);
    });
    ctx.command('玩家状态 [index:integer]', '查询自己的玩家状态', cmdConfig)
        .shortcut(/^(.+服)玩家状态$/, { args: ['$1'] })
        .userFields(['tsugu'])
        .action(async ({ session }, index) => {
        return await (0, user_1.commandPlayerInfo)(config, session, index);
    });
    ctx.command('玩家状态列表', '查询目前已经绑定的所有玩家信息', cmdConfig)
        .alias('玩家列表', '玩家信息列表')
        .userFields(['tsugu'])
        .action(async ({ session }) => {
        return await (0, user_1.commandPlayerList)(config, session);
    });
    ctx.command('玩家默认ID <index:integer>', '设置默认显示的玩家ID', cmdConfig)
        .usage('调整玩家状态指令，和发送车牌时的默认玩家信息。\n规则: \n如果该ID对应的玩家信息在当前默认服务器中, 显示。\n如果不在当前默认服务器中, 显示当前默认服务器的编号最靠前的玩家信息')
        .alias('默认玩家ID', '默认玩家', '玩家ID')
        .userFields(['tsugu'])
        .action(async ({ session }, index) => {
        if (index == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 玩家默认ID`;
        }
        return await (0, user_1.commandSwitchPlayerIndex)(config, session, index);
    });
    //其他
    ctx.command('ycm [keyword:text]', '获取车牌', cmdConfig)
        .alias('有车吗', '车来')
        .usage(`获取所有车牌车牌, 可以通过关键词过滤`)
        .example('ycm : 获取所有车牌')
        .example('ycm 大分: 获取所有车牌, 其中包含"大分"关键词的车牌')
        .action(async ({ session }, keyword) => {
        const list = await (0, roomList_1.commandRoomList)(config, keyword);
        return ((0, utils_1.paresMessageList)(list));
    });
    ctx.command('查玩家 <playerId:integer> [serverName:text]', '查询玩家信息', cmdConfig)
        .alias('查询玩家')
        .usage('查询指定ID玩家的信息。省略服务器名时, 默认从你当前的主服务器查询')
        .example('查玩家 10000000 : 查询你当前默认服务器中, 玩家ID为10000000的玩家信息')
        .example('查玩家 40474621 jp : 查询日服玩家ID为40474621的玩家信息')
        .action(async ({ session }, playerId, serverName) => {
        if (playerId == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查玩家`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, searchPlayer_1.commandSearchPlayer)(config, playerId, mainServer);
        return ((0, utils_1.paresMessageList)(list));
    });
    ctx.command("查卡 <word:text>", "查卡", cmdConfig)
        .alias('查卡牌')
        .usage('根据关键词或卡牌ID查询卡片信息, 请使用空格隔开所有参数')
        .example('查卡 1399 :返回1399号卡牌的信息').example('查卡 绿 tsugu :返回所有属性为pure的羽泽鸫的卡牌列表')
        .action(async ({ session }, text) => {
        if (text == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查卡`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        const list = await (0, searchCard_1.commandCard)(config, displayedServerList, text);
        return ((0, utils_1.paresMessageList)(list));
    });
    ctx.command('查卡面 <cardId:text>', '查卡面', cmdConfig)
        .alias('查卡插画', '查插画')
        .usage('根据卡片ID查询卡片插画').example('查卡面 1399 :返回1399号卡牌的插画')
        .usage('根据卡片描述查询卡片插画').example('查卡面 香澄 5x 花后 :返回香澄 5星的花后卡面（存在多个结果将会显示多个结果）')
        .action(async ({ session }, cardId) => {
        if (cardId == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查卡面`;
        }
        const list = await (0, getCardIllustration_1.commandGetCardIllustration)(config, cardId);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command('查角色 <word:text>', '查角色', cmdConfig)
        .usage('根据关键词或角色ID查询角色信息')
        .example('查角色 10 :返回10号角色的信息').example('查角色 吉他 :返回所有角色模糊搜索标签中包含吉他的角色列表')
        .action(async ({ session }, text) => {
        if (text == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查角色`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        const list = await (0, searchCharacter_1.commandCharacter)(config, displayedServerList, text);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("查活动 <word:text>", "查活动", cmdConfig)
        .usage('根据关键词或活动ID查询活动信息')
        .example('查活动 177 :返回177号活动的信息').example('查活动 绿 tsugu :返回所有属性加成为pure, 且活动加成角色中包括羽泽鸫的活动列表')
        .action(async ({ session }, text) => {
        if (text == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查活动`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        const list = await (0, searchEvent_1.commandEvent)(config, displayedServerList, text);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("查曲 <word:text>", "查曲", cmdConfig)
        .usage('根据关键词或曲目ID查询曲目信息')
        .example('查曲 1 :返回1号曲的信息').example('查曲 ag lv27 :返回所有难度为27的ag曲列表')
        .action(async ({ session }, text) => {
        if (text == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查曲`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        const list = await (0, searchSong_1.commandSong)(config, displayedServerList, text);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("查谱面 <songId:string> [difficultyText:text]", "查谱面", cmdConfig)
        .usage('根据曲目ID与难度查询铺面信息')
        .example('查谱面 1 :返回1号曲的所有铺面').example('查谱面 1 expert :返回1号曲的expert难度铺面')
        .action(async ({ session }, songId, difficultyText) => {
        if (songId == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查谱面`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        let difficultyId;
        if (difficultyText) {
            const fuzzySearchResult = await (0, fuzzySearch_1.getFuzzySearchResult)(config, difficultyText);
            if (!fuzzySearchResult['difficulty']) {
                return '错误: 难度名未能匹配任何难度';
            }
            difficultyId = fuzzySearchResult['difficulty'][0];
        }
        const list = await (0, songChart_1.commandSongChart)(config, displayedServerList, songId, difficultyId);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("随机曲 [word:text]", "随机曲", cmdConfig)
        .usage('根据关键词或曲目ID查询曲目信息')
        .alias('随机')
        .example('随机曲 lv24 :在所有包含24等级难度的曲中, 随机返回其中一个').example('随机曲 lv24 ag :在所有包含24等级难度的afterglow曲中, 随机返回其中一个')
        .action(async ({ session }, text) => {
        const tsuguUserData = await observeUserTsugu(session);
        const mainServer = tsuguUserData.mainServer;
        const list = await (0, songRandom_1.commandSongRandom)(config, mainServer, text);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command('查询分数表 <searchCondition:text>', '查询分数表', cmdConfig)
		.option('serverName', '-s [serverName:string] 指定数据服务器')
        .usage('查询指定服务器的歌曲分数表, 如果没有服务器名的话, 服务器为用户的默认服务器')
        .alias('查分数表', '查询分数榜', '查分数榜').example('查询分数表 Popipa lv20 hd -s cn :返回国服 Popipa LV20等级 HARD难度歌曲的分数表。不指定服务器时使用用户设置的主服务器')
        .action(async ({ session, options }, searchCondition, serverName) => {
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        let mainServer = tsuguUserData.mainServer;
        var serverNameRequest = false;
        var bandNameRequest = false;
        if (options.serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, options.serverName);
            if (serverFromServerNameFuzzySearch != -1) {
                mainServer = serverFromServerNameFuzzySearch;
            }
        }
        const list = await (0, songMeta_1.commandSongMeta)(config, displayedServerList, mainServer, searchCondition);
        return (0, utils_1.paresMessageList)(list);
    });
	ctx.command("查试炼 [origin:string] [index:number]", "查试炼", cmdConfig)
		.usage("查询当前服务器当前活动试炼信息\n可以自定义活动ID和日期")
		.alias("查stage", "查舞台", "查festival", "查5v5")
		.example("查试炼 2024.12.25 :返回2024.12.25对应活动的试炼信息, 包含歌曲meta")
		.example("查试炼 12.25 :返回当年12.25对应活动的试炼信息, 包含歌曲meta")
		.example("查试炼 261:返回261号活动第一天的试炼信息, 包含歌曲meta")
		.example("查试炼 261 7:返回261号活动第七天的试炼信息, 包含歌曲meta")
        .action(async ({ session, options }, origin, index) => {
         function parseDate(origin2) {
			const list2 = origin2?.match(/\d+/gim);
			if (!list2 || list2.length == 0)
				return {};
			if (list2.length == 1 && parseInt(list2[0]) > 31) {
				return { eventId: parseInt(list2[0]) };
			}
			const now = /* @__PURE__ */ new Date();
			return { date: new Date(list2.at(-3) ?? now.getFullYear(), (list2.at(-2) ?? now.getMonth() + 1) - 1, list2.at(-1)) };
		}
		const { eventId, date } = parseDate(origin);
        const tsuguUserData = await observeUserTsugu(session);
        const mainServer = tsuguUserData.mainServer;
        const list = await (0, eventStage_1.commandEventStage)(config, mainServer, eventId, index, date, true);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("查卡池 <gachaId:integer>", "查卡池", cmdConfig)
        .usage('根据卡池ID查询卡池信息')
        .action(async ({ session }, gachaId) => {
        if (gachaId == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 查卡池`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        const displayedServerList = tsuguUserData.displayedServerList;
        const list = await (0, searchGacha_1.commandGacha)(config, displayedServerList, gachaId);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("ycx <tier:integer> [eventId:integer] [serverName]", "查询指定档位的预测线", cmdConfig)
		.option('compare', '-c <compare:text> 与其他活动的同一档线进行对比 如ycx1000 -c 305t1000 307t2000 302')
        .usage(`查询指定档位的预测线, 如果没有服务器名的话, 服务器为用户的默认服务器。如果没有活动ID的话, 活动为当前活动\n可用档线:\n:\n${(0, utils_1.tierListOfServerToString)()}`)
        .example('ycx 1000 :返回默认服务器当前活动1000档位的档线与预测线').example('ycx 1000 177 jp:返回日服177号活动1000档位的档线与预测线')
        .action(async ({ session, options }, tier, eventId, serverName) => {
        if (tier == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help ycx`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器。如果你是希望多个相同或不同的档线进行对比，请手动在-c后手动加入英文的单引号或双引号，具体的档线在引号内填写。单个档线不需要。\n填写规则：如302后面不加Tier则表示与 ycx档线 中的档线相同。如ycx500 -c \'305t1000 302\' 此时302就是t500';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, cutoffDetail_1.commandCutoffDetail)(config, mainServer, tier, eventId,options.compare);
        return (0, utils_1.paresMessageList)(list);
    });
    
    ctx.command("ycxall [eventId:integer] [serverName]", "查询所有档位的预测线", cmdConfig)
        .usage(`查询所有档位的预测线, 如果没有服务器名的话, 服务器为用户的默认服务器。如果没有活动ID的话, 活动为当前活动\n可用档线:\n${(0, utils_1.tierListOfServerToString)()}`)
        .example('ycxall :返回默认服务器当前活动所有档位的档线与预测线').example('ycxall 177 jp:返回日服177号活动所有档位的档线与预测线')
        .alias('myycx')
        .action(async ({ session }, eventId, serverName) => {
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, cutoffAll_1.commandCutoffAll)(config, mainServer, eventId);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("lsycx <tier:integer> [eventId:integer] [serverName]", "查询指定档位的预测线", cmdConfig)
        .usage(`查询指定档位的预测线, 与最近的4期活动类型相同的活动的档线数据, 如果没有服务器名的话, 服务器为用户的默认服务器。如果没有活动ID的话, 活动为当前活动\n可用档线:\n${(0, utils_1.tierListOfServerToString)()}`)
        .example('lsycx 1000 :返回默认服务器当前活动的档线与预测线, 与最近的4期活动类型相同的活动的档线数据').example('lsycx 1000 177 jp:返回日服177号活动1000档位档线与最近的4期活动类型相同的活动的档线数据')
        .action(async ({ session }, tier, eventId, serverName) => {
        if (tier == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help lsycx`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, cutoffListOfRecentEvent_1.commandCutoffListOfRecentEvent)(config, mainServer, tier, eventId);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command("歌榜 <tier:integer> [eventId:integer] [serverName]", "查询歌榜档位分数", cmdConfig)
        .usage(`查询歌榜活动指定档位的分数线。如果没有服务器名的话, 服务器为用户的默认服务器。如果没有活动ID的话, 活动为当前活动\n可用档线: 1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000`)
        .example('歌榜 1000 :返回默认服务器当前活动1000档位的歌榜分数').example('歌榜 1000 300 jp:返回日服300号活动1000档位的歌榜分数')
        .action(async ({ session }, tier, eventId, serverName) => {
        const validTiers = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
        if (tier == undefined || !validTiers.includes(tier)) {
            return `错误: 档位必须为以下之一: ${validTiers.join(', ')}`;
        }
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, cutoffSong_1.commandCutoffSong)(config, mainServer, tier, eventId);
        return (0, utils_1.paresMessageList)(list);
    });
    ctx.command('抽卡模拟 [times:integer] [gachaId:integer]', cmdConfig)
        .usage('模拟抽卡, 如果没有卡池ID的话, 卡池为当前活动的卡池')
        .example('抽卡模拟:模拟抽卡10次').example('抽卡模拟 300 922 :模拟抽卡300次, 卡池为922号卡池')
        .channelFields(['tsugu_gacha'])
        .action(async ({ session }, times, gachaId) => {
        if (times == undefined) {
            return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help 抽卡模拟`;
        }
        const status = session.channel?.tsugu_gacha ?? true;
        if (status) {
            const tsuguUserData = await observeUserTsugu(session);
            const mainServer = tsuguUserData.mainServer;
            const list = await (0, gachaSimulate_1.commandGachaSimulate)(config, mainServer, times, gachaId);
            return ((0, utils_1.paresMessageList)(list));
        }
        else {
            return '抽卡功能已关闭';
        }
    });
    ctx.command('查岗 <playerId:string> [serverName:string]', '查询前十车速（为空则为查时速表）', cmdConfig)
        .option('count', '-c <count:number> 指定显示最近的几次分数变化，默认20次')
        .option('cgEventId', '-e <count:number> 指定活动编号')
        .action(async ({ session, options }, playerId, serverName) => {
        var mode = 0;
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (playerId == undefined) {
            mode = 1;
            const list = await (0, topRateDetail_1.commandTopRateDetail)(config, options.count, playerId, tier, mainServer, mode);
            return ((0, utils_1.paresMessageList)(list));
        }
        var tier;
        if (isNaN(parseInt(playerId))) {
            if (playerId[0] == 't' && !isNaN(parseInt(playerId.slice(1)))) {
                tier = parseInt(playerId.slice(1));
                playerId = undefined;
            }
            else {
                return `请确认输入玩家id或者排名格式正确`;
            }
            if (tier > 10 || tier < 1) {
                return `请确认输入的排名在1到10之间`;
            }
        }
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, topRateDetail_1.commandTopRateDetail)(config, options.count, playerId, tier, mainServer, 0,options.cgEventId);
        return ((0, utils_1.paresMessageList)(list));
    });
    ctx.command('查变动 <playerId:string> [serverName:string]', '查询任意Top10玩家的分数变动统计情况', cmdConfig)
        .option('count', '-c <count:number> 无作用')
        .option('cgEventId', '-e <count:number> 指定活动编号')
        .action(async ({ session, options }, playerId, serverName) => {
        var mode = 2;
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (playerId == undefined) {
            return `请确认输入玩家ID或者排名格式正确`;
        }
        var tier;
        if (isNaN(parseInt(playerId))) {
            if (playerId[0] == 't' && !isNaN(parseInt(playerId.slice(1)))) {
                tier = parseInt(playerId.slice(1));
                playerId = undefined;
            }
            else {
                return `请确认输入玩家id或者排名格式正确`;
            }
            if (tier > 10 || tier < 1) {
                return `请确认输入的排名在1到10之间`;
            }
        }
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, topRateDetail_1.commandTopRateDetail)(config, options.count, playerId, tier, mainServer, mode,options.cgEventId);
        return ((0, utils_1.paresMessageList)(list));
    });
    ctx.command('查停摆 <playerId:string> [serverName:string]', '查询任意Top10玩家的停摆情况', cmdConfig)
        .option('count', '-c <count:number> 无作用')
        .option('cgEventId', '-e <count:number> 指定活动编号')
        .action(async ({ session, options }, playerId, serverName) => {
        var mode = 3;
        const tsuguUserData = await observeUserTsugu(session);
        let mainServer = tsuguUserData.mainServer;
        if (playerId == undefined) {
            return `请确认输入玩家ID或者排名格式正确`;
        }
        var tier;
        if (isNaN(parseInt(playerId))) {
            if (playerId[0] == 't' && !isNaN(parseInt(playerId.slice(1)))) {
                tier = parseInt(playerId.slice(1));
                playerId = undefined;
            }
            else {
                return `请确认输入玩家id或者排名格式正确`;
            }
            if (tier > 10 || tier < 1) {
                return `请确认输入的排名在1到10之间`;
            }
        }
        if (serverName) {
            const serverFromServerNameFuzzySearch = await (0, fuzzySearch_1.serverNameFuzzySearchResult)(config, serverName);
            if (serverFromServerNameFuzzySearch == -1) {
                return '错误: 服务器名未能匹配任何服务器';
            }
            mainServer = serverFromServerNameFuzzySearch;
        }
        const list = await (0, topRateDetail_1.commandTopRateDetail)(config, options.count, playerId, tier, mainServer, mode,options.cgEventId);
        return ((0, utils_1.paresMessageList)(list));
    });
    /*
  ctx.on('command/before-execute', (argv) => {
    const { command, session } = argv;
    const now_channel = session.channelId;
    // 其他逻辑代码继续执行
    async function getChannelData() {
      const channel_get = await ctx.database.get('channel', { id: now_channel });
      if (channel_get[0]?.tsugu_run === false) {
        const keywords = ['查询玩家', '查卡面', '查玩家', '查卡', '查角色', '查活动', '查分数表', '查询分数榜', '查分数榜', '查曲', '查谱面', '查卡池', '查询分数表', 'ycx', 'ycxall', 'lsycx', '抽卡模拟', '绑定玩家', '解除绑定', '主服务器', '设置默认服务器', '玩家状态', '开启车牌转发', '关闭车牌转发'];
        const messageContent = session.event.message.content;
        // 检查消息是否以数组中的任意一个词开始
        const startsWithKeyword = keywords.some(keyword => messageContent.startsWith(keyword));
        if (startsWithKeyword) {
          console.log('尝试关闭');
          return '';
        }
      }
    }
    return getChannelData(); // 将结果返回给原始的命令执行过程
  });
  */
    // 为bot添加回复/at功能
    ctx.before('send', (session, options) => {
        if (config.at) {
            if (session.elements.length > 0) {
                session.elements.unshift((0, koishi_1.h)('at', { id: options.session.event.user.id }));
            }
        }
        if (config.reply) {
            if (session.elements.length > 0) {
                session.elements.unshift((0, koishi_1.h)('quote', { id: options.session.event.message.id }));
            }
        }
    });
}
const CommandLogger = new koishi_1.Logger('tsugu-command');
export const cmdConfig = {
    checkUnknown: true,
    checkArgCount: false,
    handleError: (err, { command }) => {
        CommandLogger.error(err);
        return `执行指令 ${command.displayName} 失败`;
    },
};
