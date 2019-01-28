var WebCrypto = require('node-webcrypto-ossl');
var should = require('should'); // eslint-disable-line no-unused-vars
var webcrypto = new WebCrypto();
//var nock = require('nock');
const speakeasy = require('speakeasy');

//nock.recorder.rec();
require('dotenv').config();

describe('loginInstance', function () {
  it.skip('should return refresh_token', async function () {
    
    var gladysGatewayClient = require('../index')({
      cryptoLib: webcrypto,
      serverUrl: process.env.GLADYS_GATEWAY_API_URL
    });

    var password = 'test1234';

    var loginResult = await gladysGatewayClient.login('tony.stark@gladysassistant.com', password);

    if(!loginResult.two_factor_token) {
      return Promise.reject(new Error('2FA_NOT_ENABLED'));
    }

    var twoFactorCode = speakeasy.totp({
      secret: 'OROVAL3WOBEC6W3VGV5VI3KKKB4CQSCGLZ2TOSTLK46F4KSEGBOQ'
    });

    console.log(twoFactorCode);

    var gladysInstance = await gladysGatewayClient.loginInstance(loginResult.two_factor_token, twoFactorCode);

    should.equal(gladysInstance, null);

    //var createdInstance = await gladysGatewayClient.createInstance('Gladys Instance');

    createdInstance.should.have.property('instance');
    createdInstance.instance.should.have.property('refresh_token');
    createdInstance.instance.should.have.property('access_token');
    createdInstance.should.have.property('rsaPrivateKeyJwk');
    createdInstance.should.have.property('ecdsaPrivateKeyJwk');
  });
});