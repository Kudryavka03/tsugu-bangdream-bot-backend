// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandCutoffAll(config, mainServer, eventId) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/cutoffAll`, {
        mainServer,
        eventId,
        compress: config.compress
    });
}
