var twilio = require('twilio');
var express = require('express');
var logfmt = require('logfmt');
var moment = require('moment');
var db = require('./db');
var app = express();

// Express Middleware
app.use(logfmt.requestLogger());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.cookieSession());

// Allows CORS
app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

// Enable CORS support for IE8. 
app.get('/proxy.html', function(req, res) {
  res.send('<!DOCTYPE HTML>\n' + '<script src="http://jpillora.com/xdomain/dist/0.6/xdomain.min.js" master="http://court.atlantaga.gov"></script>');
});

app.get('/', function(req, res) {
  res.send('Hello, I am Spanish Courtbot. I have a heart of justicia and a conocimiento of court cases.');
});

// Fuzzy search that returns cases with a partial name match or
// an exact citation match
app.get('/cases', function(req, res) {
  if (!req.query || !req.query.q) return res.send(400);

  db.fuzzySearch(req.query.q, function(err, data) {
    // Add readable dates, to avoid browser side date issues
    data.forEach(function(d) {
      d.readableDate = moment(d.date).format('dddd, MMM Do');
      d.payable = canPayOnline(d);
    });
    
    res.send(data);
  });
});

// Respond to text messages that come in from Twilio
app.post('/sms', function(req, res) {
  var twiml = new twilio.TwimlResponse();
  var text = req.body.Body.toUpperCase();

  if (req.session.askedReminder) {
    if (text === 'YES' || text === 'YEA' || text === 'YUP' || text === 'Y' || text === 'SI') {
      var match = req.session.match;
      db.addReminder({
        caseId: match.id,
        phone: req.body.From,
        originalCase: JSON.stringify(match)
      }, function(err, data) {});

      twiml.sms('Le mandaremos un mensaje de texto el día antes de su caso. Llámenos al (404) 954-7914 con cualquier otra pregunta.');
      req.session.askedReminder = false;
      res.send(twiml.toString());
    } else if (text === 'NO' || text ==='N') {
      twiml.sms('Sin problema. Nos vemos el día de su caso. Llamenos al (404) 954-7914 si tiene  cualquier otra pregunta.');
      req.session.askedReminder = false;
      res.send(twiml.toString());
    }
  }

  if (req.session.askedQueued) {
    if (text === 'YES' || text === 'YEA' || text === 'YUP' || text === 'Y' || text === 'SI') {
      db.addQueued({
        citationId: req.session.citationId,
        phone: req.body.From,
      }, function(err, data) {});

      twiml.sms('Bueno. Le enviaremos un mensaje de texto en los próximos 14 días. Llámenos al (404) 954-7914 con cualquier otra pregunta.');
      req.session.askedQueued = false;
      res.send(twiml.toString());
    } else if (text === 'NO' || text ==='N') {
      twiml.sms('Sin problema. Llámenos al (404) 954-7914 con cualquier otra pregunta.');
      req.session.askedQueued = false;
      res.send(twiml.toString());
    }
  }

  db.findCitation(text, function(err, results) {
    // If we can't find the case, or find more than one case with the citation
    // number, give an error and recommend they call in.
    if (!results || results.length === 0 || results.length > 1) {
      var correctLengthCitation = 6 <= text.length && text.length <= 9;
      if (correctLengthCitation) {
        twiml.sms('No encontramos su caso. Tarda hasta 14 días para que casos nuevos aparezcan en nuestro sistema. ¿Gustaría un texto cuando encontramos su información? (Responda SI o NO)');

        req.session.askedQueued = true;
        req.session.citationId = text;
      } else {
        twiml.sms('Lamentablemente no hemos podido encontrar su caso. Por favor llámenos al (404) 954-7914.');
      }
    } else {
      var match = results[0];
      var name = cleanupName(match.defendant);
      var date = moment(match.date).format('dddd, MMM Do');

      if (canPayOnline(match)){
        twiml.sms('Puede pagar su multa hoy día sin necesidad de ir a corte. Simplemente llame al (404) 658-6940 o visite court.atlantaga.gov. De lo contrario, la fecha y hora de su caso es ' + date + ' ' + match.time + ', en la sala de audiencias ' + match.room + '.')
      } else {
        twiml.sms('Spanish Encontramos un caso para el Sr./Sra. ' + name + ' el día ' + date + ' alas ' + match.time + ', en la sala de audiencias ' + match.room + '. ¿Gustaría un recordatorio el día antes? (responda SI o NO)');

        req.session.match = match;
        req.session.askedReminder = true;
      }
    }

    res.send(twiml.toString());
  });
});

// You can pay online if ALL your individual citations can be paid online
var canPayOnline = function(courtCase) {
  var eligible = true;
  courtCase.citations.forEach(function(citation) {
    if (citation.payable !== '1') eligible = false;
  });
  return eligible;
};

var cleanupName = function(name) {
  // Switch LAST, FIRST to FIRST LAST
  var bits = name.split(',');
  name = bits[1] + ' ' + bits[0];
  name = name.trim();

  // Change FIRST LAST to First Last
  name = name.replace(/\w\S*/g, function(txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });

  return name;
};

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});

