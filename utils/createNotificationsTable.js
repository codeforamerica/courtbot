var manager = require("./db/manager");

manager.createTable("notifications")
  .then(manager.closeConnection)
  .then(process.exit);