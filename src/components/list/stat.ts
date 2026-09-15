import { Canvas, Image } from 'skia-canvas';
import { drawText, releaseCanvas } from "@/image/text";
import { drawList } from "@/components/list";
import { resizeImage, stackImage } from '@/components/utils'
import { drawRoundedRect, drawRoundedRectWithText } from "@/image/drawRect";
import { Card, Stat, limitBreakRankStat } from "@/types/Card";
import { eachCardStat } from '@/types/Player';
import { Character } from '@/types/Character';

export const statConfig = {
    performance: { color: '#f76da1', name: '演出' },
    technique: { color: '#4fb9eb', name: '技巧' },
    visual: { color: '#fbc74f', name: '形象' },
}

export async function drawCardStatInList(card: Card) {
    const stat = await card.calcStat()
    const limitBreakstat = limitBreakRankStat(card.rarity)
    const limitBreakstatTotal = limitBreakstat.performance + limitBreakstat.technique + limitBreakstat.visual
    const statTotal = stat.performance + stat.technique + stat.visual
    const statImage = await drawCardStatDivided(stat, statTotal, limitBreakstat)
    const list = []
    list.push(await drawList({
        key: '综合力', content: [`综合力: ${statTotal} + (${limitBreakstatTotal * 4})`]
    }))
    list.push(new Canvas(1, 5))
    list.push(statImage)
    return stackImage(list)
}

export async function drawStatInList(stat: Stat) {
    const statTotal = Math.floor(stat.performance + stat.technique + stat.visual);
    const statImage = await drawCardStatDivided(stat, statTotal);
    const list = [];
    list.push(await drawList({
        key: '综合力', content: [`综合力: ${statTotal}`]
    }))
    list.push(new Canvas(1, 5));
    list.push(statImage);
    return stackImage(list);
}

async function drawCardStatDivided(stat: Stat, statTotal: number, limitBreakstat?: Stat): Promise<Canvas> {
    const widthMax = 800

    async function drawStatLine(key: string, value: number, total: number): Promise<Canvas> {
        const canvas = new Canvas(800, 70);
        const ctx = canvas.getContext('2d');
        let text = `${statConfig[key].name}: ${Math.floor(value)}`;
        if (limitBreakstat) {
            text += ` + (${limitBreakstat[key] * 4})`
        }
        const textImage = await drawText({
            text,
            maxWidth: widthMax,
            textSize: 30,
            lineHeight: 30
        })
        var roundedRect = drawRoundedRect({
            width: widthMax * value / total * 2,
            height: 30,
            radius: 15,
            color: statConfig[key].color,
            strokeWidth: 0
        })
        ctx.drawImage(textImage, 20, 0)

        ctx.drawImage(roundedRect, 20, 35)
        return canvas
    }
    const list = []
    for (const key in stat) {
        if (Object.prototype.hasOwnProperty.call(stat, key)) {
            const element = stat[key];
            list.push(await drawStatLine(key, element, statTotal))
        }
    }
    return stackImage(list)
}
function formatStatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`
}

async function drawEachStatChip(key: string, value: number, width: number, height: number): Promise<Canvas> {
    const bg = drawRoundedRect({
        width,
        height,
        radius: height / 2,
        color: statConfig[key].color,
        opacity: 0.96,
        strokeWidth: 0,
    })
    const text = drawText({
        text: `${statConfig[key].name}: ${formatStatPercent(value)}`,
        textSize: 16,
        maxWidth: width - 12,
        lineHeight: 16,
        color: '#ffffff',
        forceSingleLine: true,
    })
    const canvas = new Canvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bg, 0, 0)
    ctx.drawImage(text, (width - text.width) / 2, (height - text.height) / 2 + 1)
    return canvas
}

export async function drawEachCardStatFrames(ecs: eachCardStat[]): Promise<Canvas> {
    if (ecs.length === 0) {
        return new Canvas(760, 1)
    }
    const list: Array<Canvas> = []
    for (const item of ecs) {
        list.push(await drawEachCardStatDetail(item))
    }
    return stackImage(list)
}

export async function drawCharacterBonusList(ecs: eachCardStat[], key: string = '角色加成'): Promise<Canvas> {
    const data = await drawEachCardStatFrames(ecs)
    const keyImage = drawRoundedRectWithText({
        text: key,
        textSize: 30,
        color: '#5b5b5b',
        textColor: '#ffffff'
    })
    const canvas = new Canvas(800, keyImage.height + 10 + data.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(keyImage, 0, 0)
    ctx.drawImage(data, 20, keyImage.height + 10)
    return canvas
}

export async function drawEachCardStatDetail(ecs: eachCardStat): Promise<Canvas> {
    const widthMax = 760
    const leftWidth = 60
    const iconPadding = 4
    const panelWidth = widthMax - leftWidth - 10
    const height = 110
    const canvas = new Canvas(widthMax, height)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#00000000'
    ctx.fillRect(0, 0, widthMax, height)

    const tempCharacter = new Character(ecs.characterId)
    if (tempCharacter.isExist) {
        const icon = await tempCharacter.getIcon()
        const iconCanvas = resizeImage({ image: icon, heightMax: 56 })
        ctx.drawImage(iconCanvas, iconPadding + (leftWidth - iconCanvas.width) / 2, (height - iconCanvas.height) / 2)
    }

    const drawSection = async (title: string, stat: Stat, y: number) => {
        const sectionWidth = panelWidth
        const sectionHeight = 42
        const section = new Canvas(sectionWidth, sectionHeight)
        const sectionCtx = section.getContext('2d')
        sectionCtx.fillStyle = '#00000000'
        sectionCtx.fillRect(0, 0, sectionWidth, sectionHeight)

        const titleCanvas = drawText({
            text: title,
            textSize: 18,
            maxWidth: 120,
            lineHeight: 18,
            color: '#505050',
            forceSingleLine: true,
        })
        sectionCtx.drawImage(titleCanvas, 8, 12)

        const statKeys = Object.keys(statConfig) as Array<keyof typeof statConfig>
        const statGap = 8
        const chipWidth = (sectionWidth - 8 - titleCanvas.width - 12 - statGap * 2) / 3
        let chipX = titleCanvas.width + 20

        for (const key of statKeys) {
            const chip = await drawEachStatChip(key, stat[key], Math.max(90, chipWidth), 24)
            sectionCtx.drawImage(chip, chipX, 9)
            chipX += chipWidth + statGap
        }

        ctx.drawImage(section, leftWidth + 6, y)
    }

    await drawSection('潜能解放加成', ecs.potential, 8)
    await drawSection('角色任务加成', ecs.characterTask, 58)

    return canvas
}