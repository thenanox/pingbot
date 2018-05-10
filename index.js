// Include it and extract some methods for convenience
const server = require('server');
const { get, post } = server.router;
const { status, json } = server.reply;
const Signal = require('./Signal');

module.exports = server({ security: { csrf: false }, port: 8080 }, [
  get('/', ctx => 'Hello world'),
  post('/ping', ctx => {
    if(ctx.headers['user-agent'] !== 'CryptoPingAPI/0.1.0') {
      return status('400');
    }
    if(!ctx.data) {
      return status('400');
    }
    const signal = new Signal(ctx.data);
    signal.prettyPrint();
    return 'pong';
  })
]);