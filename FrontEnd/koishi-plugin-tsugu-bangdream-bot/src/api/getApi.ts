// @ts-nocheck
import axios from "axios";
export async function callAPIAndCacheResponse(url, cacheTime = 0) {
    const response = await axios.get(url);
    return response.data;
}
