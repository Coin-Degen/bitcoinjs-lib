import { Psbt as PsbtBase } from 'bip174';
import {
  PartialSig,
  PsbtInput,
  TransactionInput,
  TransactionOutput,
} from 'bip174/src/lib/interfaces';
import { checkForInput } from 'bip174/src/lib/utils';
import { toOutputScript } from './address';
import { reverseBuffer } from './bufferutils';
import { hash160 } from './crypto';
import { Signer, SignerAsync } from './ecpair';
import { bitcoin as btcNetwork, Network } from './networks';
import * as payments from './payments';
import * as bscript from './script';
import { Transaction } from './transaction';
const varuint = require('varuint-bitcoin');

export class Psbt extends PsbtBase {
  private __TX: Transaction;
  private __TX_BUF_CACHE?: Buffer;
  private opts: PsbtOpts;
  constructor(opts: PsbtOptsOptional = {}) {
    super();
    // set defaults
    this.setVersion(2);
    this.opts = Object.assign({}, DEFAULT_OPTS, opts);
    this.__TX = Transaction.fromBuffer(this.globalMap.unsignedTx!);

    // set cache
    const self = this;
    delete this.globalMap.unsignedTx;
    Object.defineProperty(this.globalMap, 'unsignedTx', {
      enumerable: true,
      get(): Buffer {
        if (self.__TX_BUF_CACHE !== undefined) {
          return self.__TX_BUF_CACHE;
        } else {
          self.__TX_BUF_CACHE = self.__TX.toBuffer();
          return self.__TX_BUF_CACHE;
        }
      },
      set(data: Buffer): void {
        self.__TX_BUF_CACHE = data;
      },
    });

    // Make data hidden when enumerating
    const dpew = (
      obj: any,
      attr: string,
      enumerable: boolean,
      writable: boolean,
    ): any =>
      Object.defineProperty(obj, attr, {
        enumerable,
        writable,
      });
    dpew(this, '__TX', false, false);
    dpew(this, '__TX_BUF_CACHE', false, true);
    dpew(this, 'opts', false, true);
  }

  addInput(inputData: TransactionInput): this {
    const self = this;
    const inputAdder = (
      _inputData: TransactionInput,
      txBuf: Buffer,
    ): Buffer => {
      if (
        !txBuf ||
        (_inputData as any).hash === undefined ||
        (_inputData as any).index === undefined ||
        (!Buffer.isBuffer((_inputData as any).hash) &&
          typeof (_inputData as any).hash !== 'string') ||
        typeof (_inputData as any).index !== 'number'
      ) {
        throw new Error('Error adding input.');
      }
      const prevHash = Buffer.isBuffer(_inputData.hash)
        ? _inputData.hash
        : reverseBuffer(Buffer.from(_inputData.hash, 'hex'));
      self.__TX.ins.push({
        hash: prevHash,
        index: _inputData.index,
        script: Buffer.alloc(0),
        sequence: _inputData.sequence || Transaction.DEFAULT_SEQUENCE,
        witness: [],
      });
      console.log(self.__TX);
      return self.__TX.toBuffer();
    };
    return super.addInput(inputData, inputAdder);
  }

  addOutput(outputData: TransactionOutput): this {
    const { address } = outputData as any;
    if (typeof address === 'string') {
      const { network } = this.opts;
      const script = toOutputScript(address, network);
      outputData = Object.assign(outputData, { script });
    }
    const self = this;
    const outputAdder = (
      _outputData: TransactionOutput,
      txBuf: Buffer,
    ): Buffer => {
      if (
        !txBuf ||
        (_outputData as any).script === undefined ||
        (_outputData as any).value === undefined ||
        !Buffer.isBuffer((_outputData as any).script) ||
        typeof (_outputData as any).value !== 'number'
      ) {
        throw new Error('Error adding output.');
      }
      self.__TX.outs.push({
        script: (_outputData as any).script!,
        value: _outputData.value,
      });
      console.log(self.__TX);
      return self.__TX.toBuffer();
    };
    return super.addOutput(outputData, true, outputAdder);
  }

