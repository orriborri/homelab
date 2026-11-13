/* Nutrition summary for Grocy recipes and planned meals. */
(function () {
  'use strict';

  const nutrientFields = {
    kcal: 'kcal_per100g',
    protein: 'protein_g_per100g',
    fat: 'fat_g_per100g',
    saturatedFat: 'saturated_fat_g_per100g',
    carbs: 'carbs_g_per100g',
    sugar: 'sugar_g_per100g',
    salt: 'salt_g_per100g'
  };
  const labels = [
    ['kcal', 'kcal'], ['protein', 'protein g'], ['carbs', 'carbs g'],
    ['fat', 'fat g'], ['saturatedFat', 'sat. fat g'], ['sugar', 'sugars g'], ['salt', 'salt g']
  ];

  function number(value) {
    const parsed = Number(String(value == null ? '' : value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function userfields(object) {
    return object && (object.userfields || object.Userfields) || {};
  }

  function macrosForPositions(positions, products, recipeId) {
    const totals = Object.fromEntries(Object.keys(nutrientFields).map(key => [key, 0]));
    (positions || []).filter(pos => Number(pos.recipe_id) === Number(recipeId) && !Number(pos.is_nested_recipe_pos)).forEach(pos => {
      const product = products[Number(pos.product_id)];
      if (!product) return;
      const fields = userfields(product);
      const grams = number(pos.amount) * number(fields.quantity_unit_stock_to_gram_factor);
      Object.entries(nutrientFields).forEach(([key, field]) => {
        totals[key] += number(fields[field]) * grams / 100;
      });
    });
    return totals;
  }

  function format(totals) {
    return labels.map(([key, label]) => `${label}: ${totals[key].toFixed(key === 'kcal' ? 0 : 1)}`).join(' · ');
  }

  function addPanel(title, lines) {
    const panel = document.createElement('section');
    panel.className = 'panel panel-default grocy-nutrition-summary';
    panel.style.margin = '12px 0';
    const heading = document.createElement('div');
    heading.className = 'panel-heading';
    heading.textContent = title;
    panel.appendChild(heading);
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.textContent = lines.join(' | ');
    panel.appendChild(body);
    const target = document.querySelector('.container-fluid') || document.body;
    target.prepend(panel);
  }

  async function load(entity) {
    return Grocy.Api.Get(`objects/${entity}`);
  }

  async function init() {
    if (!window.Grocy || !Grocy.Api || typeof Grocy.Api.Get !== 'function') return;
    const path = window.location.pathname;
    if (!/\/recipes(?:\/|$)|\/mealplan(?:\/|$)/i.test(path)) return;
    try {
      const [productsRows, positions, recipes, mealPlan] = await Promise.all([
        load('products'), load('recipes_pos'), load('recipes'), load('meal_plan')
      ]);
      const products = Object.fromEntries((productsRows || []).map(product => [Number(product.id), product]));
      const recipeRows = recipes || [];
      const lines = [];
      if (/\/mealplan(?:\/|$)/i.test(path)) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        (mealPlan || []).filter(item => {
          const date = new Date(item.day);
          return !Number.isNaN(date.getTime()) && date >= start;
        }).forEach(item => {
          const recipe = recipeRows.find(candidate => Number(candidate.id) === Number(item.recipe_id));
          if (!recipe) return;
          const totals = macrosForPositions(positions, products, recipe.id);
          const servings = number(item.recipe_servings) || number(recipe.base_servings) || 1;
          const ratio = servings / (number(recipe.base_servings) || 1);
          Object.keys(totals).forEach(key => { totals[key] *= ratio; });
          lines.push(`${recipe.name} (${servings} servings): ${format(totals)}`);
        });
      } else {
        const selected = new URLSearchParams(window.location.search).get('recipe');
        const recipe = recipeRows.find(candidate => Number(candidate.id) === Number(selected));
        if (recipe) {
          lines.push(`${recipe.name} total: ${format(macrosForPositions(positions, products, recipe.id))}`);
        }
      }
      if (lines.length) addPanel('Nutrition (estimated from product fields)', lines);
    } catch (error) {
      console.warn('Grocy nutrition summary could not load nutrition data', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
