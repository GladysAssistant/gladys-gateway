function ab2str(buf) {
  const utf8decoder = new TextDecoder();
  return utf8decoder.decode(buf);
}

function str2ab(str) {
  const buf = new ArrayBuffer(str.length * 2);
  const bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i += 1) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function appendBuffer(buffer1, buffer2) {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
}

function sanitizePassPhrase(passphrase) {
  return passphrase.trim().normalize('NFKD');
}

module.exports.ab2str = ab2str;
module.exports.str2ab = str2ab;
module.exports.appendBuffer = appendBuffer;
module.exports.sanitizePassPhrase = sanitizePassPhrase;
