var manager = require("./db/manager");

manager.createTable("reminders")
  .then(manager.closeConnection)
  .then(process.exit);