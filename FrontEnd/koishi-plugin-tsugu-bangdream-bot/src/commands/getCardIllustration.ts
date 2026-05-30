// @ts-nocheck
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
export async function commandGetCardIllustration(config, cardId) {
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/getCardIllustration`, {
        cardId
    });
}
