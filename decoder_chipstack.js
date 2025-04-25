function decodeUplink(input) {
  try {
    const data = decodePayload(input.bytes);
    return { data };
  } catch (error) {
    return { errors: [error.toString()] };
  }
}

function decodePayload(bytes) {
  let index = 0;
  const decoded = {};

  const toSignedChar = byte => (byte & 127) - (byte & 128);
  const toSignedShort = (b1, b2) => ((b1 & 0xFF) << 8 | b2) << 16 >> 16;
  const toUnsignedShort = (b1, b2) => (b1 << 8) + b2;
  const toSignedInt = (b1, b2, b3, b4) => (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;

  const bytesToHex = arr => [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
  const formatUuid = hex => `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  const substring = (source, offset, length) => bytesToHex(source.slice(offset, offset + length));

  const parseBeacon00 = () => {
    const status = bytes[index++];
    const type = status & 0x03;
    const rssi = 27 - ((status >> 2) * 2);

    switch (type) {
      case 0x00:
        return {
          type: 'ibeacon',
          rssi,
          uuid: substring(bytes, index, 2),
          major: substring(bytes, index + 2, 2),
          minor: substring(bytes, index + 4, 2),
        };
      case 0x01:
        return {
          type: 'eddystone',
          rssi,
          instance: substring(bytes, index, 6),
        };
      case 0x02:
      case 0x03:
        return {
          type: type === 0x02 ? 'altbeacon' : 'fullbeacon',
          rssi,
          id1: substring(bytes, index, 2),
          id2: substring(bytes, index + 2, 2),
          id3: substring(bytes, index + 4, 2),
        };
      default:
        throw new Error('Unknown beacon type (slotInfo 0x00)');
    }
  };

  const parseBeacon01 = () => {
    const status = bytes[index++];
    const type = status & 0x03;
    const rssi = 27 - ((status >> 2) * 2);

    switch (type) {
      case 0x00:
        return {
          type: 'ibeacon',
          rssi,
          uuid: formatUuid(substring(bytes, index, 16)),
          major: substring(bytes, index + 16, 2),
          minor: substring(bytes, index + 18, 2),
        };
      case 0x01:
        return {
          type: 'eddystone',
          rssi,
          namespace: substring(bytes, index, 10),
          instance: substring(bytes, index + 10, 6),
        };
      case 0x02:
        return {
          type: 'altbeacon',
          rssi,
          id1: formatUuid(substring(bytes, index, 16)),
          id2: substring(bytes, index + 16, 2),
          id3: substring(bytes, index + 18, 2),
        };
      default:
        throw new Error('Unknown beacon type (slotInfo 0x01)');
    }
  };

  const parseBeacon02 = () => {
    const status = bytes[index++];
    const type = status & 0x03;
    const slotMatch = (status >> 2) & 0x07;
    const rssi = 27 - ((bytes[index++] & 63) * 2);

    switch (type) {
      case 0x00:
        return {
          type: 'ibeacon',
          rssi,
          slot: slotMatch,
          major: substring(bytes, index, 2),
          minor: substring(bytes, index + 2, 2),
        };
      case 0x01:
        return {
          type: 'eddystone',
          rssi,
          slot: slotMatch,
          instance: substring(bytes, index, 6),
        };
      case 0x02:
      case 0x03:
        return {
          type: type === 0x02 ? 'altbeacon' : 'fullbeacon',
          rssi,
          slot: slotMatch,
          id2: substring(bytes, index, 2),
          id3: substring(bytes, index + 2, 2),
        };
      default:
        throw new Error('Unknown beacon type (slotInfo 0x02)');
    }
  };

  const header = bytes[index++];
  decoded.uplinkReasonButton = !!(header & 1);
  decoded.uplinkReasonMovement = !!(header & 2);
  decoded.uplinkReasonGpio = !!(header & 4);
  decoded.containsGps = !!(header & 8);
  decoded.containsOnboardSensors = !!(header & 16);
  decoded.containsSpecial = !!(header & 32);
  decoded.crc = bytes[index++].toString(16);
  decoded.batteryLevel = bytes[index++];

  if (decoded.containsOnboardSensors) {
    const sensorContent = bytes[index++];
    const hasSecondSensorContent = !!(sensorContent & 128);
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

    if (!decoded.sensorContent.buttonEventInfo && !decoded.uplinkReasonButton) {
      decoded.buttonClickReason = 'none';
    } else if (!decoded.sensorContent.buttonEventInfo) {
      decoded.buttonClickReason = 'single';
    } else if (!decoded.uplinkReasonButton) {
      decoded.buttonClickReason = 'long';
      decoded.uplinkReasonButton = true;
    } else {
      decoded.buttonClickReason = 'double';
    }

    if (hasSecondSensorContent) {
      const sensorContent2 = bytes[index++];
      Object.assign(decoded.sensorContent, {
        containsBluetoothData: !!(sensorContent2 & 1),
        containsRelativeHumidity: !!(sensorContent2 & 2),
        containsAirPressure: !!(sensorContent2 & 4),
        containsManDown: !!(sensorContent2 & 8),
        containsTilt: !!(sensorContent2 & 16),
        containsRetransmitCnt: !!(sensorContent2 & 32),
      });
    }

    if (decoded.sensorContent.containsTemperature) {
      decoded.temperature = toSignedShort(bytes[index++], bytes[index++]) / 100;
    }
    if (decoded.sensorContent.containsLight) {
      decoded.light = toUnsignedShort(bytes[index++], bytes[index++]);
    }
    if (decoded.sensorContent.containsAccelerometerCurrent) {
      decoded.accX = toSignedChar(bytes[index++]);
      decoded.accY = toSignedChar(bytes[index++]);
      decoded.accZ = toSignedChar(bytes[index++]);
    }
    if (decoded.sensorContent.containsAccelerometerMax) {
      decoded.maxAccX = toSignedChar(bytes[index++]);
      decoded.maxAccY = toSignedChar(bytes[index++]);
      decoded.maxAccZ = toSignedChar(bytes[index++]);
    }
    if (decoded.sensorContent.containsWifiPositioningData) {
      decoded.wifiHash = bytesToHex(bytes.slice(index, index + 6));
      index += 6;
    }
    if (decoded.sensorContent.containsExternalSensors) {
      decoded.externalSensor1 = bytes[index++];
      decoded.externalSensor2 = bytes[index++];
    }
    if (decoded.sensorContent.containsBluetoothData) {
      const slotInfo = bytes[index++];
      if (slotInfo === 0x00) {
        decoded.bluetooth = parseBeacon00();
      } else if (slotInfo === 0x01) {
        decoded.bluetooth = parseBeacon01();
      } else if (slotInfo === 0x02) {
        decoded.bluetooth = parseBeacon02();
      } else {
        throw new Error('Unknown Bluetooth slot info');
      }
    }
    if (decoded.sensorContent.containsRelativeHumidity) {
      decoded.relativeHumidity = bytes[index++] / 2;
    }
    if (decoded.sensorContent.containsAirPressure) {
      decoded.airPressure = toUnsignedShort(bytes[index++], bytes[index++]) * 2;
    }
    if (decoded.sensorContent.containsManDown) {
      decoded.manDown = !!(bytes[index++]);
    }
    if (decoded.sensorContent.containsTilt) {
      decoded.tilt = !!(bytes[index++]);
    }
    if (decoded.sensorContent.containsRetransmitCnt) {
      decoded.retransmitCounter = bytes[index++];
    }
  }

  if (decoded.containsGps) {
    decoded.gps = {
      navStat: bytes[index++],
      latitude: toSignedInt(bytes[index++], bytes[index++], bytes[index++], bytes[index++]) / 1e7,
      longitude: toSignedInt(bytes[index++], bytes[index++], bytes[index++], bytes[index++]) / 1e7,
      altRef: toUnsignedShort(bytes[index++], bytes[index++]) / 10,
      hAcc: bytes[index++],
      vAcc: bytes[index++],
      sog: toUnsignedShort(bytes[index++], bytes[index++]) / 10,
      cog: toUnsignedShort(bytes[index++], bytes[index++]) / 10,
      hdop: bytes[index++] / 10,
      numSvs: bytes[index++],
    };
  }

  return decoded;
}
