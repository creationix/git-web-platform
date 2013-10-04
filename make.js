#!//usr/bin/env node

var T = require('tim-task');

T.serial(
  T.rmrf("build"),
  T.parallel(
    T.copy("src/index.html", "build/index.html"),
    T.copy("src/server.js", "build/server.js"),
    T.build("src/core.js", "build/jsgit.js")
  )
)(function (err) {
  if (err) throw err;
  console.log("done.");
});