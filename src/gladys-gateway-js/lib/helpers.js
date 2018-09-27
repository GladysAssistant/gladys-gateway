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

module.exports.ab2str = ab2str;
module.exports.str2ab = str2ab;
