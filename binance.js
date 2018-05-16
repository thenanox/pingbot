const binance = require('node-binance-api'),
_ = require('lodash'),
moment = require('moment'),
numeral = require('numeral');

const APIKEY = process.env.APIKEY;
const APISECRET = process.env.APISECRET;

// Default configuration options
const maxTrackedPairs = 1;
const depthLimit = 20;
const waitTime = 1000;			
const trading_fee = 0.05; 		// 0.1 normal, 0.05 BNB
const maxBTC = 0.2;
const paperTrade = true;

// Globals
let btcPrice = 0;

let bids = {};
let asks = {};
let diff = {};

let minute = {};
let hourly = {};

let tracked_pairs = []
let tracked_data = {}
let total_pnl = {}

let wallet = [];
let info = {};
let pairs = []

// Strategies
buying_up_trend = (pair) => {
	const ma_s = 3
	const ma_m = 13
	const ma_l = 99
	const ma_h_s = hourly[pair].slice(0,ma_s).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(hourly[pair].slice(0,ma_s).length)
	const ma_h_m = hourly[pair].slice(0,ma_m).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(hourly[pair].slice(0,ma_m).length)
	const ma_h_l = hourly[pair].slice(0,ma_l).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(hourly[pair].slice(0,ma_l).length)
	const ma_m_s = minute[pair].slice(0,ma_s).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(minute[pair].slice(0,ma_s).length)
	const ma_m_m = minute[pair].slice(0,ma_m).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(minute[pair].slice(0,ma_m).length)
	const ma_m_l = minute[pair].slice(0,ma_l).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(minute[pair].slice(0,ma_l).length)
	if ( (ma_h_s >= ma_h_m) && (ma_h_m >= ma_h_l) && (ma_m_s >= ma_m_m) && (ma_m_m >= ma_m_l) ) { 
		return "BUY"
	}
	else {
		return "SELL"
	}
}

buying_low_diff = (pair) => {
	const max_ask_bid_ratio = 3.0 	// asks/bids < max_ask_bid_ratio
	const min_depth_volume = 2.0  	// btc
	const max_diff = 0.003 	// pourcent(ask-bid/bid)
	if ( (parseFloat(bids[pair])>=(parseFloat(asks[pair])*max_ask_bid_ratio)) 
		&& (parseFloat(bids[pair])>=min_depth_volume) 
		&& (parseFloat(diff[pair])<=parseFloat(max_diff)) ) { 
		return "BUY"
	}
	else {
		return "SELL"
	}
}

test = (pair) => {
	const rand = Math.random();
	if(rand > 0.6) {
		return "BUY";
	} else if (rand < 0.6){
		return "SELL";
	}
}

let strategies = [ 
	{ name: "UP_TREND", condition: buying_up_trend }, 
	{ name: "LOW_diff", condition: buying_low_diff },
	{ name: "TEST", condition: test}
]

binance.options({ 'APIKEY': APIKEY, 'APISECRET': APISECRET, 'reconnect': true, test: paperTrade });

async function run() {
	console.log('## Trading initialization started ##')	
	await sleep(waitTime)
	info = await loadExchangeInfo();
	await sleep(waitTime)
	wallet = await loadWallet();
	console.log("This is your wallet son");
	console.log(wallet);
	await getUserData()
	await sleep(waitTime)	
	btcPrice = await BTCPrice()
	await sleep(waitTime)	
	pairs = await BTCPairs();
	pairs = pairs.slice(0, maxTrackedPairs) 
	await sleep(waitTime)
	await trackDepthData()
	await sleep(waitTime)
	await getHourlyPrevPrices()
	await sleep(waitTime)
	await trackMinutePrices()
	console.log('## Trading initialization complete ##')
}

sleep = (x) => {
	return new Promise(resolve => {
		setTimeout(() => { resolve(true) }, x )
	});
}

