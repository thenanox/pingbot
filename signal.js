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
     console.log('#'+this['ticker'], "EARLY:",this['early_factor'],"TREND:",this['trend_factor']);
     console.log(this['type'], "signal on", this['exchange']);
     if(this['type'] === 'up') {
      console.log("+"+ this['volume_pct_change']+"%,", "buy vol. incr. by", this['volume_btc_change']);
      console.log("+"+ this['price_pct_change']+"%,", "price:", this['price_btc']);
     } else {
      console.log("+"+ this['volume_pct_change']+"%,", "sell vol. incr. by", this['volume_btc_change']);
      console.log("-"+ this['price_pct_change']+"%,", "price:", this['price_btc']);;
     }
     console.log('Signals', this['count']+'/7d');
     console.log('Created at:', this['created_at']);
     console.log('With bitcoin value:', this['btc_usd']);
  }
}
