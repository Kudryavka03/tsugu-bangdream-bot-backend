// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";

export async function commandCutoffSong(config, mainServer, tier, eventId) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/cutoffSong`, {
        mainServer,
        tier,
        eventId,
        compress: config.compress
    });
}
