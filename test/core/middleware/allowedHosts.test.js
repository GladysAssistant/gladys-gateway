const express = require('express');
const request = require('supertest');
const { expect } = require('chai');

const AllowedHostsMiddleware = require('../../../core/middleware/allowedHosts');

const logger = { debug: () => {} };

// The test backend runs without ALLOWED_HOSTS, so the middleware is tested on a minimal app
function createApp(allowedHosts) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(AllowedHostsMiddleware(logger, allowedHosts));
  app.get('/ping', (req, res) => res.json({ status: 200 }));
  app.get('/users/me', (req, res) => res.json({ ok: true }));
  // an error raised by the middleware would end up here (and in Sentry in production)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: 'error middleware' }));
  return app;
}

describe('allowedHosts middleware', () => {
  const app = createApp(['api.gladysgateway.com']);

  it('should let an allowed host through', async () => {
    const response = await request(app).get('/users/me').set('Host', 'api.gladysgateway.com').expect(200);
    expect(response.body).to.deep.equal({ ok: true });
  });

  it('should answer 421 with an empty body to an unknown host', async () => {
    const response = await request(app).get('/users/me').set('Host', 'random.example.com').expect(421);
    expect(response.text).to.equal('');
  });

  it('should answer 421 to an unknown route of an unknown host', async () => {
    const response = await request(app).get('/wp-login.php').set('Host', 'random.example.com').expect(421);
    expect(response.text).to.equal('');
  });

  it('should not trust X-Forwarded-Host', async () => {
    await request(app)
      .get('/users/me')
      .set('Host', 'random.example.com')
      .set('X-Forwarded-Host', 'api.gladysgateway.com')
      .expect(421);
  });

  // The load balancer health check calls /ping with the IP of the server as Host:
  // rejecting it would take the whole API down
  it('should always let /ping through, whatever the Host', async () => {
    const response = await request(app).get('/ping').set('Host', '10.0.0.1').expect(200);
    expect(response.body).to.deep.equal({ status: 200 });
    await request(app).get('/ping?check=1').set('Host', 'random.example.com').expect(200);
  });

  it('should let everything through when the filter is disabled', async () => {
    const disabledApp = createApp([]);
    await request(disabledApp).get('/users/me').set('Host', 'random.example.com').expect(200);
    await request(disabledApp).get('/ping').set('Host', '10.0.0.1').expect(200);
  });
});
