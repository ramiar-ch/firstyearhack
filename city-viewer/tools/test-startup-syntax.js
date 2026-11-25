const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('viewer and phone controller inline scripts parse before browser startup', () => {
  for (const file of ['index.html','controller.html']) {
    const html = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    for (const [script, attrs, code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!code.trim() || attrs.includes('importmap')) continue;
      const offset = html.slice(0,html.indexOf(script)).split('\n').length - 1;
      const type = attrs.includes('module') ? 'module' : 'commonjs';
      const result = spawnSync(process.execPath,['--input-type='+type,'--check'],{
        input:'\n'.repeat(offset)+code, encoding:'utf8',
      });
      assert.equal(result.status,0,result.stderr || file);
    }
  }
});
