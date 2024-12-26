require('dotenv').config();
const express = require('express');
const route = require('express-async-handler');
const ensureAuth = require('../../middleware/ensure-auth');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const router = express.Router();

const sendPaycomRequest = async (method, params) => {
  const payload = {
    id: uuidv4(),
    method,
    params,
  };

  let token =  process.env.PAYCOM_PROD_API
  let id = process.env.PAYCOM_CHEKOUT_ID
  // console.log(id, token);
  try {
    const response = await axios.post(token, payload, {
      headers: {
        'X-Auth': id,
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
    });
    // console.log(response);
    return { data: response.data, status: response.status };
  } catch (error) {
    console.error(error);
    if (error.response) {
      throw { status: error.response.status, data: error.response.data };
    }
    throw { status: 500, data: { error: 'Error communicating with Paycom API' } };
  }
};

const handlePaycomRequest = (method, paramKey) => {
  return route(async function(req, res) {
    const params = {};
    paramKey.forEach(key => {
      if (req.body[key]) params[key] = req.body[key];
    });

    if (Object.keys(params).length < paramKey.length) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    let wrappedParams = params;
    if (method === 'cards.create') {
      wrappedParams = { card: params };
    }

    try {
      const result = await sendPaycomRequest(method, wrappedParams);
      res.status(result.status).json(result.data);
    } catch (error) {
      res.status(error.status).json(error.data);
    }
  });
};

router.post('/', ensureAuth(), handlePaycomRequest('cards.create', ['number', 'expire']));
router.post('/verify-code', ensureAuth(), handlePaycomRequest('cards.get_verify_code', ['token']));
router.post('/verify', ensureAuth(), handlePaycomRequest('cards.verify', ['token', 'code']));
router.post('/check', ensureAuth(), handlePaycomRequest('cards.check', ['token']));
router.post('/remove', ensureAuth(), handlePaycomRequest('cards.remove', ['token']));

module.exports = router;
