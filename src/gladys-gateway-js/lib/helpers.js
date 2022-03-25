const utf8decoder = new TextDecoder();
const utf8encoder = new TextEncoder();

function ab2strOldStyle(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

function str2abOldStyle(str) {
  const buf = new ArrayBuffer(str.length * 2);
  const bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i += 1) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function ab2str(buf) {
  return utf8decoder.decode(new Uint8Array(buf));
}

function str2ab(str) {
  return utf8encoder.encode(str);
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

module.exports = {
  ab2str,
  ab2strOldStyle,
  str2ab,
  str2abOldStyle,
  appendBuffer,
  sanitizePassPhrase,
};
