const crypto = require('crypto');
const axios = require('axios');

const { UnauthorizedError, BadRequestError, TooManyRequestsError } = require('../../common/error');

const TTS_TOKEN_PREFIX = 'tts-token:';
const TTS_GENERATIONS_PREFIX = 'tts-generations:';
const TTS_TOKEN_TTL_IN_SECONDS = 5 * 60;
// The monthly quota is spent once, when the token is created, while each generation is a
// paid call to the TTS provider: the generations of a token are limited. A few are allowed,
// as a speaker can fetch the file more than once (HEAD then GET, retry...).
const MAX_GENERATIONS_PER_TOKEN = 3;
const MAX_TEXT_LENGTH = 5000;

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
    // Counted BEFORE calling the provider, atomically (SET NX EX + INCR in one MULTI), so
    // concurrent requests cannot all slip under the limit
    const generationsKey = `${TTS_GENERATIONS_PREFIX}:${req.params.tts_token}`;
    const [, generations] = await redisClient
      .multi()
      .set(generationsKey, 0, { NX: true, EX: TTS_TOKEN_TTL_IN_SECONDS })
      .incr(generationsKey)
      .exec();
    if (generations > MAX_GENERATIONS_PER_TOKEN) {
      throw new TooManyRequestsError('Too many generations with this TTS token.');
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
   * @apiBody {String} text The text to generate, 5000 characters at most
   *
   * @apiSuccessExample {binary} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "token": "ac365e90-78f1-482a-8afa-af326d5647a4",
   *   "url": "https://url_of_the_file"
   * }
   */
  // Runs before the monthly quota is spent (see routes.js): an invalid request does not spend it
  function validateTemporaryTokenRequest(req, res, next) {
    const { text } = req.body;
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_LENGTH) {
      throw new BadRequestError(`The text must be a string of 1 to ${MAX_TEXT_LENGTH} characters.`);
    }
    next();
  }

  async function getTemporaryToken(req, res, next) {
    const token = crypto.randomUUID();
    await redisClient.set(`${TTS_TOKEN_PREFIX}:${token}`, req.body.text, {
      EX: TTS_TOKEN_TTL_IN_SECONDS,
    });
    const url = `${process.env.GLADYS_PLUS_BACKEND_URL}/tts/${token}/generate.mp3`;
    res.json({ token, url });
  }

  return {
    generate,
    validateTemporaryTokenRequest,
    getTemporaryToken,
  };
};
