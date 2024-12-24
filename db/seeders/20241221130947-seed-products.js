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
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'Leather Jacket',
        description: 'Premium leather jacket for all seasons.',
        price: 36.0,
        category: 'Jackets',
        amount: 50,
        sizes: ['M', 'L', 'XL'],
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'Printed Shirt',
        description: 'Casual shirt with colorful prints.',
        price: 28.0,
        category: 'Shirts',
        amount: 200,
        sizes: ['S', 'M', 'L'],
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('products', null, {});
  },
};
