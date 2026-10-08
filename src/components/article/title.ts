import { Canvas } from 'skia-canvas';
import { drawText, setFontStyle } from '@/image/text';
import { Event } from '@/types/Event';
import { Server } from '@/types/Server';
import { resizeImage } from '@/components/utils';
import { outputFinalCanv } from '@/image/output';
import { GUIDE_THEME, drawGuideStar, guideGradient, drawGuideSingleLineText } from '@/image/theme';

/** Article headings share the guide typography while retaining their 130px slot. */
export async function drawArticleTitle1(text: string, subText?: string, event?: Event, BG: boolean = false): Promise<Canvas> {
    const baseX = event ? 450 : 0;
    const canvas = new Canvas(1000, 130);
    const ctx = canvas.getContext('2d');
    if (event) {
        const logoImage = await event.getEventLogoImage(Server.tw);
        const logoWidth = logoImage.width * Math.min(420 / logoImage.width, 120 / logoImage.height);
        const logoResized = resizeImage({ image: logoImage, widthMax: logoWidth });
        ctx.drawImage(logoResized, 480 - logoResized.width, 0);
    }
    drawGuideStar(ctx, 62 + baseX, 35, 13, GUIDE_THEME.primary, true);
    setFontStyle(ctx, 54, 'FangZhengHeiTi');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = guideGradient(ctx, 86 + baseX, 0, 860 - baseX, 70);
    drawGuideSingleLineText(ctx, text, 86 + baseX, 35, 860 - baseX);
    if (subText) {
        const subtitle = drawText({
            text: subText, maxWidth: 860 - baseX, textSize: 28,
            color: GUIDE_THEME.muted, font: 'FangZhengHeiTi',
        });
        // Keep subtitles inside the fixed-height title slot.
        ctx.save();
        ctx.beginPath();
        ctx.rect(86 + baseX, 77, 860 - baseX, 53);
        ctx.clip();
        ctx.drawImage(subtitle, 86 + baseX, 77);
        ctx.restore();
    }
    if (BG) {
        return outputFinalCanv({
            startWithSpace: true, imageList: [canvas], useEasyBG: false,
            BGimage: event ? await event.getEventBGImage() : undefined, text: '',
        });
    }
    return canvas;
}
