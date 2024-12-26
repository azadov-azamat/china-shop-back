'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class OrderItem extends Model {
        static associate({ Order, Product }) {
            OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
            OrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
        }
    }

    OrderItem.init(
        {
            quantity: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            price: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: 'OrderItem',
            timestamps: true,
        }
    );

    return OrderItem;
};