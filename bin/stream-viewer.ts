#!/usr/bin/env bun
/**
 * Real-time streaming viewer — candlestick chart + L2 depth + time & sales.
 *
 * Usage: bun bin/stream-viewer.ts [symbol] [--port 8080]
 */

import { RobinhoodClient } from "../src/client/client.js";
import { DxLinkClient } from "../src/client/streaming/dxlink-client.js";
import { DxLinkFeed } from "../src/client/streaming/feed.js";
import { OrderBook } from "../src/client/streaming/order-book.js";
import { StreamingAuth } from "../src/client/streaming/streaming-auth.js";

const args = process.argv.slice(2);
let currentSymbol = (args.find((a) => !a.startsWith("-")) ?? "SPY").toUpperCase();
let currentInterval = "5m";
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 8080;

/** Maps UI timeframe to REST API {interval, span} for historical fetch. */
const TF_TO_REST: Record<string, { interval: string; span: string }> = {
  "1m": { interval: "5minute", span: "day" },
  "2m": { interval: "5minute", span: "day" },
  "5m": { interval: "5minute", span: "day" },
  "30m": { interval: "hour", span: "week" },
  "1h": { interval: "hour", span: "month" },
  "1d": { interval: "day", span: "year" },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface TradePoint {
  price: number;
  size: number;
  time: number;
  direction: string;
}
interface QuoteData {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  time: number;
}

const state = {
  candles: [] as CandleData[],
  lastTrade: null as {
    price: number;
    size: number;
    change: number;
    tickDirection: string;
  } | null,
  quote: null as QuoteData | null,
  book: new OrderBook(currentSymbol, 100),
  tradeHistory: [] as TradePoint[],
};

const sseClients = new Set<ReadableStreamDefaultController>();
function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) {
    try {
      c.enqueue(new TextEncoder().encode(msg));
    } catch {
      sseClients.delete(c);
    }
  }
}

// ---------------------------------------------------------------------------
// Connect & subscribe
// ---------------------------------------------------------------------------

console.log(`Streaming ${currentSymbol} — authenticating...`);
const client = new RobinhoodClient();
await client.restoreSession();
console.log("Authenticated.");

const auth = new StreamingAuth(client._session);
const tokenData = await auth.fetchToken();
const dxClient = new DxLinkClient();
dxClient.on("close", () => console.error("WebSocket closed"));
dxClient.on("error", (e) => console.error("WebSocket error:", e.message));

const accessToken = client._session.getAuthTokenForRevocation();
await dxClient.connect(tokenData.wss_url, tokenData.token, {
  headers: { Authorization: `Bearer ${accessToken}`, Origin: "https://robinhood.com" },
});
console.log("dxLink connected.");

const feed = new DxLinkFeed(dxClient);

// --- Named callbacks (reference currentSymbol, which is mutable) ---

function handleTrade(e: Record<string, unknown>) {
  if (e.eventSymbol !== currentSymbol) return;
  const price = Number(e.price);
  if (!price || price <= 0) return;
  state.lastTrade = {
    price,
    size: Number(e.size),
    change: Number(e.change),
    tickDirection: String(e.tickDirection ?? ""),
  };
  const pt: TradePoint = {
    price,
    size: state.lastTrade.size,
    time: Date.now(),
    direction: state.lastTrade.tickDirection,
  };
  state.tradeHistory.push(pt);
  if (state.tradeHistory.length > 500) state.tradeHistory.shift();
  broadcast("trade", { ...state.lastTrade, t: pt.time });
}

const tradeCb = (evts: Array<Record<string, unknown>>) => evts.forEach(handleTrade);
const quoteCb = (evts: Array<Record<string, unknown>>) => {
  for (const e of evts) {
    if (e.eventSymbol !== currentSymbol) continue;
    state.quote = {
      bidPrice: Number(e.bidPrice),
      bidSize: Number(e.bidSize),
      askPrice: Number(e.askPrice),
      askSize: Number(e.askSize),
      time: Date.now(),
    };
    broadcast("quote", state.quote);
  }
};
const candleCb = (evts: Array<Record<string, unknown>>) => {
  for (const e of evts) {
    const c: CandleData = {
      time: Number(e.time ?? e.eventTime ?? 0),
      open: Number(e.open),
      high: Number(e.high),
      low: Number(e.low),
      close: Number(e.close),
      volume: Number(e.volume),
    };
    if (!c.open || !c.time) continue;
    const idx = state.candles.findIndex((x) => x.time === c.time);
    if (idx >= 0) {
      state.candles[idx] = c;
    } else {
      state.candles.push(c);
      state.candles.sort((a, b) => a.time - b.time);
      if (state.candles.length > 10000) state.candles.shift();
    }
  }
  broadcast("candles", state.candles);
};
const orderCb = (evts: Array<Record<string, unknown>>) => {
  for (const e of evts) {
    if (e.eventSymbol !== currentSymbol) continue;
    state.book.processEvent(e);
  }
};

function candleSym(sym: string, tf?: string) {
  return `${sym}{=${tf ?? currentInterval},tho=false,a=m}`;
}

async function subscribeSymbol(sym: string) {
  await feed.subscribe("Trade", [sym], tradeCb);
  await feed.subscribe("TradeETH", [sym], tradeCb);
  await feed.subscribe("Quote", [sym], quoteCb);
  await feed.subscribe("Candle", [candleSym(sym)], candleCb);
  await feed.subscribe("Order", [sym], orderCb);
  console.log(`Subscribed to Trade, TradeETH, Quote, Candle, Order for ${sym}`);
}

function unsubscribeSymbol(sym: string) {
  feed.removeCallback("Trade", tradeCb);
  feed.removeCallback("TradeETH", tradeCb);
  feed.removeCallback("Quote", quoteCb);
  feed.removeCallback("Candle", candleCb);
  feed.removeCallback("Order", orderCb);
  feed.unsubscribe("Trade", [sym]);
  feed.unsubscribe("TradeETH", [sym]);
  feed.unsubscribe("Quote", [sym]);
  feed.unsubscribe("Candle", [candleSym(sym)]);
  feed.unsubscribe("Order", [sym]);
}

