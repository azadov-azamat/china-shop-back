require('dotenv').config();

const axios = require('axios');

const getLatLong = async cityName => {
  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: {
        q: cityName,
        appid: apiKey,
      },
    });

    const { coord } = response.data;
    const lat = coord.lat;
    const long = coord.lon;

    return [lat, long];
  } catch (error) {
    console.error(`Xatolik yuz berdi: ${error}`);
    return null;
  }
};

async function calculateDistanceMatrix(originLat, originLng, destLat, destLng) {
  const apiKey = process.env.GOOGLE_API_KEY;

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'OK') {
    const element = data.rows[0].elements[0];

    const distance = element.distance ? element.distance.value : null; // Metrda
    const duration = element.duration ? element.duration.value : null; // Soniyada

    return {
      distance_meters: distance,
      duration_seconds: duration,
      destination_address: data.destination_addresses[0],
      origin_address: data.origin_addresses[0],
    };
  } else {
    console.error('API request failed with status: ' + data.status);
  }
}

function removePhoneNumbers(text) {
  const phoneNumberPattern =
    /(?!\d{2}[.-])[+]?(\b\d{1,3}[ .-]?)?([(]?\d{2,3}[)]?)((?:[ .-]?\d){4,7})(?![ .-]?\d)/g;
  const removedPhones = [];
  const newText = text.replace(phoneNumberPattern, match => {
    if (match.trim().endsWith('0000')) {
      return match; // Do not replace if it ends with '0000'
    }
    removedPhones.push(match.trim());
    return '';
  });

  return {
    text: newText.trim(),
    removedPhones,
  };
}

function formatOwnerUsername(owner, phone) {
  if (owner?.telegramUsername) {
    if (phone) {
      return ` · [telegram](https://t.me/${owner.telegramUsername})`;
    } else {
      return `\n\n[telegram](https://t.me/${owner.telegramUsername})`;
    }
  } else if (owner?.phone) {
    if (phone) {
      return ` · [telegram](https://t.me/+${owner.phone})`;
    } else {
      return `\n\n[telegram](https://t.me/+${owner.phone})`;
    }
    // } else if (owner?.otherPhones.length) {
    // return ``;
    // if (phone) {
    //   return ` · [telegram](https://t.me/+${addCountryCode(owner?.otherPhones[0])})`;
    // } else {
    //   return `\n\n [telegram](https://t.me/+${addCountryCode(owner?.otherPhones[0])})`;
    // }
    // } else if (phone) {
    //   return ` · [telegram](https://t.me/+${addCountryCode(phone)})`;
  }

  return '';
}

function removeTelegramHeader(text) {
  // remove Sardor , [21.08.2024 9:59]
  const regex = /^(.{1,32}?), \[(\d{2}\.\d{2}\.\d{4} \d{1,2}:\d{2})\]\n*/;
  return text.replace(regex, '');
}

function extractPhoneNumber(text) {
  if (!text) return null;

  // const regex = /\+?\d(\s*|\-?\d){6,20}/;
  const regex =
    /(?!\d{2}[.-])[+]?(\b\d{1,3}[ .-]?)?([(]?\d{2,3}[)]?)((?:[ .-]?\d){4,7})(?![ .-]?\d)/;
  const match = text.match(regex);

  let result = match ? match[0].replace(/[\s\-]+/g, '') : null;

  return result?.length < 7 ? null : result;
}

module.exports = {
  getLatLong,
  formatOwnerUsername,
  calculateDistanceMatrix,
  removeTelegramHeader,
  removePhoneNumbers,
  extractPhoneNumber,
};
