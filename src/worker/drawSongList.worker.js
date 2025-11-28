require('ts-node/register');
require('tsconfig-paths/register');

const { drawSongList,initForWorker } = require('@/view/songList');


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