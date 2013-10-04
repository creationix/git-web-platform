#!//usr/bin/env node

var T = require('tim-task');

T.serial(
  T.rmrf("build"),
  T.parallel(
    T.copy("src/index.html", "build/index.html"),
    T.copy("src/server.js", "build/server.js"),
    T.build("src/core.js", "build/jsgit.js")
  ),
  T.execFile("uglifyjs", ["build/jsgit.js", "--screw-ie8", "-c", "-m", "-o", "build/jsgit.min.js"], {})
)(function (err) {
  if (err) throw err;
  console.log("done.");
});