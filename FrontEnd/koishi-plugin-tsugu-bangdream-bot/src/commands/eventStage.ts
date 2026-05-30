// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandEventStage(config, mainServer, eventId, index, date, meta = false) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/eventStage`, {
        mainServer,
        compress: config.compress,
        meta,
        eventId,
        index,
		date: date?.getTime()
    });
}
