const { expect } = require('chai');

const OpenAIModel = require('../../../../core/api/openai/openai.model');

describe('OpenAIModel.saveUsage', () => {
  it('should not throw when database insert fails', async () => {
    const errorsLogged = [];
    const logger = {
      error: (e) => errorsLogged.push(e),
    };
    const fakeDb = {
      t_ai_usage: {
        insert: async () => {
          throw new Error('database is down');
        },
      },
    };
    const openAIModel = OpenAIModel(logger, fakeDb, TEST_LEGACY_REDIS_CLIENT, null);
    await openAIModel.saveUsage({
      account_id: 'b2d23f66-487d-493f-8acb-9c8adb400def',
      instance_id: '0bc53f3c-1e11-40d3-99a4-bd392a666eaf',
      request_type: 'text',
    });
    expect(errorsLogged).to.have.lengthOf(2);
    expect(errorsLogged[0]).to.equal('OpenAI: Unable to save AI usage in database');
  });
});
