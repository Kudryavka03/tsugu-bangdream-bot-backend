// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandSongMeta(config, displayedServerList, mainServer, searchCondition) {
       return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/songMeta`, {
            displayedServerList,
            mainServer,
            compress: config.compress,
            searchCondition: searchCondition
        });
}
