// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandSongRandom(config, mainServer, text) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/songRandom`, {
        mainServer,
        text,
        compress: config.compress
    });
}
