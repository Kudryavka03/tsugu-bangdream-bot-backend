import { parentPort } from 'node:worker_threads';
import fs from 'fs';

parentPort.on('message', ({ id, action, text }) => {
    try {
      let result;
        //console.log(`${action} ${text}`)
      switch (action) {
        case 'readFile': {
          result = fs.readFileSync(text);
          //console.log("read OK!")
          break;
        }
        case 'stat': {
          result = fs.statSync(text);
          break;
        }
        case 'exist': {
            result = fs.existsSync(text);
            break;
        }
        case 'parseJSON': {
          result = JSON.parse(text);
          break;
        }
        case 'readJson': {
            result = JSON.parse(fs.readFileSync(text,'utf-8'));
            break;
        }
        case 'readJsonText': {
          result = fs.readFileSync(text,'utf-8');
          break;
      }
        case 'readTags': {
            result = (fs.existsSync(text)) ? fs.readFileSync(text, 'utf-8') : undefined;
            break;
        }
        default:
          throw new Error("Unknown action: " + action);
      }
  
      parentPort.postMessage({ id, result });
    } catch (e) {
      parentPort.postMessage({ id, error: e.message });
    }
  });
  