async function loadExchangeInfo() {
	return new Promise(resolve => {
		binance.exchangeInfo( (error, data) => {
			let info = {};
			const symbols = data.symbols.filter( symbol => symbol.symbol.endsWith('BTC'))
			for ( let obj of symbols ) {
				let filters = {status: obj.status};
				for ( let filter of obj.filters ) {
					if ( filter.filterType == "MIN_NOTIONAL" ) {
						filters.minNotional = filter.minNotional;
					} else if ( filter.filterType == "PRICE_FILTER" ) {
						filters.minPrice = filter.minPrice;
						filters.maxPrice = filter.maxPrice;
						filters.tickSize = filter.tickSize;
					} else if ( filter.filterType == "LOT_SIZE" ) {
						filters.stepSize = filter.stepSize;
						filters.minQty = filter.minQty;
						filters.maxQty = filter.maxQty;
					}
				}
				filters.baseAssetPrecision = obj.baseAssetPrecision;
				filters.quotePrecision = obj.quotePrecision;
				filters.orderTypes = obj.orderTypes;
				filters.icebergAllowed = obj.icebergAllowed;
				info[obj.symbol] = filters;
			}
			resolve(info);
		});
	});
}

async function loadWallet() {
	return new Promise(resolve => {
		binance.account( (error, account) => {
			resolve(account.balances.filter(balance => balance.free !== '0.00000000' || balance.locked !== '0.00000000'));
		})
	})
}

async function getUserData() {
	return new Promise(resolve => {
		binance.websockets.userData(balanceUpdate, executionUpdate);
		resolve(true)
	})
}

function balanceUpdate(data) {
	console.log("Balance Update");
	wallet.length = 0;
	for ( let obj of data.B ) {
		let { a:asset, f:available, l:onOrder } = obj;
		if ( available === "0.00000000" && onOrder === "0.00000000" ) continue;
		wallet.push({asset: asset, free: available, locked: onOrder})
	}
	console.log(wallet);
}

function executionUpdate(data) {
	let { x:executionType, s:symbol, p:price, q:quantity, S:side, o:orderType, i:orderId, X:orderStatus } = data;
	if ( executionType == "NEW" ) {
		if ( orderStatus == "REJECTED" ) {
			console.log("Order Failed! Reason: "+data.r);
		}
		console.log(symbol+" "+side+" "+orderType+" ORDER #"+orderId+" ("+orderStatus+")");
		console.log("..price: "+price+", quantity: "+quantity);
		return;
	}
	//NEW, CANCELED, REPLACED, REJECTED, TRADE, EXPIRED
	console.log(symbol+"\t"+side+" "+executionType+" "+orderType+" ORDER #"+orderId);
}

BTCPrice = () => {
	return new Promise(resolve => {
		binance.websockets.candlesticks(['BTCUSDT'], "1m", (candlesticks) => {
			let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlesticks;
			let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks;
			btcPrice = close
			resolve(btcPrice)
		})
	})
}

BTCPairs = () => {
	return new Promise(resolve => {
		binance.exchangeInfo((error, data) => {
			if (error) {
				console.log( error )
				resolve([])
			}
			if (data) {
				resolve( data.symbols.filter( pair => pair.symbol.endsWith('BTC') ).map(pair=>pair.symbol) )
			}
		})
	})
}

trackDepthPair = (pair) => {
	return new Promise(resolve => {
		console.log( pair + " > starting tracking depth data" )
		binance.websockets.depthCache([pair], (symbol, depth) => {
			var bids = binance.sortBids(depth.bids, depthLimit)
			var asks = binance.sortAsks(depth.asks, depthLimit)
			asks[pair] = _.sum(_.values(asks).slice(0,depthLimit))*binance.first(asks)
			bids[pair] = _.sum(_.values(bids).slice(0,depthLimit))*binance.first(bids)
			diff[pair] = 100 * (binance.first(asks) - binance.first(bids)) / (binance.first(bids))
			resolve(true)
		}, depthLimit);
	}, depthLimit)
}

async function trackDepthData() {
	for (var i = 0, len = pairs.length; i < len; i++) {
		var pair = pairs[i]
		await trackDepthPair(pair)
		await sleep(waitTime)
		console.log(pair + " > depth tracked a:" + numeral(asks[pair]).format("0.00") + " / b:" + numeral(bids[pair]).format("0.00") )
	}
}

