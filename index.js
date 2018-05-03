require('dotenv');

const SerialPort = require('serialport');
const request = require('request');
const NodeCache = require('node-cache');

const myCache = new NodeCache();
const parsers = SerialPort.parsers;
const parser = new parsers.Readline({ delimiter: '\r\n' });

const postToAPI = slot => {
  request.post(
    'http://127.0.0.1:9000/parkingslots/state/' + slot.id,
    { json: slot },
    (err, res, body) => {
      if (err) throw err;
    }
  );
};

const getSlotFromCache = slotNumber => {
  return myCache.get(slotNumber);
};

const slotChanged = (slot, currentStatus) => {
  var isOccupied = currentStatus === 'occupied';
  return slot.occupied !== isOccupied;
};

const saveToCache = slot => {
  myCache.set(slot.number, slot);
};

const checkSlot = data => {
  var words = data.split(' ');
  if (words[0] === 'Sensor') {
    var slotNumber = words[1];
    var slot = getSlotFromCache(slotNumber);

    var currentStatus = words[2];
    if (slot != null && slotChanged(slot, currentStatus)) {
      slot.occupied = !slot.occupied;
      saveToCache(slot);
      postToAPI(slot);
      console.log(slot);
    }
  }
};

const openPort = portName => {
  var port = new SerialPort(
    portName,
    { autoOpen: true, baudRate: 9600 },
    err => {
      if (err) throw err;
      port.pipe(parser);
      port.on('open', () => console.log('Port open'));
      parser.on('data', data => checkSlot(data));
    }
  );
};

const setRefreshInterval = section => () => {
  setInterval(
    () =>
      request.get(
        'http://127.0.0.1:9000/parkingslots/section/' + section,
        (err, res, body) =>
          processGetSection(err, res, body, () => console.log('data refresed'))
      ),
    10000
  );
};

const updateCache = (err, body) => {
  if (err) throw err;
  var slots = JSON.parse(body);
  var reduced = slots.map(slot => {
    var reduced = {
      id: slot.id,
      number: slot.number,
      preferential: slot.preferential,
      occupied: slot.occupied
    };
    return reduced;
  });

  reduced.map(slot => myCache.set(slot.number, slot));
};

const processGetSection = (err, res, body, next) => {
  updateCache(err, body);
  if (next) next();
};

const setUp = section => {
  request.get(
    'http://127.0.0.1:9000/parkingslots/section/' + section,
    (err, res, body) =>
      processGetSection(err, res, body, setRefreshInterval(section))
  );
};

setUp('A');

SerialPort.list((err, ports) => {
  if (err) throw err;
  openPort(ports[0].comName);
});
