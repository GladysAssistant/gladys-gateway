const nock = require('nock'); // eslint-disable-line

// intercepting mailgun API call so it's not really sent during tests
const mailgunNock = nock('https://api.mailgun.net:443') // eslint-disable-line no-unused-vars
  .persist()
  .filteringPath(path => '/')
  .post('/')
  .reply(200, {
    id: '',
    message: 'Queued. Thank you.',
  });
