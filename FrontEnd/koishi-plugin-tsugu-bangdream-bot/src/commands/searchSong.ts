// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandSong(config, displayedServerList, text) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchSong`, {
        displayedServerList,
        text,
        compress: config.compress
    });
}
