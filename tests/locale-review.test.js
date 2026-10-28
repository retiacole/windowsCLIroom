'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Shell=require('../src/shell.js'),Data=require('../src/data.js'),Engine=require('../src/engine.js');
for(const language of ['ja','en'])test(`all 56 lessons grade correctly with ${language} examples and help output`,()=>{
 for(const lesson of Data.lessons){const cp=Engine.fresh(lesson);for(const command of lesson.solution){const entry=Shell.run(cp.session,language==='ja'?command.replace(/\\/g,'¥'):command,{language});cp.evidence=Engine.observe(lesson,entry,cp.evidence);}const grade=Engine.grade(lesson,cp.session,lesson.question?.answer,cp.evidence);assert.equal(grade.ok,true,lesson.id+' '+JSON.stringify(grade));}
});
