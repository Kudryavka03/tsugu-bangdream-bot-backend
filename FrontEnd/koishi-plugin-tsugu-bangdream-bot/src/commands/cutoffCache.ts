// @ts-nocheck
import { getReplyFromBackend } from "../api/getReplyFromBackend";

export async function commandAddCutoffCache(config, mainServer, tier, eventId) {
    return await getReplyFromBackend(`${config.backendUrl}/cutoffCache/add`, {
        mainServer,
        tier,
        eventId
    });
}

export async function commandDelCutoffCache(config, cutoffCacheId) {
    return await getReplyFromBackend(`${config.backendUrl}/cutoffCache/del`, {
        id: cutoffCacheId
    });
}

export async function commandCutoffCacheStatus(config) {
    return await getReplyFromBackend(`${config.backendUrl}/cutoffCache/status`, {});
}
