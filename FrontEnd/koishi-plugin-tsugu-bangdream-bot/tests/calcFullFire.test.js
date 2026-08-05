const test = require('node:test')
const assert = require('node:assert/strict')
const {
    calculateFullFireTime,
    commandCalcFullFire,
    parseFullFireInput,
    parseRecoveryTime,
} = require('../lib/commands/calcFullFire')

test('accepts all documented time formats', () => {
    for (const value of ['0130', '01:30', '01：30', '1：30', '1:30', '1分钟30秒']) {
        assert.equal(parseRecoveryTime(value), 90, value)
    }
})

test('defaults to cn and 30 minutes while allowing the server without a time', () => {
    assert.deepEqual(parseFullFireInput('23').value, {
        currentFire: 23,
        remainingSeconds: 1800,
        server: 'cn',
    })
    assert.deepEqual(parseFullFireInput('8 jp').value, {
        currentFire: 8,
        remainingSeconds: 1800,
        server: 'jp',
    })
})

test('validates fire caps and next-fire time', () => {
    assert.equal(parseFullFireInput('24 cn').ok, true)
    assert.equal(parseFullFireInput('25 cn').ok, false)
    assert.equal(parseFullFireInput('9 jp').ok, true)
    assert.equal(parseFullFireInput('10 jp').ok, false)
    assert.equal(parseFullFireInput('8 31:00 jp').ok, false)
})

test('calculates the first recovery separately from later 30-minute recoveries', () => {
    const now = new Date(2026, 7, 5, 10, 0, 0)
    const parsed = parseFullFireInput('23 1:00 cn')
    assert.equal(parsed.ok, true)
    assert.equal(
        calculateFullFireTime(parsed.value, now).getTime(),
        new Date(2026, 7, 5, 10, 31, 0).getTime(),
    )

    assert.equal(commandCalcFullFire('23 1:00 cn', now), [
        '以 2026-08-05 10:00:00（服务器当前时间）为基准，在 cn 服剩余 23 火，且在 1:00 后回一火的情况下：',
        '预计 2026-08-05 10:31:00 时火将会回满。',
        '建议提前 5 分钟（2026-08-05 10:26:00）登入游戏清火。',
    ].join('\n'))
})
