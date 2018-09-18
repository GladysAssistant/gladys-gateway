const jwt = require('jsonwebtoken');

module.exports = function() {

  function generateAccessToken(user, scope){
    return jwt.sign({ user_id: user.id, scope }, process.env.JWT_ACCESS_TOKEN_SECRET, {
      audience: 'user',
      issuer: 'gladys-gateway',
      expiresIn: 1*60*60 // refresh token is valid 1 hour
    });
  }

  function generateRefreshToken(user, scope, deviceId){
    return jwt.sign({ user_id: user.id, scope, device_id: deviceId }, process.env.JWT_REFRESH_TOKEN_SECRET, {
      audience: 'user',
      issuer: 'gladys-gateway',
      expiresIn: 30*24*60*60 // refresh token is valid 30 days
    });
  }

  return {
    generateAccessToken,
    generateRefreshToken
  };
};