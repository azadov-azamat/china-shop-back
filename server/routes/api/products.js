const express = require('express');
const route = require('express-async-handler');
const router = express.Router();
const {
    Product,
    sequelize,
    Sequelize,
    Op, Like, Media
} = require('../../../db/models');
const ensureAuth = require("../../middleware/ensure-auth");
const {serialize} = require("../../../db/serializers");
const pagination = require('../../utils/pagination');
const parsQps = require('../../utils/qps')();

router.get(
    '/',
    route(async function (req, res) {
        const query = parsQps(req.query);
        query.include = [
            {
                model: Like,
                as: 'like',
            },
            {
                model: Media,
                as: 'media',
            }
        ];
        const {rows, count} = await Product.findAndCountAll(query);
        rows.pagination = pagination(query.limit, query.offset, count);
        res.send(serialize(rows));
    })
);

router.get(
    '/:id',
    route(async function (req, res) {
        const product = await Product.findOne({
            where: {
                id: req.params.id
            },
            include: [
                {
                    model: Like,
                    as: 'like',
                },
                {
                    model: Media,
                    as: 'media',
                }
            ]
        });
        if (!product) {
            return res.status(404).json({error: 'Products not found'});
        }
        res.send(serialize(product));
    })
);

router.post(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        const {name, description, price, category, amount, sizes} = req.body;
        const newProduct = await Product.create({name, description, price, category, amount, sizes});
        res.status(serialize(newProduct));
    })
)

router.put(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const {name, description, price, category, amount, sizes} = req.body;
        const product = await Product.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({error: 'Products not found'});
        }
        await product.update({name, description, price, category, amount, sizes});
        res.status(200).json(product);
    })
);

router.delete(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const product = await Product.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({error: 'Products not found'});
        }
        await product.destroy();
        res.status(204).send();
    })
);

module.exports = router;
