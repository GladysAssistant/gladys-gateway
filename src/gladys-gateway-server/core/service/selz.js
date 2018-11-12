const axios = require('axios');

module.exports = function (logger) {
  
  function createDiscount(email) {
    
    if (!process.env.SELZ_TOKEN) {
      logger.info('Selz is not enabled, resolving');
      return Promise.resolve();
    }

    logger.info('Creating Selz Discount...');

    // Selz does not accept discount name bigger than 40
    var truncatedEmail = email.substring(0, 38);

    const options = {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' +  process.env.SELZ_TOKEN},
      data: {
        name: truncatedEmail,
        type: 'product',
        target_id: process.env.SELZ_PRODUCT_ID,
        minimum_value: '0.00',
        free_shipping: false,
        value_off: '0.00',
        percent_off: 100,
        currency_code: 'EUR',
        is_published: true,
        quantity: 1,
        valid_to: new Date(new Date().getTime() + 7*24*60*60*1000)
      },
      url: 'https://api.selz.com/discounts',
    };

    return axios(options)
      .catch((err) => {
        logger.warn('Unable to create Selz Discount');
        logger.warn(err);
      });
  }

  return {
    createDiscount
  };
};