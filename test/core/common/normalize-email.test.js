const { expect } = require('chai');

const { normalizeEmail } = require('../../../core/common/normalize-email');

describe('normalizeEmail', () => {
  it('should trim and lowercase emails', () => {
    expect(normalizeEmail('Mixed.Case.User@Example.com')).to.equal('mixed.case.user@example.com');
    expect(normalizeEmail('  User@Example.COM  ')).to.equal('user@example.com');
    expect(normalizeEmail('already.lower@test.fr')).to.equal('already.lower@test.fr');
  });

  it('should return non-string values unchanged', () => {
    expect(normalizeEmail(null)).to.equal(null);
    expect(normalizeEmail(undefined)).to.equal(undefined);
    expect(normalizeEmail(42)).to.equal(42);
  });
});
