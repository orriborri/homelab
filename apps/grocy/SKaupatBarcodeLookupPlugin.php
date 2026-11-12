<?php

use Grocy\Helpers\BaseBarcodeLookupPlugin;

/** Read-only EAN lookup against S-kaupat's product catalogue. */
class SKaupatBarcodeLookupPlugin extends BaseBarcodeLookupPlugin
{
	public const PLUGIN_NAME = 'S-kaupat (Porvoo)';
	private const STORE_ID = '613756626'; // S-market Näsi, Porvoo

	protected function ExecuteLookup($barcode)
	{
		if (!preg_match('/^\d{8,14}$/', (string)$barcode))
		{
			return null;
		}

		$query = <<<'GRAPHQL'
query ProductByEan($id: ID!, $storeId: ID!) {
  product(id: $id, storeId: $storeId) {
    id
    name
    description
    ingredientStatement
    nutrients { name value ri kcal }
    allergens { allergenTypeText levelOfContainmentCode }
    measurement { netWeight }
  }
}
GRAPHQL;

		$payload = json_encode([
			'query' => $query,
			'variables' => ['id' => (string)$barcode, 'storeId' => self::STORE_ID]
		]);
		$curl = curl_init('https://api.s-kaupat.fi/');
		curl_setopt_array($curl, [
			CURLOPT_POST => true,
			CURLOPT_POSTFIELDS => $payload,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
			CURLOPT_CONNECTTIMEOUT => 5,
			CURLOPT_TIMEOUT => 12,
			CURLOPT_USERAGENT => 'Grocy-Skaupat-Lookup/1.0'
		]);
		$response = curl_exec($curl);
		$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
		curl_close($curl);
		if ($response === false || $status < 200 || $status >= 300)
		{
			return null;
		}

		$data = json_decode($response, true);
		$product = $data['data']['product'] ?? null;
		if (!$product || empty($product['name']))
		{
			return null;
		}

		$nutrition = [];
		foreach (($product['nutrients'] ?? []) as $nutrient)
		{
			if (isset($nutrient['name'], $nutrient['value']))
			{
				$nutrition[] = $nutrient['name'] . ': ' . $nutrient['value'];
			}
		}
		$description = trim((string)($product['description'] ?? ''));
		if (!empty($product['ingredientStatement']))
		{
			$description .= "\nIngredients: " . $product['ingredientStatement'];
		}
		if ($nutrition)
		{
			$description .= "\nNutrition (as listed by S-kaupat): " . implode('; ', $nutrition);
		}
		$allergens = array_map(static function ($allergen) {
			return trim(($allergen['allergenTypeText'] ?? '') . ' ' . ($allergen['levelOfContainmentCode'] ?? ''));
		}, $product['allergens'] ?? []);
		$allergens = array_filter($allergens);
		if ($allergens)
		{
			$description .= "\nAllergens: " . implode('; ', $allergens);
		}

		$locationId = $this->UserSettings['product_presets_location_id'] != -1
			? $this->UserSettings['product_presets_location_id'] : $this->Locations[0]->id;
		$quId = $this->UserSettings['product_presets_qu_id'] != -1
			? $this->UserSettings['product_presets_qu_id'] : $this->QuantityUnits[0]->id;

		$result = [
			'name' => $product['name'],
			'description' => $description,
			'location_id' => $locationId,
			'qu_id_purchase' => $quId,
			'qu_id_stock' => $quId,
			'__qu_factor_purchase_to_stock' => 1,
			'__barcode' => (string)$barcode
		];
		return $result;
	}
}
