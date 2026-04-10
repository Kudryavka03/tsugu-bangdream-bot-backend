import { Canvas, Image } from 'skia-canvas';

export function stackImage(list: Array<Image | Canvas>) {
    var maxW = 0
    var allH = 0
    for (var i = 0; i < list.length; i++) {
        if (list[i].width > maxW) {
            maxW = list[i].width
        }
        allH += list[i].height
    }
    var tempcanv = new Canvas(maxW, allH)
    var ctx = tempcanv.getContext("2d")
    var allH2 = 0
    for (var i = 0; i < list.length; i++) {
        ctx.drawImage(list[i], 0, allH2)
        allH2 = allH2 + list[i].height
    }
    return (tempcanv)
}

export function stackImageHorizontal(list: Array<Image | Canvas>) {
    var maxH = 0
    var allW = 0
    for (var i = 0; i < list.length; i++) {
        if (list[i].height > maxH) {
            maxH = list[i].height
        }
        allW += list[i].width
    }
    var tempcanv = new Canvas(allW, maxH)
    var ctx = tempcanv.getContext("2d")
    var allW2 = 0
    for (var i = 0; i < list.length; i++) {
        ctx.drawImage(list[i], allW2, 0)
        allW2 = allW2 + list[i].width
    }
    return (tempcanv)
}

interface resizeImageOptions {
    image: Image | Canvas,
    heightMax?: number,
    widthMax?: number
}
//输入canvas或Image，高度，宽度，返回等比例缩放到限制高度的canvas
export function resizeImage({
    image,
    heightMax,
    widthMax
}: resizeImageOptions) {
    var height = image.height
    var width = image.width
    if (heightMax != undefined) {
        width = width * heightMax / height
        height = heightMax
    }
    if (widthMax != undefined) {
        height = height * widthMax / width
        width = widthMax
    }
    var canvas = new Canvas(width, height)
    var ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, width, height)
    return canvas
}

// 取得高度，节省空间
export function getOptHeight(n:number,x:number,y:number,line:number,line2:number){
    // n：多少个框
    // x：框长度比例
    // y：框高度比例
    // line：行高度
    // line2：列高度
    let size = 999999999999999
    let x1 = 0
    let y1 = 0
    let maxHeightLimit = 7000
    for(var i = 1;i<7;i++){ // 长度，最高7个长度
        let h = Math.ceil(n/i)  // 当每行有i个的时候，h预计要多少个
        let s = ((h*y + line*h)*(x*i + line2*i))
        if (s <= size){
            size = s
            x1 = i
            y1 = h * y
        }
    }
    // 获取最佳的面积
    if (y1 + x + line  >= 7000) return  7000
    return y1  + x + line
}