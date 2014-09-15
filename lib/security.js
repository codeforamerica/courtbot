var crypto = require('crypto');

exports.encryptPhone = function(phone) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');
  return encryptedPhone;
};

exports.decryptPhone = function(encryptedPhone) {
  var decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var phone = decipher.update(encryptedPhone, 'hex', 'utf8') + decipher.final('utf8');
  return phone;
};
