const util = require('util');
const isProduction = process.env.NODE_ENV === 'production';

function errorHandler(err, req, res, next) {
  if (req.path.substring(0, 4) === '/api' && isProduction) {
    let errMessages = [
      '[!] API ERROR:',
      util.format('    %s %s', req.method, req.originalUrl),
      'Headers: ',
    ];

    for (let headerKey in req.headers) {
      let headerVal = req.headers[headerKey];
      errMessages.push(util.format('    %s: %s', headerKey, headerVal));
    }
    errMessages.push(util.format(err));
    console.error(errMessages.join('\n'));
  } else {
    console.error(err);
  }

  if (isProduction) {
    res.sendStatus(500);
  } else {
    res.status(500).send({ error: util.format(err) });
  }
}

process.on('unhandledRejection', function (reason, promise) {
  console.error(reason, promise);
});

module.exports = errorHandler;
