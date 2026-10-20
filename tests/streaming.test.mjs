import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTurns, updateTurn } from '../src/lib.js';

test('a late HTTP response cannot erase a streamed answer or revert a completed turn',()=>{
  const live=[{id:'turn',status:'completed',items:[{id:'user',type:'userMessage',content:[]},{id:'answer',type:'agentMessage',text:'完整回答已经到达。'}]}];
  const late=[{id:'turn',status:'inProgress',items:[{id:'user',type:'userMessage',content:[]},{id:'answer',type:'agentMessage',text:'完整'}]}];
  const result=mergeTurns(live,late);
  assert.equal(result.length,1);assert.equal(result[0].status,'completed');assert.equal(result[0].items.length,2);assert.equal(result[0].items[1].text,'完整回答已经到达。');
});

test('stream deltas and terminal snapshots converge without duplicate messages',()=>{
  let turns=updateTurn([],'item/agentMessage/delta',{turnId:'turn',itemId:'answer',delta:'第一句。'});
  turns=updateTurn(turns,'item/agentMessage/delta',{turnId:'turn',itemId:'answer',delta:'第二句。'});
  turns=updateTurn(turns,'item/completed',{turnId:'turn',item:{id:'answer',type:'agentMessage',text:'第一句。第二句。'}});
  turns=updateTurn(turns,'turn/completed',{turn:{id:'turn',status:'completed',items:[]}});
  assert.equal(turns[0].items.length,1);assert.equal(turns[0].items[0].text,'第一句。第二句。');assert.equal(turns[0].status,'completed');
});
