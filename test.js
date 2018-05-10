const request = require('supertest');
const server = require('./index.js');

const launch = async (ctx) => {
  const port = Math.round(Math.random() * 10000 + 1000);
  // const port = 3000;
  console.log("Port:", port);
  ctx = await ctx;
  await new Promise((resolve) => ctx.server.close(resolve));
  await new Promise(resolve => setTimeout(resolve, 1000));
  await new Promise((resolve) => {
    ctx.server.listen(port, resolve)
  });
  return ctx;
};

const mockData = {
  "btc_usd": 14101.1,
  "count": 1,
  "created_at": "2018-01-12T11:47:42Z+00:00",
  "exchange": "poloniex",
  "price_btc": 4.022e-05,
  "price_pct_change": -0.000263778,
  "ticker": "TICKR",
  "type": "down",
  "volume_btc_change": 2.013723252,
  "volume_pct_change": 1.332458710,
  "early_factor": 0.25,
  "trend_factor": 0.07
};

const wrongData = {
  "btc_usd": 14101.1,
  "count": "stringcount",
  "created_at": "2018-01-12T11:47:42Z+00:00",
  "exchange": "poloniex",
  "price_btc": 4.022e-05,
  "price_pct_change": -0.000263778,
  "ticker": "TICKR",
  "type": "down",
  "volume_btc_change": 2.013723252,
  "volume_pct_change": 1.332458710,
  "early_factor": 0.25,
  "trend_factor": 0.07
};

describe('Ping server', () => {
  describe('Homepage', () => {;
    it('renders the homepage', async () => {
      const ctx = await launch(server);
      return request(ctx.app)
        .get('/')
        .expect(200)
        .then(response => {
          expect(response.text).toMatch("Hello world");
        });
    });
  });

  describe('Headers', () => {
    it('send correct headers', async () => {
      const ctx = await launch(server);
      return request(ctx.app)
        .post('/ping')
        .set('Content-Type','application/json')
        .set('User-Agent','CryptoPingAPI/0.1.0')
        .send(mockData)
        .expect(200)
        .then(response => {
          expect(response.text).toMatch("pong");
        });
    });
    it('send incorrect headers', async () => {
      const ctx = await launch(server);
      return request(ctx.app)
        .post('/ping')
        .set('Content-Type','application/json')
        .set('User-Agent','FakeAgent')
        .send(mockData)
        .expect(400);
    });
  });

  describe('Body', () => {
    it('send correct data', async () => {
      const ctx = await launch(server);
      return request(ctx.app)
        .post('/ping')
        .set('Content-Type','application/json')
        .set('User-Agent','CryptoPingAPI/0.1.0')
        .send(mockData)
        .expect(200)
        .then(response => {
          expect(response.text).toMatch("pong");
        });
    });
  });
});

