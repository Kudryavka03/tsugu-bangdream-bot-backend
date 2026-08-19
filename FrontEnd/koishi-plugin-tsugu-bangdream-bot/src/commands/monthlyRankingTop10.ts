import { Server } from "../types/Server";
import { getReplyFromBackend } from "../api/getReplyFromBackend";
import { Config } from '../config';

export async function commandMonthlyRankingTop10(config: Config, mainServer: Server, monthlyRankingId?: number): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/monthlyRankingTop10`, {
        mainServer,
        monthlyRankingId,
        compress: config.compress,
    });
}
