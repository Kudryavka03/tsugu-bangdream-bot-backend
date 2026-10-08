import { Canvas, Image } from 'skia-canvas';
import { setFontStyle } from '@/image/text';
import { assetsRootPath } from '@/config';
import * as path from 'path';
import { loadImageFromPath } from '@/image/utils';
import { registerLogicalHeight } from '@/image/surfaceShadow';
import { drawGuideSingleLineText } from '@/image/theme';

const TITLE_LOGICAL_HEIGHT = 110;
let titleImagePromise: Promise<Image> | undefined;
function getTitleImage(): Promise<Image> {
    if (!titleImagePromise) {
        titleImagePromise = loadImageFromPath(path.join(assetsRootPath, 'title.png'))
            .catch(error => { titleImagePromise = undefined; throw error; });
    }
    return titleImagePromise;
}

/** Restore the original pink tab / white pill title and its embedded shadow. */
export async function drawTitle(title1: string, title2: string): Promise<Canvas> {
    const image = await getTitleImage();
    const canvas = new Canvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    ctx.textBaseline = 'middle';
    setFontStyle(ctx, 30, 'old');
    ctx.fillStyle = '#ffffff';
    drawGuideSingleLineText(ctx, title1, 74, 25, image.width - 148);
    setFontStyle(ctx, 40, 'old');
    ctx.fillStyle = '#5b5b5b';
    drawGuideSingleLineText(ctx, title2, 74, 78, image.width - 100);
    return registerLogicalHeight(canvas, TITLE_LOGICAL_HEIGHT);
}
