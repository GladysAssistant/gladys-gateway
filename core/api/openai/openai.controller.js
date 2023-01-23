const axios = require('axios');

module.exports = function OpenAIController() {
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

  return {
    ask,
  };
};
