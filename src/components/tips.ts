import { Canvas, Image } from 'skia-canvas'
import { drawText, releaseCanvas } from "@/image/text"
import { resizeImage } from "@/components/utils"
import { GUIDE_THEME } from '@/image/theme'

interface drawTipsConfig {
    text: string,
    image?: Image,
    maxWidth?: number,
}

export async function drawTips({
    text,
    image,
    maxWidth = 900,
}: drawTipsConfig): Promise<Canvas> {//下方指令提示
    let textMaxWidth = maxWidth
    if (image) {
        textMaxWidth -= 250
    }
    //文字
    const textImage = await drawText({
        text,
        maxWidth: textMaxWidth,
        textSize: 30,
        color: GUIDE_THEME.muted,
    })
    let height = textImage.height
    //图片
    let imageCanvas: Canvas
    if (image) {
        imageCanvas = resizeImage({
            image,
            widthMax: 250
        })
        height = Math.max(textImage.height, imageCanvas.height)
    }
    const canvas = new Canvas(maxWidth + 100, height + 20)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = GUIDE_THEME.divider
    ctx.fillRect(50, 0, maxWidth, 2)
    ctx.fillStyle = GUIDE_THEME.primary
    ctx.fillRect(50, 0, Math.min(86, maxWidth), 3)
    ctx.drawImage(textImage, 50, 20)

    if (image) {
        ctx.drawImage(imageCanvas, maxWidth - 200, 20)
    }
    return canvas
}
