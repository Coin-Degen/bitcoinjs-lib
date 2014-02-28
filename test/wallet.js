var Wallet = require('../src/wallet.js')
var Network = require('../src/network')
var mainnet = Network.mainnet.addressVersion
var testnet = Network.testnet.addressVersion
var assert = require('assert')

describe('Wallet', function() {
  var seed = 'crazy horse battery staple'

  describe('default constructor', function() {
    var wallet;
    beforeEach(function() {
      wallet = new Wallet(seed)
    })

    it('defaults to Bitcoin mainnet', function() {
      assert.equal(wallet.getMasterKey().network, 'prod')
    })

    it('defaults to private derivationMethod', function() {
      assert.equal(wallet.derivationMethod, 'private')
    })
  })

  describe('constructor options', function() {
    var wallet;
    beforeEach(function() {
      wallet = new Wallet(seed, {network: 'testnet', derivationMethod: 'public'})
    })

    it('uses the network if specified', function() {
      assert.equal(wallet.getMasterKey().network, 'testnet')
    })

    it('uses the derivationMethod if specified', function() {
      assert.equal(wallet.derivationMethod, 'public')
    })
  })

  describe('networkType', function() {
    it('ensures that a mainnet Wallet has mainnet child keys (pub and priv)', function() {
        var w = Wallet("foobar", {network: "prod"})
        assert(w.getMasterKey().priv.version == mainnet)
        w.generateAddress()
        assert(w.getPrivateKey(0).priv.version == mainnet)
    })

    it('ensures that a testnet Wallet has testnet child keys (pub and priv)', function() {
        var w = Wallet("foobar", {network: "testnet"})
        assert(w.getMasterKey().priv.version == testnet)
        w.generateAddress()
        assert(w.getPrivateKey(0).priv.version == testnet)
    })
  })
})
