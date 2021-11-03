/// <reference types="node" />
import { TweakedPublicKey } from './types';
export declare function liftX(buffer: Buffer): Buffer | null;
export declare function tweakKey(pubKey: Buffer, h: Buffer | undefined): TweakedPublicKey | null;
export declare function leafHash(script: Buffer, version: number): Buffer;
export declare function rootHashFromPath(controlBlock: Buffer, tapLeafMsg: Buffer): Buffer;
export declare function rootHashFromTree(scripts: any): Buffer;
