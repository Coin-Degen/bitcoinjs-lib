var bs58check = require('bs58check')
var bcrypto = require('./crypto')
var ecdsa = require('./ecdsa')
var ecurve = require('ecurve')
var NETWORKS = require('./networks')
var randomBytes = require('randombytes')
var typeforce = require('typeforce')
var types = require('./types')

var BigInteger = require('bigi')

function ECPair (d, Q, options) {
  options = options || {}

  typeforce({
    compressed: types.maybe(types.Boolean),
    network: types.maybe(types.Network)
  }, options)

  if (d) {
    if (d.signum() <= 0) throw new Error('Private key must be greater than 0')
    if (d.compareTo(ECPair.curve.n) >= 0) throw new Error('Private key must be less than the curve order')
    if (Q) throw new TypeError('Unexpected publicKey parameter')

    this.d = d

  } else {
    typeforce(types.ECPoint, Q)

    this.__Q = Q
  }

  this.compressed = options.compressed === undefined ? true : options.compressed
  this.network = options.network || NETWORKS.bitcoin
}

Object.defineProperty(ECPair.prototype, 'Q', {
  get: function () {
    if (!this.__Q && this.d) {
      this.__Q = ECPair.curve.G.multiply(this.d)
    }

    return this.__Q
  }
})

// Public access to secp256k1 curve
ECPair.curve = ecurve.getCurveByName('secp256k1')

ECPair.fromPublicKeyBuffer = function (buffer, network) {
  var Q = ecurve.Point.decodeFrom(ECPair.curve, buffer)

  return new ECPair(null, Q, {
    compressed: Q.compressed,
    network: network
  })
}

ECPair.fromWIF = function (string, networks) {
  var payload = bs58check.decode(string)
  var version = payload.readUInt8(0)
  var compressed

  if (payload.length === 34) {
    if (payload[33] !== 0x01) throw new Error('Invalid compression flag')

    // truncate the version/compression bytes
    payload = payload.slice(1, -1)
    compressed = true

  // no compression flag
  } else {
    if (payload.length !== 33) throw new Error('Invalid WIF payload length')

    // Truncate the version byte
    payload = payload.slice(1)
    compressed = false
  }

  var network

  // list of networks?
  if (Array.isArray(networks)) {
    network = networks.filter(function (network) {
      return version === network.wif
    }).pop() || {}

  // otherwise, assume a network object (or default to bitcoin)
  } else {
    network = networks || NETWORKS.bitcoin
  }

  if (version !== network.wif) throw new Error('Invalid network')

  var d = BigInteger.fromBuffer(payload)

  return new ECPair(d, null, {
    compressed: compressed,
    network: network
  })
}

ECPair.makeRandom = function (options) {
  options = options || {}

  var rng = options.rng || randomBytes
  var buffer = rng(32)
  typeforce(types.Buffer256bit, buffer)

  var d = BigInteger.fromBuffer(buffer)
  d = d.mod(ECPair.curve.n)

  return new ECPair(d, null, options)
}

ECPair.prototype.toWIF = function () {
  if (!this.d) throw new Error('Missing private key')

  var bufferLen = this.compressed ? 34 : 33
  var buffer = new Buffer(bufferLen)

  buffer.writeUInt8(this.network.wif, 0)
  this.d.toBuffer(32).copy(buffer, 1)

  if (this.compressed) {
    buffer.writeUInt8(0x01, 33)
  }

  return bs58check.encode(buffer)
}

ECPair.prototype.getAddress = function () {
  var pubKey = this.getPublicKeyBuffer()
  var pubKeyHash = bcrypto.hash160(pubKey)

  var payload = new Buffer(21)
  payload.writeUInt8(this.network.pubKeyHash, 0)
  pubKeyHash.copy(payload, 1)

  return bs58check.encode(payload)
}

ECPair.prototype.getPublicKeyBuffer = function () {
  return this.Q.getEncoded(this.compressed)
}

ECPair.prototype.sign = function (hash) {
  if (!this.d) throw new Error('Missing private key')

  return ecdsa.sign(ECPair.curve, hash, this.d)
}

ECPair.prototype.verify = function (hash, signature) {
  return ecdsa.verify(ECPair.curve, hash, signature, this.Q)
}

module.exports = ECPair
