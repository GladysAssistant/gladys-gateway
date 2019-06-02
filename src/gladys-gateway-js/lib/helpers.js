function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

function str2ab(str) {
  let buf = new ArrayBuffer(str.length * 2);
  let bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function appendBuffer(buffer1, buffer2) {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
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