  extractTransaction(): Transaction {
    if (!this.inputs.every(isFinalized)) throw new Error('Not finalized');
    const tx = Transaction.fromBuffer(this.globalMap.unsignedTx!);
    this.inputs.forEach((input, idx) => {
      if (input.finalScriptSig) tx.ins[idx].script = input.finalScriptSig;
      if (input.finalScriptWitness) {
        tx.ins[idx].witness = scriptWitnessToWitnessStack(
          input.finalScriptWitness,
        );
      }
    });
    return tx;
  }

  finalizeAllInputs(): {
    result: boolean;
    inputResults: boolean[];
  } {
    const inputResults = range(this.inputs.length).map(idx =>
      this.finalizeInput(idx),
    );
    const result = inputResults.every(val => val === true);
    return {
      result,
      inputResults,
    };
  }

  finalizeInput(inputIndex: number): boolean {
    const input = checkForInput(this.inputs, inputIndex);
    const { script, isP2SH, isP2WSH, isSegwit } = getScriptFromInput(
      inputIndex,
      input,
      this.globalMap.unsignedTx!,
    );
    if (!script) return false;

    const scriptType = classifyScript(script);
    if (!canFinalize(input, script, scriptType)) return false;

    const { finalScriptSig, finalScriptWitness } = getFinalScripts(
      script,
      scriptType,
      input.partialSig!,
      isSegwit,
      isP2SH,
      isP2WSH,
    );

    if (finalScriptSig)
      this.addFinalScriptSigToInput(inputIndex, finalScriptSig);
    if (finalScriptWitness)
      this.addFinalScriptWitnessToInput(inputIndex, finalScriptWitness);
    if (!finalScriptSig && !finalScriptWitness) return false;

    this.clearFinalizedInput(inputIndex);
    return true;
  }

  signInput(inputIndex: number, keyPair: Signer): Psbt {
    if (!keyPair || !keyPair.publicKey)
      throw new Error('Need Signer to sign input');
    const { hash, sighashType } = getHashAndSighashType(
      this.inputs,
      inputIndex,
      keyPair.publicKey,
      this.globalMap.unsignedTx!,
    );

    const partialSig = {
      pubkey: keyPair.publicKey,
      signature: bscript.signature.encode(keyPair.sign(hash), sighashType),
    };

    return this.addPartialSigToInput(inputIndex, partialSig);
  }

  signInputAsync(inputIndex: number, keyPair: SignerAsync): Promise<void> {
    if (!keyPair || !keyPair.publicKey)
      throw new Error('Need Signer to sign input');
    const { hash, sighashType } = getHashAndSighashType(
      this.inputs,
      inputIndex,
      keyPair.publicKey,
      this.globalMap.unsignedTx!,
    );

    return keyPair.sign(hash).then(signature => {
      const partialSig = {
        pubkey: keyPair.publicKey,
        signature: bscript.signature.encode(signature, sighashType),
      };

      this.addPartialSigToInput(inputIndex, partialSig);
    });
  }
}

//
//
//
//
// Helper functions
//
//
//
//

interface PsbtOptsOptional {
  network?: Network;
}

interface PsbtOpts {
  network: Network;
}

const DEFAULT_OPTS = {
  network: btcNetwork,
};

function isFinalized(input: PsbtInput): boolean {
  return !!input.finalScriptSig || !!input.finalScriptWitness;
}

function getHashAndSighashType(
  inputs: PsbtInput[],
  inputIndex: number,
  pubkey: Buffer,
  txBuf: Buffer,
): {
  hash: Buffer;
  sighashType: number;
} {
  const input = checkForInput(inputs, inputIndex);
  const { hash, sighashType, script } = getHashForSig(inputIndex, input, txBuf);
  checkScriptForPubkey(pubkey, script);
  return {
    hash,
    sighashType,
  };
}

