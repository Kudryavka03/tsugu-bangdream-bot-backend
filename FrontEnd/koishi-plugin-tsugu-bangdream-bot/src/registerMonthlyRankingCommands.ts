// @ts-nocheck
import type { Context } from "koishi";
import * as utils_1 from "./utils";
import * as fuzzySearch_1 from "./api/fuzzySearch";
import * as monthlyRankingCutoffDetail_1 from "./commands/monthlyRankingCutoffDetail";
import * as monthlyRankingCutoffAll_1 from "./commands/monthlyRankingCutoffAll";
import * as monthlyRankingCutoffListOfRecent_1 from "./commands/monthlyRankingCutoffListOfRecent";
// 依赖 Bestdori 月榜 top API，暂不可用
// import * as monthlyRankingTopRateDetail_1 from "./commands/monthlyRankingTopRateDetail";
// import * as monthlyRankingTopRateRanking_1 from "./commands/monthlyRankingTopRateRanking";
// import * as monthlyRankingTopTenMinuteSpeed_1 from "./commands/monthlyRankingTopTenMinuteSpeed";
// import * as monthlyRankingTopRunningStatus_1 from "./commands/monthlyRankingTopRunningStatus";
// import * as monthlyRankingTopSleepStat_1 from "./commands/monthlyRankingTopSleepStat";
// import { isInteger } from "./commands/utils";

