import { Canvas, Image } from 'skia-canvas'
import { drawText, releaseCanvas } from '@/image/text'
import { assetsRootPath } from '@/config'
import * as path from 'path'
import { loadImageFromPath } from '@/image/utils';
import { registerLogicalHeight } from '@/image/surfaceShadow';


const TITLE_LOGICAL_HEIGHT = 110
let titleImagePromise: Promise<Image> | undefined

function getTitleImage(): Promise<Image> {
    if (!titleImagePromise) {
        titleImagePromise = loadImageFromPath(path.join(assetsRootPath, '/title.png'))
            .catch((error) => {
                titleImagePromise = undefined
                throw error
            })
    }
    return titleImagePromise
}

export async function drawTitle(title1: string, title2: string): Promise<Canvas> {
    const titleImage = await getTitleImage()
    const canvas = new Canvas(titleImage.width, titleImage.height)
    const ctx = canvas.getContext("2d")
    ctx.drawImage(titleImage, 0, 0)
    var text1 = await drawText({ text: title1, maxWidth: 900, lineHeight: 50, textSize: 30, color: '#ffffff', font: 'old' })
    var text2 = await drawText({ text: title2, maxWidth: 900, lineHeight: 68, textSize: 40, color: '#5b5b5b', font: 'old' })
    ctx.drawImage(text1, 74, 0)

    ctx.drawImage(text2, 74, 42)

    // title.png contains the exact alpha-matched shadow. Its extra pixels are
    // allowed to overlap the existing 30px inter-component gap, while layout
    // continues to advance by the original 110px.
    return registerLogicalHeight(canvas, TITLE_LOGICAL_HEIGHT)
}
