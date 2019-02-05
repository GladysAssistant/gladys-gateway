const srpFixture = require('./srp-fixture.json');

module.exports = function initRedis(redisClient) {
  function clean() {
    return redisClient.FLUSHALLAsync();
  }

  function fill() {
    return redisClient.multi()
      .set(`login_session:2b2aa099-4323-44e8-bb07-0b9b55dbe1dc`, JSON.stringify({
        serverEphemeral: srpFixture.serverEphemeral,
        user: {
          id: 'bdb1a902-a65e-46f9-8c2a-5c09840e2e10',
          email: srpFixture.username,
          srp_salt: srpFixture.salt,
          srp_verifier: srpFixture.verifier,
          two_factor_enabled: false,
        },
        clientEphemeralPublic: srpFixture.clientEphemeral.public,
      }))
      .execAsync();
  }

  return {
    clean,
    fill,
  };
};
