const test = require('node:test')
const assert = require('node:assert/strict')
const {
    CONTROL_SCORE_GUIDE,
    parseControlScoreInput,
} = require('../lib/commands/controlScore')

test('guides the user when target PT is missing', () => {
    const parsed = parseControlScoreInput(undefined)
    assert.equal(parsed.ok, false)
    assert.match(parsed.error, /缺少目标PT/)
    assert.match(parsed.error, /控分 <目标PT>/)
})

test('accepts target, bonus and event id in positional order', () => {
    const parsed = parseControlScoreInput('500 120 300')
    assert.equal(parsed.ok, true)
    assert.equal(parsed.value.targetPt, 500)
    assert.equal(parsed.value.bonusRate, 120)
    assert.equal(parsed.value.eventId, 300)
})

test('accepts named parameters, event modes, server and page', () => {
    const parsed = parseControlScoreInput('500 活动300 加成120 支援282000 清CP jp 第2页')
    assert.equal(parsed.ok, true)
    assert.deepEqual(parsed.value, {
        targetPt: 500,
        bonusRate: 120,
        eventId: 300,
        supportBand: 282000,
        cpClear: true,
        isWin: undefined,
        easyMode: undefined,
        alternativePage: 2,
        serverName: 'jp',
    })
})

test('accepts team and match mode switches', () => {
    const team = parseControlScoreInput('500 50 300 失败 完整')
    assert.equal(team.ok, true)
    assert.equal(team.value.isWin, false)
    assert.equal(team.value.easyMode, false)

    const match = parseControlScoreInput('500 50 300 精简')
    assert.equal(match.ok, true)
    assert.equal(match.value.easyMode, true)
})

test('rejects invalid and unknown parameters', () => {
    assert.equal(parseControlScoreInput('500 426').ok, false)
    assert.equal(parseControlScoreInput('500 未知参数').ok, false)
})

test('guide includes examples for every supported event type', () => {
    assert.match(CONTROL_SCORE_GUIDE, /控分 500 胜利 精简/)
    assert.match(CONTROL_SCORE_GUIDE, /控分 500 失败 完整/)
    assert.match(CONTROL_SCORE_GUIDE, /CP清CP：控分 500 清CP/)
    assert.match(CONTROL_SCORE_GUIDE, /指定活动时请加入活动ID/)
    assert.doesNotMatch(CONTROL_SCORE_GUIDE, /947/)
})
