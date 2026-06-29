const { expect } = require('chai');

const { normalizeLanguage } = require('../../../core/common/language');

describe('normalizeLanguage', () => {
  it('should normalize supported locales', () => {
    expect(normalizeLanguage('fr')).to.equal('fr');
    expect(normalizeLanguage('fr-FR')).to.equal('fr');
    expect(normalizeLanguage('en')).to.equal('en');
    expect(normalizeLanguage('en-US')).to.equal('en');
  });

  it('should default unknown locales to fr', () => {
    expect(normalizeLanguage('auto')).to.equal('fr');
    expect(normalizeLanguage('de')).to.equal('fr');
    expect(normalizeLanguage('au')).to.equal('fr');
  });

  it('should use the provided default for empty values', () => {
    expect(normalizeLanguage(null, 'en')).to.equal('en');
    expect(normalizeLanguage(undefined, 'en')).to.equal('en');
    expect(normalizeLanguage('', 'en')).to.equal('en');
    expect(normalizeLanguage('   ', 'en')).to.equal('en');
  });
});
