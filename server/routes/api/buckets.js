const express = require('express');
const route = require('express-async-handler');
const router = express.Router();
const {
    Bucket,
    User,
    Product,
    sequelize,
    Sequelize,
    Op, Media,
} = require('../../../db/models');
const ensureAuth = require("../../middleware/ensure-auth");
const {serialize} = require("../../../db/serializers");
const pagination = require('../../utils/pagination');
const parsQps = require('../../utils/qps')();

router.get(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        const query = parsQps(req.query);
        query.include = [
            {
                model: User,
                as: 'user',
            },
            {
                model: Product,
                as: 'product',
                include: [
                    {
                        model: Media,
                        as: 'media',
                    }
                ]
            }
        ];
        const {rows, count} = await Bucket.findAndCountAll(query);
        rows.pagination = pagination(query.limit, query.offset, count);
        res.send(serialize(rows));
    })
);

router.get(
    '/count',
    ensureAuth(),
    route(async function (req, res) {
        const query = parsQps(req.query);
        query.include = [
            {
                model: User,
                as: 'user',
            },
            {
                model: Product,
                as: 'product',
            }
        ];
        const count = await Bucket.count(query);
        res.send({count});
    })
);

router.get(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const bucket = await Bucket.findByPk(req.params.id);
        if (!bucket) {
            return res.status(404).json({error: 'Buckets not found'});
        }
        res.send(serialize(bucket));
    })
);

router.post(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        let {count, size, product} = req.body;
        const userId = req.user.id;
        product = await Product.findOne({where: {id: product.id}});

        if (!product) {
            res.send({error: 'Product not found'});
        }

        const newBucket = await Bucket.create({count, size, user_id: userId, product_id: product.id});
        res.send(serialize(newBucket));
    })
)

router.patch(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const json = req.body;
        const bucket = await Bucket.findByPk(req.params.id);
        if (!bucket) {
            return res.status(404).json({error: 'Products not found'});
        }
        res.send(serialize(await bucket.update(json)));
    })
);

router.delete(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const bucket = await Bucket.findByPk(req.params.id);
        if (!bucket) {
            return res.status(404).json({error: 'Buckets not found'});
        }
        await bucket.destroy();
        res.status(204).send();
    })
);

module.exports = router;
