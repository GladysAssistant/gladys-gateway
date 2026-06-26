const axios = require('axios');

module.exports = function OpenAIController(openAIModel) {
  /**
   * @api {post} /openai/ask Ask GPT-3 a question
   * @apiName Ask GPT-3
   * @apiGroup OpenAI
   *
   *
   * @apiParam {String} question The question to ask to GPT-3
   * @apiParam {Array} previous_questions An array of previous question/answer
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "type": "TURN_ON",
   *   "answer": "I turn on the light in the kitchen",
   *   "room": "kitchen"
   * }
   */
  async function ask(req, res, next) {
    const { data } = await axios.post(process.env.OPEN_AI_ASK_API_URL, req.body, {
      headers: {
        authorization: `Bearer ${process.env.OPEN_AI_ASK_API_KEY}`,
      },
    });
    res.json(data);
  }

  /**
   * @api {get} /openai/quota Get remaining OpenAI requests quota
   * @apiName Get OpenAI quota
   * @apiGroup OpenAI
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   *
   * {
   *   "text": {
   *     "remaining": 95,
   *     "max": 100,
   *     "reset_in_seconds": 2592000
   *   },
   *   "image": {
   *     "remaining": 100,
   *     "max": 50,
   *     "reset_in_seconds": 0
   *   }
   * }
   */
  async function getQuota(req, res, next) {
    const quota = await openAIModel.getQuota(req.instance);
    res.json(quota);
  }

  return {
    ask,
    getQuota,
  };
};
