import fr from './translation.fr.json';
import en from './translation.en.json';

const TRANSLATION = {
  en,
  fr
};

const translate = (language, key) => {
  if (!TRANSLATION[language]) {
    language = 'en';
  }

  if (TRANSLATION[language][key]) {
    return TRANSLATION[language][key];
  }

  return key;
};


export default translate;