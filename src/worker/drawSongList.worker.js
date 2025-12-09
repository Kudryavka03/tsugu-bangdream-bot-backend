require('ts-node/register');
require('tsconfig-paths/register');

const { drawSongList,initForWorker } = require('@/view/songList');
const { drawEventList } = require('@/view/eventList');
const { drawCardList } = require('@/view/cardList');
const {drawRandomGacha} = require('@/view/gachaSimulate')
const {setMainAPI} = require('@/types/_Main')


module.exports = async function (task) {
  return await drawSongList(
    task.matches,
    task.displayedServerList,
    task.compress,
    task.mainAPI
  );
};

module.exports.initWorker = async function () {
  await initForWorker();
};

module.exports.drawEventList = async function (task) {
  return await drawEventList(
    task.matches,
    task.displayedServerList,
    task.compress,
    task.mainAPI
  );
};

module.exports.drawCardList = async function (task) {
  return await drawCardList(
    task.matches,
    task.displayedServerList,
    task.useEasyBG,
    task.compress,
    task.after_training,
    task.mainAPI
  );
};
module.exports.drawRandomGacha = async function (task) {
  return await drawRandomGacha(
    task.gacha,
    task.times,
    task.compress,
    task.apiData,
  );
};
module.exports.setMainApiToWorker = async function (task) {
  return await setMainAPI(
    task.data
  );
};
module.exports.warmup  = (t) => { return true; };