getPairHourlyPrices = (pair) => {
	return new Promise(resolve => {
		binance.candlesticks(pair, "1h", (error, ticks, symbol) => {
			if (error) {
				console.log( symbol + " > hourly prices ERROR " + error )
				resolve(true)
			}
			if (ticks) {
				hourly[symbol] =  _.drop(_.reverse( ticks.map( tick => (tick[4]) ) ) ) 
				console.log( symbol + " > " + hourly[symbol].length + " hourly prices retrieved p:" + hourly[symbol][0])
				resolve(true)	
			}
		})
	})
}

async function getHourlyPrevPrices() {
	for (var i = 0, len = pairs.length; i < len; i++) {
		await getPairHourlyPrices(pairs[i])
		await sleep(waitTime)
	}
}

getPrevMinutePrices = (pair) => {
	return new Promise(resolve => {
		binance.candlesticks(pair, "1m", (error, ticks, symbol) => {
			if (error) {
				console.log( pair + " getPrevMinutePrices ERROR " + error )
				resolve(true)
			}
			if (ticks) {
				minute[symbol] = _.drop(_.reverse( ticks.map( tick => (tick[4]) ) ) )
				resolve(true)
			}
		})
	})
}

async function trackMinutePrices() {
	for (var i = 0, len = pairs.length; i < len; i++) {
		await getPrevMinutePrices(pairs[i])
		await sleep(waitTime)
		console.log(pairs[i] + " > " + minute[pairs[i]].length + " minute prices retrieved")
		await trackFutureMinutePrices(pairs[i])
		await sleep(waitTime)
		console.log(pairs[i] + " > future prices tracked.")
	}
}

trackFutureMinutePrices = (pair) => {
	return new Promise(resolve => {
		binance.websockets.candlesticks([pair], "1m", (candlesticks) => {
			let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlesticks
			let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks
			strategies.map( strat => {
				var tracked_index = _.findIndex(tracked_pairs, (o) => { return ( (o.strat === strat.name) && (o.symbol === pair) )})
				if ( tracked_index > -1) {
					tracked_data[symbol][strat.name].push({ 
						date: moment().format('h:mm:ss a'),
						price: close,
						asks: parseFloat(asks[symbol]),
						bids: parseFloat(bids[symbol]),
						diff: parseFloat(diff[symbol]),
					})
				}
			})
			if (isFinal) {
				minute[symbol].unshift(close)
				if ( (moment().format('m')%1 === 0) && (symbol==="ETHBTC") ) { 
					console.log("# " + moment().format('h:mm:ss') + " - new minute price added #") 
				}
				if ( moment().format('m')==='59' ){ 
					hourly[symbol].unshift(close) 
					if (symbol==="ETHBTC") { console.log("# " + moment().format('h:mm:ss') + " - new hourly price added #") }
				}
				strategies.map( strat => { 
					const stratResult = strat.condition(symbol);
					if (stratResult === "BUY") {
						var tracked_index = _.findIndex(tracked_pairs, (o) => { return ( (o.strat === strat.name) && (o.symbol === symbol) )})
						if ( tracked_index === -1 ) {
							console.log("# " + moment().format('h:mm:ss') + " :: " + symbol 
								+ " BUY :: " + strat.name + " :: "
								+ " A:" + numeral(asks[symbol]).format("0.00") 
								+ " B:" + numeral(bids[symbol]).format("0.00") 
								+ " C:" + close 
								+ " D:%" + numeral(diff[symbol]).format("0.000") 
								+ " https://www.binance.com/tradeDetail.html?symbol=" + symbol.slice(0, -3) + "_BTC")
							if ( typeof tracked_data[symbol] === 'undefined' ) {
								tracked_data[symbol] = {}
							}
							tracked_data[symbol][strat.name] = []
							tracked_pairs.push({ 
								symbol: symbol, 
								date: moment().format('MMMM Do YYYY, h:mm:ss a'),
								timestamp: Date.now(),
								price: close,
								volume: volume,
								usdvolume: volume*close*btcPrice,
								strat: strat.name
							})
						}
					} 
					if (stratResult === "SELL") {
						var tracked_index = _.findIndex(tracked_pairs, (o) => { return ( (o.strat === strat.name) && (o.symbol === symbol) )})
						if ( tracked_index > -1) {
							if ( typeof total_pnl[strat.name] === 'undefined' ) {
								total_pnl[strat.name] = []
							}
							total_pnl[strat.name].unshift({ 
								symbol: symbol, 
								date: moment().format('MMMM Do YYYY, h:mm:ss a'),
								timestamp: Date.now(),
								pnl: 100.00*(
									((parseFloat(close) - parseFloat(close)*trading_fee*0.01)-
									(parseFloat(tracked_pairs[tracked_index].price) + parseFloat(tracked_pairs[tracked_index].price)*trading_fee*0.01))
									/parseFloat(close))
							})
							console.log("# " + moment().format('h:mm:ss') + " :: " + symbol 
								+ " SELL :: " + strat.name + " :: "
								+ " max:%" + numeral(100.00*(parseFloat((_.maxBy(tracked_data[symbol][strat.name], 'price').price)/parseFloat(tracked_pairs[tracked_index].price))-1)).format("0.000") 
								+ " pnl:%" + numeral(total_pnl[strat.name][0].pnl).format("0.000") 
								+ " tpnl:%" + numeral(_.sumBy(total_pnl[strat.name], 'pnl')).format("0.000") 
								+ " ::  A:" + numeral(asks[symbol]).format("0.00") 
								+ " B:" + numeral(bids[symbol]).format("0.00") 
								+ " C:" + close 
								+ " D:%" + numeral(diff[symbol]).format("0.000") 
								+ " https://www.binance.com/tradeDetail.html?symbol=" + symbol.slice(0, -3) + "_BTC")
							tracked_pairs = tracked_pairs.filter(o => !( (o.strat === strat.name) && (o.symbol === symbol) ))
						}
					} 
				})
			}
		});
		resolve(true)
	})
}