function getFinalScripts(
  script: Buffer,
  scriptType: string,
  partialSig: PartialSig[],
  isSegwit: boolean,
  isP2SH: boolean,
  isP2WSH: boolean,
): {
  finalScriptSig: Buffer | undefined;
  finalScriptWitness: Buffer | undefined;
} {
  let finalScriptSig: Buffer | undefined;
  let finalScriptWitness: Buffer | undefined;

  // Wow, the payments API is very handy
  const payment: payments.Payment = getPayment(script, scriptType, partialSig);
  const p2wsh = !isP2WSH ? null : payments.p2wsh({ redeem: payment });
  const p2sh = !isP2SH ? null : payments.p2sh({ redeem: p2wsh || payment });

  if (isSegwit) {
    if (p2wsh) {
      finalScriptWitness = witnessStackToScriptWitness(p2wsh.witness!);
    } else {
      finalScriptWitness = witnessStackToScriptWitness(payment.witness!);
    }
    if (p2sh) {
      finalScriptSig = p2sh.input;
    }
  } else {
    if (p2sh) {
      finalScriptSig = p2sh.input;
    } else {
      finalScriptSig = payment.input;
    }
  }
  return {
    finalScriptSig,
    finalScriptWitness,
  };
}

function getSortedSigs(script: Buffer, partialSig: PartialSig[]): Buffer[] {
  const p2ms = payments.p2ms({ output: script });
  // for each pubkey in order of p2ms script
  return p2ms
    .pubkeys!.map(pk => {
      // filter partialSig array by pubkey being equal
      return (
        partialSig.filter(ps => {
          return ps.pubkey.equals(pk);
        })[0] || {}
      ).signature;
      // Any pubkey without a match will return undefined
      // this last filter removes all the undefined items in the array.
    })
    .filter(v => !!v);
}

function getPayment(
  script: Buffer,
  scriptType: string,
  partialSig: PartialSig[],
): payments.Payment {
  let payment: payments.Payment;
  switch (scriptType) {
    case 'multisig':
      const sigs = getSortedSigs(script, partialSig);
      payment = payments.p2ms({
        output: script,
        signatures: sigs,
      });
      break;
    case 'pubkey':
      payment = payments.p2pk({
        output: script,
        signature: partialSig[0].signature,
      });
      break;
    case 'pubkeyhash':
      payment = payments.p2pkh({
        output: script,
        pubkey: partialSig[0].pubkey,
        signature: partialSig[0].signature,
      });
      break;
    case 'witnesspubkeyhash':
      payment = payments.p2wpkh({
        output: script,
        pubkey: partialSig[0].pubkey,
        signature: partialSig[0].signature,
      });
      break;
  }
  return payment!;
}

function canFinalize(
  input: PsbtInput,
  script: Buffer,
  scriptType: string,
): boolean {
  switch (scriptType) {
    case 'pubkey':
    case 'pubkeyhash':
    case 'witnesspubkeyhash':
      return hasSigs(1, input.partialSig);
    case 'multisig':
      const p2ms = payments.p2ms({ output: script });
      return hasSigs(p2ms.m!, input.partialSig);
    default:
      return false;
  }
}

function checkScriptForPubkey(pubkey: Buffer, script: Buffer): void {
  const pubkeyHash = hash160(pubkey);

  const decompiled = bscript.decompile(script);
  if (decompiled === null) throw new Error('Unknown script error');

  const hasKey = decompiled.some(element => {
    if (typeof element === 'number') return false;
    return element.equals(pubkey) || element.equals(pubkeyHash);
  });

  if (!hasKey) {
    throw new Error(
      `Can not sign for this input with the key ${pubkey.toString('hex')}`,
    );
  }
}

interface HashForSigData {
  script: Buffer;
  hash: Buffer;
  sighashType: number;
}

