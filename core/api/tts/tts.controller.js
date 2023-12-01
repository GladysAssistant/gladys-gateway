const axios = require('axios');
const uuid = require('uuid');

const { UnauthorizedError } = require('../../common/error');

const TTS_TOKEN_PREFIX = 'tts-token:';

module.exports = function TTSController(redisClient) {
  /**
   * @api {get} /tts/:tts_token/generate.mp3 Return a mp3 file
   * @apiName generate
   * @apiGroup TTS
   *
   * @apiSuccessExample {binary} Success-Response:
   * HTTP/1.1 200 OK
   */
  async function generate(req, res, next) {
    const text = await redisClient.get(`${TTS_TOKEN_PREFIX}:${req.params.tts_token}`);
    if (!text) {
      throw new UnauthorizedError('Invalid TTS token.');
    }
    // Streaming response to client
    const { data, headers } = await axios({
      url: process.env.TEXT_TO_SPEECH_URL,
      method: 'POST',
      data: {
        text,
      },
      headers: {
        authorization: `Bearer ${process.env.TEXT_TO_SPEECH_API_KEY}`,
      },
      responseType: 'stream',
    });
    res.setHeader('content-type', headers['content-type']);
    res.setHeader('content-length', headers['content-length']);
    data.pipe(res);
  }

  /**
   * @api {post} /tts/token Get temporary token to access TTS API
   * @apiName getToken
   * @apiGroup TTS
   *
   * @apiBody {String} text The text to generate
   *
   * @apiSuccessExample {binary} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "token": "ac365e90-78f1-482a-8afa-af326d5647a4",
   *   "url": "https://url_of_the_file"
   * }
   */
  async function getTemporaryToken(req, res, next) {
    const token = uuid.v4();
    await redisClient.set(`${TTS_TOKEN_PREFIX}:${token}`, req.body.text, {
      EX: 5 * 60, // 5 minutes in seconds
    });
    const url = `${process.env.GLADYS_PLUS_BACKEND_URL}/tts/${token}/generate.mp3`;
    res.json({ token, url });
  }

  return {
    generate,
    getTemporaryToken,
  };
};