async function loadHistory(sym: string) {
  try {
    const rest = TF_TO_REST[currentInterval] ?? { interval: "5minute", span: "day" };
    const hist = await client.getStockHistoricals(sym, {
      interval: rest.interval,
      span: rest.span,
      bounds: "regular",
    });
    const items = hist?.[0]?.historicals;
    if (!items) return;
    let added = 0;
    for (const h of items) {
      const c: CandleData = {
        time: new Date(h.begins_at).getTime(),
        open: Number(h.open_price),
        high: Number(h.high_price),
        low: Number(h.low_price),
        close: Number(h.close_price),
        volume: h.volume ?? 0,
      };
      if (!c.open || !c.time) continue;
      const idx = state.candles.findIndex((x) => x.time === c.time);
      if (idx < 0) {
        state.candles.push(c);
        added++;
      }
    }
    if (added > 0) {
      state.candles.sort((a, b) => a.time - b.time);
      broadcast("candles", state.candles);
    }
    console.log(`Loaded ${added} historical candles for ${sym} (${rest.interval}/${rest.span})`);
  } catch (e) {
    console.error("History fetch error:", e);
  }
}

async function switchSymbol(newSym: string) {
  if (newSym === currentSymbol) return;
  const oldSym = currentSymbol;
  unsubscribeSymbol(oldSym);
  currentSymbol = newSym;
  state.candles = [];
  state.lastTrade = null;
  state.quote = null;
  state.tradeHistory = [];
  state.book = new OrderBook(currentSymbol, 100);
  await subscribeSymbol(currentSymbol);
  await loadHistory(currentSymbol);
  broadcast("symbolChanged", { symbol: currentSymbol, interval: currentInterval });
}

async function switchInterval(newTf: string) {
  if (newTf === currentInterval) return;
  // Unsubscribe old candle subscription
  feed.removeCallback("Candle", candleCb);
  feed.unsubscribe("Candle", [candleSym(currentSymbol)]);
  currentInterval = newTf;
  state.candles = [];
  // Subscribe new candle subscription
  await feed.subscribe("Candle", [candleSym(currentSymbol)], candleCb);
  await loadHistory(currentSymbol);
  broadcast("intervalChanged", { interval: currentInterval });
  console.log(`Switched to ${currentInterval} candles`);
}

await subscribeSymbol(currentSymbol);
await loadHistory(currentSymbol);

// ---------------------------------------------------------------------------
// L2 price-level aggregation
// ---------------------------------------------------------------------------

function getBucketSize(price: number): number {
  if (price < 1) return 0.001;
  if (price < 10) return 0.01;
  if (price < 50) return 0.02;
  if (price < 200) return 0.05;
  if (price < 500) return 0.1;
  if (price < 1000) return 0.1;
  return 0.25;
}

function aggregateLevels(
  levels: { price: number; size: number }[],
  bucketSize: number,
  side: "bid" | "ask",
): { price: number; size: number }[] {
  const buckets = new Map<number, number>();
  for (const l of levels) {
    // Bids round down, asks round up (bucket toward spread)
    const key =
      side === "bid"
        ? Math.floor(l.price / bucketSize) * bucketSize
        : Math.ceil(l.price / bucketSize) * bucketSize;
    buckets.set(key, (buckets.get(key) ?? 0) + l.size);
  }
  const result = [...buckets.entries()].map(([price, size]) => ({ price, size }));
  return side === "bid"
    ? result.sort((a, b) => b.price - a.price)
    : result.sort((a, b) => a.price - b.price);
}

