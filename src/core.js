// This is the core recipe.  Feel free to change any piece with a new
// implementation and re-generate the jsgit.js script using the `make.js`
// tool in the root of this repo.

// Some of these libraries assume setImmediate exists.  Let's polyfill it!
if (!window.setImmediate) window.setImmediate = require('../lib/defer.js');

var platform = {
  sha1: require('git-sha1'),
  bops: require('../lib/bops/index.js'),
  tcp: require('websocket-tcp-client').tcp,
  tls: require('websocket-tcp-client').tls,
  // Uncomment these to enable zlib compression of the values
  // This is a time/space tradeoff.
  // inflate: require('git-zlib/inflate.js'),
  // deflate: require('git-zlib/deflate.js'),
};
platform.http = require('git-http')(platform);

window.jsgit = {
  repo: require('js-git')(platform),
  remote: require('git-net')(platform),
  db: require('git-localdb')(platform),
  // Uncomment to switch to an in-memory database for quick testing.
  // db: require('git-memdb'),
  version: require('js-git/package.json').version
};

