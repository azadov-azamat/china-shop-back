const { Scenes, Markup } = require('telegraf');
const { WizardScene } = Scenes;

const { translate } = require('../utils/translate');
const { keyboards } = require('../utils/keyboards');
const { SearchFilter } = require('../../../db/models');
const { findLoads, trackButton } = require('../utils/general');


const destinationWizard = new WizardScene(
  'destinationWizard',
  async (ctx) => {
    const location = ctx.message?.location;
    const filterId = ctx.wizard.state.filterId;
    const skip = ctx.wizard.state.skipFirstStep;
    const destinationText = ctx.wizard.state.destination;

    if (destinationText) {
      ctx.wizard.selectStep(1);
      return destinationWizard.steps[1](ctx);
    }

    if (skip) {
      await ctx.reply(translate('enter-destination'),
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([[translate('skip')]]).resize()
        }
      );
      return ctx.wizard.next();
    } else {
      if (!location || !filterId) {
        await ctx.reply(translate('share-location'));
        return leaveWizard(ctx);
      }

      const filter = await SearchFilter.findByPk(filterId);
      const { latitude, longitude } = location;

      filter.originLatlng = [latitude, longitude];
      filter.user_search_id = null;
      await filter.save();
      ctx.filter = filter;

      await ctx.reply(translate('enter-destination'),
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([[translate('skip')]]).resize()
        }
      );
      return ctx.wizard.next();
    }
  },

  async (ctx) => {
    const destination = ctx.wizard.state.destination || ctx.message?.text;
    const filterId = ctx.wizard.state.filterId;
    const filter = await SearchFilter.findByPk(filterId);

    if (!destination || !filter) {
      return leaveWizard(ctx);
    }

    if (destination === translate('skip')) {
      filter.destinationCityName = null;
      filter.user_search_id = null;
      await filter.save();
      ctx.filter = filter;

      await ctx.reply(translate('location-search'), { parse_mode: 'Markdown', ...keyboards('changeDirection', { ctx }) });

      await findLoads(ctx, 0);
      trackButton(ctx, 'search_by_location', 'destination skipped');

      return ctx.scene.leave();
    } else if (destination) {

      filter.destinationCityName = destination;
      filter.user_search_id = null;
      await filter.save();
      ctx.filter = filter;

      await ctx.reply(translate('location-destination-search', { destination }), { parse_mode: 'Markdown', ...keyboards('changeDirection', { ctx }) });

      await findLoads(ctx, 0);
      trackButton(ctx, 'search_by_location');

      return ctx.scene.leave();
    } else {
      await ctx.reply(translate('enter-correct-destination'));
      return ctx.wizard.back();
    }
  }
);

async function leaveWizard(ctx) {
  await ctx.reply(translate('main-menu'), keyboards('main', { ctx }));
  return ctx.scene.leave();
}

module.exports = destinationWizard;
