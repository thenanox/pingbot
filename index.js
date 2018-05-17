// Include it and extract some methods for convenience
const server = require('server');
const { get, post, error } = server.router;
const { status, json } = server.reply;
require('dotenv').load();

const Signal = require('./signal');
const trader = require('./binance');

const PORT = process.env.PORT || 5000
const signalsCache = [];
const tradesCache = [];

trader.run();
module.exports = server({ security: { csrf: false }, port: PORT }, [
  get('/', ctx => 'Hello world'),
  post('/', async ctx => {
    console.log('headers', ctx.headers);
    if(ctx.headers['user-agent'] !== 'CryptoPingAPI/0.1.1') {
      return status('400');
    }
    console.log('body', ctx.data);
    if(!ctx.data) {
      return status('400');
    }
    const signal = new Signal(ctx.data);
    signalsCache.push(signal);
    if(signalsCache.length >= 100) {
      signalsCache.shift();
    }
    if(signal.type === 'up') {
      const result = await trader.open(signal);
      tradesCache.push(result);
    } else {
      trader.close(signal);
    }
    return 'pong';
  }),
  get('/signals', ctx => {
    const result = signalsCache.map(signal => signal.prettyPrinted());
    return json(result);
  }),
  get('/trades', ctx => {
    return json(tradesCache);
  }),
  get('/signals/clear', ctx => {
    signalsCache.length = 0;
    return json('History has been cleared!');
  }),
  error(ctx => status(500).send(ctx.error.message))
]);