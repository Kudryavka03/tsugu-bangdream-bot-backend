// jsonWorker.js
const { parentPort } = require('worker_threads');

if (parentPort) {
  parentPort.on('message', (jsonStr) => {
    try {
      const result = JSON.parse(jsonStr);
      parentPort.postMessage(result);
    } catch (err) {
      parentPort.postMessage({ __error: err.message });
    }
  });
}
