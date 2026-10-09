import { Canvas, Image } from 'skia-canvas';
import { BackgroundStyle, DEFAULT_BACKGROUND_STYLE, getBackgroundColor, CreateBG, CreateBGEazy, CreateBGPure } from '@/image/BG';
import { logger } from '@/logger';
import { drawDecoratedImage, getLogicalHeight } from '@/image/surfaceShadow';
var useGpu = false  // 控制是否使用GPU
interface outputFinalOptions {
    startWithSpace?: boolean;
    imageList: Array<Image | Canvas>;
    useEasyBG?: boolean;
    text?: string;
    BGimage?: Image | Canvas;
    compress?: boolean;
    usePureBG?: boolean;
    useNoneBG?: boolean;
    backgroundStyle?: BackgroundStyle;
}

//将图片列表从上到下叠在一起输出为一张图片
export var outputFinalCanv = async function ({ imageList,
    startWithSpace = true,
    useEasyBG = true,
    text = 'BanG Dream!',
    BGimage,
    usePureBG = false,
    useNoneBG=false,
    backgroundStyle = DEFAULT_BACKGROUND_STYLE,
}: outputFinalOptions
): Promise<Canvas> {
    //console.log(imageList)
    const componentGap = 34
    let allH = 30
    if (startWithSpace) {
        allH += 50
    }
    var maxW = 0
    for (var i = 0; i < imageList.length; i++) {
        allH = allH + getLogicalHeight(imageList[i])
        allH += componentGap
        if (imageList[i].width > maxW) {
            maxW = imageList[i].width
        }
    }
    var tempcanv = new Canvas(maxW, allH)
    tempcanv.gpu = useGpu
    
    var ctx = tempcanv.getContext("2d")
    ctx.imageSmoothingEnabled = false
    const bgColor = getBackgroundColor(backgroundStyle)
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, maxW, allH);
    var size = maxW*allH
    // Size-based fallbacks may simplify the default background, but explicit
    // plain or event-artwork choices must not be overwritten.
    if (!useNoneBG && useEasyBG && !usePureBG) {
        if (size >= 6150000) usePureBG = true
        if (size >= 78000000) useNoneBG = true
    }
    if (useNoneBG){

    }
    else if (usePureBG){
        await CreateBGPure({
            width: maxW,
            height: allH,
            canvas: tempcanv,
            backgroundStyle,
        })
    }
    else if (useEasyBG) {
        await CreateBGEazy({
            width: maxW,
            height: allH,
            canv: tempcanv,
            backgroundStyle,
        })
            
    }
    else  {
        ctx.drawImage(await CreateBG({
            text,
            image: BGimage,
            width: maxW,
            height: allH,
            backgroundStyle,
        }), 0, 0)
    }


    let allH2 = 0
    if (startWithSpace) {
        allH2 += 50
    }
    for (var i = 0; i < imageList.length; i++) {
        drawDecoratedImage(ctx, imageList[i], 0, allH2)
        allH2 = allH2 + getLogicalHeight(imageList[i])
        allH2 += componentGap
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
    usePureBG = false,
    useNoneBG = false,
    backgroundStyle = DEFAULT_BACKGROUND_STYLE,
}: outputFinalOptions): Promise<Buffer> {
    var tempcanv = await outputFinalCanv({
        startWithSpace,
        imageList,
        useNoneBG,
        usePureBG,
        useEasyBG,
        text,
        BGimage,
        backgroundStyle,
    })
    var tempBuffer: Buffer
    if (compress != undefined && compress) {
        var size = (tempcanv.height * tempcanv.width)
        var qualityValue = 0.6
        //console.log(size)
        if (size >=5000000) qualityValue = 0.55
        if (size >=70000000) qualityValue = 0.5
        logger('adjustImageOutputQuality',`Image Size:${size} Final output quality:${qualityValue}`)
        tempBuffer = await tempcanv.toBuffer('jpeg', { quality:qualityValue,downsample:true })
    }
    else {
        tempBuffer = await tempcanv.toBuffer('png')
    }
    return (tempBuffer)
    
    
}
