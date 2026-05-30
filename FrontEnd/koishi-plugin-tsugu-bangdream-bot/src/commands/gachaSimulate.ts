// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandGachaSimulate(config, mainServer, times = 10, gachaId) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/gachaSimulate`, {
        mainServer,
        times,
        compress: config.compress,
        gachaId
    });
}