const getHashForSig = (
  inputIndex: number,
  input: PsbtInput,
  txBuf: Buffer,
): HashForSigData => {
  const unsignedTx = Transaction.fromBuffer(txBuf);
  const sighashType = input.sighashType || Transaction.SIGHASH_ALL;
  let hash: Buffer;
  let script: Buffer;

  if (input.nonWitnessUtxo) {
    const nonWitnessUtxoTx = Transaction.fromBuffer(input.nonWitnessUtxo);

    const prevoutHash = unsignedTx.ins[inputIndex].hash;
    const utxoHash = nonWitnessUtxoTx.getHash();

    // If a non-witness UTXO is provided, its hash must match the hash specified in the prevout
    if (!prevoutHash.equals(utxoHash)) {
      throw new Error(
        `Non-witness UTXO hash for input #${inputIndex} doesn't match the hash specified in the prevout`,
      );
    }

    const prevoutIndex = unsignedTx.ins[inputIndex].index;
    const prevout = nonWitnessUtxoTx.outs[prevoutIndex];

    if (input.redeemScript) {
      // If a redeemScript is provided, the scriptPubKey must be for that redeemScript
      checkRedeemScript(inputIndex, prevout.script, input.redeemScript);
      script = input.redeemScript;
      hash = unsignedTx.hashForSignature(
        inputIndex,
        input.redeemScript,
        sighashType,
      );
    } else {
      script = prevout.script;
      hash = unsignedTx.hashForSignature(
        inputIndex,
        prevout.script,
        sighashType,
      );
    }
  } else if (input.witnessUtxo) {
    let _script: Buffer; // so we don't shadow the `let script` above
    if (input.redeemScript) {
      // If a redeemScript is provided, the scriptPubKey must be for that redeemScript
      checkRedeemScript(
        inputIndex,
        input.witnessUtxo.script,
        input.redeemScript,
      );
      _script = input.redeemScript;
    } else {
      _script = input.witnessUtxo.script;
    }
    if (isP2WPKH(_script)) {
      // P2WPKH uses the P2PKH template for prevoutScript when signing
      const signingScript = payments.p2pkh({ hash: _script.slice(2) }).output!;
      hash = unsignedTx.hashForWitnessV0(
        inputIndex,
        signingScript,
        input.witnessUtxo.value,
        sighashType,
      );
      script = _script;
    } else {
      if (!input.witnessScript)
        throw new Error('Segwit input needs witnessScript if not P2WPKH');
      checkWitnessScript(inputIndex, _script, input.witnessScript);
      hash = unsignedTx.hashForWitnessV0(
        inputIndex,
        input.witnessScript,
        input.witnessUtxo.value,
        sighashType,
      );
      // want to make sure the script we return is the actual meaningful script
      script = input.witnessScript;
    }
  } else {
    throw new Error('Need a Utxo input item for signing');
  }
  return {
    script,
    sighashType,
    hash,
  };
};

type ScriptCheckerFunction = (idx: number, spk: Buffer, rs: Buffer) => void;

const scriptCheckerFactory = (
  payment: any,
  paymentScriptName: string,
): ScriptCheckerFunction => (
  inputIndex: number,
  scriptPubKey: Buffer,
  redeemScript: Buffer,
): void => {
  const redeemScriptOutput = payment({
    redeem: { output: redeemScript },
  }).output as Buffer;

  if (!scriptPubKey.equals(redeemScriptOutput)) {
    throw new Error(
      `${paymentScriptName} for input #${inputIndex} doesn't match the scriptPubKey in the prevout`,
    );
  }
};

const checkRedeemScript = scriptCheckerFactory(payments.p2sh, 'Redeem script');
const checkWitnessScript = scriptCheckerFactory(
  payments.p2wsh,
  'Witness script',
);

type isPaymentFunction = (script: Buffer) => boolean;

