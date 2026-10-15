const { expect } = require('chai');
const GladysUsage = require('../../../core/middleware/gladysUsage');

function createMiddleware() {
  const inserted = [];
  const db = {
    t_gladys_usage: {
      insert: async (row) => {
        inserted.push(row);
      },
    },
  };
  const logger = { warn: () => {} };
  return { middleware: GladysUsage(logger, db), inserted };
}

function createReq(userAgent) {
  return {
    ip: '127.0.0.1',
    headers: userAgent === undefined ? {} : { 'user-agent': userAgent },
    query: {},
    body: { client_id: '1a8bd5df-050b-480b-af63-0c7eeaf55fb4', system: 'linux' },
  };
}

describe('gladysUsage middleware', () => {
  it('should record a usage point for a Gladys instance', () => {
    const { middleware, inserted } = createMiddleware();
    let nextCalled = false;
    middleware(createReq('Gladys/v5.2.0'), {}, () => {
      nextCalled = true;
    });
    expect(nextCalled).to.equal(true);
    expect(inserted).to.have.lengthOf(1);
    expect(inserted[0]).to.include({
      client_id: '1a8bd5df-050b-480b-af63-0c7eeaf55fb4',
      user_agent: 'Gladys/v5.2.0',
      event_type: 'get-gladys-version',
      system: 'linux',
    });
  });
  it('should not record a usage point for a crawler', () => {
    const { middleware, inserted } = createMiddleware();
    let nextCalled = false;
    middleware(createReq('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'), {}, () => {
      nextCalled = true;
    });
    expect(nextCalled).to.equal(true);
    expect(inserted).to.have.lengthOf(0);
  });
  it('should not record a usage point without user agent', () => {
    const { middleware, inserted } = createMiddleware();
    let nextCalled = false;
    middleware(createReq(undefined), {}, () => {
      nextCalled = true;
    });
    expect(nextCalled).to.equal(true);
    expect(inserted).to.have.lengthOf(0);
  });
});
