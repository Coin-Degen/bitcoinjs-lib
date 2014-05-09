var assert = require('assert')
var crypto = require('..').crypto
var networks = require('..').networks

var Address = require('../src/address.js')
var Script = require('../src/script.js')

var fixtures = require('./fixtures/script')

function b2h(b) { return new Buffer(b).toString('hex') }
function h2b(h) { return new Buffer(h, 'hex') }

describe('Script', function() {
  describe('constructor', function() {
    it('works for a byte array', function() {
      assert.ok(new Script([]))
    })

    it('works when nothing is passed in', function() {
      assert.ok(new Script())
    })

    it('throws an error when input is not an array', function() {
      assert.throws(function(){ new Script({}) })
    })
  })

  describe('fromHex/toHex', function() {
    fixtures.valid.forEach(function(f) {
      it('decodes/encodes ' + f.description, function() {
        assert.equal(Script.fromHex(f.hex).toHex(), f.hex)
      })
    })
  })

  describe('getHash', function() {
    it('matches the test vectors', function() {
      fixtures.valid.forEach(function(f) {
        var script = Script.fromHex(f.hex)

        assert.equal(script.getHash().toString('hex'), f.hash)
      })
    })
  })

  describe('getInType', function() {
    fixtures.valid.forEach(function(f) {
      if (!f.scriptPubKey) {
        it('supports ' + f.description, function() {
          var script = Script.fromHex(f.hex)

          assert.equal(script.getInType(), f.type)
        })
      }
    })
  })

  describe('getOutType', function() {
    fixtures.valid.forEach(function(f) {
      if (f.scriptPubKey) {
        it('supports ' + f.description, function() {
          var script = Script.fromHex(f.hex)

          assert.equal(script.getOutType(), f.type)
        })
      }
    })
  })

  describe('pay-to-pubKeyHash', function() {
    it('matches the test data', function() {
      var address = Address.fromBase58Check('19E6FV3m3kEPoJD5Jz6dGKdKwTVvjsWUvu')
      var script = Script.createPubKeyHashScriptPubKey(address.hash)

      // FIXME: not good TDD
      assert.equal(script.toHex(), fixtures.valid[1].hex)
    })
  })

  describe('pay-to-scriptHash', function() {
    it('matches the test data', function() {
      var hash = new Buffer('e8c300c87986efa84c37c0519929019ef86eb5b4', 'hex')
      var script = Script.createP2SHScriptPubKey(hash)

      // FIXME: not good TDD
      assert.equal(script.toHex(), fixtures.valid[0].hex)
    })
  })

  describe('2-of-3 Multi-Signature scriptPubKey', function() {
    var pubKeys

    beforeEach(function() {
      pubKeys = [
        '02ea1297665dd733d444f31ec2581020004892cdaaf3dd6c0107c615afb839785f',
        '02fab2dea1458990793f56f42e4a47dbf35a12a351f26fa5d7e0cc7447eaafa21f',
        '036c6802ce7e8113723dd92cdb852e492ebb157a871ca532c3cb9ed08248ff0e19'
      ].map(h2b)
    })

    it('should create valid redeemScript', function() {
      var redeemScript = Script.createMultisigScriptPubKey(2, pubKeys)

      var hash160 = crypto.hash160(redeemScript.buffer)
      var multisigAddress = new Address(hash160, networks.bitcoin.scriptHash)

      assert.equal(multisigAddress.toString(), '32vYjxBb7pHJJyXgNk8UoK3BdRDxBzny2v')
    })
  })

  describe('2-of-2 Multisig scriptSig', function() {
    var pubKeys = [
      '02359c6e3f04cefbf089cf1d6670dc47c3fb4df68e2bad1fa5a369f9ce4b42bbd1',
      '0395a9d84d47d524548f79f435758c01faec5da2b7e551d3b8c995b7e06326ae4a'
    ].map(h2b)
    var signatures = [
      '304402207515cf147d201f411092e6be5a64a6006f9308fad7b2a8fdaab22cd86ce764c202200974b8aca7bf51dbf54150d3884e1ae04f675637b926ec33bf75939446f6ca2801',
      '3045022100ef253c1faa39e65115872519e5f0a33bbecf430c0f35cf562beabbad4da24d8d02201742be8ee49812a73adea3007c9641ce6725c32cd44ddb8e3a3af460015d140501'
    ].map(h2b)
    var expected = '0047304402207515cf147d201f411092e6be5a64a6006f9308fad7b2a8fdaab22cd86ce764c202200974b8aca7bf51dbf54150d3884e1ae04f675637b926ec33bf75939446f6ca2801483045022100ef253c1faa39e65115872519e5f0a33bbecf430c0f35cf562beabbad4da24d8d02201742be8ee49812a73adea3007c9641ce6725c32cd44ddb8e3a3af460015d14050147522102359c6e3f04cefbf089cf1d6670dc47c3fb4df68e2bad1fa5a369f9ce4b42bbd1210395a9d84d47d524548f79f435758c01faec5da2b7e551d3b8c995b7e06326ae4a52ae'

    it('should create a valid P2SH multisig scriptSig', function() {
      var redeemScript = Script.createMultisigScriptPubKey(2, pubKeys)
      var actual = Script.createP2SHMultisigScriptSig(signatures, redeemScript)

      assert.equal(b2h(actual.buffer), expected)
    })
  })
})
