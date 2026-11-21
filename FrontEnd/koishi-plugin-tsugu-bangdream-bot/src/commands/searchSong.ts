// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandSong(config, displayedServerList, text = '', mainServer?) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchSong`, {
        displayedServerList,
        mainServer,
        text,
        compress: config.compress
    });
}

export async function commandSongDiff(config, mainServer, text, sourceServer?, destinationServer?) {
    return getReplyFromBackend_1.getReplyFromBackend(`${config.backendUrl}/songDiff`, {
        mainServer,
        text,
        sourceServer,
        destinationServer,
        compress: config.compress,
    });
}
