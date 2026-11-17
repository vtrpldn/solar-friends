import assert from 'node:assert/strict';
import {matchingTransactions} from '../web/v02/weekend/banking.js';
const timeOnDay = day => (day * 1440 + 60 - 540) / .45;
const entries = [
  {time:timeOnDay(9),amount:120,category:'sales',description:'Sold tomatoes'},
  {time:timeOnDay(9),amount:-4,category:'electricity',description:'Grid electricity'},
  {time:timeOnDay(3),amount:-30,category:'construction',description:'Timber'},
  {time:timeOnDay(2),amount:50,category:'outsideWork',description:'Town work'},
];
const now=timeOnDay(9);
assert.equal(matchingTransactions(entries,{},now).length,4);
assert.deepEqual(matchingTransactions(entries,{period:'today',direction:'in'},now),[entries[0]]);
assert.deepEqual(matchingTransactions(entries,{period:'week'},now),entries.slice(0,3));
assert.deepEqual(matchingTransactions(entries,{query:' ELECTRICITY ',direction:'out'},now),[entries[1]]);
assert.deepEqual(matchingTransactions(entries,{query:'tomatoes',direction:'out'},now),[]);
assert.deepEqual(matchingTransactions(entries,{query:'outsidework'},now),[entries[3]]);
assert.equal(entries.length,4);
console.log('PASS combined ledger filters, inclusive game-day boundaries, category search and no matches');
