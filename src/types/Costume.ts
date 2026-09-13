import { callAPIAndCacheResponse } from '@/api/getApi';
import { downloadFile, existLocalCache } from '@/api/downloadFile';
import { Bestdoriurl, globalDefaultServer } from '@/config';
import mainAPI from '@/types/_Main';
import { Server, getServerByPriority } from '@/types/Server';
import { Image, loadImage } from 'skia-canvas';
import { stringToNumberArray } from '@/types/utils'
import { assetErrorImageBuffer } from '@/image/utils';

export class Costume {
    costumeId: number;
    isExist: boolean = false;
    characterId: number;
    assetBundleName: string;
    description: Array<string | null>;
    publishedAt: Array<number | null>;
    data: Object;
    cards: Array<number>;
    sdResourceName: string;
    isInitfull: boolean = false;
    sdResourceName2:string
    constructor(costumeId: number,cardId?:number) {
        this.costumeId = costumeId
        const costumeData = mainAPI['costumes'][costumeId.toString()]
        //let sdResourceName2 = ""
        if (cardId) this.sdResourceName2 = mainAPI['cards'][cardId.toString()]["resourceSetName"].replace("res","sd").toString() // 备用sdChara
        console.log(mainAPI['cards'][cardId.toString()]["resourceSetName"])
        if (costumeData == undefined) {
            this.isExist = false;
            return
        }
        this.isExist = true;
        this.characterId = costumeData['characterId'];
        this.assetBundleName = costumeData['assetBundleName'];
        this.description = costumeData['description'];
        this.publishedAt = stringToNumberArray(costumeData['publishedAt']);
    }
    async initFull() {
        if (this.isInitfull) {
            return
        }
        var costumeData = await callAPIAndCacheResponse(`${Bestdoriurl}/api/costumes/${this.costumeId}.json`,3,3,false,0)
        this.data = costumeData
        this.isExist = true;
        this.characterId = costumeData['characterId'];
        this.assetBundleName = costumeData['assetBundleName'];
        this.description = costumeData['description'];
        this.publishedAt = stringToNumberArray(costumeData['publishedAt']);
        this.cards = costumeData['cards'];
        this.sdResourceName = costumeData['sdResourceName'];
        this.isInitfull = true;
    }
    async getSdcharaQuick(flags,displayedServerList: Server[] = globalDefaultServer): Promise<Image> {
        if (!displayedServerList) displayedServerList = globalDefaultServer
        var server = getServerByPriority(this.publishedAt, displayedServerList)
        var url = `${Bestdoriurl}/assets/${Server[server]}/characters/livesd/${flags}_rip/sdchara.png`
        var url2 = `${Bestdoriurl}/assets/${Server[server]}/characters/livesd/${this.sdResourceName2}_rip/sdchara.png`
        var hasCacheName = existLocalCache([url,url2])
        var sdCharaBuffer = null
        if (hasCacheName){
            sdCharaBuffer = await downloadFile(hasCacheName)
        }else{
            try{
                sdCharaBuffer = await downloadFile(url,false)
            }
            catch{
                if (!url2.includes("undefined")){
                    sdCharaBuffer = await downloadFile(url2)
                }else{
                    sdCharaBuffer = assetErrorImageBuffer
                }
            }
        }
        return await loadImage(sdCharaBuffer)
    }
    async getSdchara(flags,displayedServerList: Server[] = globalDefaultServer): Promise<Image> {
        //console.log(flags)
        if (!displayedServerList) displayedServerList = globalDefaultServer
        var server = getServerByPriority(this.publishedAt, displayedServerList)
        var sdCharaBuffer = await downloadFile(`${Bestdoriurl}/assets/${Server[server]}/characters/livesd/${flags}_rip/sdchara.png`)
        return await loadImage(sdCharaBuffer)
    }
}
