/// Implements Bitcoin's feature for signing arbitrary messages.
var Address = require('./address')
var bufferutils = require('./bufferutils')
var crypto = require('./crypto')
var ecdsa = require('./ecdsa')
var networks = require('./networks')

var Address = require('./address')
var ECPubKey = require('./ecpubkey')

function magicHash(message, network) {
  var magicPrefix = new Buffer(network.magicPrefix)
  var messageBuffer = new Buffer(message)
  var lengthBuffer = new Buffer(bufferutils.varIntSize(messageBuffer.length))
  bufferutils.writeVarInt(lengthBuffer, messageBuffer.length, 0)

  var buffer = Buffer.concat([
    magicPrefix, lengthBuffer, messageBuffer
  ])
  return crypto.hash256(buffer)
}

function sign(key, message, network) {
  network = network || networks.bitcoin

  var hash = magicHash(message, network)
  var sig = ecdsa.parseSig(key.sign(hash))
  var i = ecdsa.calcPubKeyRecoveryParam(key.pub.Q, sig.r, sig.s, hash)

  return ecdsa.serializeSigCompact(sig.r, sig.s, i, key.pub.compressed)
}

// TODO: network could be implied from address
function verify(address, compactSig, message, network) {
  if (typeof address === 'string') {
    address = Address.fromBase58Check(address)
  }

  network = network || networks.bitcoin

  var hash = magicHash(message, network)
  var sig = ecdsa.parseSigCompact(compactSig)
  var Q = ecdsa.recoverPubKey(sig.r, sig.s, hash, sig.i)

  var pubKey = new ECPubKey(Q, sig.compressed)
  return pubKey.getAddress(address.version).toString() === address.toString()
}

module.exports = {
  magicHash: magicHash,
  sign: sign,
  verify: verify
}
