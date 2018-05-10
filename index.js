// Include it and extract some methods for convenience
const server = require('server');
const { get, post } = server.router;
const { status, json } = server.reply;
const Signal = require('./signal');

const PORT = process.env.PORT || 5000
const signalsCache = [];
module.exports = server({ security: { csrf: false }, port: PORT }, [
  get('/', ctx => 'Hello world'),
  post('/ping', ctx => {
    if(ctx.headers['user-agent'] !== 'CryptoPingAPI/0.1.0') {
      return status('400');
    }
    if(!ctx.data) {
      return status('400');
    }
    const signal = new Signal(ctx.data);
    signalsCache.push(signal);
    if(signalsCache.length >= 100) {
      signalsCache.shift();
    }
    return 'pong';
  }),
  get('/signals', ctx => {
    const result = signalsCache.map(signal => signal.prettyPrinted());
    return json(result);
  }),
  get('/signals/clear', ctx => {
    signalsCache.length = 0;
    return json('History has been cleared!');
  })
]);