import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export type KeyPair = { publicKey: string; secretKey: string };

export function generateKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: encodeBase64(kp.publicKey), secretKey: encodeBase64(kp.secretKey) };
}

export function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string,
  mySecretKeyB64: string,
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(
    decodeUTF8(plaintext),
    nonce,
    decodeBase64(recipientPublicKeyB64),
    decodeBase64(mySecretKeyB64),
  );
  return { ciphertext: encodeBase64(box), nonce: encodeBase64(nonce) };
}

export function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  senderPublicKeyB64: string,
  mySecretKeyB64: string,
): string | null {
  const opened = nacl.box.open(
    decodeBase64(ciphertextB64),
    decodeBase64(nonceB64),
    decodeBase64(senderPublicKeyB64),
    decodeBase64(mySecretKeyB64),
  );
  return opened ? encodeUTF8(opened as Uint8Array<ArrayBuffer>) : null;
}

export function encryptFile(fileBytes: Uint8Array): {
  encryptedBytes: Uint8Array; fileKey: string; fileNonce: string;
} {
  const fileKey = nacl.randomBytes(nacl.secretbox.keyLength);
  const fileNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return {
    encryptedBytes: nacl.secretbox(fileBytes as Uint8Array<ArrayBuffer>, fileNonce as Uint8Array<ArrayBuffer>, fileKey as Uint8Array<ArrayBuffer>) as Uint8Array<ArrayBuffer>,
    fileKey: encodeBase64(fileKey as Uint8Array<ArrayBuffer>),
    fileNonce: encodeBase64(fileNonce as Uint8Array<ArrayBuffer>),
  };
}

export function decryptFile(
  encryptedBytes: Uint8Array,
  fileKeyB64: string,
  fileNonceB64: string,
): Uint8Array | null {
  return nacl.secretbox.open(encryptedBytes, decodeBase64(fileNonceB64), decodeBase64(fileKeyB64));
}

export function wrapFileKey(
  fileKeyB64: string,
  recipientPublicKeyB64: string,
  mySecretKeyB64: string,
): { wrappedKey: string; keyNonce: string } {
  const keyNonce = nacl.randomBytes(nacl.box.nonceLength);
  const wrappedKey = nacl.box(
    decodeBase64(fileKeyB64),
    keyNonce,
    decodeBase64(recipientPublicKeyB64),
    decodeBase64(mySecretKeyB64),
  );
  return { wrappedKey: encodeBase64(wrappedKey), keyNonce: encodeBase64(keyNonce) };
}

export function unwrapFileKey(
  wrappedKeyB64: string,
  keyNonceB64: string,
  senderPublicKeyB64: string,
  mySecretKeyB64: string,
): string | null {
  const bytes = nacl.box.open(
    decodeBase64(wrappedKeyB64),
    decodeBase64(keyNonceB64),
    decodeBase64(senderPublicKeyB64),
    decodeBase64(mySecretKeyB64),
  );
  return bytes ? encodeBase64(bytes) : null;
}
