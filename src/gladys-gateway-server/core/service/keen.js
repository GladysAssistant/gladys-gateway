const axios = require('axios');

module.exports = function keen(logger) {

  function track(eventName, data) {

    // only save event if environnement variables are defined
    if(process.env.KEEN_IO_PROJECT_ID && process.env.KEEN_IO_WRITE_KEY) {
      
      const options = {
        method: 'POST',
        data: data,
        url: `https://api.keen.io/3.0/projects/${process.env.KEEN_IO_PROJECT_ID}/events/${eventName}?api_key=${process.env.KEEN_IO_WRITE_KEY}`,
      };
  
      return axios(options)
        .catch(() => {
          logger.warn('Unable to save keen event');
        });
    }
  }

  return {
    track
  };
};

