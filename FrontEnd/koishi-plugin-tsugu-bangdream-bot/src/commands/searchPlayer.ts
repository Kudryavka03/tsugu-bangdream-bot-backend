// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandSearchPlayer(config, playerId, mainServer) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchPlayer`, {
        mainServer,
        playerId,
        useEasyBG: config.useEasyBG,
        compress: config.compress,
    });
}
