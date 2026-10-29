const request = require('supertest');
const { expect } = require('chai');

function loginSalt(ip) {
  return request(TEST_BACKEND_APP)
    .post('/users/login-salt')
    .set('X-Forwarded-For', ip)
    .send({ email: 'unknown@gladysassistant.com' });
}

describe('IP rate limiters', () => {
  it('should share the rate limit of IPv6 addresses of the same /64', async () => {
    const first = await loginSalt('2001:db8::1');
    const second = await loginSalt('2001:0db8:0:0:abcd::2');
    expect(Number(second.headers['ratelimit-remaining'])).to.equal(Number(first.headers['ratelimit-remaining']) - 1);
  });

  it('should not share the rate limit of IPv6 addresses of different /64', async () => {
    const first = await loginSalt('2001:db8::1');
    const second = await loginSalt('2001:db8:0:1::1');
    expect(second.headers['ratelimit-remaining']).to.equal(first.headers['ratelimit-remaining']);
  });

  it('should share the rate limit of an IPv4 address and its IPv4-mapped IPv6 address', async () => {
    const first = await loginSalt('203.0.113.7');
    const second = await loginSalt('::ffff:203.0.113.7');
    expect(Number(second.headers['ratelimit-remaining'])).to.equal(Number(first.headers['ratelimit-remaining']) - 1);
  });

  it('should rate limit wrong admin api tokens per /64 for IPv6 clients', async () => {
    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(TEST_BACKEND_APP)
        .post('/admin/api/backups/purge')
        .set('X-Forwarded-For', `2001:db8:5::${i}`)
        .set('Authorization', 'wrong-token')
        .expect(401);
    }
    await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('X-Forwarded-For', '2001:db8:5::abcd')
      .set('Authorization', 'wrong-token')
      .expect(429);
    await request(TEST_BACKEND_APP)
      .post('/admin/api/backups/purge')
      .set('X-Forwarded-For', '2001:db8:6::1')
      .set('Authorization', 'wrong-token')
      .expect(401);
  });
});
