// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandCutoffDetail(config, mainServer, tier, eventId,compare) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/cutoffDetail`, {
        mainServer,
        tier,
        eventId,
        compress: config.compress,
        compare: compare
    });
}
