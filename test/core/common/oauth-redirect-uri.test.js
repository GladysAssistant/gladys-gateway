const { expect } = require('chai');

const { isAllowedRedirectUri, buildRedirectUrl } = require('../../../core/common/oauth-redirect-uri');

const GOOGLE_ALLOWED = [
  'https://oauth-redirect.googleusercontent.com',
  'https://oauth-redirect-sandbox.googleusercontent.com',
];
const ALEXA_ALLOWED = ['https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV'];

describe('oauth-redirect-uri', () => {
  describe('isAllowedRedirectUri', () => {
    it('should accept any path when the allowed entry is an origin', () => {
      expect(
        isAllowedRedirectUri('https://oauth-redirect.googleusercontent.com/r/project-id', GOOGLE_ALLOWED),
      ).to.equal(true);
      expect(isAllowedRedirectUri('https://oauth-redirect-sandbox.googleusercontent.com', GOOGLE_ALLOWED)).to.equal(
        true,
      );
    });
    it('should require an exact path when the allowed entry has a path', () => {
      expect(isAllowedRedirectUri('https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUV', ALEXA_ALLOWED)).to.equal(
        true,
      );
      expect(
        isAllowedRedirectUri('https://pitangui.amazon.com/api/skill/link/M1CD0NOTQVDMUVX', ALEXA_ALLOWED),
      ).to.equal(false);
      expect(isAllowedRedirectUri('https://pitangui.amazon.com/api/skill/link/', ALEXA_ALLOWED)).to.equal(false);
    });
    it('should reject a host that only starts with the allowed host', () => {
      expect(
        isAllowedRedirectUri('https://oauth-redirect.googleusercontent.com.attacker.com/toto', GOOGLE_ALLOWED),
      ).to.equal(false);
      expect(isAllowedRedirectUri('https://oauth-redirect.googleusercontent.com:8443/toto', GOOGLE_ALLOWED)).to.equal(
        false,
      );
    });
    it('should reject credentials in the URL', () => {
      expect(
        isAllowedRedirectUri('https://oauth-redirect.googleusercontent.com@attacker.com/toto', GOOGLE_ALLOWED),
      ).to.equal(false);
    });
    it('should reject non https, invalid and non string values', () => {
      expect(isAllowedRedirectUri('http://oauth-redirect.googleusercontent.com/toto', GOOGLE_ALLOWED)).to.equal(false);
      expect(isAllowedRedirectUri('not-a-url', GOOGLE_ALLOWED)).to.equal(false);
      expect(isAllowedRedirectUri(undefined, GOOGLE_ALLOWED)).to.equal(false);
      expect(isAllowedRedirectUri({ startsWith: () => true }, GOOGLE_ALLOWED)).to.equal(false);
    });
  });

  describe('buildRedirectUrl', () => {
    it('should encode state and code as query parameters', () => {
      const url = new URL(
        buildRedirectUrl('https://oauth-redirect.googleusercontent.com/r/id', 'a b&c=d#e', 'the-code'),
      );
      expect(url.origin + url.pathname).to.equal('https://oauth-redirect.googleusercontent.com/r/id');
      expect(url.searchParams.get('state')).to.equal('a b&c=d#e');
      expect(url.searchParams.get('code')).to.equal('the-code');
    });
    it('should tolerate a missing state', () => {
      const url = new URL(buildRedirectUrl('https://oauth-redirect.googleusercontent.com/r/id', undefined, 'the-code'));
      expect(url.searchParams.get('state')).to.equal('');
    });
  });
});
