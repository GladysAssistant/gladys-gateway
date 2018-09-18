const nock = require('nock');

// intercepting mailgun API call so it's not really sent during tests

var mailgunNock = nock('https://api.mailgun.net:443') // eslint-disable-line no-unused-vars
  .filteringPath((path) => '/')
  .post('/')
  .reply(200, {
    id: '',
    message: 'Queued. Thank you.'
  });