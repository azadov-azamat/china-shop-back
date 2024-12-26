const express = require('express');
const route = require('express-async-handler');
const router = express.Router();
const { Order, User, OrderItem, Product } = require('../../../db/models');
const ensureAuth = require('../../middleware/ensure-auth');
const { serialize } = require('../../../db/serializers');
const pagination = require('../../utils/pagination');
const parsQps = require('../../utils/qps')();

// Get all orders
router.get(
    '/',
    ensureAuth(),
    route(async (req, res) => {
        const query = parsQps(req.query);
        query.include = [
            { model: User, as: 'user' },
            {
                model: OrderItem,
                as: 'items',
                include: [{ model: Product, as: 'product' }],
            },
        ];
        const { rows, count } = await Order.findAndCountAll(query);
        rows.pagination = pagination(query.limit, query.offset, count);
        res.send(serialize(rows));
    })
);

// Get order by ID
router.get(
    '/:id',
    ensureAuth(),
    route(async (req, res) => {
        const order = await Order.findByPk(req.params.id, {
            include: [
                { model: User, as: 'user' },
                {
                    model: OrderItem,
                    as: 'items',
                    include: [{ model: Product, as: 'product' }],
                },
            ],
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.status(200).json(serialize(order));
    })
);

// Create order
router.post(
    '/',
    ensureAuth(),
    route(async (req, res) => {
        const userId = req.user.id;
        const { items } = req.body;

        const order = await Order.create({ userId, status: 'pending', totalAmount: 0 });
        let totalAmount = 0;

        for (const item of items) {
            const product = await Product.findByPk(item.productId);
            if (!product) {
                return res.status(404).json({ error: `Product ID ${item.productId} not found` });
            }

            await OrderItem.create({
                order_id: order.id,
                product_id: item.productId,
                quantity: item.quantity,
                price: product.price,
            });

            totalAmount += product.price * item.quantity;
        }

        order.totalAmount = totalAmount;
        await order.save();

        res.status(201).json(serialize(order));
    })
);

// Delete order
router.delete(
    '/:id',
    ensureAuth(),
    route(async (req, res) => {
        const order = await Order.findByPk(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        await order.destroy();
        res.status(204).send();
    })
);

module.exports = router;