const isPaymentFactory = (payment: any): isPaymentFunction => (
  script: Buffer,
): boolean => {
  try {
    payment({ output: script });
    return true;
  } catch (err) {
    return false;
  }
};
const isP2WPKH = isPaymentFactory(payments.p2wpkh);
const isP2PKH = isPaymentFactory(payments.p2pkh);
const isP2MS = isPaymentFactory(payments.p2ms);
const isP2PK = isPaymentFactory(payments.p2pk);

const classifyScript = (script: Buffer): string => {
  if (isP2WPKH(script)) return 'witnesspubkeyhash';
  if (isP2PKH(script)) return 'pubkeyhash';
  if (isP2MS(script)) return 'multisig';
  if (isP2PK(script)) return 'pubkey';
  return 'nonstandard';
};

interface GetScriptReturn {
  script: Buffer | null;
  isSegwit: boolean;
  isP2SH: boolean;
  isP2WSH: boolean;
}
function getScriptFromInput(
  inputIndex: number,
  input: PsbtInput,
  _unsignedTx: Buffer,
): GetScriptReturn {
  const res: GetScriptReturn = {
    script: null,
    isSegwit: false,
    isP2SH: false,
    isP2WSH: false,
  };
  if (input.nonWitnessUtxo) {
    if (input.redeemScript) {
      res.isP2SH = true;
      res.script = input.redeemScript;
    } else {
      const unsignedTx = Transaction.fromBuffer(_unsignedTx);
      const nonWitnessUtxoTx = Transaction.fromBuffer(input.nonWitnessUtxo);
      const prevoutIndex = unsignedTx.ins[inputIndex].index;
      res.script = nonWitnessUtxoTx.outs[prevoutIndex].script;
    }
  } else if (input.witnessUtxo) {
    res.isSegwit = true;
    res.isP2SH = !!input.redeemScript;
    res.isP2WSH = !!input.witnessScript;
    if (input.witnessScript) {
      res.script = input.witnessScript;
    } else if (input.redeemScript) {
      res.script = payments.p2wpkh({
        hash: input.redeemScript.slice(2),
      }).output!;
    } else {
      res.script = payments.p2wpkh({
        hash: input.witnessUtxo.script.slice(2),
      }).output!;
    }
  }
  return res;
}

const hasSigs = (neededSigs: number, partialSig?: any[]): boolean => {
  if (!partialSig) return false;
  if (partialSig.length > neededSigs) throw new Error('Too many signatures');
  return partialSig.length === neededSigs;
};

function witnessStackToScriptWitness(witness: Buffer[]): Buffer {
  let buffer = Buffer.allocUnsafe(0);

  function writeSlice(slice: Buffer): void {
    buffer = Buffer.concat([buffer, Buffer.from(slice)]);
  }

  function writeVarInt(i: number): void {
    const currentLen = buffer.length;
    const varintLen = varuint.encodingLength(i);

    buffer = Buffer.concat([buffer, Buffer.allocUnsafe(varintLen)]);
    varuint.encode(i, buffer, currentLen);
  }

  function writeVarSlice(slice: Buffer): void {
    writeVarInt(slice.length);
    writeSlice(slice);
  }

  function writeVector(vector: Buffer[]): void {
    writeVarInt(vector.length);
    vector.forEach(writeVarSlice);
  }

  writeVector(witness);

  return buffer;
}

function scriptWitnessToWitnessStack(buffer: Buffer): Buffer[] {
  let offset = 0;

  function readSlice(n: number): Buffer {
    offset += n;
    return buffer.slice(offset - n, offset);
  }

  function readVarInt(): number {
    const vi = varuint.decode(buffer, offset);
    offset += varuint.decode.bytes;
    return vi;
  }

  function readVarSlice(): Buffer {
    return readSlice(readVarInt());
  }

  function readVector(): Buffer[] {
    const count = readVarInt();
    const vector: Buffer[] = [];
    for (let i = 0; i < count; i++) vector.push(readVarSlice());
    return vector;
  }

  return readVector();
}

const range = (n: number): number[] => [...Array(n).keys()];
