const { exec } = require('pkg'),
  pac = require('./package.json');

(async () => {
  console.log('Building executables.');
  await exec(['--output', `hidegvan-${pac.version}`, '.']);
  console.log('Complete.');
})();
