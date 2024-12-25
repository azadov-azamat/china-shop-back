const express = require('express');
const route = require('express-async-handler');
const router = express.Router();
const {
    Comment,
    User,
    Product,
    sequelize,
    Sequelize,
    Op,
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
                model: User,
                as: 'user',
            },
            {
                model: Product,
                as: 'product',
            }
        ];
        const { rows, count } = await Comment.findAndCountAll(query);
        rows.pagination = pagination(query.limit, query.offset, count);
        res.send(serialize(rows));
    })
);

router.get(
    '/:id',
    route(async function (req, res) {
        const comment = await Comment.findByPk(req.params.id);
        if (!comment) {
            return res.status(404).json({error: 'Comments not found'});
        }
        res.status(200).json(comment);
    })
);

router.post(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        const {name, description, price, category, amount, sizes} = req.body;
        const newComment = await Comment.create({name, description, price, category, amount, sizes});
        res.status(201).json(newComment);
    })
)

router.put(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const {name, description, price, category, amount, sizes} = req.body;
        const comment = await Comment.findByPk(req.params.id);
        if (!comment) {
            return res.status(404).json({error: 'Comments not found'});
        }
        await comment.update({name, description, price, category, amount, sizes});
        res.status(200).json(comment);
    })
);

router.delete(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const comment = await Comment.findByPk(req.params.id);
        if (!comment) {
            return res.status(404).json({error: 'Comments not found'});
        }
        await comment.destroy();
        res.status(204).send();
    })
);

module.exports = router;