// Broadcast book at 4Hz
setInterval(() => {
  const snap = state.book.getSnapshot(500);
  if (snap.eventCount > 0) {
    const midPrice = snap.midpoint ?? snap.bids[0]?.price ?? snap.asks[0]?.price ?? 0;
    const bucket = getBucketSize(midPrice);
    broadcast("book", {
      bids: aggregateLevels(snap.bids, bucket, "bid"),
      asks: aggregateLevels(snap.asks, bucket, "ask"),
      spread: snap.spread,
      midpoint: snap.midpoint,
      eventCount: snap.eventCount,
    });
  }
}, 250);

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function getHTML() {
  return /* html */ `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${currentSymbol} Live</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0c;color:#ccc;font-family:'SF Mono','Fira Code',monospace;font-size:12px;overflow:hidden}
.hdr{display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #1a1a1e;background:#0e0e12}
.sym-btn{display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 10px;border-radius:4px;border:none;background:transparent;transition:background 0.15s}
.sym-btn:hover{background:#1a1a1e}
.sym-btn .icon{color:#555;font-size:12px}
.sym-btn .sym{font-size:16px;font-weight:700;color:#fff;font-family:inherit}
.px{font-size:22px;font-weight:700}
.px.up{color:#00c853}.px.dn{color:#ff1744}.px.flat{color:#ccc}
.chg{font-size:12px}.chg.up{color:#00c853}.chg.dn{color:#ff1744}
.ohlcv{font-size:11px;color:#888;margin-left:12px;display:flex;gap:8px}
.ohlcv .lbl{color:#555}.ohlcv .o{color:#00c853}.ohlcv .h{color:#00c853}.ohlcv .l{color:#ff1744}.ohlcv .c{color:#fff}.ohlcv .v{color:#00c853}
.meta{margin-left:auto;font-size:10px;color:#444;display:flex;gap:14px}
.wrap{display:flex;height:calc(100vh - 40px)}
.chart-area{flex:1;position:relative;min-width:0}
canvas{position:absolute;top:0;left:0;width:100%;height:100%}
.side{width:280px;border-left:1px solid #1a1a1e;display:flex;flex-direction:column;overflow:hidden}
.ptitle{padding:5px 8px;font-size:9px;text-transform:uppercase;color:#444;letter-spacing:1px;border-bottom:1px solid #141418;background:#0e0e12}
.book{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.bside{flex:1;display:flex;flex-direction:column;overflow:hidden}
.bside.asks{justify-content:flex-end}
.brow{display:flex;align-items:center;height:18px;position:relative;padding:0 8px;font-size:11px}
.brow .bar{position:absolute;top:0;bottom:0;opacity:0.12}
.brow.bid .bar{right:0;background:#00c853}
.brow.ask .bar{right:0;background:#ff1744}
.brow .pc{width:64px;text-align:right;z-index:1;font-weight:600}
.brow.bid .pc{color:#00c853}.brow.ask .pc{color:#ff1744}
.brow .sc{flex:1;text-align:right;z-index:1;color:#666}
.bsp{text-align:center;padding:3px;color:#444;font-size:10px;border-top:1px solid #141418;border-bottom:1px solid #141418;background:#0a0a0c}
.st{padding:2px 8px;font-size:9px;color:#333;border-top:1px solid #141418}
.st.on{color:#00c853}
.tf-bar{display:flex;gap:2px;margin-left:4px}
.tf{background:#1a1a1e;border:1px solid #2a2a2e;color:#888;font-size:11px;font-family:inherit;padding:2px 8px;border-radius:3px;cursor:pointer;transition:all 0.12s}
.tf:hover{background:#252528;color:#ccc}
.tf.active{background:#00c853;color:#0a0a0c;border-color:#00c853;font-weight:600}
.l2-toggle{margin-left:8px}
.hdr-quote{display:flex;align-items:center;gap:6px;font-size:11px;margin-left:8px}
.hdr-quote .b{color:#00c853}.hdr-quote .a{color:#ff1744}
.hdr-quote .sep{color:#333;font-size:10px}
.search-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100;justify-content:center;padding-top:80px}
.search-overlay.open{display:flex}
.search-box{width:480px;background:#1a1a1e;border-radius:12px;border:1px solid #2a2a2e;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.5)}
.search-header{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #2a2a2e}
.search-header .icon{color:#666;font-size:16px;margin-right:10px}
.search-input{flex:1;background:none;border:none;color:#fff;font-size:16px;font-family:inherit;outline:none}
.search-input::placeholder{color:#555}
.search-close{background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}
.search-close:hover{color:#fff;background:#2a2a2e}
.search-results{max-height:360px;overflow-y:auto}
.search-row{display:flex;align-items:center;padding:10px 16px;cursor:pointer;transition:background 0.1s}
.search-row:hover,.search-row.active{background:#252528}
.search-row .ticker{font-weight:700;color:#fff;width:72px;font-size:14px}
.search-row .name{color:#666;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.search-empty{padding:20px 16px;color:#444;text-align:center;font-size:13px}
</style></head><body>
<div class="hdr">
<button class="sym-btn" id="symBtn"><span class="icon">&#x1F50D;</span><span class="sym" id="symLabel">${currentSymbol}</span></button>
<div class="tf-bar" id="tfBar">
<button class="tf" data-tf="1m">1m</button>
<button class="tf" data-tf="2m">2m</button>
<button class="tf active" data-tf="5m">5m</button>
<button class="tf" data-tf="30m">30m</button>
<button class="tf" data-tf="1h">1H</button>
<button class="tf" data-tf="1d">1D</button>
</div>
<span class="hdr-quote"><span class="b" id="hBid">Bid —</span><span class="sep">|</span><span class="a" id="hAsk">Ask —</span></span>
<span class="px flat" id="lp">—</span>
<span class="chg" id="chg"></span>
<div class="ohlcv" id="ohlcv"></div>
<div class="meta"><span id="si"></span><span id="tc">0 trades</span><button class="tf l2-toggle active" id="l2Toggle">L2</button></div>
</div>
<div class="wrap">
<div class="chart-area"><canvas id="cv"></canvas></div>
<div class="side">
<div class="ptitle">L2 Order Book</div>
<div class="book">
<div class="bside asks" id="asks"></div>
<div class="bsp" id="bsp">—</div>
<div class="bside bids" id="bids"></div>
</div>
<div class="st" id="st">Connecting...</div>
</div>
</div>
<div class="search-overlay" id="searchOverlay">
<div class="search-box">
<div class="search-header">
<span class="icon">&#x1F50D;</span>
<input class="search-input" id="searchInput" type="text" placeholder="Search symbol..." autocomplete="off" spellcheck="false">
<button class="search-close" id="searchClose">&times;</button>
</div>
<div class="search-results" id="searchResults"><div class="search-empty">Type to search</div></div>
</div>
</div>
<script>
const f=(n,d=2)=>Number(n).toFixed(d);
const fS=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n));
const fT=t=>new Date(t).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});

let candles=[];
let bookData=null;
let tradeCount=0;
let lastQuote=null;
let showL2Overlay=true;

// Viewport state
const vp={
  scrollOffset:0,
  candleWidth:8,
  candleGap:2,
  minCandleWidth:2,
  maxCandleWidth:40,
  priceMin:null,
  priceMax:null,
  priceAutoFit:true,
  atLiveEdge:true,
  isDragging:false,
  dragMode:null,
  dragStart:{x:0,y:0},
  dragStartVp:{scrollOffset:0,priceMin:0,priceMax:0},
  mouseX:-1,
  mouseY:-1,
  hoveredCandleIndex:-1,
};

// Canvas
const cv=document.getElementById('cv');
const ctx=cv.getContext('2d');
let W,H;
function resize(){
  const r=devicePixelRatio||1;
  const rc=cv.parentElement.getBoundingClientRect();
  W=rc.width;H=rc.height;
  cv.width=W*r;cv.height=H*r;
  ctx.setTransform(r,0,0,r,0,0);
}
addEventListener('resize',resize);resize();

const GREEN='#00c853',RED='#ff1744',WICK='#666',BG='#0a0a0c';
const pad={t:10,b:28,l:0,r:72};

// --- Coordinate transforms ---
function getVisibleRange(){
  const chartW=W-pad.l-pad.r;
  const step=vp.candleWidth+vp.candleGap;
  const maxVisible=Math.floor(chartW/step);
  const total=candles.length;
  const endIndex=Math.min(total,total-Math.round(vp.scrollOffset));
  const startIndex=Math.max(0,endIndex-maxVisible);
  return {startIndex:startIndex,endIndex:endIndex,maxVisible:maxVisible,step:step};
}

function computePriceRange(vis){
  if(!vp.priceAutoFit&&vp.priceMin!==null&&vp.priceMax!==null){
    return {pMin:vp.priceMin,pMax:vp.priceMax};
  }
  var pMin=Infinity,pMax=-Infinity;
  for(var i=0;i<vis.length;i++){pMin=Math.min(pMin,vis[i].low);pMax=Math.max(pMax,vis[i].high)}
  if(bookData){
    for(var j=0;j<Math.min(bookData.bids.length,15);j++)pMin=Math.min(pMin,bookData.bids[j].price);
    for(var k=0;k<Math.min(bookData.asks.length,15);k++)pMax=Math.max(pMax,bookData.asks[k].price);
  }
  var pp=Math.max((pMax-pMin)*0.08,0.1);
  pMin-=pp;pMax+=pp;
  return {pMin:pMin,pMax:pMax};
}

function yFromPrice(p,pMin,pMax,priceH){
  return pad.t+(1-(p-pMin)/(pMax-pMin))*priceH;
}

function priceFromY(py,pMin,pMax,priceH){
  return pMax-(py-pad.t)/priceH*(pMax-pMin);
}

function indexFromX(px,range){
  var chartW=W-pad.l-pad.r;
  var totalW=range.step*(range.endIndex-range.startIndex);
  var offsetX=pad.l+chartW-totalW;
  return Math.floor((px-offsetX)/range.step)+range.startIndex;
}

function draw(){
  ctx.fillStyle=BG;ctx.fillRect(0,0,W,H);

  var range=getVisibleRange();
  var vis=candles.slice(range.startIndex,range.endIndex);

  if(vis.length<2){ctx.fillStyle='#333';ctx.font='13px monospace';ctx.textAlign='center';ctx.fillText('Waiting for candle data...',W/2,H/2);return}

  var cw=W-pad.l-pad.r;
  var ch=H-pad.t-pad.b;
  var volH=ch*0.15;
  var priceH=ch-volH;
  var n=vis.length;
  var barW=vp.candleWidth;
  var gap=vp.candleGap;
  var totalW=(barW+gap)*n;
  var offsetX=pad.l+cw-totalW;

  var pr=computePriceRange(vis);
  var pMin=pr.pMin,pMax=pr.pMax;

  var maxVol=1;
  for(var vi=0;vi<vis.length;vi++){var vol=vis[vi].volume||0;if(vol>maxVol)maxVol=vol}
  var yP=function(p){return yFromPrice(p,pMin,pMax,priceH)};
  var yV=function(v,base){return base-(v/maxVol)*volH};
  var volBase=pad.t+priceH+volH;

  // Grid
  ctx.strokeStyle='#141418';ctx.lineWidth=1;
  ctx.font='9px monospace';ctx.fillStyle='#444';ctx.textAlign='right';
  var pStep=niceStep(pMax-pMin,8);
  for(var p=Math.ceil(pMin/pStep)*pStep;p<=pMax;p+=pStep){
    var gy=yP(p);
    ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(W-pad.r,gy);ctx.stroke();
    ctx.fillText(f(p),W-pad.r+66,gy+3);
  }
  // Time labels
  ctx.textAlign='center';ctx.fillStyle='#333';
  var labelInterval=Math.max(Math.floor(n/6),1);
  for(var ti=0;ti<n;ti+=labelInterval){
    var tc=vis[ti];if(!tc)continue;
    var tx=offsetX+ti*(barW+gap)+barW/2;
    ctx.fillText(fT(tc.time),tx,H-pad.b+14);
  }

  // L2 depth overlay (Order book data only, no BBO quote injection)
  if(showL2Overlay&&bookData){
    var bidLevels=[],askLevels=[];
    for(var bi=0;bi<bookData.bids.length;bi++){var bl=bookData.bids[bi];if(bl.size>0)bidLevels.push({price:bl.price,size:bl.size})}
    for(var ai=0;ai<bookData.asks.length;ai++){var al=bookData.asks[ai];if(al.size>0)askLevels.push({price:al.price,size:al.size})}
    bidLevels.sort(function(a,b){return b.price-a.price});
    askLevels.sort(function(a,b){return a.price-b.price});

    var dMax=1;
    for(var di=0;di<bidLevels.length;di++){if(bidLevels[di].size>dMax)dMax=bidLevels[di].size}
    for(var dj=0;dj<askLevels.length;dj++){if(askLevels[dj].size>dMax)dMax=askLevels[dj].size}
    var maxBarW=cw*0.30;

    for(var bdi=0;bdi<Math.min(bidLevels.length,40);bdi++){
      var bdl=bidLevels[bdi];var bdy=yP(bdl.price);
      if(bdy<pad.t||bdy>pad.t+priceH)continue;
      var bdw=bdl.size/dMax*maxBarW;
      ctx.fillStyle=bdi===0?'rgba(76,175,80,0.45)':'rgba(76,175,80,0.25)';
      ctx.fillRect(W-pad.r-bdw,bdy-2,bdw,4);
    }
    for(var adi=0;adi<Math.min(askLevels.length,40);adi++){
      var adl=askLevels[adi];var ady=yP(adl.price);
      if(ady<pad.t||ady>pad.t+priceH)continue;
      var adw=adl.size/dMax*maxBarW;
      ctx.fillStyle=adi===0?'rgba(183,110,60,0.45)':'rgba(183,110,60,0.25)';
      ctx.fillRect(W-pad.r-adw,ady-2,adw,4);
    }
  }

  // Volume bars
  for(var vbi=0;vbi<n;vbi++){
    var vc=vis[vbi];
    var vx=offsetX+vbi*(barW+gap);
    var vUp=vc.close>=vc.open;
    ctx.globalAlpha=0.35;
    ctx.fillStyle=vUp?GREEN:RED;
    var vTop=yV(vc.volume||0,volBase);
    ctx.fillRect(vx,vTop,barW,volBase-vTop);
    ctx.globalAlpha=1;
  }

  // Separator
  ctx.strokeStyle='#1a1a1e';
  ctx.beginPath();ctx.moveTo(pad.l,pad.t+priceH);ctx.lineTo(W-pad.r,pad.t+priceH);ctx.stroke();

  // Candlesticks
  for(var ci=0;ci<n;ci++){
    var cc=vis[ci];
    var cx=offsetX+ci*(barW+gap);
    var cmid=cx+barW/2;
    var cUp=cc.close>=cc.open;
    var bodyTop=yP(Math.max(cc.open,cc.close));
    var bodyBot=yP(Math.min(cc.open,cc.close));
    var bodyH=Math.max(bodyBot-bodyTop,1);

    ctx.strokeStyle=cUp?GREEN:RED;
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cmid,yP(cc.high));ctx.lineTo(cmid,yP(cc.low));ctx.stroke();

    ctx.fillStyle=cUp?GREEN:RED;
    if(bodyH<=2){
      ctx.fillRect(cx,bodyTop,barW,bodyH);
    }else{
      if(cUp){
        ctx.strokeStyle=GREEN;ctx.lineWidth=1;
        ctx.strokeRect(cx+0.5,bodyTop+0.5,barW-1,bodyH-1);
        ctx.fillStyle=BG;
        ctx.fillRect(cx+1,bodyTop+1,barW-2,bodyH-2);
      }else{
        ctx.fillRect(cx,bodyTop,barW,bodyH);
      }
    }
  }

  // Current price line + label
  if(vis.length>0){
    var last=vis[vis.length-1];
    var ly=yP(last.close);
    var lUp=last.close>=last.open;
    ctx.setLineDash([2,2]);
    ctx.strokeStyle=lUp?'rgba(0,200,83,0.5)':'rgba(255,23,68,0.5)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,ly);ctx.lineTo(W-pad.r,ly);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=lUp?GREEN:RED;
    ctx.fillRect(W-pad.r,ly-8,pad.r,16);
    ctx.fillStyle=BG;
    ctx.font='bold 10px monospace';ctx.textAlign='left';
    ctx.fillText(f(last.close),W-pad.r+3,ly+4);
  }

  // Crosshair
  if(vp.mouseX>=pad.l&&vp.mouseX<=W-pad.r&&vp.mouseY>=pad.t&&vp.mouseY<=H-pad.b&&!vp.isDragging){
    ctx.save();
    ctx.setLineDash([3,3]);
    ctx.strokeStyle='rgba(255,255,255,0.2)';
    ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(vp.mouseX,pad.t);ctx.lineTo(vp.mouseX,H-pad.b);ctx.stroke();
    ctx.beginPath();ctx.moveTo(pad.l,vp.mouseY);ctx.lineTo(W-pad.r,vp.mouseY);ctx.stroke();
    ctx.setLineDash([]);

    var cursorPrice=priceFromY(vp.mouseY,pMin,pMax,priceH);
    ctx.fillStyle='#2a2a2e';
    ctx.fillRect(W-pad.r,vp.mouseY-8,pad.r,16);
    ctx.fillStyle='#ccc';
    ctx.font='9px monospace';ctx.textAlign='left';
    ctx.fillText(f(cursorPrice),W-pad.r+3,vp.mouseY+3);

    var hoverIdx=indexFromX(vp.mouseX,range);
    if(hoverIdx>=range.startIndex&&hoverIdx<range.endIndex){
      vp.hoveredCandleIndex=hoverIdx;
      var hc=candles[hoverIdx];
      if(hc){
        var timeStr=fT(hc.time);
        ctx.font='9px monospace';
        var tw=ctx.measureText(timeStr).width+8;
        ctx.fillStyle='#2a2a2e';
        ctx.fillRect(vp.mouseX-tw/2,H-pad.b,tw,16);
        ctx.fillStyle='#ccc';ctx.textAlign='center';
        ctx.fillText(timeStr,vp.mouseX,H-pad.b+11);
      }
    }else{
      vp.hoveredCandleIndex=-1;
    }
    ctx.restore();
  }else if(!vp.isDragging){
    vp.hoveredCandleIndex=-1;
  }

  // Scroll to live button
  if(!vp.atLiveEdge){
    var bx=W-pad.r-42,by=H-pad.b-30;
    ctx.fillStyle='rgba(0,200,83,0.12)';
    ctx.fillRect(bx,by,36,22);
    ctx.strokeStyle='rgba(0,200,83,0.4)';
    ctx.lineWidth=1;
    ctx.strokeRect(bx,by,36,22);
    ctx.fillStyle='#00c853';
    ctx.font='bold 11px monospace';ctx.textAlign='center';
    ctx.fillText('>>',bx+18,by+15);
  }

  // OHLCV display
  var ohlcvCandle=(vp.hoveredCandleIndex>=0&&vp.hoveredCandleIndex<candles.length)?candles[vp.hoveredCandleIndex]:vis[vis.length-1];
  if(ohlcvCandle){
    var oc=ohlcvCandle;
    var ocUp=oc.close>=oc.open;
    document.getElementById('ohlcv').innerHTML=
      '<span><span class="lbl">O</span> <span class="'+(ocUp?'o':'l')+'">'+f(oc.open)+'</span></span>'+
      '<span><span class="lbl">H</span> <span class="h">'+f(oc.high)+'</span></span>'+
      '<span><span class="lbl">L</span> <span class="l">'+f(oc.low)+'</span></span>'+
      '<span><span class="lbl">C</span> <span class="c">'+f(oc.close)+'</span></span>'+
      '<span><span class="lbl">V</span> <span class="v">'+fS(oc.volume)+'</span></span>';
  }
}

function niceStep(range,ticks){
  var raw=range/ticks;var mag=Math.pow(10,Math.floor(Math.log10(raw)));
  var n=raw/mag;return(n<1.5?1:n<3.5?2:n<7.5?5:10)*mag;
}

// --- Event handlers ---
function zoomAtCursor(cursorX,deltaY){
  var range=getVisibleRange();
  var cursorFraction=(cursorX-pad.l)/(W-pad.l-pad.r);
  var cursorCandleIdx=indexFromX(cursorX,range);
  var zoomFactor=deltaY>0?1.1:0.9;
  var newWidth=Math.max(vp.minCandleWidth,Math.min(vp.maxCandleWidth,vp.candleWidth/zoomFactor));
  if(Math.abs(newWidth-vp.candleWidth)<0.01)return;
  vp.candleWidth=newWidth;
  vp.candleGap=Math.max(1,Math.round(newWidth*0.2));
  var newStep=vp.candleWidth+vp.candleGap;
  var newMaxVis=Math.floor((W-pad.l-pad.r)/newStep);
  var newEndIdx=cursorCandleIdx+Math.round((1-cursorFraction)*newMaxVis);
  vp.scrollOffset=Math.max(0,candles.length-newEndIdx);
  vp.atLiveEdge=vp.scrollOffset<0.5;
  if(vp.atLiveEdge)vp.scrollOffset=0;
}

cv.addEventListener('wheel',function(e){
  e.preventDefault();
  var x=e.offsetX;
  // Wheel over price axis → zoom price scale
  if(x>W-pad.r){
    var range=getVisibleRange();
    var vis=candles.slice(range.startIndex,range.endIndex);
    if(vis.length<2)return;
    var pr=computePriceRange(vis);
    if(vp.priceAutoFit){vp.priceAutoFit=false;vp.priceMin=pr.pMin;vp.priceMax=pr.pMax}
    var center=(vp.priceMin+vp.priceMax)/2;
    var half=(vp.priceMax-vp.priceMin)/2;
    var sf=e.deltaY>0?1.05:0.95;
    vp.priceMin=center-half*sf;
    vp.priceMax=center+half*sf;
    return;
  }
  // Shift+wheel → horizontal scroll
  if(e.shiftKey){
    var delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
    var range=getVisibleRange();
    var candlesDelta=-delta/range.step;
    vp.scrollOffset=Math.max(0,Math.min(candles.length-5,vp.scrollOffset+candlesDelta));
    vp.atLiveEdge=vp.scrollOffset<0.5;
    if(vp.atLiveEdge)vp.scrollOffset=0;
    return;
  }
  // Default: zoom at cursor (TradingView style)
  zoomAtCursor(x,e.deltaY);
},{passive:false});

cv.addEventListener('mousedown',function(e){
  var x=e.offsetX,y=e.offsetY;
  if(!vp.atLiveEdge){
    var bx=W-pad.r-42,by=H-pad.b-30;
    if(x>=bx&&x<=bx+36&&y>=by&&y<=by+22){
      vp.scrollOffset=0;vp.atLiveEdge=true;return;
    }
  }
  vp.isDragging=true;
  vp.dragStart={x:x,y:y};
  if(x>W-pad.r){
    vp.dragMode='priceScale';
    var range=getVisibleRange();
    var vis=candles.slice(range.startIndex,range.endIndex);
    var pr=computePriceRange(vis);
    vp.dragStartVp={scrollOffset:vp.scrollOffset,priceMin:pr.pMin,priceMax:pr.pMax};
    vp.priceAutoFit=false;
    vp.priceMin=pr.pMin;vp.priceMax=pr.pMax;
  }else{
    vp.dragMode='pan';
    vp.dragStartVp={scrollOffset:vp.scrollOffset,priceMin:vp.priceMin,priceMax:vp.priceMax};
  }
  cv.style.cursor=vp.dragMode==='priceScale'?'ns-resize':'grabbing';
});

cv.addEventListener('mousemove',function(e){
  var x=e.offsetX,y=e.offsetY;
  vp.mouseX=x;vp.mouseY=y;
  if(!vp.isDragging){
    cv.style.cursor=x>W-pad.r?'ns-resize':'crosshair';
    return;
  }
  var dx=x-vp.dragStart.x;
  var dy=y-vp.dragStart.y;
  if(vp.dragMode==='pan'){
    var range=getVisibleRange();
    var candlesDelta=dx/range.step;
    vp.scrollOffset=Math.max(0,Math.min(candles.length-5,vp.dragStartVp.scrollOffset+candlesDelta));
    vp.atLiveEdge=vp.scrollOffset<0.5;
    if(vp.atLiveEdge)vp.scrollOffset=0;
    if(!vp.priceAutoFit&&vp.dragStartVp.priceMin!=null&&vp.dragStartVp.priceMax!=null){
      var ch=H-pad.t-pad.b;
      var priceH=ch-ch*0.15;
      var priceRange=vp.dragStartVp.priceMax-vp.dragStartVp.priceMin;
      var priceDelta=(dy/priceH)*priceRange;
      vp.priceMin=vp.dragStartVp.priceMin+priceDelta;
      vp.priceMax=vp.dragStartVp.priceMax+priceDelta;
    }
  }else if(vp.dragMode==='priceScale'){
    var center=(vp.dragStartVp.priceMin+vp.dragStartVp.priceMax)/2;
    var halfRange=(vp.dragStartVp.priceMax-vp.dragStartVp.priceMin)/2;
    var scaleFactor=Math.exp(dy*0.005);
    vp.priceMin=center-halfRange*scaleFactor;
    vp.priceMax=center+halfRange*scaleFactor;
  }
});

cv.addEventListener('mouseup',function(){
  vp.isDragging=false;vp.dragMode=null;
  cv.style.cursor='crosshair';
});

cv.addEventListener('mouseleave',function(){
  vp.mouseX=-1;vp.mouseY=-1;
  if(vp.isDragging){vp.isDragging=false;vp.dragMode=null;}
});

cv.addEventListener('dblclick',function(e){
  if(e.offsetX>W-pad.r){
    vp.priceAutoFit=true;vp.priceMin=null;vp.priceMax=null;
  }
});

// Touch support
var lastTouchDist=0;
cv.addEventListener('touchstart',function(e){
  if(e.touches.length===2){
    e.preventDefault();
    var t1=e.touches[0],t2=e.touches[1];
    lastTouchDist=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
  }else if(e.touches.length===1){
    vp.isDragging=true;vp.dragMode='pan';
    var t=e.touches[0];
    vp.dragStart={x:t.clientX,y:t.clientY};
    vp.dragStartVp={scrollOffset:vp.scrollOffset,priceMin:vp.priceMin,priceMax:vp.priceMax};
  }
},{passive:false});

cv.addEventListener('touchmove',function(e){
  e.preventDefault();
  if(e.touches.length===2){
    var t1=e.touches[0],t2=e.touches[1];
    var dist=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
    var mid=(t1.clientX+t2.clientX)/2;
    var rect=cv.getBoundingClientRect();
    zoomAtCursor(mid-rect.left,dist<lastTouchDist?30:-30);
    lastTouchDist=dist;
  }else if(e.touches.length===1&&vp.isDragging){
    var t=e.touches[0];
    var dx=t.clientX-vp.dragStart.x;
    var range=getVisibleRange();
    var candlesDelta=dx/range.step;
    vp.scrollOffset=Math.max(0,Math.min(candles.length-5,vp.dragStartVp.scrollOffset+candlesDelta));
    vp.atLiveEdge=vp.scrollOffset<0.5;
    if(vp.atLiveEdge)vp.scrollOffset=0;
  }
},{passive:false});

cv.addEventListener('touchend',function(){
  vp.isDragging=false;vp.dragMode=null;
});

// SSE
const es=new EventSource('/stream');
document.getElementById('st').className='st on';
document.getElementById('st').textContent='Connected';
es.onerror=()=>{document.getElementById('st').className='st';document.getElementById('st').textContent='Reconnecting...'};
es.onopen=()=>{document.getElementById('st').className='st on';document.getElementById('st').textContent='Connected'};

es.addEventListener('trade',(e)=>{
  const t=JSON.parse(e.data);tradeCount++;
  const el=document.getElementById('lp');el.textContent=f(t.price);
  const up=t.tickDirection?.includes('UP'),dn=t.tickDirection?.includes('DOWN');
  el.className='px '+(up?'up':dn?'dn':'flat');
  const s=t.change>=0?'+':'';
  const ce=document.getElementById('chg');ce.textContent=s+f(t.change)+' ('+s+f(t.change/(t.price-t.change)*100,2)+'%)';
  ce.className='chg '+(t.change>=0?'up':'dn');
  document.getElementById('tc').textContent=tradeCount+' trades';
  // Live candle update — track price in current candle between Candle events
  if(candles.length>0){
    var last=candles[candles.length-1];
    last.close=t.price;
    if(t.price>last.high)last.high=t.price;
    if(t.price<last.low)last.low=t.price;
  }
});

es.addEventListener('quote',(e)=>{
  const q=JSON.parse(e.data);lastQuote=q;
  document.getElementById('hBid').textContent='Bid '+f(q.bidPrice)+' x '+fS(q.bidSize);
  document.getElementById('hAsk').textContent='Ask '+f(q.askPrice)+' x '+fS(q.askSize);
  const sp=q.askPrice-q.bidPrice;
  document.getElementById('si').textContent='Spread $'+f(sp,4);
});

es.addEventListener('candles',(e)=>{candles=JSON.parse(e.data)});

es.addEventListener('book',(e)=>{
  const b=JSON.parse(e.data);bookData=b;
  const mx=Math.max(...b.bids.map(l=>l.size),...b.asks.map(l=>l.size),1);
  const row=(l,s)=>'<div class="brow '+s+'"><div class="bar" style="width:'+(l.size/mx*100).toFixed(1)+'%"></div><span class="pc">'+f(l.price)+'</span><span class="sc">'+fS(l.size)+'</span></div>';
  document.getElementById('asks').innerHTML=b.asks.slice(0,18).reverse().map(l=>row(l,'ask')).join('');
  document.getElementById('bids').innerHTML=b.bids.slice(0,18).map(l=>row(l,'bid')).join('');
  if(b.spread!=null)document.getElementById('bsp').textContent='Spread $'+f(b.spread,4)+(b.midpoint?' Mid $'+f(b.midpoint):'')+' ('+b.eventCount+')';
});

es.addEventListener('symbolChanged',(e)=>{
  var d=JSON.parse(e.data);
  document.getElementById('symLabel').textContent=d.symbol;
  document.title=d.symbol+' Live';
  candles=[];bookData=null;lastQuote=null;tradeCount=0;
  document.getElementById('lp').textContent='\\u2014';
  document.getElementById('lp').className='px flat';
  document.getElementById('chg').textContent='';
  document.getElementById('ohlcv').innerHTML='';
  document.getElementById('tc').textContent='0 trades';
  document.getElementById('asks').innerHTML='';
  document.getElementById('bids').innerHTML='';
  document.getElementById('bsp').textContent='\\u2014';
  document.getElementById('hBid').textContent='Bid \\u2014';
  document.getElementById('hAsk').textContent='Ask \\u2014';
  vp.scrollOffset=0;vp.atLiveEdge=true;
  vp.priceAutoFit=true;vp.priceMin=null;vp.priceMax=null;
  if(typeof noMoreHistory!=='undefined')noMoreHistory=false;
  // Sync timeframe buttons if interval included
  if(d.interval){
    var btns=document.querySelectorAll('.tf');
    for(var i=0;i<btns.length;i++){
      btns[i].classList.toggle('active',btns[i].getAttribute('data-tf')===d.interval);
    }
  }
});

// Fetch history on load
fetch('/history').then(r=>r.json()).then(d=>{candles=d.candles||[]}).catch(()=>{});

// --- Search ---
var searchOverlay=document.getElementById('searchOverlay');
var searchInput=document.getElementById('searchInput');
var searchResults=document.getElementById('searchResults');
var searchTimer=null;
var searchActive=-1;
var searchItems=[];

function openSearch(){
  searchOverlay.classList.add('open');
  searchInput.value='';
  searchResults.innerHTML='<div class="search-empty">Type to search</div>';
  searchActive=-1;
  searchItems=[];
  setTimeout(function(){searchInput.focus()},50);
}
function closeSearch(){
  searchOverlay.classList.remove('open');
  searchInput.value='';
  searchActive=-1;
  searchItems=[];
}

document.getElementById('symBtn').addEventListener('click',openSearch);
document.getElementById('searchClose').addEventListener('click',closeSearch);
searchOverlay.addEventListener('click',function(e){
  if(e.target===searchOverlay)closeSearch();
});

document.addEventListener('keydown',function(e){
  if(searchOverlay.classList.contains('open')){
    if(e.key==='Escape'){closeSearch();e.preventDefault();return}
    if(e.key==='ArrowDown'){
      e.preventDefault();
      if(searchItems.length>0){searchActive=Math.min(searchActive+1,searchItems.length-1);renderActive()}
      return;
    }
    if(e.key==='ArrowUp'){
      e.preventDefault();
      if(searchItems.length>0){searchActive=Math.max(searchActive-1,0);renderActive()}
      return;
    }
    if(e.key==='Enter'){
      e.preventDefault();
      if(searchActive>=0&&searchActive<searchItems.length){selectSymbol(searchItems[searchActive].symbol)}
      return;
    }
  }else{
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&document.activeElement===document.body){
      e.preventDefault();openSearch();
    }
  }
});

function renderActive(){
  var rows=searchResults.querySelectorAll('.search-row');
  for(var i=0;i<rows.length;i++){
    rows[i].classList.toggle('active',i===searchActive);
  }
  if(searchActive>=0&&rows[searchActive]){
    rows[searchActive].scrollIntoView({block:'nearest'});
  }
}

searchInput.addEventListener('input',function(){
  var q=searchInput.value.trim();
  if(searchTimer)clearTimeout(searchTimer);
  if(!q){searchResults.innerHTML='<div class="search-empty">Type to search</div>';searchItems=[];searchActive=-1;return}
  searchTimer=setTimeout(function(){
    fetch('/search?q='+encodeURIComponent(q))
      .then(function(r){return r.json()})
      .then(function(data){
        searchItems=data.results||[];
        searchActive=searchItems.length>0?0:-1;
        if(searchItems.length===0){
          searchResults.innerHTML='<div class="search-empty">No results</div>';
          return;
        }
        var html='';
        for(var i=0;i<searchItems.length;i++){
          var it=searchItems[i];
          html+='<div class="search-row'+(i===0?' active':'')+'" data-idx="'+i+'">';
          html+='<span class="ticker">'+esc(it.symbol)+'</span>';
          html+='<span class="name">'+esc(it.name||'')+'</span>';
          html+='</div>';
        }
        searchResults.innerHTML=html;
        searchResults.querySelectorAll('.search-row').forEach(function(row){
          row.addEventListener('click',function(){
            var idx=parseInt(row.getAttribute('data-idx'));
            if(searchItems[idx])selectSymbol(searchItems[idx].symbol);
          });
        });
      })
      .catch(function(){searchResults.innerHTML='<div class="search-empty">Search error</div>'});
  },200);
});

function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}

function selectSymbol(sym){
  closeSearch();
  fetch('/switch?symbol='+encodeURIComponent(sym)).catch(function(){});
}

// --- Timeframe buttons ---
document.getElementById('l2Toggle').addEventListener('click',function(){
  showL2Overlay=!showL2Overlay;
  this.classList.toggle('active',showL2Overlay);
});

document.getElementById('tfBar').addEventListener('click',function(e){
  var btn=e.target;
  if(!btn.classList||!btn.classList.contains('tf'))return;
  var tf=btn.getAttribute('data-tf');
  if(!tf)return;
  fetch('/interval?tf='+encodeURIComponent(tf)).catch(function(){});
});

es.addEventListener('intervalChanged',function(e){
  var d=JSON.parse(e.data);
  candles=[];bookData=null;
  vp.scrollOffset=0;vp.atLiveEdge=true;
  vp.priceAutoFit=true;vp.priceMin=null;vp.priceMax=null;
  if(typeof noMoreHistory!=='undefined')noMoreHistory=false;
  var btns=document.querySelectorAll('.tf');
  for(var i=0;i<btns.length;i++){
    btns[i].classList.toggle('active',btns[i].getAttribute('data-tf')===d.interval);
  }
});

// --- Infinite scroll ---
var loadingMore=false;
var noMoreHistory=false;
var origDraw=draw;
draw=function(){
  origDraw();
  // Trigger history load when near left edge
  if(candles.length>0&&!loadingMore&&!noMoreHistory){
    var range=getVisibleRange();
    if(range.startIndex<=2){
      loadingMore=true;
      var prevLen=candles.length;
      fetch('/historicals')
        .then(function(r){return r.json()})
        .then(function(d){
          if(d.candles){candles=d.candles}
          if(candles.length<=prevLen)noMoreHistory=true;
          loadingMore=false;
        })
        .catch(function(){loadingMore=false});
    }
  }
};

function frame(){draw();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/stream") {
      const stream = new ReadableStream({
        start(controller) {
          sseClients.add(controller);
          // Send current symbol + interval
          controller.enqueue(
            new TextEncoder().encode(
              `event: symbolChanged\ndata: ${JSON.stringify({ symbol: currentSymbol, interval: currentInterval })}\n\n`,
            ),
          );
          if (state.quote)
            controller.enqueue(
              new TextEncoder().encode(`event: quote\ndata: ${JSON.stringify(state.quote)}\n\n`),
            );
          if (state.lastTrade)
            controller.enqueue(
              new TextEncoder().encode(
                `event: trade\ndata: ${JSON.stringify({ ...state.lastTrade, t: Date.now() })}\n\n`,
              ),
            );
          if (state.candles.length > 0)
            controller.enqueue(
              new TextEncoder().encode(
                `event: candles\ndata: ${JSON.stringify(state.candles)}\n\n`,
              ),
            );
        },
        cancel() {},
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
    if (url.pathname === "/search") {
      const q = url.searchParams.get("q")?.trim();
      if (!q) return Response.json({ results: [] });
      try {
        const instruments = await client.findInstruments(q);
        const results = instruments.slice(0, 12).map((i) => ({
          symbol: i.symbol,
          name: i.simple_name || i.name,
          type: i.type,
        }));
        return Response.json({ results });
      } catch (err) {
        console.error("Search error:", err);
        return Response.json({ results: [], error: "Search failed" }, { status: 500 });
      }
    }
    if (url.pathname === "/switch") {
      const sym = url.searchParams.get("symbol")?.trim().toUpperCase();
      if (!sym) return Response.json({ error: "Missing symbol" }, { status: 400 });
      try {
        await switchSymbol(sym);
        return Response.json({ symbol: currentSymbol, ok: true });
      } catch (err) {
        console.error("Switch error:", err);
        return Response.json({ error: "Switch failed" }, { status: 500 });
      }
    }
    if (url.pathname === "/interval") {
      const tf = url.searchParams.get("tf")?.trim();
      if (!tf || !TF_TO_REST[tf])
        return Response.json({ error: "Invalid timeframe" }, { status: 400 });
      try {
        await switchInterval(tf);
        return Response.json({ interval: currentInterval, ok: true });
      } catch (err) {
        console.error("Interval switch error:", err);
        return Response.json({ error: "Interval switch failed" }, { status: 500 });
      }
    }
    if (url.pathname === "/historicals") {
      // Fetch broader history and merge into state
      try {
        await loadHistory(currentSymbol);
        return Response.json({ candles: state.candles });
      } catch (err) {
        console.error("Historicals error:", err);
        return Response.json({ candles: state.candles });
      }
    }
    if (url.pathname === "/history") {
      return Response.json({ candles: state.candles });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(getHTML(), { headers: { "Content-Type": "text/html" } });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`\n  Stream viewer: http://127.0.0.1:${server.port}\n`);
console.log("Waiting for market data...");
