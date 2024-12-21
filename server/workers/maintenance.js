const createQueue = require('./utils/create-queue');
const { getPricePerKiloStatistics } = require('../utils/statistics');
const { Load, Vehicle, User, sequelize, Sequelize, Op } = require('../../db/models');
const debug = require('debug')('worker:maintenance');
const error = require('debug')('worker:maintenance:error');
const Promise = require('bluebird');

const jobOptions = {
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};

const queue = createQueue('maintenance-hourly', { defaultJobOptions: jobOptions });
const queue2 = createQueue('maintenance-daily', { defaultJobOptions: jobOptions });
const queue3 = createQueue('process-vehicle-load', { defaultJobOptions: jobOptions });

async function processor() {
  debug('Processor function started');

  try {
    const [count1, updatedLoads] = await Load.update(
      { isArchived: true },
      {
        where: {
          [Op.or]: [
            {
              duplicationCounter: {
                [Op.gt]: 650,
              },
              isArchived: false,
            },
            {
              duplicationCounter: {
                [Op.gt]: 245,
              },
              destination_country_id: {
                [Op.in]: [1, 8],
              },
              origin_country_id: {
                [Op.in]: [1, 8],
              },
              isArchived: false,
            },
            {
              destination_country_id: {
                [Op.in]: [1, 8],
              },
              origin_country_id: {
                [Op.in]: [1, 8],
              },
              createdAt: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '4.5 days'"),
              },
              isArchived: false,
            },
            {
              loadReadyDate: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '1.5 days'"),
              },
              isArchived: false,
            },
            {
              createdAt: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '6 days'"),
              },
              isArchived: false,
            },
            {
              publishedDate: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '3 days'"),
              },
              isArchived: false,
            },
            {
              expirationButtonCounter: {
                [Op.gt]: 3,
              },
              openMessageCounter: {
                [Op.gt]: 6,
              },
              isArchived: false,
            },
            {
              expirationButtonCounter: {
                [Op.gt]: 2,
              },
              openMessageCounter: {
                [Op.gt]: 22,
              },
              isArchived: false,
            },
          ],
        },
        returning: ['id', 'expiration_button_counter'],
      }
    );
    debug(`Archived ${count1} loads.`);

    const archivedLoadIds = updatedLoads
      .filter(({ expirationButtonCounter }) => expirationButtonCounter > 0)
      .map(({ id }) => id);

    if (archivedLoadIds.length) {
      debug(`Archived Load IDs with positive expirationButtonCounter: ${archivedLoadIds}`);
      await sequelize
        .query(
          `
          UPDATE users
          SET marked_expired_loads = array(
            SELECT unnest(marked_expired_loads)
            EXCEPT
            SELECT unnest(array[:archivedLoadIds]::varchar[])
          )
          WHERE marked_expired_loads && array[:archivedLoadIds]::varchar[]
        `,
          {
            replacements: { archivedLoadIds },
            type: Sequelize.QueryTypes.UPDATE,
          }
        )
        .catch(error);
      debug(`Updated users' marked_expired_loads for archived loads.`);
    }

    const [count2, updatedVehicles] = await Vehicle.update(
      { isArchived: true },
      {
        where: {
          [Op.or]: [
            {
              duplicationCounter: {
                [Op.gt]: 200,
              },
              isArchived: false,
            },
            {
              createdAt: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '4 days'"),
              },
              isArchived: false,
            },
            {
              publishedDate: {
                [Op.lte]: Sequelize.literal("NOW() - INTERVAL '2.8 days'"),
              },
              isArchived: false,
            },
            {
              invalidButtonCounter: {
                [Op.gt]: 3,
              },
              isArchived: false,
            },
          ],
        },
        returning: ['id', 'invalid_button_counter'],
      }
    );
    debug(`Archived ${count2} vehicles.`);

    const archivedVehicleIds = updatedVehicles
      .filter(({ invalidButtonCounter }) => invalidButtonCounter > 0)
      .map(({ id }) => id);

    if (archivedVehicleIds.length) {
      debug(`Archived Vehicle IDs with positive invalidButtonCounter: ${archivedVehicleIds}`);
      await sequelize
        .query(
          `
          UPDATE users
          SET marked_invalid_vehicles = array(
            SELECT unnest(marked_invalid_vehicles)
            EXCEPT
            SELECT unnest(array[:archivedVehicleIds]::varchar[])
          )
          WHERE marked_invalid_vehicles && array[:archivedVehicleIds]::varchar[]
        `,
          {
            replacements: { archivedVehicleIds },
            type: Sequelize.QueryTypes.UPDATE,
          }
        )
        .catch(error);
      debug(`Updated users' marked_invalid_vehicles for archived vehicles.`);
    }

    await sequelize.query(`
      WITH DuplicateLoads AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
              PARTITION BY
                  phone,
                  description_hash,
                  origin_city_name,
                  destination_city_name
              ORDER BY
                  published_date DESC
          ) AS rn
        FROM
          loads_active
        WHERE
          phone IS NOT NULL AND
          description_hash IS NOT NULL AND
          origin_city_name IS NOT NULL AND
          destination_city_name IS NOT NULL
      )
      DELETE FROM loads
      WHERE id IN (
          SELECT id
          FROM DuplicateLoads
          WHERE rn > 1
      );
    `);

    debug('Processor function completed successfully.');
  } catch (err) {
    error('Error in processor function:', err);
  }
}

