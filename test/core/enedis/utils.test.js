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

module.exports = {
  mockAccessTokenRefresh,
};
