export interface EventListBlockSize {
    width: number;
    height: number;
}

export interface EventListColumn {
    /** Inclusive start and exclusive end, preserving the sorted reading order. */
    start: number;
    end: number;
    width: number;
    height: number;
}

export interface EventListPage {
    columns: EventListColumn[];
    width: number;
    height: number;
    area: number;
}

interface EventListLayoutOptions {
    rowGap?: number;
    columnGap?: number;
    minimumColumnWidth?: number;
    maxHeight?: number;
    maxColumns?: number;
    outerWidth?: number;
    outerHeight?: number;
    minimumOutputWidth?: number;
}

/**
 * Pack contiguous activities using their measured dimensions. For each column
 * count, find the smallest possible maximum height, then also consider taller
 * partitions which can save width when a few activities are unusually wide.
 * Dynamic programming minimizes the sum of column widths at each height.
 * Among layouts within 8% of the smallest image area, prefer a squarer image.
 */
export function planEventListLayout(
    blocks: EventListBlockSize[],
    {
        rowGap = 30, columnGap = 30, minimumColumnWidth = 800,
        maxHeight = 7000, maxColumns = 7,
        outerWidth = 200, outerHeight = 324, minimumOutputWidth = 0,
    }: EventListLayoutOptions = {},
): EventListPage[] {
    if (blocks.length === 0) return [];
    const columnLimit = Math.max(1, Math.floor(maxColumns));
    const pages: EventListPage[] = [];
    let pageStart = 0;

    while (pageStart < blocks.length) {
        // A greedy pass finds the largest contiguous page that fits the height
        // and column limits. An oversized activity stays intact on its own page.
        let pageEnd = pageStart;
        for (let column = 0; column < columnLimit && pageEnd < blocks.length; column++) {
            let height = 0;
            const columnStart = pageEnd;
            while (pageEnd < blocks.length) {
                const nextHeight = height + (pageEnd > columnStart ? rowGap : 0) + blocks[pageEnd].height;
                if (nextHeight > maxHeight && pageEnd > columnStart) break;
                if (blocks[pageEnd].height > maxHeight && pageEnd > pageStart) break;
                height = nextHeight;
                pageEnd++;
                if (height > maxHeight) break;
            }
            if (blocks[pageStart].height > maxHeight || pageEnd === columnStart) break;
        }

        const pageBlocks = blocks.slice(pageStart, pageEnd);
        const count = pageBlocks.length;
        const prefixHeight = [0];
        for (const block of pageBlocks) prefixHeight.push(prefixHeight[prefixHeight.length - 1] + block.height + rowGap);
        const segmentHeight = (start: number, end: number) => prefixHeight[end] - prefixHeight[start] - rowGap;
        const tallestBlock = Math.max(...pageBlocks.map(block => block.height));
        const heightLimit = Math.max(maxHeight, tallestBlock);
        const candidates: EventListPage[] = [];

        for (let columnCount = 1; columnCount <= Math.min(columnLimit, count); columnCount++) {
            const requiredColumns = (height: number) => {
                let columns = 1, usedHeight = 0;
                for (const block of pageBlocks) {
                    const nextHeight = usedHeight + (usedHeight > 0 ? rowGap : 0) + block.height;
                    if (nextHeight > height) {
                        columns++;
                        usedHeight = block.height;
                    } else usedHeight = nextHeight;
                }
                return columns;
            };
            if (requiredColumns(heightLimit) > columnCount) continue;

            // Heights come from integer Canvas dimensions; binary search finds
            // the exact minimum feasible maximum height for this column count.
            let low = tallestBlock, high = Math.min(heightLimit, segmentHeight(0, count));
            while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (requiredColumns(middle) <= columnCount) high = middle;
                else low = middle + 1;
            }
            const heightCandidates = new Set([low, ...[1.05, 1.1, 1.2, 1.4].map(ratio => Math.min(heightLimit, Math.ceil(low * ratio)))]);
            for (const targetHeight of heightCandidates) {
                const widths = Array.from({ length: columnCount + 1 }, () => new Array<number>(count + 1).fill(Infinity));
                const squares = Array.from({ length: columnCount + 1 }, () => new Array<number>(count + 1).fill(Infinity));
                const cuts = Array.from({ length: columnCount + 1 }, () => new Array<number>(count + 1).fill(-1));
                widths[0][0] = squares[0][0] = 0;
                for (let column = 1; column <= columnCount; column++) {
                    for (let end = column; end <= count; end++) {
                        let width = minimumColumnWidth;
                        for (let start = end - 1; start >= column - 1; start--) {
                            const height = segmentHeight(start, end);
                            if (height > targetHeight) break;
                            width = Math.max(width, pageBlocks[start].width);
                            if (!Number.isFinite(widths[column - 1][start])) continue;
                            const totalWidth = widths[column - 1][start] + width;
                            const squareHeight = squares[column - 1][start] + height * height;
                            if (totalWidth < widths[column][end] || (totalWidth === widths[column][end] && squareHeight < squares[column][end])) {
                                widths[column][end] = totalWidth;
                                squares[column][end] = squareHeight;
                                cuts[column][end] = start;
                            }
                        }
                    }
                }
                if (!Number.isFinite(widths[columnCount][count])) continue;
                const columns: EventListColumn[] = [];
                let end = count;
                for (let column = columnCount; column > 0; column--) {
                    const start = cuts[column][end];
                    columns.unshift({
                        start: pageStart + start, end: pageStart + end,
                        width: Math.max(minimumColumnWidth, ...pageBlocks.slice(start, end).map(block => block.width)),
                        height: segmentHeight(start, end),
                    });
                    end = start;
                }
                const width = columns.reduce((sum, column) => sum + column.width, 0) + columnGap * (columnCount - 1);
                const height = Math.max(...columns.map(column => column.height));
                const area = Math.max(minimumOutputWidth, width + outerWidth) * (height + outerHeight);
                candidates.push({ columns, width, height, area });
            }
        }
        const minimumArea = Math.min(...candidates.map(page => page.area));
        const compactCandidates = candidates.filter(page => page.area <= minimumArea * 1.08);
        const shape = (page: EventListPage) => Math.abs(Math.log(Math.max(minimumOutputWidth, page.width + outerWidth) / (page.height + outerHeight)));
        compactCandidates.sort((a, b) => shape(a) - shape(b) || a.area - b.area);
        pages.push(compactCandidates[0]);
        pageStart = pageEnd;
    }
    return pages;
}
