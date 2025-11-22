const { Canvas} = require('skia-canvas');
const { parentPort } = require('worker_threads');

parentPort.on('message', async ({ id, width, height, pixels, format, quality }) => {
    try {
        const canvas = new Canvas(width, height);
        
        const ctx = canvas.getContext('2d');

        // 通过 raw buffer 创建 ImageData
        const imageData = ctx.createImageData(width, height);

        // 注意：skia-canvas 的 raw buffer 是 premultiplied alpha
        // 直接 set 会显示正确
        imageData.data.set(pixels);
        ctx.putImageData(imageData, 0, 0);

        // 输出 PNG/JPEG
        const buffer = format === 'jpeg'
            ? await canvas.toBuffer('jpeg', { quality })
            : await canvas.toBuffer('png');

        parentPort.postMessage({ id, buffer }, [buffer.buffer]);
    } catch (e) {
        parentPort.postMessage({ id, error: e.stack || e.message });
    }
});
