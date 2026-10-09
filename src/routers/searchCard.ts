import express from 'express';
import { body, validationResult } from 'express-validator';
import { drawCardDetail } from '@/view/cardDetail';
import { drawCardList } from '@/view/cardList';
import { isInteger, listToBase64 } from '@/routers/utils';
import { isServer, isServerList } from '@/types/Server';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { getServerByServerId, Server } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { piscina } from '@/WorkerPool';
import mainAPI from '@/types/_Main';
import { getCurrentEvent } from '@/types/Event';
import { getEventGachaAndCardList } from '@/view/eventDetail';
import { globalDefaultServer, serverNameFullList } from '@/config';

const router = express.Router();

router.post(
    '/',
    [
        body('displayedServerList').custom(isServerList),
        body('mainServer').optional().custom(isServer),
        body('text').optional().isString(),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('useEasyBG').isBoolean(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        var { displayedServerList, mainServer, text, fuzzySearchResult, useEasyBG, compress } = req.body;
        var after_training = true
        const inputText = text ?? '';
        if (inputText.includes('花前')) {
            after_training = false
            
            text = inputText.replace('花前','')
        }
        text = text?.trim();
        // 检查 text 和 fuzzySearchResult 是否同时存在
        if (text && fuzzySearchResult) {
            return res.status(500).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
        }

        try {
            const result = await commandCard(displayedServerList, text || fuzzySearchResult || '', useEasyBG, compress, after_training, mainServer);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandCard(displayedServerList: Server[], input: string | FuzzySearchResult | undefined, useEasyBG: boolean, compress?: boolean,after_training:boolean = true, mainServer?: Server) {

    if (input == null || (typeof input === 'string' && input.trim() === '')) {
        return await commandCurrentEventCards(displayedServerList, useEasyBG, compress, mainServer, after_training);
    }
    
    let fuzzySearchResult: FuzzySearchResult
    // 根据 input 的类型执行不同的逻辑
    if (typeof input === 'string') {
        if (isInteger(input)) {
            var inputId = parseInt(input)
            //if (inputId == 947) return getDoujinshiSayoHina()
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

    var result =  await drawCardList(fuzzySearchResult, displayedServerList,useEasyBG, compress,after_training)
    if (result!=null){
        return result
    }
    return (await piscina.drawList.run({
            matches: fuzzySearchResult,
            displayedServerList,
            useEasyBG,
            compress,
            after_training,
            mainAPI:null
        },{name:'drawCardList'})).map(toBuffer)
}

export async function commandCurrentEventCards(displayedServerList: Server[], useEasyBG: boolean, compress?: boolean, mainServer?: Server, after_training: boolean = true): Promise<Array<Buffer | string>> {
    const server = mainServer ?? displayedServerList[0] ?? globalDefaultServer[0];
    const event = getCurrentEvent(server);
    if (!event) {
        return [`错误: ${serverNameFullList[server]}没有已开始的活动`];
    }
    await event.initFull();
    const { gachaCardList } = await getEventGachaAndCardList(event, server);
    const cardIds = [...new Set([...gachaCardList.map(card => card.cardId), ...(event.rewardCards ?? [])])];
    if (cardIds.length === 0) {
        return [`${serverNameFullList[server]}当前活动没有卡池卡牌或奖励卡牌`];
    }

    const servers = [...new Set([server, ...displayedServerList])];
    // 精确匹配活动卡牌，沿用单结果详情、多结果列表的输出方式。
    return await commandCard(servers, { cardId: cardIds, _all: [] }, useEasyBG, compress, after_training, server);
}



function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x);
    }
    return x; // string 或已是 Buffer
}

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
