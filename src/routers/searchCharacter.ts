import express from 'express';
import { body } from 'express-validator';
import { drawCharacterList } from '@/view/characterList';
import { drawCharacterDetail } from '@/view/characterDetail';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { isServer, Server } from '@/types/Server';
import { Character, getCharacterBirthdayByOffset, getCharacterIdsByBirthday, getNearestCharacterBirthday } from '@/types/Character';
import { parseBirthdayOffset, parseCharacterBirthday } from './characterSearchInput';
import { getDateByServerTimezone } from '@/components/list/time';
import { globalDefaultServer } from '@/config';
import { listToBase64 } from '@/routers/utils';
import { isServerList } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();
const birthdaySearchHelp = '今天没有角色生日。\n可以通过角色ID、关键词或生日查询，例如：\n查角色 10\n查角色 吉他\n查角色 7.21\n查角色 +（下一个生日）\n查角色 -（上一个生日）\n生日也支持 721、1027、10.27、7月21日、7月21 等写法。';

router.post('/',
    [
        body('displayedServerList').custom(isServerList),
        body('mainServer').optional().custom(isServer),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('text').optional().isString(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { displayedServerList, fuzzySearchResult, text, compress, mainServer } = req.body;
        const searchText = text?.trim();
        
        // 检查 text 和 fuzzySearchResult 是否同时存在
        if (searchText && fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
        }
        try {
            const result = await commandCharacter(displayedServerList, searchText || fuzzySearchResult, compress, mainServer);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).json({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandCharacter(displayedServerList: Server[], input: string | FuzzySearchResult | undefined, compress: boolean, mainServer: Server = displayedServerList[0] ?? globalDefaultServer[0]): Promise<Array<Buffer | string>> {

    if (input == null || (typeof input === 'string' && !input.trim())) {
        const now = Date.now()
        for (const server of new Set([mainServer, Server.jp])) {
            const date = getDateByServerTimezone(now, server)
            const characterIds = await getCharacterIdsByBirthday(date.getUTCMonth() + 1, date.getUTCDate())
            if (characterIds.length > 0) {
                // 加入日服，避免生日命中的角色因其他服务器尚未发布而被隐藏。
                const servers = [...new Set([server, ...displayedServerList, Server.jp])]
                return await drawCharacterList({ characterId: characterIds }, servers, compress)
            }
        }
        const nearest = await getNearestCharacterBirthday(getDateByServerTimezone(now, mainServer))
        if (!nearest) return [birthdaySearchHelp]
        const servers = [...new Set([mainServer, ...displayedServerList, Server.jp])]
        const result = await drawCharacterList({ characterId: nearest.characterIds }, servers, compress)
        return [`${birthdaySearchHelp}\n距离今天最近的生日是 ${nearest.month}月${nearest.day}日：`, ...result]
    }

    let fuzzySearchResult: FuzzySearchResult
    // 根据 input 的类型执行不同的逻辑
    if (typeof input === 'string') {
        input = input.trim()
        const offset = parseBirthdayOffset(input)
        if (offset !== null) {
            const date = getDateByServerTimezone(Date.now(), mainServer)
            const birthday = await getCharacterBirthdayByOffset(date, offset)
            if (!birthday) return ['没有搜索到有生日信息的角色']
            const servers = [...new Set([mainServer, ...displayedServerList, Server.jp])]
            return await drawCharacterList({ characterId: birthday.characterIds }, servers, compress)
        }
        const isCharacterId = /^\d+$/.test(input)
        const characterId = isCharacterId ? Number(input) : null
        if (isCharacterId && new Character(characterId).isExist) {
            return await drawCharacterDetail(characterId, displayedServerList, compress)
        }
        const birthday = parseCharacterBirthday(input)
        if (birthday) {
            const characterIds = await getCharacterIdsByBirthday(birthday.month, birthday.day)
            if (characterIds.length === 0) {
                return ['没有搜索到符合条件的角色']
            }
            const servers = [...new Set([...displayedServerList, Server.jp])]
            return await drawCharacterList({ characterId: characterIds }, servers, compress)
        }
        if (isCharacterId) {
            return await drawCharacterDetail(characterId, displayedServerList, compress)
        }
        fuzzySearchResult = fuzzySearch(input)
    } else {
        // 使用 fuzzySearch 逻辑
        fuzzySearchResult = input
    }

    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词']
    }

    return await drawCharacterList(fuzzySearchResult, displayedServerList, compress)

}

export { router as searchCharacterRouter }
