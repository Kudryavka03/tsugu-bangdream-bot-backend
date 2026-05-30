// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandCharacter(config, displayedServerList, text) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/searchCharacter`, {
        displayedServerList,
        text,
        compress: config.compress
    });
}
