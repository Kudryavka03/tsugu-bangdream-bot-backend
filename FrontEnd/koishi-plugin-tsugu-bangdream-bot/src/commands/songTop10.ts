import { Server } from "../types/Server";
import { getReplyFromBackend } from "../api/getReplyFromBackend";
import { Config } from '../config';

export async function commandSongTop10(config: Config, mainServer: Server, eventId?: number, songId?: number): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/songTop10`, {
        mainServer,
        eventId,
        songId,
        compress: config.compress,
    });
}
