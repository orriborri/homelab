<?php

$db = new PDO('sqlite:/config/data/grocy.db', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$fields = [
	['quantity_unit_stock_to_gram_factor', 'Stock unit to grams', 'Nutrition conversion', 1],
	['kcal_per100g', 'Energy (kcal / 100 g)', 'Nutrition', 2],
	['protein_g_per100g', 'Protein (g / 100 g)', 'Nutrition', 3],
	['fat_g_per100g', 'Fat (g / 100 g)', 'Nutrition', 4],
	['saturated_fat_g_per100g', 'Saturated fat (g / 100 g)', 'Nutrition', 5],
	['carbs_g_per100g', 'Carbohydrate (g / 100 g)', 'Nutrition', 6],
	['sugar_g_per100g', 'Sugars (g / 100 g)', 'Nutrition', 7],
	['salt_g_per100g', 'Salt (g / 100 g)', 'Nutrition', 8]
];

$insert = $db->prepare('INSERT INTO userfields (entity, name, caption, type, show_as_column_in_tables, config, sort_number, input_required) VALUES (:entity, :name, :caption, :type, 0, NULL, :sort, 0)');
$exists = $db->prepare('SELECT id FROM userfields WHERE entity = :entity AND name = :name LIMIT 1');
$db->beginTransaction();
foreach ($fields as [$name, $caption, $group, $sort])
{
	$exists->execute([':entity' => 'products', ':name' => $name]);
	if (!$exists->fetchColumn())
	{
		$insert->execute([':entity' => 'products', ':name' => $name, ':caption' => $caption, ':type' => 'number-decimal', ':sort' => $sort]);
	}
}
$db->commit();
