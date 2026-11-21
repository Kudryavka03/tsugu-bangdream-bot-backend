import { Canvas } from 'skia-canvas';
import { drawDatablock } from '@/components/dataBlock';
import { drawDifficulity } from '@/components/list/difficulty';
import { drawTitle } from '@/components/title';
import { serverNameFullList } from '@/config';
import { outputFinalBuffer } from '@/image/output';
import { setFontStyle, wrapText } from '@/image/text';
import { drawGuideSingleLineText, GUIDE_THEME } from '@/image/theme';
import { getServerByPriority, Server } from '@/types/Server';
import { difficultyNameList, Song } from '@/types/Song';
import mainAPI from '@/types/_Main';

const rowWidth = 800;
const rowHeight = 82;
const rowGap = 10;
const headerHeight = 54;
const rowsPerPage = 18;
const textX = 76;
const difficultyX = 476;
const difficultyWidth = 62;
const textWidth = difficultyX - textX - 16;
const rowStyles = {
    '+': { color: '#216447', background: '#edf7f0', accent: '#daeee2' },
    '-': { color: '#913d4c', background: '#fcf0f2', accent: '#f3dae0' },
};

function getBandName(song: Song, server: Server): string {
    const bandNames = mainAPI['singer']?.[song.bandId]?.bandName ?? mainAPI['bands']?.[song.bandId]?.bandName;
    const localized = bandNames && getServerByPriority(bandNames, [server]);
    return bandNames?.[localized] || '未知乐队';
}

export async function drawSongDiff(
    source: Server,
    destination: Server,
    sourceOnly: Song[],
    destinationOnly: Song[],
    compress: boolean,
    scope: string,
): Promise<Buffer[]> {
    const rows = [
        ...sourceOnly.map(song => ({ song, server: source, sign: '-' as const })),
        ...destinationOnly.map(song => ({ song, server: destination, sign: '+' as const })),
    ];
    const result: Buffer[] = [];
    const pageCount = Math.ceil(rows.length / rowsPerPage);
    const sourceName = serverNameFullList[source];
    const destinationName = serverNameFullList[destination];
    const title = await drawTitle(`${sourceName} → ${destinationName}`, `歌曲差异 · ${scope}`);

    for (let start = 0; start < rows.length; start += rowsPerPage) {
        const page = rows.slice(start, start + rowsPerPage);
        const table = new Canvas(rowWidth, headerHeight + page.length * (rowHeight + rowGap) - rowGap);
        const ctx = table.getContext('2d');
        ctx.textBaseline = 'middle';
        ctx.fillStyle = GUIDE_THEME.muted;
        setFontStyle(ctx, 17, 'old');
        ctx.fillText('歌曲 / 乐队', textX, 25);
        ctx.textAlign = 'center';
        ctx.fillText('难度 / 物量', difficultyX + difficultyNameList.length * difficultyWidth / 2, 11);
        setFontStyle(ctx, 14, 'old');
        for (const [difficulty, label] of difficultyNameList.entries()) {
            ctx.fillText(label.toUpperCase(), difficultyX + (difficulty + 0.5) * difficultyWidth, 36);
        }

        for (const [index, { song, server, sign }] of page.entries()) {
            const y = headerHeight + index * (rowHeight + rowGap);
            const style = rowStyles[sign];
            ctx.fillStyle = style.background;
            ctx.beginPath();
            ctx.roundRect(0, y, rowWidth, rowHeight, 22);
            ctx.fill();

            ctx.fillStyle = style.accent;
            ctx.beginPath();
            ctx.roundRect(18, y + 12, 36, 36, 18);
            ctx.fill();
            ctx.fillStyle = style.color;
            ctx.textAlign = 'center';
            setFontStyle(ctx, 27, 'old');
            ctx.fillText(sign === '-' ? '−' : sign, 36, y + 30);
            setFontStyle(ctx, 15, 'old');
            ctx.fillText(`#${song.songId}`, 36, y + 61);

            ctx.textAlign = 'left';
            ctx.fillStyle = GUIDE_THEME.text;
            const songTitle = song.musicTitle?.[server] ?? song.musicTitle?.find(Boolean) ?? '未知歌曲';
            const { wrappedText: titleLines } = wrapText({ text: songTitle, textSize: 24, maxWidth: textWidth });
            setFontStyle(ctx, 24, 'old');
            if (titleLines.length > 1) {
                drawGuideSingleLineText(ctx, titleLines[0], textX, y + 19, textWidth);
                const secondLine = titleLines[1].trimStart() + (titleLines.length > 2 ? '…' : '');
                drawGuideSingleLineText(ctx, secondLine, textX, y + 43, textWidth);
            } else {
                drawGuideSingleLineText(ctx, songTitle, textX, y + 28, textWidth);
            }
            ctx.fillStyle = GUIDE_THEME.muted;
            setFontStyle(ctx, 19, 'old');
            const bandY = titleLines.length > 1 ? y + 66 : y + 58;
            drawGuideSingleLineText(ctx, getBandName(song, server), textX, bandY, textWidth);

            ctx.textAlign = 'center';
            setFontStyle(ctx, 17, 'old');
            for (const id of difficultyNameList.keys()) {
                const difficulty = song.difficulty?.[id];
                if (!difficulty) continue;
                const x = difficultyX + (id + 0.5) * difficultyWidth;
                const badge = await drawDifficulity(id, difficulty.playLevel, 32);
                ctx.drawImage(badge, x - badge.width / 2, y + 12);
                const notes = song.notes?.[id] ?? difficulty.notesQuantity;
                ctx.fillText(notes?.toString() ?? '—', x, y + 60);
            }
        }
        const pageLabel = pageCount > 1 ? ` · ${start / rowsPerPage + 1}/${pageCount}` : '';
        const section = await drawDatablock({
            list: [table],
            topLeftText: `+ ${destinationName}独有 ${destinationOnly.length} 首    - ${sourceName}独有 ${sourceOnly.length} 首${pageLabel}`,
        });
        result.push(await outputFinalBuffer({ imageList: [title, section], compress }));
    }
    return result;
}
