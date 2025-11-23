import { Canvas, Image } from 'skia-canvas';
import { CreateBG, CreateBGEazy } from '@/image/BG';
import { assetsRootPath } from '@/config';
import * as path from 'path';
import { loadImageFromPath } from '@/image/utils';
import Piscina from 'piscina';
const workerPath = path.resolve(__dirname, "../toBufferWorker.js");
var BGDefaultImage: Image
var useGpu = false  // 控制是否使用GPU
async function loadImageOnce() {
    BGDefaultImage = await loadImageFromPath(path.join(assetsRootPath, "/BG/live.png"));
}
loadImageOnce()
//var worker = new Worker(workerPath); // if debug：new Worker(workerPath,{execArgv: ['--inspect=9235']})
const pool = new Piscina({
    filename: workerPath,
    execArgv:[],
    
    maxThreads: 4  // 可自行调整
});


interface outputFinalOptions {
    startWithSpace?: boolean;
    imageList: Array<Image | Canvas>;
    useEasyBG?: boolean;
    text?: string;
    BGimage?: Image | Canvas;
    compress?: boolean;
}

//将图片列表从上到下叠在一起输出为一张图片
export var outputFinalCanv = async function ({ imageList,
    startWithSpace = true,
    useEasyBG = true,
    text = 'BanG Dream!',
    BGimage = BGDefaultImage
}: outputFinalOptions
): Promise<Canvas> {
    //console.log(imageList)
    let allH = 30
    if (startWithSpace) {
        allH += 50
    }
    var maxW = 0
    for (var i = 0; i < imageList.length; i++) {
        allH = allH + imageList[i].height
        allH += 30
        if (imageList[i].width > maxW) {
            maxW = imageList[i].width
        }
    }
    var tempcanv = new Canvas(maxW, allH)
    tempcanv.gpu = useGpu
    
    var ctx = tempcanv.getContext("2d")

    if (useEasyBG) {
        ctx.drawImage(await CreateBGEazy({
            width: maxW,
            height: allH
        }), 0, 0)
    }
    else {
        ctx.drawImage(await CreateBG({
            text,
            image: BGimage,
            width: maxW,
            height: allH
        }), 0, 0)
    }


    let allH2 = 0
    if (startWithSpace) {
        allH2 += 50
    }
    for (var i = 0; i < imageList.length; i++) {
        ctx.drawImage(imageList[i], 0, allH2)
        allH2 = allH2 + imageList[i].height
        allH2 += 30
    }

    return (tempcanv)
}



//输出为二进制流
export var outputFinalBuffer = async function ({
    startWithSpace = true,
    imageList,
    useEasyBG = true,
    text,
    BGimage,
    compress = true,
}: outputFinalOptions): Promise<Buffer> {
    var tempcanv = await outputFinalCanv({
        startWithSpace,
        imageList,
        useEasyBG,
        text,
        BGimage,
    })
    var tempBuffer: Buffer
/*
    const { width, height } = tempcanv;
    const timestamp01 = Date.now();
    //const imageData = ctx.getImageData(0, 0, width, height);
    const raw = await tempcanv.raw;  // raw = Uint8ClampedArray
    //const buffer = raw.buffer;       // 可转移
    const timestamp02 = Date.now();
    console.log('canvas.raw总用时：'+(timestamp02 - timestamp01))
    // 直接把 ArrayBuffer 传给 Piscina 的任务
    var buf = await pool.run(
        {
            width,
            height,
            pixels: raw,
            format:'jpeg',
            
        },
        { transferList: [raw.buffer] }
    );
    const timestamp03 = Date.now();
    console.log('总用时：'+(timestamp03 - timestamp01) + '  worker用时：' +(timestamp03 - timestamp02) )
    return Buffer.from(buf);
*/
/*
    const timestamp = Date.now();
    const buf = await sendCanvas(tempcanv)
    const timestamp2 = Date.now();
    console.log('总用时：'+(timestamp2 - timestamp))
    console.log(buf)
    return Buffer.from(buf); // PNG/JPEG Buffer
    */
    


    //console.log("绘图开始")
    //tempcanv.raw
    if (compress != undefined && compress) {
       // const timestamp = Date.now();
        //tempBuffer = await tempcanv.toBuffer('raw' )
        //tempBuffer = await tempcanv.raw
        tempBuffer = await tempcanv.toBuffer('jpeg', { quality: 0.6 })
        //const timestamp2 = Date.now();
        //tempBuffer = await tempcanv.toBuffer('jpeg', { quality: 0.6 })
        //const timestamp3 = Date.now();
        //console.log(timestamp2 - timestamp)
        //console.log(timestamp3 - timestamp2)
    }
    else {
        tempBuffer = await tempcanv.toBuffer('png')
    }
    return (tempBuffer)
    
    
}


  // Worker思想就是Post过去然后接收器接收。await就是等待message的
  // 然后现在新开一个Worker给Canvas。由于toBuffer本身是使用skia线程池的，因此理论上可以占满CPU
  // 目的就是不阻塞主线程