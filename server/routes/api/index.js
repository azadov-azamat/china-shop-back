const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/bots', require('./bots'));
router.use('/likes', require('./likes'));
router.use('/media', require('./media'));

module.exports = router;