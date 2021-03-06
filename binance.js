const binance = require('node-binance-api'),
_ = require('lodash'),
moment = require('moment'),
numeral = require('numeral'),
math = require('mathjs');

const APIKEY = process.env.APIKEY;
const APISECRET = process.env.APISECRET;

// Default configuration options
const maxTrackedPairs = 1;
const depthLimit = 20;
const waitTime = 1000;			
const trading_fee = 0.05; 		// 0.1 normal, 0.05 BNB
const maxBTC = 0.2;
const paperTrade = true;
const reward = 0.04;					// percentage for sell limit
const risk = 0.02							// percentage for stop loss

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

test = (pair) => {
	const rand = Math.random();
	if(rand > 0.6) {
		return false;
	} else if (rand < 0.6){
		return true;
	}
}

let sellStrategies = [ 
	{ name: "TEST", condition: test}
]

binance.options({ 'APIKEY': APIKEY, 'APISECRET': APISECRET, 'reconnect': true, useServerTime: true, test: paperTrade });

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
						filters.minPrice = parseInt(filter.minPrice);
						filters.maxPrice = parseInt(filter.maxPrice);
						filters.tickSize = filter.tickSize;
					} else if ( filter.filterType == "LOT_SIZE" ) {
						filters.stepSize = filter.stepSize;
						filters.minQty = parseInt(filter.minQty);
						filters.maxQty = parseInt(filter.maxQty);
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
			resolve(account.balances.filter(balance => balance.free !== '0.00000000' || balance.locked !== '0.00000000')
				.map(balance => {balance.free = parseFloat(balance.free); balance.locked = parseFloat(balance.locked); return balance;}));
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
			sellStrategies.map( strat => {
				var tracked_index = _.findIndex(tracked_pairs, (o) => o.symbol === pair);
				if ( tracked_index > -1) {
					tracked_data[symbol].push({ 
						date: moment().format('h:mm:ss a'),
						price: close,
						volume: volume,
						accumulatedVolume: accumulatedVolume + volume,
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
				sellStrategies.map( strat => { 
					if (strat.condition(symbol)) {
						var tracked_index = _.findIndex(tracked_pairs, (o) => o.symbol === symbol)
						if ( tracked_index > -1) {
							console.log('Symbol', symbol);
							console.log('data', JSON.stringify(tracked_data[symbol],null,2));
							tracked_data[symbol].length = -1;
							tracked_pairs = tracked_pairs.filter(o => !(o.symbol === symbol))
						}
					} 
				})
			}
		});
		resolve(true)
	})
}

function open(signal) {
	return new Promise(resolve => {
		const result = {};
		const pair = signal.ticker;
		result.pair = pair;
		if(wallet.length === 0) {
			throw new Error("Wallet still not prepared");
		}
		const btc = wallet.filter( balance => balance.asset === 'BTC')[0];
		const quote = wallet.filter( balance => balance.asset === pair);
		//Check price is not so much lower
		//Check volume against day
		if(quote.length > 0) {

		} else {
			//Obtain 
			if(btc.free > 0.02) { 
				const {quantity:quantity, price:price} = calculateCoinInfo(info[pair+"BTC"], signal);
				console.log('Buy', pair, quantity, price);
				//Risk reward 1/2
				binance.buy(pair+"BTC", quantity, price, {type:'LIMIT'}, (error, response) => {
					if(error) console.log('error', error.body)				
					console.log("Limit Buy response", response);
					console.log("order id: " + response.orderId);
					const buyOrder = response.orderId;
					result.buy = price;
					const sub = math.round(price * risk, 8);
					const sell = math.round(price * (risk+0.01), 8);
					const stopPrice = checkPrice(info[pair+"BTC"], math.subtract(price,sub));
					const sellPrice = checkPrice(info[pair+"BTC"], math.subtract(price,sell));
					console.log('Stop loss', pair, stopPrice, sellPrice);
					binance.sell(pair+"BTC", quantity, sellPrice, {stopPrice: stopPrice, type: "STOP_LOSS_LIMIT"}, (error, response) => {
						if(error) console.log('error', error.body)
						console.log("Stop loss response", response);
						console.log("order id: " + response.orderId);
						const riskOrder = response.orderId;
						result.risk = stopPrice;
						const add = math.round(price * reward, 8);
						const sellLimit = checkPrice(info[pair+"BTC"], math.sum(price,add));
						console.log('Sell limit', pair, sellLimit);
						binance.sell(pair+"BTC", quantity, sellLimit, {type:'LIMIT'}, (error, response) => {
							if(error) console.log('error', error.body)
							console.log("Stop loss response", response);
							console.log("order id: " + response.orderId);
							const rewardOrder = response.orderId;
							result.reward = sellLimit;
							tracked_pairs.push({ 
								symbol: pair+"BTC", 
								date: moment().format('MMMM Do YYYY, h:mm:ss a'),
								timestamp: Date.now(),
								quantity: quantity,
								buy: price,
								buyOrder: buyOrder,
								stop: stopPrice,
								risk: sellPrice,
								riskOrder: riskOrder,
								reward: sellLimit,
								rewardOrder: rewardOrder
							});
							resolve(result);
						});
					});				
				});
			}
		}
	});
}

function calculateCoinInfo(info, signal) {
	const price = checkPrice(info, signal.price_btc);
	const quantity = checkQuantity(info, signal.price_btc);
	checkMinNotional(info, price, quantity);
	return {price:price, quantity:quantity};
}

function checkPrice(info, price) {
	const roundedPrice = binance.roundStep(price, info.tickSize);
	if(roundedPrice >= info.minPrice && roundedPrice <= info.maxPrice && math.mod(math.subtract(roundedPrice,info.minPrice), info.tickSize) < info.tickSize) {
		return roundedPrice;
	} else {
		throw new Error("Not valid price");
	}
}

function checkQuantity(info, price) {
	let quantity;
	if(info.stepSize !== 1) {
		quantity = binance.roundStep(0.02 / price, info.stepSize);
	} else {
		quantity = math.round(0.02 / price, 0);
	}
	if(quantity >= info.minQty && quantity <= info.maxQty && math.mod(math.subtract(quantity,info.minQty), info.stepSize) < info.stepSize) {
		return quantity;
	} else {
		throw new Error("Not valid quantity");
	}
}

function checkMinNotional(info, minPrice, minQty) {
	if(minPrice * minQty < info.minNotional) {
		throw new Error("Not valid transaction");
	}
}

function close(signal) {

}

module.exports = {
	run: run,
	open: open,
	close: close
}
