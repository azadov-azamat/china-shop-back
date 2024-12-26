const express = require('express');
const route = require('express-async-handler');
const {v4: uuidv4} = require('uuid');
const {Media, Company, Product} = require('../../../db/models');
const {serialize, deserialize} = require('../../../db/serializers');
const ensureAuth = require('../../middleware/ensure-auth');
const {getSignedUploadUrl} = require("../../services/aws");
const parsQps = require('../../utils/qps')();

const router = express.Router();
const MEDIA_COUNT_LIMIT = 20;

router.post(
    '/',
    ensureAuth(),
    route(async function (req, res) {
        let json = req.body;

        let {user, product} = json;

        let productId = product?.id || null;
        let userId = user?.id || null;

        let mediaCount = await Media.count({
            where: {product_id: productId, user_id: userId},
        });

        if (productId) {
            if (mediaCount > MEDIA_COUNT_LIMIT) {
                return res.sendStatus(401);
            }
        } else if (json.contentType) {
            await Media.destroy({
                where: {
                    user_id: userId,
                    content_type: json.contentType,
                },
            });
        } else {
            if (mediaCount > 0) {
                await Media.destroy({
                    where: {
                        user_id: userId,
                    },
                });
                // return res.sendStatus(401);
            }
        }

        if (productId) {
            product = await Product.findOne({where: {id: productId}});
            if (!product) {
                return res.sendStatus(401);
            }
        }

        let media = await Media.create({
            product_id: productId,
            user_id: userId,
            order: mediaCount - 1,
            ...json,
        });

        res.send(serialize(media));
    }),
);

router.patch(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const {id} = req.params;
        let json = await deserialize(req.body);
        // let { error, value } = userSchema.validate(json);
        // if (error) {
        //   return res.send({ error })
        // }
        // json = value;

        // let isOwnUser = req.user.id === param.id;
        // if (!req.userCan.updateAny('user') && !(isOwnUser && req.userCan.updateOwn('user'))) {
        //   return res.sendStatus(401);
        // }

        let [_, media] = await Media.update(json, {where: {id}, returning: true});
        res.send(serialize(media));
    }),
);

router.get(
    '/',
    route(async function (req, res) {
        const query = parsQps(req.query);

        let media = await Media.findAll(query);

        res.send(serialize(media));
    }),
);

router.get(
    '/upload-url/product',
    ensureAuth(),
    route(async function (req, res) {
        const {id} = req.query;

        let mediaCount = await Media.count({where: {product_id: id}});
        if (mediaCount > MEDIA_COUNT_LIMIT) {
            return res.sendStatus(401);
        }

        let product = Product.findOne({where: {id}});
        if (!product) {
            return res.sendStatus(401);
        }

        let uuid = uuidv4();
        let uploadUrl = await getSignedUploadUrl(`products/${id}/${uuid}`);

        res.send({id: uuid, uploadUrl, expires: 60 * 60});
    }),
);

router.get(
    '/upload-url/user',
    ensureAuth(),
    route(async function (req, res) {
        const {id} = req.query;

        let mediaCount = await Media.count({where: {user_id: id}});
        if (mediaCount > 0) {
            // return res.sendStatus(401);
        }

        if (req.user.id !== parseInt(id, 10)) {
            return res.sendStatus(401);
        }

        let uuid = uuidv4();
        let uploadUrl = await getSignedUploadUrl(`users/${id}/${uuid}`);

        res.send({id: uuid, uploadUrl, expires: 60 * 60});
    }),
);

router.get(
    '/count',
    route(async function (req, res) {
        const {product_id} = req.query;
        const query = ({where: {product_id}, raw: true});
        const {rows, count} = await Media.findAndCountAll(query);

        res.send({count});
    }),
);

router.get(
    '/:id',
    route(async function (req, res) {
        const {id} = req.params;

        let media = await Media.findOne({where: {id}, raw: true});

        res.send(serialize(media));
    }),
);

router.delete(
    '/:id',
    ensureAuth(),
    route(async function (req, res) {
        const {id} = req.params;

        let media = await Media.findOne({
            where: {id, '$product.owner_id$': req.user.id},
            include: [{model: Product, as: 'product'}],
        });

        if (media) {
            await media.destroy();
        }

        res.sendStatus(204);
    }),
);

module.exports = router;
