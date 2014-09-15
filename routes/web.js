var db = require('../lib/db');
var moment = require('moment');

// Fuzzy search that returns cases with a partial name match or
// an exact citation match
module.exports = function(req, res) {
  if (!req.query || !req.query.q) return res.send(400);

  db.findCase(req.query.q, function(err, data) {
    // Add readable dates, to avoid browser side date issues
    data.forEach(function(d) {
      d.readableDate = moment(d.date).format('dddd, MMM Do');
      d.payable = eligibleToPay(d);
    });
    
    res.send(data);
  });
};

// You can pay online if ALL your individual citations can be paid online
function eligibleToPay(courtCase) {
  var eligible = true;
  courtCase.citations.forEach(function(citation) {
    if (citation.payable !== '1') eligible = false;
  });
  return eligible;
}