export function registerMonthlyRankingCommands(
    ctx: Context,
    config,
    observeUserTsugu: (session: any) => Promise<any>,
    commandConfig,
) {
    const cmdConfig = commandConfig;

    /*
    // 依赖 私有API，暂不可用
    ctx.command('m查岗 <playerId:string> [limit:string] [monthlyRankingId] [serverName:string]', '查询月榜前十查岗', cmdConfig)
        .option('count', '-c <count:number> 指定显示最近的几次分数变化，默认20次')
        .option('day', '-d <day:number> 指定月榜开始的第几天的分数变动详情')
        .action(async ({ session, options }, playerId, limit, monthlyRankingId, serverName) => {
            if (playerId == undefined) {
                return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help m查岗`;
            }
            let tier;
            if (isNaN(parseInt(playerId))) {
                if (playerId[0] == 't' && !isNaN(parseInt(playerId.slice(1)))) {
                    tier = parseInt(playerId.slice(1));
                    playerId = undefined;
                } else {
                    return `请确认输入玩家id或者排名格式正确`;
                }
                if (tier > 10 || tier < 1) {
                    return `请确认输入的排名在1到10之间`;
                }
            }
            let f_limit;
            if (limit) {
                const str = limit.trim()
                    .replace(/＞/g, ">")
                    .replace(/＜/g, "<")
                    .replace(/＝/g, "=");
                if (/^>\d+$/.test(str) || /^<\d+$/.test(str) || /^>=\d+$/.test(str) || /^<=\d+$/.test(str) || /^\d+-\d+$/.test(str)) {
                    f_limit = limit;
                } else {
                    serverName = monthlyRankingId;
                    monthlyRankingId = limit;
                }
            }
            if (isNaN(Number(monthlyRankingId))) {
                serverName = monthlyRankingId;
                monthlyRankingId = undefined;
            }
            if (options.day && (options.day < 0 || !Number.isInteger(options.day))) {
                return `参数day输入无效，请提供一个正整数`;
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            const list = await monthlyRankingTopRateDetail_1.commandMonthlyRankingTopRateDetail(config, monthlyRankingId === undefined ? undefined : Number(monthlyRankingId), options.day, f_limit, options.count, playerId, tier, mainServer);
            return utils_1.paresMessageList(list);
        });

    ctx.command('m前十车速 [commandArgs:text]', '查询当前月榜前十车速排名', cmdConfig)
        .option('length', '-l <length:string> 指定时间范围，默认60(单位min)')
        .option('time', '-t <time:string> 指定结束统计的时间，格式为H或HH:mm')
        .option('date', '-d <date:string> 指定结束统计日期，格式为"年/月/日"或"月/日"(分隔符用.也可)')
        .option('player', '-p <player:string> 指定玩家')
        .action(async ({ session, options }, commandArgs) => {
            const isPlayer = (s) => (/^t([1-9]|10)$/i.test(s) || /^p\d+$/i.test(s));
            const isHour = (s) => (/^(?:[01]?\d|2[0-4])(?:[:：][0-5]\d)?$/.test(s));
            const isDate = (s) => (/^(?:(\d{4})[/.](\d{1,2})[/.](\d{1,2})|(\d{1,2})[/.](\d{1,2}))$/.test(s));
            const isTimeRange = (s) => (/^\d+(min|h|m)?$/i.test(s));

            let player = options?.player;
            let length = isTimeRange(options?.length) ? utils_1.parseTimeToMinutes(options.length) : undefined;
            let timeHour = isHour(options.time) ? Number(options.time.replace(/:/g, ".")) : undefined;
            let date = isDate(options?.date) ? utils_1.parseDate(options.date) : undefined;
            let serverName = undefined;

            if (commandArgs?.length) {
                for (const arg of commandArgs?.trim()?.split(/\s+/g)) {
                    if (isPlayer(arg)) {
                        player ??= arg.replace(/^p/i, '');
                    } else if (isHour(arg)) {
                        timeHour ??= Number(arg.replace(/:/g, "."));
                    } else if (isDate(arg)) {
                        date ??= utils_1.parseDate(arg);
                    } else if (isTimeRange(arg)) {
                        length ??= utils_1.parseTimeToMinutes(arg);
                    } else if (!/\d/.test(arg)) {
                        serverName ??= arg;
                    }
                }
            }
            if (timeHour) {
                if (date) {
                    date.setHours(timeHour);
                    if (!isInteger(String(timeHour))) {
                        date.setMinutes(Math.round(timeHour * 100 - 100));
                    }
                } else {
                    const now = new Date();
                    date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), timeHour, isInteger(String(timeHour)) ? 0 : Math.round(timeHour * 100 % 100), 0, 0);
                }
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            let compareTier = undefined;
            let comparePlayerUid = undefined;
            if (player?.startsWith('t')) {
                compareTier = Number(player.slice(1));
            } else if (player && !/^[0-9]+$/.test(player)) {
                return '参数player输入无效，请指定正确排名或uid';
            } else if (player) {
                comparePlayerUid = Number(player);
            }
            length ??= 60;
            if (length && !/^[0-9]+$/.test(String(length))) {
                return '参数time输入无效，请指定时间长度(默认min)';
            }
            const list = await monthlyRankingTopRateRanking_1.commandMonthlyRankingTopRateRanking(config, mainServer, length, date, compareTier, comparePlayerUid);
            return utils_1.paresMessageList(list);
        });

    ctx.command('m分速表 [commandArgs:text]', '查询当前月榜前十分速表', cmdConfig)
        .option('length', '-l <length:string> 指定时间范围，默认60(单位min)')
        .option('allPlayer', '-a')
        .option('time', '-t <time:string> 指定结束统计的时间，格式为H或HH:mm')
        .option('date', '-d <date:string> 指定结束统计日期，格式为"年/月/日"或"月/日"(分隔符用.也可)')
        .action(async ({ session, options }, commandArgs) => {
            const isHour = (s) => (/^(?:[01]?\d|2[0-4])(?:[:：][0-5]\d)?$/.test(s));
            const isDate = (s) => (/^(?:(\d{4})[/.](\d{1,2})[/.](\d{1,2})|(\d{1,2})[/.](\d{1,2}))$/.test(s));
            const isTimeRange = (s) => (/^\d+(min|h|m)?$/i.test(s));

            let length = isTimeRange(options?.length) ? utils_1.parseTimeToMinutes(options.length) : undefined;
            let timeHourStr = isHour(options?.time) ? options.time : undefined;
            let date = isDate(options?.date) ? utils_1.parseDate(options.date) : undefined;
            let serverName = undefined;

            if (commandArgs?.length) {
                for (const arg of commandArgs.trim().split(/\s+/g)) {
                    if (isHour(arg)) {
                        timeHourStr ??= arg;
                    } else if (isDate(arg)) {
                        date ??= utils_1.parseDate(arg);
                    } else if (isTimeRange(arg)) {
                        length ??= utils_1.parseTimeToMinutes(arg);
                    } else if (arg === '-a') {
                        options.allPlayer = true;
                    } else if (!/\d/.test(arg)) {
                        serverName ??= arg;
                    }
                }
            }

            if (timeHourStr) {
                const [h, m] = timeHourStr.split(/[:：]/).map(Number);
                if (date) {
                    date.setHours(h);
                    date.setMinutes(m || 0);
                    date.setSeconds(0);
                    date.setMilliseconds(0);
                } else {
                    const now = new Date();
                    date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m || 0, 0, 0);
                }
            }

            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }

            length ??= 60;
            if (length && !/^[0-9]+$/.test(String(length))) {
                return '参数length输入无效，请指定正确的时间长度(单位min)';
            }

            const list = await monthlyRankingTopTenMinuteSpeed_1.commandMonthlyRankingTopTenMinuteSpeed(config, mainServer, length, date, options.allPlayer);
            return utils_1.paresMessageList(list);
        });

    ctx.command('m查稼动 <playerId:string> [monthlyRankingId] [serverName:string]', '查询月榜前十稼动', cmdConfig)
        .alias('m查稼働')
        .option('time', '-t <time:number> 指定时间边界，默认25(单位min)')
        .action(async ({ session, options }, playerId, monthlyRankingId, serverName) => {
            if (playerId == undefined) {
                return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help m查稼动`;
            }
            if (isNaN(Number(monthlyRankingId))) {
                serverName = monthlyRankingId;
                monthlyRankingId = undefined;
            }
            let tier;
            if (isNaN(parseInt(playerId))) {
                if (playerId[0] == 't' && !isNaN(parseInt(playerId.slice(1)))) {
                    tier = parseInt(playerId.slice(1));
                    playerId = undefined;
                } else {
                    return `请确认输入玩家id或者排名格式正确`;
                }
                if (tier > 10 || tier < 1) {
                    return `请确认输入的排名在1到10之间`;
                }
            }
            if (options.time && options.time < 5) {
                return '参数time输入无效，请输入一个不小于5的整数';
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            const list = await monthlyRankingTopRunningStatus_1.commandMonthlyRankingTopRunningStatus(config, monthlyRankingId === undefined ? undefined : Number(monthlyRankingId), playerId, tier, options?.time || 25, mainServer);
            return utils_1.paresMessageList(list);
        });

    ctx.command('m查睡眠 <playerId:string> [monthlyRankingId] [serverName:string]', '查询月榜前十睡眠状况', cmdConfig)
        .option('time', '-t <time:number> 指定时间边界，默认25(单位min)')
        .action(async ({ session, options }, playerId, monthlyRankingId, serverName) => {
            if (playerId == undefined) {
                return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help m查睡眠`;
            }
            if (isNaN(Number(monthlyRankingId))) {
                serverName = monthlyRankingId;
                monthlyRankingId = undefined;
            }
            let tier;
            if (isNaN(parseInt(playerId))) {
                if (playerId[0] == 't' && !isNaN(parseInt(playerId.slice(1)))) {
                    tier = parseInt(playerId.slice(1));
                    playerId = undefined;
                } else {
                    return `请确认输入玩家id或者排名格式正确`;
                }
                if (tier > 10 || tier < 1) {
                    return `请确认输入的排名在1到10之间`;
                }
            }
            if (options.time && options.time < 5) {
                return '参数time输入无效，请输入一个不小于5的整数';
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            const list = await monthlyRankingTopSleepStat_1.commandMonthlyRankingTopSleepStat(config, monthlyRankingId === undefined ? undefined : Number(monthlyRankingId), playerId, tier, options?.time || 25, mainServer);
            return utils_1.paresMessageList(list);
        });
    */

    ctx.command("mycx <tier:integer> [monthlyRankingId:integer] [serverName]", "查询指定档位的月榜预测线", cmdConfig)
        .usage(`查询指定档位的月榜预测线, 如果没有服务器名的话, 服务器为用户的默认服务器。如果没有月榜ID的话, 活动为当前月榜\n可用档线:\n${utils_1.tierListOfServerToString()}`)
        .example('mycx 1000 :返回默认服务器当前月榜1000档位的档线与预测线')
        .action(async ({ session }, tier, monthlyRankingId, serverName) => {
            if (tier == undefined) {
                return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help mycx`;
            }
            if (isNaN(monthlyRankingId)) {
                serverName = monthlyRankingId;
                monthlyRankingId = undefined;
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            const list = await monthlyRankingCutoffDetail_1.commandMonthlyRankingCutoffDetail(config, mainServer, tier, monthlyRankingId);
            return utils_1.paresMessageList(list);
        });

    ctx.command("mycxall [monthlyRankingId] [serverName]", "查询所有档位的月榜预测线", cmdConfig)
        .usage(`查询所有月榜档位的预测线, 如果没有服务器名的话, 服务器为用户的默认服务器。如果没有月榜ID的话, 活动为当前月榜\n可用档线:\n${utils_1.tierListOfServerToString()}`)
        .action(async ({ session }, monthlyRankingId, serverName) => {
            if (isNaN(monthlyRankingId)) {
                serverName = monthlyRankingId;
                monthlyRankingId = undefined;
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            const list = await monthlyRankingCutoffAll_1.commandMonthlyRankingCutoffAll(config, mainServer, monthlyRankingId);
            return utils_1.paresMessageList(list);
        });

    ctx.command("mlsycx <tier:integer> [monthlyRankingId] [serverName]", "查询月榜历史档线对比", cmdConfig)
        .usage(`查询指定档位的预测线, 与最近的月榜档线数据对比\n可用档线:\n${utils_1.tierListOfServerToString()}`)
        .action(async ({ session }, tier, monthlyRankingId, serverName) => {
            if (tier == undefined) {
                return `错误: 指令不完整\n使用以下指令以查看帮助:\n  help mlsycx`;
            }
            if (isNaN(monthlyRankingId)) {
                serverName = monthlyRankingId;
                monthlyRankingId = undefined;
            }
            const tsuguUserData = await observeUserTsugu(session);
            let mainServer = tsuguUserData.mainServer;
            if (serverName) {
                const serverFromServerNameFuzzySearch = await fuzzySearch_1.serverNameFuzzySearchResult(config, serverName);
                if (serverFromServerNameFuzzySearch == -1) {
                    return '错误: 服务器名未能匹配任何服务器';
                }
                mainServer = serverFromServerNameFuzzySearch;
            }
            const list = await monthlyRankingCutoffListOfRecent_1.commandMonthlyRankingCutoffListOfRecent(config, mainServer, tier, monthlyRankingId);
            return utils_1.paresMessageList(list);
        });
}
