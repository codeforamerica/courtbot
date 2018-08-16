var manager = require("./db/manager");

manager.ensureTablesExist()
  .then(manager.closeConnection)
  .then(process.exit);