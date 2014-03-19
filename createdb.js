var fs = require('fs');
var csv = require('csv');
var _ = require('underscore');
var Knex = require('knex');
var Promise = require('bluebird');

var knex = Knex.initialize({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    user: 'shashemi',
    password: '',
    database: 'shashemi',
    charset: 'utf8',
  },
});

var createTable = function() {
  return knex.schema.createTable('cases', function(t) {
    t.increments('id').primary();
    t.string('defendant', 100);
    t.string('room', 100);
    t.string('date', 100);
    t.string('time', 100);
    t.string('citation', 100);
    t.string('violation_code', 100);
    t.string('violation_desc', 100);
  });
}

var populateTable = function(caseData) {
  return knex('cases').insert(caseData);
}

var getCaseData = function(callback) {
  return new Promise(function(resolve) {
    var allData = [];
    var citations = [];

    csv()
    .from.path(__dirname + '/data/D140318.csv', { delimiter: ',', escape: '"' })
    .to.array(function(data) {
      data.forEach(function(line) {
        // Ignore junk data that appeared from the conversion
        if (line.length < 4) return;

        // Ignore label lines
        if (line[0] === 'Defendant') return;
        
        // Catch any line wrapping errors with the citation
        // TODO: Figure out how to fix this automatically
        if (!line[5]) console.log('Error: ' + line);


        var caseData = {
          defendant: parseDefendant(line[4]),
          room: line[0],
          date: 'March 18th',
          time: line[1],
          citation: parseCitation(line[5]),
          violation_code: line[2],
          violation_desc: line[3],
        };

        allData.push(caseData);
        citations.push(caseData.citation);
      });

      console.log('Data imported. Number of cases for this day: ' + _.uniq(citations).length);
      resolve(allData);
    });
  })  
}

var parseCitation = function(citation) {
  // Remove the 'THE CITY OF ATLANTA MUNICIPAL COURT' string
  // that sometimes gets mixed in because of the broken parser
  var hasJunk = citation.indexOf("THE CITY OF ATLANTA MUNICIPAL COURT");
  if (hasJunk > -1) citation = citation.substring(0, hasJunk);

  return citation;
};

var parseDefendant = function(defendant) {
  return defendant;
}

knex.schema.dropTableIfExists('cases')
  .then(createTable)
  .then(getCaseData)
  .then(populateTable)
  .then(function() { knex.client.pool.destroy(); });