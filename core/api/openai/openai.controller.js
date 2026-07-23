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
    const startTime = Date.now();
    const { data } = await axios.post(process.env.OPEN_AI_ASK_API_URL, req.body, {
      headers: {
        authorization: `Bearer ${process.env.OPEN_AI_ASK_API_KEY}`,
      },
    });
    const responseTimeMs = Date.now() - startTime;
    const usage = data && data.usage ? data.usage : {};
    const firstChoice = data && data.choices && data.choices.length > 0 ? data.choices[0] : {};
    await openAIModel.saveUsage({
      account_id: req.accountId,
      instance_id: req.instance.id,
      request_type: req.aiRequestType,
      model: data && data.model ? data.model : null,
      prompt_tokens: usage.prompt_tokens !== undefined ? usage.prompt_tokens : null,
      completion_tokens: usage.completion_tokens !== undefined ? usage.completion_tokens : null,
      total_tokens: usage.total_tokens !== undefined ? usage.total_tokens : null,
      response_time_ms: responseTimeMs,
      finish_reason: firstChoice.finish_reason ? firstChoice.finish_reason : null,
      api_response_id: data && data.id ? data.id : null,
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
