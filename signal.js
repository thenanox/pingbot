module.exports = class Signal {
  constructor(json){
     this['btc_usd'] = json['btc_usd'];
     this['count'] = json['count'];
     this['created_at'] = json['created_at'];
     this['exchange'] = json['exchange'];
     this['price_btc'] = json['price_btc'];
     this['price_pct_change'] = json['price_pct_change'];
     this['ticker'] = json['ticker'];
     this['type'] = json['type'];
     this['volume_btc_change'] = json['volume_btc_change'];
     this['volume_pct_change'] = json['volume_pct_change'];
     this['early_factor'] = json['early_factor'];
     this['trend_factor'] = json['trend_factor'];
  }
  prettyPrint(){
     console.log('btc_usd', this['btc_usd']);
     console.log('count', this['count']);
     console.log('created_at', this['created_at']);
     console.log('exchange', this['exchange']);
     console.log('price_btc', this['price_btc']);
     console.log('price_pct_change', this['price_pct_change']);
     console.log('ticker', this['ticker']);
     console.log('type', this['type']);
     console.log('volume_btc_change', this['volume_btc_change']);
     console.log('volume_pct_change', this['volume_pct_change']);
     console.log('early_factor', this['early_factor']);
     console.log('trend_factor', this['trend_factor']);
  }
}
