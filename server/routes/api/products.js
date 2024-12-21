const express = require('express');
const route = require('express-async-handler');
const router = express.Router();
const {
    Products,
    sequelize,
    Sequelize,
    Op,
} = require('../../../db/models');
const ensureAuth = require("../../middleware/ensure-auth");

router.get(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        const products = await Products.findAll();
        res.status(200).json(products);
    })
);

router.get(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const product = await Products.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({error: 'Products not found'});
        }
        res.status(200).json(product);
    })
);

router.post(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        const {name, description, price, category, amount, sizes} = req.body;
        const newProduct = await Products.create({name, description, price, category, amount, sizes});
        res.status(201).json(newProduct);
    })
)

router.put(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const {name, description, price, category, amount, sizes} = req.body;
        const product = await Products.findByPk(req.params.id);
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
        const product = await Products.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({error: 'Products not found'});
        }
        await product.destroy();
        res.status(204).send();
    })
);

module.exports = router;
