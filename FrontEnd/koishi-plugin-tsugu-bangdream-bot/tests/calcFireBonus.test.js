const test = require('node:test')
const assert = require('node:assert/strict')
const {
    parseCalcFireBonusInput,
} = require('../lib/commands/calcFireBonus')

test('defaults to the current event when no parameters are provided', () => {
    assert.deepEqual(parseCalcFireBonusInput(undefined), {
        ok: true,
        value: {},
    })
    assert.deepEqual(parseCalcFireBonusInput('   '), {
        ok: true,
        value: {},
    })
})

test('accepts all three parameters together', () => {
    assert.deepEqual(parseCalcFireBonusInput('230 10 1'), {
        ok: true,
        value: {
            totalDraws: 230,
            fireBonus: 10,
            grandPrizes: 1,
        },
    })
})

test('requires all three parameters when any parameter is provided', () => {
    assert.equal(parseCalcFireBonusInput('230').ok, false)
    assert.equal(parseCalcFireBonusInput('230 10').ok, false)
})

test('rejects invalid values and oversized combinations', () => {
    assert.equal(parseCalcFireBonusInput('230 -1 1').ok, false)
    assert.equal(parseCalcFireBonusInput('10 11 1').ok, false)
    assert.equal(parseCalcFireBonusInput('10 5 6').ok, false)
    assert.equal(parseCalcFireBonusInput('1000 100 100').ok, false)
})
