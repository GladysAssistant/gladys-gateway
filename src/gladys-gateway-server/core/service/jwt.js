const jwt = require('jsonwebtoken');

module.exports = function JwtService() {
  function generateTwoFactorToken(user) {
    return jwt.sign({ user_id: user.id, scope: ['two-factor'] }, process.env.JWT_TWO_FACTOR_SECRET, {
      algorithm: 'HS256',
      issuer: 'gladys-gateway',
      expiresIn: 2 * 60, // two factor token is valid 2 minutes
    });
  }

  function generateAccessToken(user, scope) {
    return jwt.sign({ user_id: user.id, scope }, process.env.JWT_ACCESS_TOKEN_SECRET, {
      algorithm: 'HS256',
      audience: 'user',
      issuer: 'gladys-gateway',
      expiresIn: 1 * 60 * 60, // access token is valid 1 hour
    });
  }

  function generateRefreshToken(user, scope, deviceId, userAgentHash) {
    return jwt.sign(
      {
        user_id: user.id,
        scope,
        device_id: deviceId,
        fingerprint: userAgentHash,
      },
      process.env.JWT_REFRESH_TOKEN_SECRET,
      {
        algorithm: 'HS256',
        audience: 'user',
        issuer: 'gladys-gateway',
        expiresIn: 100 * 365 * 24 * 60 * 60, // refresh token basically never expires, they are invalidated server side
      },
    );
  }

  function generateAccessTokenOauth(user, scope, audience) {
    return jwt.sign({ user_id: user.id, scope }, process.env.JWT_ACCESS_TOKEN_SECRET, {
      algorithm: 'HS256',
      audience,
      issuer: 'gladys-gateway',
      expiresIn: 1 * 60 * 60, // access token is valid 1 hour
    });
  }

  function generateRefreshTokenOauth(user, scope, deviceId, audience) {
    return jwt.sign(
      {
        user_id: user.id,
        scope,
        device_id: deviceId,
      },
      process.env.JWT_REFRESH_TOKEN_SECRET,
      {
        algorithm: 'HS256',
        audience,
        issuer: 'gladys-gateway',
        expiresIn: 100 * 365 * 24 * 60 * 60, // refresh token basically never expires, they are invalidated server side
      },
    );
  }

  function generateRefreshTokenInstance(instance) {
    return jwt.sign({ instance_id: instance.id }, process.env.JWT_REFRESH_TOKEN_SECRET, {
      algorithm: 'HS256',
      audience: 'instance',
      issuer: 'gladys-gateway',
      // refresh token of instance basically never expires, they are invalidated server side
      expiresIn: 100 * 365 * 24 * 60 * 60,
    });
  }

  function generateAccessTokenInstance(instance) {
    return jwt.sign({ instance_id: instance.id }, process.env.JWT_ACCESS_TOKEN_SECRET, {
      algorithm: 'HS256',
      audience: 'instance',
      issuer: 'gladys-gateway',
      expiresIn: 1 * 60 * 60, // access token is valid 1 hour
    });
  }

  return {
    generateTwoFactorToken,
    generateAccessToken,
    generateRefreshToken,
    generateRefreshTokenInstance,
    generateAccessTokenInstance,
    generateAccessTokenOauth,
    generateRefreshTokenOauth,
  };
};
