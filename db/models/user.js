'use strict';
const {Model} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate({SearchFilter, Subscription}) {
        }
    }

    User.init(
        {
            firstName: DataTypes.STRING,
            lastName: DataTypes.STRING,
            phone: DataTypes.STRING,
            telegramId: DataTypes.BIGINT,
            telegramUsername: DataTypes.STRING,
            selectedLang: DataTypes.STRING,
            isAgreed: DataTypes.BOOLEAN,
            isBlocked: DataTypes.BOOLEAN,
            latlng: {
                type: DataTypes.GEOMETRY('POINT'),
                get() {
                    const val = this.getDataValue('latlng');
                    return val?.coordinates ? val.coordinates : null;
                },
                set(val) {
                    if (val) {
                        this.setDataValue('latlng', { type: 'Point', coordinates: val });
                    }
                },
            },
            role: {
                type: DataTypes.ENUM('user', 'manager', 'merchant', 'admin'),
            },
        },
        {
            sequelize,
            modelName: 'User',
            underscored: true,
        }
    );

    return User;
};
