// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandGacha(config, displayedServerList, gachaId) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchGacha`, {
        displayedServerList,
        gachaId,
        useEasyBG: config.useEasyBG,
        compress: config.compress
    });
}
