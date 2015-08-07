/* global describe, it */
/* eslint-disable no-new */

var assert = require('assert')
var opcodes = require('../src/opcodes')

var Script = require('../src/script')

var fixtures = require('./fixtures/script.json')

describe('Script', function () {
  describe('constructor', function () {
    it('accepts valid parameters', function () {
      var buffer = new Buffer([1])
      var chunks = [1]
      var script = new Script(buffer, chunks)

      assert.strictEqual(script.buffer, buffer)
      assert.strictEqual(script.chunks, chunks)
    })

    it('throws an error when input is not an array', function () {
      assert.throws(function () {
        new Script({})
      }, /Expected Buffer, got/)
    })
  })

  describe('fromASM/toASM', function () {
    fixtures.valid.forEach(function (f) {
      if (!f.asm) return

      it('decodes/encodes ' + f.description, function () {
        var script = Script.fromASM(f.asm)

        assert.strictEqual(script.toASM(), f.asm)
        assert.strictEqual(script.buffer.toString('hex'), f.hex)
      })
    })
  })

  describe('fromHex/toHex', function () {
    fixtures.valid.forEach(function (f) {
      it('decodes/encodes ' + f.description, function () {
        var script = Script.fromHex(f.hex)

        assert.strictEqual(script.toASM(), f.asm)
        assert.strictEqual(script.buffer.toString('hex'), f.hex)
      })
    })
  })

  describe('fromChunks', function () {
    it('should match expected behaviour', function () {
      var hash = new Buffer(32)
      hash.fill(0)

      var script = Script.fromChunks([
        opcodes.OP_HASH160,
        hash,
        opcodes.OP_EQUAL
      ])

      assert.strictEqual(script.buffer.toString('hex'), 'a920000000000000000000000000000000000000000000000000000000000000000087')
    })
  })

  describe('without', function () {
    var hex = 'a914e8c300c87986efa94c37c0519929019ef86eb5b487'
    var script = Script.fromHex(hex)

    it('should return a script without the given value', function () {
      var subScript = script.without(opcodes.OP_HASH160)

      assert.strictEqual(subScript.buffer.toString('hex'), '14e8c300c87986efa94c37c0519929019ef86eb5b487')
    })

    it('shouldnt mutate the original script', function () {
      var subScript = script.without(opcodes.OP_EQUAL)

      assert.notEqual(subScript.buffer.toString('hex'), hex)
      assert.strictEqual(script.buffer.toString('hex'), hex)
    })
  })
})
