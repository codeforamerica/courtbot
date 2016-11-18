var manager = require("./db/manager");

manager.createTable("queued")
  .then(manager.closeConnection)
  .then(process.exit);