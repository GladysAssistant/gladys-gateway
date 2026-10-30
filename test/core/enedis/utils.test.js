const crypto = require('crypto');
const nock = require('nock');

const mockAccessTokenRefresh = (status = 200) => {
  nock(`https://${process.env.ENEDIS_BACKEND_URL}`)
    .post('/oauth2/v3/token', (body) => {
      const grandTypeValid = body.grant_type === 'client_credentials';
      const clientIdValid = body.client_id === process.env.ENEDIS_GRANT_CLIENT_ID;
      const clientSecretValid = body.client_secret === process.env.ENEDIS_GRANT_CLIENT_SECRET;
      return grandTypeValid && clientIdValid && clientSecretValid;
    })
    .reply(status, {
      access_token: 'ba42fe5a-0eaa-11e5-9813-4dd05b3a25f3',
      token_type: 'Bearer',
      expires_in: 12600,
      refresh_token: '7dnCbf8P0ypCyxbnX7tUKjcSveE2Nu8w',
      scope: '/v3/metering_data/consumption_load_curve.GET',
      issued_at: '1487075532179',
      refresh_token_issued_at: '1487075532179',
      apigo_client_id: '73cd2d7f-e361-b7f6-48359493ed2c',
    });
};

// Links meters (PRM) to the account of the test user, like a consent given on Enedis does
// (POST /enedis/finalize exchanges the autorisation_id of the consent for its meters)
const linkEnedisUsagePoints = async (
  usagePointsIds,
  userId = 'a139e4a6-ec6c-442d-9730-0499155d38d4',
  accountId = 'b2d23f66-487d-493f-8acb-9c8adb400def',
) => {
  await TEST_DATABASE_INSTANCE.t_device.update(
    { client_id: process.env.ENEDIS_GRANT_CLIENT_ID, user_id: userId, revoked: false, is_deleted: false },
    { revoked: true, is_deleted: true },
  );
  await TEST_DATABASE_INSTANCE.t_device.insert({
    id: crypto.randomUUID(),
    name: 'Enedis',
    client_id: process.env.ENEDIS_GRANT_CLIENT_ID,
    user_id: userId,
  });
  // eslint-disable-next-line no-restricted-syntax
  for (const usagePointId of usagePointsIds) {
    // eslint-disable-next-line no-await-in-loop
    await TEST_DATABASE_INSTANCE.t_enedis_usage_point.insert(
      { account_id: accountId, usage_point_id: usagePointId },
      { onConflict: { target: ['usage_point_id'], action: 'ignore' } },
    );
  }
};

module.exports = {
  mockAccessTokenRefresh,
  linkEnedisUsagePoints,
};