async function calculateStatistics() {
  const results = await sequelize.query(
    `
    SELECT
      origin_city_id,
      destination_city_id
    FROM bot_top_searches
    WHERE
      (origin_country_id IN (1, 8) OR destination_country_id IN (1, 8))
      AND origin_city_id IS NOT NULL
      AND destination_city_id IS NOT NULL;
  `,
    {
      type: sequelize.QueryTypes.SELECT,
    }
  );

  await Promise.map(
    results,
    async ({ origin_city_id, destination_city_id }) => {
      const priceStats = await getPricePerKiloStatistics(origin_city_id, destination_city_id);

      if (!priceStats.average || priceStats.count < 15) {
        return;
      }

      debug(`${origin_city_id} - ${destination_city_id} calculating stats`);

      await sequelize.query(
        `
      INSERT INTO statistics_load_kilo_prices
      (date, average, median, max, min, count, destination_city_id, origin_city_id)
      VALUES (CURRENT_DATE, :average, :median, :max, :min, :count, :destination_city_id, :origin_city_id)
      ON CONFLICT (date, origin_city_id, destination_city_id)
      DO UPDATE SET
        average = EXCLUDED.average,
        median = EXCLUDED.median,
        max = EXCLUDED.max,
        min = EXCLUDED.min,
        count = EXCLUDED.count;
    `,
        {
          replacements: {
            average: priceStats.average?.toFixed(2),
            median: priceStats.median?.toFixed(2),
            max: priceStats.max?.toFixed(2),
            min: priceStats.min?.toFixed(2),
            count: priceStats.count,
            destination_city_id: destination_city_id,
            origin_city_id: origin_city_id,
          },
        }
      );
    },
    { concurrency: 1 }
  );

  debug(`stats complete`);
}

async function processor2() {
  debug('Processor function started');

  await sequelize.query('REFRESH MATERIALIZED VIEW bot_top_searches;');
  debug('bot_top_searches view updated.');

  await sequelize.query('REFRESH MATERIALIZED VIEW truck_types_count;');
  debug('truck_types_count view updated.');

  await sequelize.query('REFRESH MATERIALIZED VIEW goods_summary;');
  debug('goods_summary view updated.');

  await sequelize.query('REFRESH MATERIALIZED VIEW loads_with_null_destination;');
  debug('loads_with_null_destination view updated.');

  await sequelize.query('REFRESH MATERIALIZED VIEW loads_with_null_origin;');
  debug('loads_with_null_origin view updated.');

  const [results, metadata] = await sequelize.query(`
    UPDATE users
    SET vehicle_search_limit = 2
    WHERE vehicle_search_limit < 2;
  `);

  debug(`Users reset vehicle limit: ${metadata.rowCount}`);

  const [results2, metadata2] = await sequelize.query(`
    UPDATE users
    SET load_search_limit = 20
    WHERE load_search_limit < 20;
  `);

  debug(`Users reset loads limit: ${metadata2.rowCount}`);

  await sequelize.query(`
    UPDATE loads
    SET owner_id = users.id
    FROM users
    WHERE loads.telegram_user_id = users.telegram_id AND loads.owner_id IS NULL;
  `);

  await sequelize.query(`
     UPDATE loads
     SET
      origin_country_id = destination_country_id,
      destination_country_id = origin_country_id,
      origin_city_id = destination_city_id,
      destination_city_id = origin_city_id,
      origin_city_name = destination_city_name,
      destination_city_name = origin_city_name
     WHERE
      origin_country_id = 1
      AND destination_country_id = 2
      AND (goods ILIKE '%мясо%' OR goods ILIKE '%Пиломатериал%' OR goods ILIKE '%МДФ, ДСП%' OR goods ILIKE '%ДСП%'  OR goods ILIKE '%ДСП-МДФ%' OR goods ILIKE '%МДФ%' OR goods ILIKE '%подсолнечное масло%' OR goods ILIKE '%фанера%'  OR goods ILIKE '%ТАХТА%' OR goods ILIKE '%Фанер%');
    `);

  await calculateStatistics();

  debug('All materialized views updated.');
}

async function processor3({ data }) {
  if (data.type === 'vehicle') {
  } else if (data.type === 'load') {
  }
}

queue.process(processor);
queue2.process(processor2);
queue3.process(processor3);

queue.on('failed', (job, err) => error(err));
queue.on('error', err => error(err));

queue2.on('failed', (job, err) => error(err));
queue2.on('error', err => error(err));

queue3.on('failed', (job, err) => error(err));
queue3.on('error', err => error(err));

queue2.add(
  {},
  {
    jobId: 1,
    repeat: { cron: '0 23 * * *' },
  }
);

queue.add({}, { jobId: 1, repeat: { every: 1000 * 60 * 60 } });

debug('Worker started and waiting for jobs...');
