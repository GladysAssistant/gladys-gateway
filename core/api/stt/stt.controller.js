const axios = require('axios');

module.exports = function STTController() {
  /**
   * @api {post} /stt Transcribe speech to text
   * @apiName transcribe
   * @apiGroup STT
   */
  async function transcribe(req, res) {
    const headers = {
      authorization: `Bearer ${process.env.SPEECH_TO_TEXT_API_KEY}`,
    };
    if (req.headers['content-type']) {
      headers['content-type'] = req.headers['content-type'];
    }
    const { data } = await axios.post(process.env.SPEECH_TO_TEXT_URL, req.body, {
      headers,
    });
    res.json(data);
  }

  return {
    transcribe,
  };
};
