// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandCutoffListOfRecentEvent(config, mainServer, tier, eventId) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/cutoffListOfRecentEvent`, {
        mainServer,
        tier,
        eventId,
        compress: config.compress
    });
}
