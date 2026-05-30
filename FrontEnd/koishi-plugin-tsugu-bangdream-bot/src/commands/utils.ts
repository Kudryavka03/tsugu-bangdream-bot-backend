// @ts-nocheck
export function generateVerifyCode() {
    let verifyCode;
    do {
        verifyCode = Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000;
    } while (verifyCode.toString().includes('64') || verifyCode.toString().includes('89'));
    return verifyCode;
}
export function isInteger(char) {
    const regex = /^-?[1-9]\d*$/;
    return regex.test(char);
}
