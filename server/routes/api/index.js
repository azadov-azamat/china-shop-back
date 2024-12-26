const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/bots', require('./bots'));
router.use('/likes', require('./likes'));
router.use('/media', require('./media'));
router.use('/products', require('./products'));
router.use('/comments', require('./comments'));
router.use('/buckets', require('./buckets'));
router.use('/cards', require('./cards'));
router.use('/receipts', require('./receipts'));
router.use('/orders', require('./orders'));

module.exports = router;
