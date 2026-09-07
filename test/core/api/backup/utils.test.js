const fs = require('fs');
const { Buffer } = require('buffer');

async function readChunk(filePath, { length, startPosition }) {
  const fileHandle = await fs.promises.open(filePath, 'r');

  try {
    // eslint-disable-next-line prefer-const
    let { bytesRead, buffer } = await fileHandle.read({
      buffer: Buffer.alloc(length),
      length,
      position: startPosition,
    });

    if (bytesRead < length) {
      buffer = buffer.slice(0, bytesRead);
    }

    return buffer;
  } finally {
    await fileHandle.close();
  }
}

module.exports = {
  readChunk,
};
