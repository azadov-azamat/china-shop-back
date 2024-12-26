'use strict';
const {Model} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Order extends Model {
        static associate({User, Product, OrderItem}) {
            Order.belongsTo(User, {foreignKey: 'user_id', as: 'user'});

            Order.belongsToMany(Product, {
                through: OrderItem,
                foreignKey: 'order_id',
                otherKey: 'product_id',
                as: 'products',
            });
        }
    }

    Order.init(
        {
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'pending', // pending, completed, canceled
            },
            totalAmount: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
                defaultValue: 0.0,
            },
        },
        {
            sequelize,
            modelName: 'Order',
            timestamps: true,
        }
    );

    return Order;
};