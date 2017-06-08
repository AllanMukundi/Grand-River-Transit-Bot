'use strict'

// Server setup
const express = require('express')
const bodyParser = require('body-parser');
const app = express();
const request = require('request');
const aiBot = require('apiai')(process.env.API_AI);
const http = require('http');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = app.listen(process.env.PORT || 8080, () => {
  console.log('Listening on port %d in %s mode',
              server.address().port, app.settings.env);
})

// Routing
app.get('/grt', (req, res) => {
  if (req.query['hub.mode'] && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.status(403).end();
  }
});

app.post('/grt', (req, res) => {
  console.log(req.body);
  if (req.body.object === 'page') {
    req.body.entry.forEach((entry) => {
      entry.messaging.forEach((event) => {
        if (event.message && event.message.text) {
          sendMessage(event);
        }
      });
    });
    res.status(200).end();
  }
});

app.post('/transit', (req, res) => {
  if(req.body.result.action === 'transit') {
    let stop = req.body.result.parameters['stopNumber'];
    let bus = req.body.result.parameters['busRoute'];
    let url = 'http://realtimemap.grt.ca/Stop/GetStopInfo?stopId='+stop+'&routeId='+bus;

    request.get(url, (err, response, body) => {
      if (!err && response.statusCode == 200) {
        let json = JSON.parse(body);
        let stopTimes = json['stopTimes'];
        let stops = '';
        let times = [];

        for(let entry = 0; entry < stopTimes.length; ++entry) {
          times.push(stopTimes[entry]['Minutes']);
        }

        if(times.length == 0) {
          stops += 'The specified bus route has no upcoming arrival times at the requested stop number.';
        } else {
          stops += 'Bus '+stopTimes[0]['Name']+' will arrive in: ';
          for(let time = 0; time < times.length; ++time) {
            if(time == times.length - 1) {
              stops += "and "+times[time]+" minutes.";
            } else {
              stops += times[time]+", ";
            }
          }
        };

        console.log(body);
        return res.json({
          speech: stops,
          displayText: stops,
          source: 'transit'
        });
      } else {
        return res.status(400).json({
          status: {
            code: 400,
            errorType: 'The requested stop number or bus route could not be found'
          }});
      }
    });
  }
});

function sendMessage(event) {
  let sender = event.sender.id;
  let text = event.message.text;

  let apiai = aiBot.textRequest(text, {
    sessionId: 'testing'
  });

  apiai.on('response', (response) => {
    let aiText = response.result.fulfillment.speech;

    request({
      url: 'https://graph.facebook.com/v2.6/me/messages',
      qs: {access_token: process.env.PAGE_TOKEN},
      method: 'POST',
      json: {
        recipient: {id: sender},
        message: {text: aiText}
      }
    }, (error, response) => {
      if (error) {
          console.log('Error sending message: ', error);
      } else if (response.body.error) {
          console.log('Error: ', response.body.error);
      }
    });

  });

  apiai.on('error', (error) => {
    console.log(error);
  });

  apiai.end();

}
