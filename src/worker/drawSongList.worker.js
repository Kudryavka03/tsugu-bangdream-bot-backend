require('ts-node/register');
require('tsconfig-paths/register');

const { drawSongList,initForWorker } = require('@/view/songList');
const { drawEventList } = require('@/view/eventList');


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