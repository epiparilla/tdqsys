'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readPublic}=require('./helpers');

test('Master Table, Print Queue and Sales Executives share compact cell and button formatting',()=>{
  const css=readPublic('facilitator.css').replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(match=>({selectors:match[1].trim().split(',').map(value=>value.trim()),body:match[2]}));
  const cells=rules.find(rule=>rule.selectors.includes('#master td') && rule.selectors.includes('#prints td') && rule.selectors.includes('#sales td'));
  assert.ok(cells,'All three tables must use one shared cell rule');
  for(const page of ['master','prints','sales'])for(const tag of ['th','td'])assert.ok(cells.selectors.includes(`#${page} ${tag}`));
  assert.match(cells.body,/font-size:12px/);assert.match(cells.body,/padding:7px 6px/);
  const buttons=rules.find(rule=>['master','prints','sales'].every(page=>rule.selectors.includes(`#${page} td button`)));
  assert.ok(buttons,'All three tables must use one shared button rule');
  assert.match(buttons.body,/font-size:11px/);assert.match(buttons.body,/padding:4px/);assert.match(buttons.body,/margin:2px/);
});
