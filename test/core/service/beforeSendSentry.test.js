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
    expect(sent.request.data).to.deep.equal({ nested: {} });
    expect(sent.extra).to.deep.equal({ keep: 'me' });
  });

  it('should drop events raised on denied urls', () => {
    expect(beforeSendSentry({ request: { url: 'https://api.gladysgateway.com/instances/access-token' } })).to.equal(
      null,
    );
    expect(beforeSendSentry({ request: { url: 'https://api.gladysgateway.com/v1/api/owntracks/abc' } })).to.equal(null);
  });

  it('should match denied paths on the pathname only, not on the query string or host', () => {
    expect(
      beforeSendSentry({ request: { url: 'https://api.gladysgateway.com/users/login?next=/instances/access-token' } }),
    ).to.not.equal(null);
    expect(
      beforeSendSentry({ request: { url: 'https://instances.access-token.example.com/users/login' } }),
    ).to.not.equal(null);
    expect(beforeSendSentry({ request: { url: '/instances/access-token' } })).to.equal(null);
    expect(beforeSendSentry({ request: { url: 'not a url at all' } })).to.not.equal(null);
  });

  it('should keep the user id but never the email', () => {
    const event = { user: { id: 'user-id', email: 'tony.stark@gladysassistant.com' }, message: 'boom' };
    expect(beforeSendSentry(event)).to.deep.equal({ user: { id: 'user-id' }, message: 'boom' });
  });

  it('should keep events without a request', () => {
    expect(beforeSendSentry({ message: 'boom' })).to.deep.equal({ message: 'boom' });
  });
});
