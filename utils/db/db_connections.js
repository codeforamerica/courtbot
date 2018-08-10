/**
 * It's important to set the correct time zone for the database here as a tz string.
 * i.e. America/Anchorage (not -08 or PST)
 * This allows us to simply insert local date/times and let the database perform the conversion
 * which will store utc in the DB.
 */

module.exports = {
    production: {
        client: "pg",
        connection: process.env.DATABASE_URL,
        pool: {
            afterCreate: function(connection, callback) {
                connection.query(`SET TIME ZONE '${process.env.TZ}';`, function(err) {
                    callback(err, connection);
                });
            }
        }
    },
    development: {
        client: "pg",
        connection: process.env.DATABASE_URL,
        pool: {
            afterCreate: function(connection, callback) {
                connection.query(`SET TIME ZONE '${process.env.TZ}';`, function(err) {
                    callback(err, connection);
                });
            }
        }
    },
    test: {
        client: "pg",
        connection: process.env.DATABASE_TEST_URL,
        pool: {
            afterCreate: function(connection, callback) {
                connection.query(`SET TIME ZONE '${process.env.TZ}';`, function(err) {
                    callback(err, connection);
                });
            }
        }
    }
}