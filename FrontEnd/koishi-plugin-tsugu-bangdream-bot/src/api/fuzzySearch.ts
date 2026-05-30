// @ts-nocheck
import * as getDataFromBackend_1 from "./getDataFromBackend";
export async function getFuzzySearchResult(config, text) {
    const result = await (0, getDataFromBackend_1.getDataFromBackend)(`${config.backendUrl}/fuzzySearch`, {
        text
    });
    return result;
}
export async function serverNameFuzzySearchResult(config, serverNameText) {
    const result = await getFuzzySearchResult(config, serverNameText);
    if (result && result['server']) {
        return result['server'][0];
    }
    return -1;
}
export async function bandNameFuzzySearchResult(config, serverNameText) {
    const result = await getFuzzySearchResult(config, serverNameText);
    if (result && result['bandId']) {
        return result['bandId'][0];
    }
    return -1;
}
