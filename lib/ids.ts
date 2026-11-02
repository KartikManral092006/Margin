const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// 248 = 62 * 4: dropping bytes at or above it keeps every character equally likely.
const UNBIASED_LIMIT = 248;

type RandomBytes = (size: number) => Uint8Array;

const cryptoBytes: RandomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));

// Letters and digits only, so IDs can be reused inside Nexconn user and channel IDs.
export function newAlnumId(length = 32, randomBytes: RandomBytes = cryptoBytes): string {
  let id = "";
  while (id.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < UNBIASED_LIMIT) id += ALPHABET.charAt(byte % ALPHABET.length);
      if (id.length === length) break;
    }
  }
  return id;
}
