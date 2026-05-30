// @ts-nocheck
import axios from "axios";
import * as koishi_1 from "koishi";
export const getDataFromBackendLogger = new koishi_1.Logger('tsugu-getDataFromBackend');
export async function getDataFromBackend(url, data) {
    getDataFromBackendLogger.info(url, data);
    const result = await axios.post(url, data);
    if (result?.data?.status != 'success') {
        return {};
    }
    //console.log(result.data.data)
    return result.data.data;
}
