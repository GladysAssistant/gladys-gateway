const express = require('express');

const templates = require('./email');

const app = express();

app.get('/:template_name/:language', (req, res) => {
  res.send(
    templates[req.params.template_name][req.params.language].ejs({
      confirmationUrlGladys4: 'http://gladysassistant.com',
    }),
  );
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
