import { FontLibrary, Image, Canvas, CanvasRenderingContext2D } from 'skia-canvas';
const canvas = new Canvas(1, 1);
var isRegisterFonts = false;
var assetsRootPath = process.env.ASROOT
FontLibrary.use("old", [`${assetsRootPath}/Fonts/old.ttf`])
FontLibrary.use("FangZhengHeiTi", [`${assetsRootPath}/Fonts/FangZhengHeiTi_GBK.ttf`])
const ctx = canvas.getContext('2d');
ctx.textBaseline = 'alphabetic';
export function wrapText({
    text,
    textSize,
    maxWidth,
    lineHeight,
    font = "old",
}) {
    const temp = text.split('\n');
    setFontStyle(ctx, textSize, font);

    for (var i = 0; i < temp.length; i++) {
        let temptext = temp[i]
        let a = 0
        for (var n = 0; n < temptext.length; n++) {
            if (maxWidth > ctx.measureText(temptext.slice(0, temptext.length - n)).width) {
                a = n
                break
            }

        }
        if (a != 0) {
            temp.splice(i + 1, 0, temp[i].slice(temp[i].length - a, temp[i].length))
            temp[i] = temp[i].slice(0, temp[i].length - a)
        }
    }

    for (var i = 0; i < temp.length; i++) {
        if (temp[i] == "") {
            temp.splice(i, 1);
            //去除空值
            i--;
        }
    }
    return {
        numberOfLines: temp.length,
        wrappedText: temp,
    };
}
export var setFontStyle = function (ctx, textSize, font) {//设置字体大小
    ctx.font = textSize + 'px ' + font + ",Microsoft Yahei"
}