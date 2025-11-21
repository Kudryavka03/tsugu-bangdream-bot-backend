const { Canvas, Image, loadImage,SkImage  } = require('skia-canvas');
const { parentPort } = require('worker_threads');

parentPort.on('message', async ({ id, width, height, pixels, format, quality }) => {
    try {
        //const canvas = new Canvas(width, height);
        //const ctx = canvas.getContext('2d');
        const img = SkImage.fromBytes(pixels, width, height);
        //SkImage.toBuffer
        //ctx.putImageData(img, 0, 0);

        /*
        // 输出 PNG/JPEG
        const buffer = format === 'jpeg'
            ? await canvas.toBuffer('jpeg', { quality })
            : await canvas.toBuffer('png');
            */
            const buffer = format === 'jpeg'
            ? await img.toBuffer('jpeg', { quality })
            : await img.toBuffer('png');

        parentPort.postMessage({ id, buffer }, [buffer.buffer]);
    } catch (e) {
        parentPort.postMessage({ id, error: e.stack || e.message });
    }
});