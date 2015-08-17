/* global describe, it */

var assert = require('assert')
var networks = require('../src/networks')

var Address = require('../src/address')
var Script = require('../src/script')

var fixtures = require('./fixtures/address.json')

describe('Address', function () {
  describe('fromBase58Check', function () {
    fixtures.valid.forEach(function (f) {
      it('decodes ' + f.base58check, function () {
        var decode = Address.fromBase58Check(f.base58check)

        assert.strictEqual(decode.version, f.version)
        assert.strictEqual(decode.hash.toString('hex'), f.hash)
      })
    })

    fixtures.invalid.fromBase58Check.forEach(function (f) {
      it('throws on ' + f.exception, function () {
        assert.throws(function () {
          Address.fromBase58Check(f.address)
        }, new RegExp(f.address + ' ' + f.exception))
      })
    })
  })

  describe('fromOutputScript', function () {
    fixtures.valid.forEach(function (f) {
      it('parses ' + f.script.slice(0, 30) + '... (' + f.network + ')', function () {
        var script = Script.fromASM(f.script)
        var address = Address.fromOutputScript(script, networks[f.network])

        assert.strictEqual(address, f.base58check)
      })
    })

    fixtures.invalid.fromOutputScript.forEach(function (f) {
      it('throws when ' + f.script.slice(0, 30) + '... ' + f.exception, function () {
        var script = Script.fromASM(f.script)

        assert.throws(function () {
          Address.fromOutputScript(script)
        }, new RegExp(f.script + ' ' + f.exception))
      })
    })
  })

  describe('toBase58Check', function () {
    fixtures.valid.forEach(function (f) {
      it('formats ' + f.hash + ' (' + f.network + ')', function () {
        var address = Address.toBase58Check(new Buffer(f.hash, 'hex'), f.version)

        assert.strictEqual(address, f.base58check)
      })
    })
  })

  describe('toOutputScript', function () {
    fixtures.valid.forEach(function (f) {
      var network = networks[f.network]

      it('exports ' + f.script.slice(0, 30) + '... (' + f.network + ')', function () {
        var script = Address.toOutputScript(f.base58check, network)

        assert.strictEqual(script.toASM(), f.script)
      })
    })

    fixtures.invalid.toOutputScript.forEach(function (f) {
      it('throws when ' + f.exception, function () {
        assert.throws(function () {
          Address.toOutputScript(f.address)
        }, new RegExp(f.address + ' ' + f.exception))
      })
    })
  })
})
