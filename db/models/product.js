const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Product extends Model {
        static associate({Like, Media}) {
            Product.hasOne(Like, { foreignKey: 'product_id', as: 'like' });
            Product.hasMany(Media, { foreignKey: 'product_id', as: 'media', onDelete: 'cascade' });
        }
    }

    Product.init(
        {
            name: DataTypes.STRING,
            description: DataTypes.TEXT,
            price: DataTypes.FLOAT,
            category: DataTypes.STRING,
            amount: DataTypes.INTEGER,
            sizes: DataTypes.ARRAY(DataTypes.STRING),
        },
        {
            sequelize,
            modelName: 'Product',
            underscored: true,
        }
    );

    return Product;
};
