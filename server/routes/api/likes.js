const express = require('express');
const route = require('express-async-handler');
const { Like, Sequelize, Property } = require('../../../db/models');
const { deserialize, serialize } = require('../../../db/serializers');
const parseQps = require('../../utils/qps')();
const ensureAuth = require('../../middleware/ensure-auth');
const pagination = require('../../utils/pagination');

const router = express.Router();

router.post(
  '/',
  ensureAuth(),
  route(async function (req, res) {
    let json = await deserialize(req.body);
    let propertyId = req.body.data.relationships.property.data.id;

    json.owner_id = req.user.id;
    json.property_id = propertyId;

    let like = await Like.create(json);

    res.send(serialize(like));
  })
);

router.get(
  '/',
  ensureAuth(),
  route(async function (req, res) {
    const query = parseQps(req.query);
    query.where.owner_id = req.user.id;
    query.where.liked = query.where.liked === undefined ? true : query.where.liked;
    query.include = [{ model: Property, as: 'property' }];

    let { rows, count } = await Like.findAndCountAll(query);
    rows.pagination = pagination(query.limit, query.offset, count);

    res.send(serialize(rows));
  })
);

router.get(
  '/:id',
  ensureAuth(),
  route(async function (req, res) {
    const { id } = req.params;
    let userId = req.user.id;
    let query = { where: { id, owner_id: userId }, raw: true };

    let like = await Like.findOne(query);

    res.send(serialize(like));
  })
);

router.delete(
  '/:id',
  ensureAuth(),
  route(async function (req, res) {
    const { id } = req.params;
    let userId = req.user.id;

    await Like.destroy({ where: { id, owner_id: userId } });

    res.sendStatus(204);
  })
);

module.exports = router;
