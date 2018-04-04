var manager = require("./db/manager");

manager.createTable("requests")
  .then(manager.closeConnection)
  .then(process.exit);