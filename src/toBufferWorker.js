const { Canvas, Image, loadImage } = require('skia-canvas');
const { parentPort } = require('worker_threads');

parentPort.on('message', async ({  id,width, height, pixels,format, quality }) => {
    try {
        const canvas = new Canvas(width, height);
        //console.log("new Canvas(width, height)")
        const ctx = canvas.getContext('2d');
        //console.log("canvas.getContext('2d')")
        const imageData = ctx.createImageData(width, height);
        //console.log("ctx.createImageData(width, height)")

        imageData.data.set(pixels);
        //console.log("imageData.data.set(pixels)")
        ctx.putImageData(imageData, 0, 0);
        //console.log("ctx.putImageData(imageData, 0, 0)")
        const buffer = format === 'jpeg' 
            ? await canvas.toBuffer('jpeg', { quality }) 
            : await canvas.toBuffer('png');
        //console.log(buffer)
        parentPort.postMessage({id,buffer}, [buffer.buffer]);

    } catch (e) {
        console.log(e)
        parentPort.postMessage({ error: e.stack || e.message });
    }
});