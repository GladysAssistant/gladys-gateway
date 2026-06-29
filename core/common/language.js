const SUPPORTED_LANGUAGES = ['en', 'fr'];

function normalizeLanguage(language, defaultLanguage = 'fr') {
  if (!language || typeof language !== 'string' || !language.trim()) {
    return defaultLanguage;
  }

  const code = language.trim().toLowerCase().slice(0, 2);
  if (SUPPORTED_LANGUAGES.includes(code)) {
    return code;
  }

  return defaultLanguage;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
};
