# Grocy nutrition tracking

Grocy's barcode lookup uses the S-kaupat catalogue for S-market Näsi in Porvoo
(store ID `613756626`). The catalogue is unofficial and store-specific. When a
product is found, its name, description, ingredients, and full nutrition-label
values are added to the product lookup result. The lookup only reads public
catalogue data; it does not use an S-kaupat account.

The deployment adds these product userfields automatically:

| Field | Meaning |
| --- | --- |
| `kcal_per100g` | kcal per 100 g |
| `protein_g_per100g` | Protein per 100 g |
| `fat_g_per100g` | Fat per 100 g |
| `saturated_fat_g_per100g` | Saturated fat per 100 g |
| `carbs_g_per100g` | Carbohydrate per 100 g |
| `sugar_g_per100g` | Sugars per 100 g |
| `salt_g_per100g` | Salt per 100 g |
| `quantity_unit_stock_to_gram_factor` | Grams represented by one stock unit |

Enter the per-100-g values from the product label in these fields. For a product
tracked in grams, set its conversion factor to `1`. If a stock unit represents
a package of 500 g, set the factor to `500`. Grocy's recipe and meal-plan pages
then show estimated energy, protein, carbohydrate, fat, saturated fat, sugar,
and salt totals. Recipe positions using units other than the product stock unit
need a matching stock-unit conversion for totals to be accurate.

Nutrition fields are added idempotently to the existing Grocy database by a
small startup helper. It only adds missing definitions and does not change
product records or existing nutrition values.
