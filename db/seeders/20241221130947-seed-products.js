module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('products', [
      {
        name: 'Purple Hoodie',
        description: 'Comfortable and stylish purple hoodie.',
        price: 48.0,
        category: 'Hoodies',
        amount: 100,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Leather Jacket',
        description: 'Premium leather jacket for all seasons.',
        price: 36.0,
        category: 'Jackets',
        amount: 50,
        sizes: ['M', 'L', 'XL'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Printed Shirt',
        description: 'Casual shirt with colorful prints.',
        price: 28.0,
        category: 'Shirts',
        amount: 200,
        sizes: ['S', 'M', 'L'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('products', null, {});
  },
};
