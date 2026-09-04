const { expect } = require('chai');
const beforeSendSentry = require('../../../core/service/beforeSendSentry');

describe('beforeSendSentry', () => {
  it('should strip credentials and location data wherever they appear', () => {
    const event = {
      request: {
        url: 'https://api.gladysgateway.com/users/login',
        data: { email: 'tony.stark@gladysassistant.com', password: 'secret', nested: { token: 'abc' } },
      },
      extra: { latitude: 48.8, longitude: 2.3, keep: 'me' },
    };
    const sent = beforeSendSentry(event);
    expect(sent.request.data).to.deep.equal({ email: 'tony.stark@gladysassistant.com', nested: {} });
    expect(sent.extra).to.deep.equal({ keep: 'me' });
  });

  it('should drop events raised on denied urls', () => {
    expect(beforeSendSentry({ request: { url: 'https://api.gladysgateway.com/instances/access-token' } })).to.equal(
      null,
    );
    expect(beforeSendSentry({ request: { url: 'https://api.gladysgateway.com/v1/api/owntracks/abc' } })).to.equal(null);
  });

  it('should keep events without a request', () => {
    expect(beforeSendSentry({ message: 'boom' })).to.deep.equal({ message: 'boom' });
  });
});
