// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";

export async function commandMonthlyRanking(config, displayedServerList, text) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchMonthlyRanking`, {
        displayedServerList,
        text,
        useEasyBG: config.useEasyBG,
        compress: config.compress
    });
}
