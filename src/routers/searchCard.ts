import express from 'express';
import { body, validationResult } from 'express-validator';
import { drawCardDetail } from '@/view/cardDetail';
import { drawCardList } from '@/view/cardList';
import { isInteger, listToBase64 } from '@/routers/utils';
import { isServerList } from '@/types/Server';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { getServerByServerId, Server } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('displayedServerList').custom(isServerList),
        body('text').optional().isString(),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('useEasyBG').isBoolean(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { displayedServerList, text, fuzzySearchResult, useEasyBG, compress } = req.body;
        
        // 检查 text 和 fuzzySearchResult 是否同时存在
        if (text && fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
        }
        // 检查 text 和 fuzzySearchResult 是否同时不存在
        if (!text && !fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: '不能同时不存在 text 与 fuzzySearchResult' });
        }

        try {
            const result = await commandCard(displayedServerList, text || fuzzySearchResult, useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

async function commandCard(displayedServerList: Server[], input: string | FuzzySearchResult, useEasyBG: boolean, compress?: boolean) {
    let fuzzySearchResult: FuzzySearchResult
    // 根据 input 的类型执行不同的逻辑
    if (typeof input === 'string') {
        if (isInteger(input)) {
            var inputId = parseInt(input)
            if (inputId = 947) return getDoujinshiSayoHina()
            return await drawCardDetail(inputId, displayedServerList, useEasyBG, compress)
        }
        fuzzySearchResult = fuzzySearch(input)
    } else {
        // 使用 fuzzySearch 逻辑
        fuzzySearchResult = input
    }

    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词']
    }

    return await drawCardList(fuzzySearchResult, displayedServerList,useEasyBG, compress)

};

export async function getDoujinshiSayoHina(){
    var DoujinshiSayoHinaList = [
        "(Bang Dream! SayoHina doujin) ki君mi - B62544-冰川雙子《大切な人》-v3",
        "(C97) [Daisan-keitai (Kura)] Doushite Saikin Kuttsuku no? (BanG Dream!)",
        "(C97) [VOLUTES (Kurogane Kenn)] The Desert on the Horizon (BanG Dream!)",
        "(C99) [VOLUTES (Kurogane Kenn)] Futago no Kyuusoku - Le Repos des Jumelles | The Twins' Relaxation (BanG Dream!) [English] [/u/ scanlations]",
        "(C97) [Hatakewotagayasudake (Various)] 3417 Omnibus (BanG Dream!)",
        "(BanG Dreamer's Party! 7th STAGE) [Ishiyakiimo (Various)] Kyou wa Issho ni Netemo Ii? (BanG Dream!)",
    ]
    var text = []
    const max = DoujinshiSayoHinaList.length;
    const randomInt = Math.floor(Math.random() * (max  -1));
    //text.join(DoujinshiSayoHinaList[randomInt])
    text.push(DoujinshiSayoHinaList[randomInt])
    //console.log(DoujinshiSayoHinaList[randomInt])
    return text
}

export { router as searchCardRouter }