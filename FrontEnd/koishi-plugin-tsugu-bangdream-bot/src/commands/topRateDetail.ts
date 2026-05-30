// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandTopRateDetail(config, count, playerId, tier, mainServer, mode = 0, cgEventId = 0) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/topRateDetail`, {
        mainServer,
        count,
        playerId,
        tier,
        compress: config.compress,
        mode: mode,
        eventId: cgEventId
    });
}
