// @ts-nocheck
import * as koishi_1 from "koishi";
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";

export async function commandEventVoice(config, session, text = '', mainServer) {
    const list = await (0, getReplyFromBackend_1.getTypedReplyFromBackend)(`${config.backendUrl}/searchEventVoice`, {
        mainServer,
        text: text ?? '',
    });
    await sendEventVoices(session, list);
}

async function sendEventVoices(session, list) {
    if (!Array.isArray(list) || list.length === 0) {
        await session.send('该活动没有可播放的奖励语音');
        return;
    }
    for (const message of list) {
        if (typeof message === 'string') {
            if (message) await session.send(message);
            continue;
        }
        const audio = message?.type === 'audio' ? message.data : message;
        const mime = message?.type === 'audio' && message.mime ? message.mime : 'audio/mpeg';
        if (!audio) continue;
        // 每条短语音单独作为语音消息发送，不走文件。
        await session.send(koishi_1.h.audio(audio, mime));
    }
}
