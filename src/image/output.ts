import { Canvas, Image } from 'skia-canvas';
import { CreateBG, CreateBGEazy } from '@/image/BG';
import { assetsRootPath } from '@/config';
import * as path from 'path';
import { loadImageFromPath } from '@/image/utils';
import { Worker } from 'node:worker_threads';

const workerPath = path.resolve(__dirname, "../toBufferWorker.js");
var BGDefaultImage: Image
async function loadImageOnce() {
    BGDefaultImage = await loadImageFromPath(path.join(assetsRootPath, "/BG/live.png"));
}
loadImageOnce()
var worker = new Worker(workerPath); // if debug：new Worker(workerPath,{execArgv: ['--inspect=9235']})
const pending = new Map<number, { resolve: (buf: Buffer) => void, reject: (err: any) => void }>();


      // 接收生成的 Buffer
worker.on('message', (msg:{id:number, buffer: Buffer , error?:string}) => {
    const {id,buffer,error} = msg;
    const p = pending.get(id)
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else if (buffer) p.resolve(Buffer.from(buffer));

});
worker.on('exit', (code, signal) => {
    if (code !== 0) console.error('Worker crashed', code, signal);
    //worker = new Worker(workerPath,{execArgv: ['--inspect=9235']});
});
worker.on('error', (err) => {
    console.error('Worker error:', err);
        //worker.terminate();
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
    
    if (compress != undefined && compress) {
        tempBuffer = await tempcanv.toBuffer('jpeg', { quality: 0.6 })
    }
    else {
        tempBuffer = await tempcanv.toBuffer('png')
    }
    return (tempBuffer)
    

/*
    const ctx = tempcanv.getContext('2d');
    const { width, height } = tempcanv;
    const imageData = ctx.getImageData(0, 0, width, height);

*//*
    //var tempBuffer: Buffer
    if (compress != undefined && compress) {
        //console.log("renderToBufferInWorker start");
        tempBuffer = await renderToBufferInWorker(tempcanv, 'jpeg',  0.6 )
        //console.log("renderToBufferInWorker OK");
    }
    else {
        //console.log("renderToBufferInWorkerPNG start");
        tempBuffer = await renderToBufferInWorker(tempcanv, 'png',  1 )
        //console.log("renderToBufferInWorkerPNG OK");
    }
    //console.log(typeof(tempBuffer))
    return (Buffer.from(tempBuffer))
    */
}

function renderToBufferInWorker(canvas, format: 'png'|'jpeg' = 'png', quality = 0.8) {
    return new Promise<Buffer>((resolve, reject) => {
      
  
      const ctx = canvas.getContext('2d');
      const width = Math.floor(canvas.width);
const height = Math.floor(canvas.height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const id = Math.random();
      pending.set(id, { resolve, reject });
      // 发送像素数据给 Worker
      worker.postMessage({
        id,
        width,
        height,
        pixels: imageData.data,
        format,
        quality
      }, [imageData.data.buffer]);

    });
  }

  // Worker思想就是Post过去然后接收器接收。await就是等待message的
  // 然后现在新开一个Worker给Canvas。由于toBuffer本身是使用skia线程池的，因此理论上可以占满CPU
  // 目的就是不阻塞主线程