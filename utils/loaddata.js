/* eslint "no-console": "off" */

// Downloads the latest courtdate CSV file and
// rebuilds the database. For best results, load nightly.
const request = require('request');
const csv = require('csv');
const copyFrom = require('pg-copy-streams').from;
const CombinedStream = require('combined-stream')
const manager = require('./db/manager');

const CSV_DELIMITER = ',';

const csv_headers = {
    criminal_cases: ['date', 'last', 'first', 'room', 'time', 'id', 'type'],
    civil_cases: ['date', 'last', 'first', false, 'room', 'time', 'id', false, 'violation', false]
}

/**
 * Main function that performs the entire load process.
 *
 * @param  {String} dataUrls - list of data urls to load along with an optional
 *   header object key to use on each file.  Format is url|csv_type,...  The default
 *   csv_type is civil_cases. If this parameter is missing, then the
 *   environment variable DATA_URL is used instead.
 * @return {Promise} - resolves to object with file and record count: { files: 2, records: 12171 }
 */
async function loadData(dataUrls) {
    // determine what urls to load and how to extract them
    // example DATA_URL=http://courtrecords.alaska.gov/MAJIC/sandbox/acs_mo_event.csv
    // example DATA_URL=http://courtrecords.../acs_mo_event.csv|civil_cases,http://courtrecords.../acs_cr_event.csv|criminal_cases

    const files = (dataUrls || process.env.DATA_URL).split(',');

    // A single connection is needed for pg-copy-streams and the temp table
    const stream_client = await manager.acquireSingleConnection()

    // Postgres temp tables only last as long as the connection
    // so we need to use one connection for the whole life of the table
    await createTempHearingsTable(stream_client)

    for (let i = 0; i < files.length; i++) {
        const [url, csv_type] = files[i].split('|');
        if (url.trim() == '') continue
        try{
            await loadCSV(stream_client, url, csv_type)
        } catch(err) {
            stream_client.end()
            throw(err)
        }
    }

    var count = await copyTemp(stream_client)
    stream_client.end()
    manager.knex.client.pool.destroy()
    return {files: files.length, records: count}
}
/**
 * Transforms and loads a streamed csv file into the Postgres table .
 *
 * @param {Client} client - single pg client to use to create temp table and stream into DB
 * @param {string} url - CSV url
 * @param {string} csv_type - key for the csv_headers
 */
function loadCSV(client, url, csv_type){
    /* Define transform from delivered csv to unified format suitable for DB */
    const transformToTable = csv.transform(row => [`${row.date} ${row.time}`, `${row.first} ${row.last}`, row.room, row.id, row.type])

    /* Use the csv header array to determine which headers describe the csv.
       Default to the original citation headers */
    const parser =  csv.parse({
        delimiter: CSV_DELIMITER,
        columns: csv_headers[csv_type === 'criminal_cases' ? 'criminal_cases' : 'civil_cases'],
        trim: true
    })

    return new Promise(async (resolve, reject) => {
        /*  Since we've transformed csv into [date, defendant, room, id] form, we can just pipe it to postgres */
        const copy_stream = client.query(copyFrom('COPY hearings_temp ("date", "defendant", "room", "case_id", "type") FROM STDIN CSV'));
        copy_stream.on('error', reject)
        copy_stream.on('end',  resolve)

        request.get(url)
        .on('response', function (res) {
            if (res.statusCode !== 200) {
              this.emit('error', new Error("Error loading CSV. Return HTTP Status: "+res.statusCode))
            }
        })
        .on('error', reject)
        .pipe(parser)
        .on('error', reject)
        .pipe(transformToTable)
        .pipe(csv.stringify())
        .pipe(copy_stream)
    })
}

/**
 * Copy temp table to real table. Enforce unique constraints by ignoring dupes.
 * @param {*} client
 */
async function copyTemp(client){
    await manager.dropTable('hearings')
    await manager.createTable('hearings')
    let resp = await client.query(
        `INSERT INTO hearings (date, defendant, room, case_id, type)
        SELECT date, defendant, room, case_id, type from hearings_temp
        ON CONFLICT DO NOTHING;`
    )
    const count = resp.rowCount
    return count
}
/**
 * Temp table to pipe into. This is necessary because Postgres can't configure
 * alternate constraint handling when consuming streams. Duplicates would kill the insert.
 * @param {*} client
 */
async function createTempHearingsTable(client){
    // Need to use the client rather than pooled knex connection
    // becuase pg temp tables are tied to the life of the client.
    await client.query(
        `CREATE TEMP TABLE hearings_temp (
            date timestamptz,
            defendant varchar(100),
            room varchar(100),
            case_id varchar(100),
            type varchar(100)
        )`
    )
    return
}

module.exports = loadData;
