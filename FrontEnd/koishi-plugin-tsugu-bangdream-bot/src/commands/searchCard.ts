// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandCard(config, displayedServerList, text = '', mainServer?) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchCard`, {
        displayedServerList,
        mainServer,
        text,
        useEasyBG: config.useEasyBG,
        compress: config.compress
    });
}
