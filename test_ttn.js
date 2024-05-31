const decoder = require('./decoder_ttn');

function parse(hex) {
  const cleanedHex = hex.replace(/\s/g, '');
  const buffer = Buffer.from(cleanedHex, 'hex');
  return decoder(buffer);
}
console.log(process.argv)
const payload = parse(process.argv[2]);
console.log(payload)
