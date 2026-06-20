// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandSongChart(config, displayedServerList, songId, difficultyId, mirror = false) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/songChart`, {
        displayedServerList,
        songId,
        compress: config.compress,
        difficultyId,
        mirror
    });
}
