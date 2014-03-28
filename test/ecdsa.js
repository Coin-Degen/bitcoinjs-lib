var assert = require('assert')
var convert = require('../').convert
var ecdsa = require('../').ecdsa
var Message = require('../').Message

describe('ecdsa', function() {
  describe('recoverPubKey', function() {
    it('succesfully recovers a public key', function() {
      var addr = 'mgQK8S6CfSXKjPmnujArSmVxafeJfrZsa3'
      var signature = convert.base64ToBytes('H0PG6+PUo96UPTJ/DVj8aBU5it+Nuli4YdsLuTMvfJxoHH9Jb7jYTQXCCOX2jrTChD5S1ic3vCrUQHdmB5/sEQY=')
      var sighex = convert.bytesToHex(signature)

      var hash = Message.getHash('1111')
      var obj = ecdsa.parseSigCompact(signature)
      var pubKey = ecdsa.recoverPubKey(obj.r, obj.s, hash, obj.i)

      assert.equal(pubKey.toHex(true), '02e8fcf4d749b35879bc1f3b14b49e67ab7301da3558c5a9b74a54f1e6339c334c')
    })
  })
})
