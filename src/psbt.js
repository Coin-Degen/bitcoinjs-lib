'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const bip174_1 = require('bip174');
const payments = require('./payments');
const script = require('./script');
const transaction_1 = require('./transaction');
const checkRedeemScript = (inputIndex, scriptPubKey, redeemScript) => {
  const redeemScriptOutput = payments.p2sh({
    redeem: { output: redeemScript },
  }).output;
  if (!scriptPubKey.equals(redeemScriptOutput)) {
    throw new Error(
      `Redeem script for input #${inputIndex} doesn't match the scriptPubKey in the prevout`,
    );
  }
};
class Psbt extends bip174_1.Psbt {
  constructor() {
    super();
  }
  signInput(inputIndex, keyPair) {
    // TODO: Implement BIP174 pre-sign checks:
    // https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki#signer
    //
    // if non_witness_utxo.exists:
    //     assert(sha256d(non_witness_utxo) == psbt.tx.innput[i].prevout.hash)
    //     if redeemScript.exists:
    //         assert(non_witness_utxo.vout[psbt.tx.input[i].prevout.n].scriptPubKey == P2SH(redeemScript))
    //         sign_non_witness(redeemScript)
    //     else:
    //         sign_non_witness(non_witness_utxo.vout[psbt.tx.input[i].prevout.n].scriptPubKey)
    // else if witness_utxo.exists:
    //     if redeemScript.exists:
    //         assert(witness_utxo.scriptPubKey == P2SH(redeemScript))
    //         script = redeemScript
    //     else:
    //         script = witness_utxo.scriptPubKey
    //     if IsP2WPKH(script):
    //         sign_witness(P2PKH(script[2:22]))
    //     else if IsP2WSH(script):
    //         assert(script == P2WSH(witnessScript))
    //         sign_witness(witnessScript)
    // else:
    //     assert False
    const input = this.inputs[inputIndex];
    if (input === undefined) throw new Error(`No input #${inputIndex}`);
    if (input.nonWitnessUtxo) {
      const unsignedTx = transaction_1.Transaction.fromBuffer(
        this.globalMap.unsignedTx,
      );
      const nonWitnessUtxoTx = transaction_1.Transaction.fromBuffer(
        input.nonWitnessUtxo,
      );
      const prevoutHash = unsignedTx.ins[inputIndex].hash;
      const utxoHash = nonWitnessUtxoTx.getHash();
      // If a non-witness UTXO is provided, its hash must match the hash specified in the prevout
      if (!prevoutHash.equals(utxoHash)) {
        throw new Error(
          `Non-witness UTXO hash for input #${inputIndex} doesn't match the hash specified in the prevout`,
        );
      }
      if (input.redeemScript) {
        const prevoutIndex = unsignedTx.ins[inputIndex].index;
        const prevout = nonWitnessUtxoTx.outs[prevoutIndex];
        // If a redeemScript is provided, the scriptPubKey must be for that redeemScript
        checkRedeemScript(inputIndex, prevout.script, input.redeemScript);
      }
    } else if (input.witnessUtxo) {
      if (input.redeemScript) {
        // If a redeemScript is provided, the scriptPubKey must be for that redeemScript
        checkRedeemScript(
          inputIndex,
          input.witnessUtxo.script,
          input.redeemScript,
        );
      }
    }
    // TODO: Get hash to sign
    const hash = Buffer.alloc(32);
    const partialSig = {
      pubkey: keyPair.publicKey,
      signature: script.signature.encode(
        keyPair.sign(hash),
        input.sighashType || 0x01,
      ),
    };
    return this.addPartialSigToInput(inputIndex, partialSig);
  }
}
exports.Psbt = Psbt;
