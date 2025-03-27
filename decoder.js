/* eslint no-bitwise: ["error", { "allow": ["&", "<<", ">>", "|"] }] */
/* eslint no-plusplus: "off" */

/**
 * Decode payload
 * @param bytes Buffer
 * @returns Object
 */
module.exports = function Decoder(bytes) {
  // Decoded result
  const decoded = {};
  // Pointer/index within the byte stream
  let index = 0;

  function toSignedChar(byte) {
    return (byte & 127) - (byte & 128);
  }

  function toSignedShort(byte1, byte2) {
    const sign = byte1 & (1 << 7);
    const x = (((byte1 & 0xFF) << 8) | (byte2 & 0xFF));
    if (sign) {
      return 0xFFFF0000 | x; // fill in most significant bits with 1's
    }
    return x;
  }

  function toUnsignedShort(byte1, byte2) {
    return (byte1 << 8) + byte2;
  }

  function toSignedInteger(byte1, byte2, byte3, byte4) {
    return (byte1 << 24) | (byte2 << 16) | (byte3 << 8) | byte4;
  }

  function formatUuid(uuid) {
    //XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    return uuid.substring(0,8)+'-'+uuid.substring(8, 12)+'-'+uuid.substring(12,16)+'-'+uuid.substring(16,20)+'-'+uuid.substring(20);
  }

  function bytesToHexString(bytes){
    if (!bytes){
      return null;
    }
    bytes = new Uint8Array(bytes);
    var hexBytes = [];

    for (var i = 0; i < bytes.length; ++i) {
      var byteString = bytes[i].toString(16);
      if (byteString.length < 2){
        byteString = "0" + byteString;
      }
      hexBytes.push(byteString);
    }
    return hexBytes.join("");
  }

  function substring(source, offset, length) {
    const buffer = new Uint8Array(length);
    for(var i = 0; i < length; i++) {
      buffer[i] = source[offset+i];
    }
    return bytesToHexString(buffer);
  }

  // parser for slotInfo 0x00
  function parseBluetoothBeacons00() {
    const beaconStatus = bytes[index++];
    const beaconType = beaconStatus & 0x03;
    const rssiRaw = beaconStatus >> 2;
    const rssi = 27 - (rssiRaw * 2);

    let beacon;
    switch (beaconType) {
      case 0x00:
        beacon = {
          type: 'ibeacon',
          rssi,
          uuid: substring(bytes, index, 2),
          major: substring(bytes, index + 2, 2),
          minor: substring(bytes, index + 4, 2),
        };
        index += 6;
        return beacon;
      case 0x01:
        beacon = {
          type: 'eddystone',
          rssi,
          instance: substring(bytes, index, 6),
        };
        index += 6;
        return beacon;
      case 0x02:
        beacon = {
          type: 'altbeacon',
          rssi,
          id1: substring(bytes, index, 2),
          id2: substring(bytes, index + 2, 2),
          id3: substring(bytes, index + 4, 2),
        };
        index += 6;
        return beacon;
      default:
        throw new Error('Invalid beacon type');
    }
  }

  // parser for slotInfo 0x01
  function parseBluetoothBeacons01() {
    const beaconStatus = bytes[index++];
    const beaconType = beaconStatus & 0x03;
    const rssiRaw = beaconStatus >> 2;
    const rssi = 27 - (rssiRaw * 2);

    let beacon;
    switch (beaconType) {
      case 0x00:
        beacon = {
          type: 'ibeacon',
          rssi,
          uuid: formatUuid(substring(bytes, index, 16)),
          major: substring(bytes, index + 16, 2),
          minor: substring(bytes, index + 18, 2),
        };
        index += 20;
        return beacon;
      case 0x01:
        beacon = {
          type: 'eddystone',
          rssi,
          namespace: substring(bytes, index, 10),
          instance: substring(bytes, index + 10, 6),
        };
        index += 16;
        return beacon;
      case 0x02:
        beacon = {
          type: 'altbeacon',
          rssi,
          id1: formatUuid(substring(bytes, index, 16)),
          id2: substring(bytes, index + 16, 2),
          id3: substring(bytes, index + 18, 2),
        };
        index += 20;
        return beacon;
      case 0x03:
        beacon = {
          type: 'fullbeacon',
          rssi,
          id1: formatUuid(substring(bytes, index, 16)),
          id2: substring(bytes, index + 16, 2),
          id3: substring(bytes, index + 18, 2),
        };
        index += 20;
        return beacon;
      default:
        throw new Error('Invalid beacon type');
    }
  }

  // parser for slotInfo 0x02
  function parseBluetoothBeacons02() {
    const beaconStatus = bytes[index++];
    const beaconType = beaconStatus & 0x03;
    const slotMatch = (beaconStatus >> 2) & 0x07;

    const rssiRaw = bytes[index++] & 63;
    const rssi = 27 - (rssiRaw * 2);

    let beacon;
    switch (beaconType) {
      case 0x00:
        beacon = {
          type: 'ibeacon',
          rssi,
          slot: slotMatch,
          major: substring(bytes, index, 2),
          minor: substring(bytes, index + 2, 2),
        };
        index += 4;
        return beacon;
      case 0x01:
        beacon = {
          type: 'eddystone',
          rssi,
          slot: slotMatch,
          instance: substring(bytes, index, 6),
        };
        index += 6;
        return beacon;
      case 0x02:
        beacon = {
          type: 'altbeacon',
          rssi,
          slot: slotMatch,
          id2: substring(bytes, index, 2),
          id3: substring(bytes, index + 2, 2),
        };
        index += 4;
        return beacon;
      case 0x03:
        beacon = {
          type: 'fullbeacon',
          rssi,
          slot: slotMatch,
          id2: substring(bytes, index, 2),
          id3: substring(bytes, index + 2, 2),
        };
        index += 6;
        return beacon;
      default:
        throw new Error('Invalid beacon type');
    }
  }

  // Read header byte
  const headerByte = bytes[index++];
  decoded.uplinkReasonButton = !!(headerByte & 1);
  if (decoded.uplinkReasonButton) {
    // Also set the reason (this can be overridden below, based on sensor content)
    decoded.buttonClickReason = 'single';
  }
  decoded.uplinkReasonMovement = !!(headerByte & 2);
  decoded.uplinkReasonGpio = !!(headerByte & 4);
  decoded.containsGps = !!(headerByte & 8);
  decoded.containsOnboardSensors = !!(headerByte & 16);
  decoded.containsSpecial = !!(headerByte & 32);

  decoded.crc = bytes[index++];
  decoded.batteryLevel = bytes[index++];

  if (decoded.containsOnboardSensors) {
    const sensorContent = bytes[index++];
    decoded.sensorContent = {
      containsTemperature: !!(sensorContent & 1),
      containsLight: !!(sensorContent & 2),
      containsAccelerometerCurrent: !!(sensorContent & 4),
      containsAccelerometerMax: !!(sensorContent & 8),
      containsWifiPositioningData: !!(sensorContent & 16),
      buttonEventInfo: !!(sensorContent & 32),
      containsExternalSensors: !!(sensorContent & 64),
      containsBluetoothData: false,
    };

    const buttonHeader = decoded.uplinkReasonButton; // b0
    const buttonEvent = decoded.sensorContent.buttonEventInfo; // b3
    if (!buttonEvent && !buttonHeader) {
      decoded.buttonClickReason = 'none';
    } else if (!buttonEvent && buttonHeader) {
      decoded.buttonClickReason = 'single';
    } else if (buttonEvent && !buttonHeader) {
      decoded.buttonClickReason = 'long';
      decoded.uplinkReasonButton = true; // Set the uplink reason true, because the button was pressed.
    } else if (buttonEvent && buttonHeader) {
      decoded.buttonClickReason = 'double';
    }

    const hasSecondSensorContent = !!(sensorContent & 128);

    if (hasSecondSensorContent) {
      const sensorContent2 = bytes[index++];
      decoded.sensorContent.containsBluetoothData = !!(sensorContent2 & 1);
      decoded.sensorContent.containsRelativeHumidity = !!(sensorContent2 & 2);
      decoded.sensorContent.containsAirPressure = !!(sensorContent2 & 4);
      decoded.sensorContent.containsManDown = !!(sensorContent2 & 8);
      decoded.sensorContent.containsTilt = !!(sensorContent2 & 16);
      decoded.sensorContent.containsRetransmitCnt = !!(sensorContent2 & 32);
    }

    if (decoded.sensorContent.containsTemperature) {
      decoded.temperature = toSignedShort(bytes[index++], bytes[index++]) / 100;
    }

    if (decoded.sensorContent.containsLight) {
      const value = (bytes[index++] << 8) + bytes[index++];
      const exponent = (value >> 12) & 0xFF;
      decoded.lightIntensity = ((value & 0x0FFF) << exponent) / 100;
    }
    if (decoded.sensorContent.containsAccelerometerCurrent) {
      decoded.accelerometer = {
        x: toSignedShort(bytes[index++], bytes[index++]) / 1000,
        y: toSignedShort(bytes[index++], bytes[index++]) / 1000,
        z: toSignedShort(bytes[index++], bytes[index++]) / 1000,
      };
    }

    if (decoded.sensorContent.containsAccelerometerMax) {
      decoded.maxAccelerationNew = toSignedShort(bytes[index++], bytes[index++]) / 1000;
      decoded.maxAccelerationHistory = toSignedShort(bytes[index++], bytes[index++]) / 1000;
    }

    if (decoded.sensorContent.containsWifiPositioningData) {
      const wifiInfo = bytes[index++];
      const numAccessPoints = (wifiInfo & 7);
      // const wifiStatus = (wifiInfo >> 3) & 0x03;
      const wifiStatus = ((wifiInfo & 8) >> 2) + ((wifiInfo & 16) >> 3);
      const containsSignalStrength = wifiInfo & 32;
      let wifiStatusDescription;

      switch (wifiStatus) {
        case 0:
          wifiStatusDescription = 'success';
          break;

        case 1:
          wifiStatusDescription = 'failed';
          break;

        case 2:
          wifiStatusDescription = 'no_access_points';
          break;

        default:
          wifiStatusDescription = `unknown (${wifiStatus})`;
      }

      decoded.wifiInfo = {
        status: wifiStatusDescription,
        statusCode: wifiStatus,
        accessPoints: [],
      };

      for (let i = 0; i < numAccessPoints; i++) {
        const macAddress = [
          bytes[index++].toString(16),
          bytes[index++].toString(16),
          bytes[index++].toString(16),
          bytes[index++].toString(16),
          bytes[index++].toString(16),
          bytes[index++].toString(16),
        ];
        let signalStrength;

        if (containsSignalStrength) {
          signalStrength = toSignedChar(bytes[index++]); // to signed
        } else {
          signalStrength = null;
        }

        decoded.wifiInfo.accessPoints.push({
          macAddress: macAddress.join(':'),
          signalStrength,
        });
      }
    }

    if (decoded.sensorContent.containsExternalSensors) {
      const type = bytes[index++];

      switch(type) {
        case 0x0A:
          decoded.externalSensor = {
            type: 'battery',
            batteryA: toUnsignedShort(bytes[index++], bytes[index++]),
            batteryB: toUnsignedShort(bytes[index++], bytes[index++]),
          };
          break;

        case 0x64:
          decoded.externalSensor = {
            type: 'externalTemperature',
            value: toSignedShort(bytes[index++], bytes[index++]) / 100
          };
          break;

        case 0x65:
          decoded.externalSensor = {
            type: 'detectSwitch',
            value: bytes[index++]
          };
          break;

          case 0x66:
            var iobuttonStateData = bytes[index++];
            var iobuttonState = (iobuttonStateData & 0xF0)>>4;
            var iobuttonStateClickCnt = (iobuttonStateData & 0x0F);
            switch(iobuttonState){
              case 0: iobuttonState = 'Idle'; break;
              case 1: iobuttonState = 'Calling'; break;
              case 2: iobuttonState = 'Success'; break;
              case 3: iobuttonState = 'Cleared'; break;
              default: iobuttonState = 'Undefined';
            }
            decoded.externalSensor = {
                type: 'buttonState',
                state: iobuttonState,
                clickCnt: iobuttonStateClickCnt
            };
            break;
      }
    }

    if (decoded.sensorContent.containsBluetoothData) {
      const bluetoothInfo = bytes[index++];
      const numBeacons = (bluetoothInfo & 7);
      const bluetoothStatus = (bluetoothInfo >> 3) & 0x03;
      const addSlotInfo = (bluetoothInfo >> 5) & 0x03;
      let bluetoothStatusDescription;
      switch (bluetoothStatus) {
        case 0:
          bluetoothStatusDescription = 'success';
          break;
        case 1:
          bluetoothStatusDescription = 'failed';
          break;
        case 2:
          bluetoothStatusDescription = 'no_access_points';
          break;
        default:
          bluetoothStatusDescription = `unknown (${bluetoothStatus})`;
      }
      decoded.bluetoothInfo = {
        status: bluetoothStatusDescription,
        statusCode: bluetoothStatus,
        addSlotInfo,
        beacons: [],
      };

      for (let i = 0; i < numBeacons; i++) {
        switch (addSlotInfo) {
          case 0x00:
            decoded.bluetoothInfo.beacons.push(parseBluetoothBeacons00());
            break;
          case 0x01:
            decoded.bluetoothInfo.beacons.push(parseBluetoothBeacons01());
            break;
          case 0x02:
            decoded.bluetoothInfo.beacons.push(parseBluetoothBeacons02());
            break;
          default:
            throw new Error('Invalid addSlotInfo type');
        }
      }
    }

    if (decoded.sensorContent.containsRelativeHumidity) {
      decoded.relativeHumidity = toUnsignedShort(bytes[index++], bytes[index++]) / 100;
    }

    if (decoded.sensorContent.containsAirPressure) {
      // uint24
      decoded.airPressure = (bytes[index++] << 16) + (bytes[index++] << 8) + bytes[index++];
    }

    if (decoded.sensorContent.containsManDown) {
      let manDownData = (bytes[index++]);
      let manDownState = (manDownData & 0x0f)
      let manDownStateLabel;
      switch(manDownState) {
        case 0x00:
          manDownStateLabel = 'ok';
          break;
        case 0x01:
          manDownStateLabel = 'sleeping';
          break;
        case 0x02:
          manDownStateLabel = 'preAlarm';
          break;
        case 0x03:
          manDownStateLabel = 'alarm';
          break;
        default:
          manDownStateLabel = manDownState+'';
          break;
      }
      decoded.manDown = {
        state: manDownStateLabel,
        positionAlarm: !!(manDownData & 0x10),
        movementAlarm: !!(manDownData & 0x20),
      };
    }

    if (decoded.sensorContent.containsTilt) {
      decoded.tilt = {
        currentTilt: toUnsignedShort(bytes[index++], bytes[index++]) / 100,
        currentDirection: Math.round(bytes[index++] * (360/255)),
        maximumTiltHistory: toUnsignedShort(bytes[index++], bytes[index++]) / 100,
        DirectionHistory: Math.round(bytes[index++] * (360/255)),
      };
    }

    if (decoded.sensorContent.containsRetransmitCnt) {
      decoded.retransmitCnt = bytes[index++];
      };
  }
  if (decoded.containsGps) {
    decoded.gps = {};
    decoded.gps.navStat = bytes[index++];
    decoded.gps.latitude = toSignedInteger(
      bytes[index++],
      bytes[index++],
      bytes[index++],
      bytes[index++],
    ) / 10000000;
    decoded.gps.longitude = toSignedInteger(
      bytes[index++],
      bytes[index++],
      bytes[index++],
      bytes[index++],
    ) / 10000000;
    decoded.gps.altRef = toUnsignedShort(bytes[index++], bytes[index++]) / 10;
    decoded.gps.hAcc = bytes[index++];
    decoded.gps.vAcc = bytes[index++];
    decoded.gps.sog = toUnsignedShort(bytes[index++], bytes[index++]) / 10;
    decoded.gps.cog = toUnsignedShort(bytes[index++], bytes[index++]) / 10;
    decoded.gps.hdop = bytes[index++] / 10;
    decoded.gps.numSvs = bytes[index++];
  }
  return decoded;
};