function open(signal) {
	console.log('signal', signal)
	const pair = signal.ticker;
	const btc = wallet.filter( balance => balance.asset === 'BTC')[0];
	const quote = wallet.filter( balance => balance.asset === pair);
	console.log('btc', btc),
	console.log('pair', quote);
	if(quote.length > 0) {

	} else {
		//Obtain 
		const balance = numeral(btc.free);
		const defaultTrade = 0.02;		
		if(balance.value() > defaultTrade) { 
			// for now use 0.01 btc trades to test
			const price = signal.price_btc;
			const quantity = numeral(defaultTrade).divide(price).format("0")
			console.log('With 0.2 btc', quantity, price);
			//Risk reward 1/2
			binance.buy(pair+"BTC", quantity, price, {type:'LIMIT'}, (error, response) => {
				if(error) console.log('error', error.body)
				console.log("Limit Buy response", response);
				console.log("order id: " + response.orderId);
				const sub = numeral(price).multiply(0.025).value();
				console.log('sub', sub);
				const stopPrice = numeral(price).subtract(sub).value();
				console.log('stopPrice', stopPrice);
				binance.sell(pair+"BTC", quantity, price, {stopPrice: stopPrice, type:  "STOP_LOSS"}, (error, response) => {
					if(error) console.log('error', error.body)
					console.log("Stop loss response", response);
					console.log("order id: " + response.orderId);
					const add = numeral(price).multiply(0.05).value();
					console.log('add', add);
					const sellLimit = numeral(price).add(add).value();
					console.log('sellLimit', sellLimit);
					binance.sell(pair+"BTC", quantity, sellLimit, {type:'LIMIT'}, (error, response) => {
						if(error) console.log('error', error.body)
						console.log("Stop loss response", response);
						console.log("order id: " + response.orderId);
					});
				});				
			});
		}
	}
}

function close(signal) {

}

module.exports = {
	run: run,
	open: open,
	close: close
}