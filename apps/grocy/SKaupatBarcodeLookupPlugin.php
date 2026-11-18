<?php

use Grocy\Helpers\BaseBarcodeLookupPlugin;

/** Read-only EAN lookup against S-kaupat's product catalogue. */
class SKaupatBarcodeLookupPlugin extends BaseBarcodeLookupPlugin
{
	public const PLUGIN_NAME = 'S-kaupat (Porvoo)';
	private const STORE_ID = '613756626'; // S-market Näsi, Porvoo

	private function FindUnitId(array $names)
	{
		foreach ($this->QuantityUnits as $unit)
		{
			if (in_array(strtolower(trim($unit->name)), $names, true))
			{
				return $unit->id;
			}
		}
		return null;
	}

	private function PackageGrams(array $product)
	{
		// Never treat the catalogue's approximate piece weight as a fixed package size.
		if (in_array(strtoupper($product['basicQuantityUnit'] ?? ''), ['KG', 'KGM'], true)
			|| preg_match('/(?:\bn\.|\bnoin\b|\bapprox\.?|~|≈)/iu', $product['name']))
		{
			return null;
		}

		// The API's bare numeric netWeight has no verified unit. Only use explicit units.
		$netWeight = $product['measurement']['netWeight'] ?? null;
		$candidates = is_string($netWeight) ? [$netWeight, $product['name']] : [$product['name']];
		foreach ($candidates as $text)
		{
			$count = preg_match_all('/(?<![\p{L}\d.,])(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g)\b/iu', $text, $matches, PREG_SET_ORDER);
			// Multiple labelled weights (e.g. net and drained) require manual review.
			if ($count > 1) return null;
			if ($count !== 1) continue;
			$match = $matches[0];
			$grams = (float)str_replace(',', '.', $match[2]);
			$grams *= strtolower($match[3]) === 'kg' ? 1000 : 1;
			$grams *= $match[1] !== '' ? (int)$match[1] : 1;
			return is_finite($grams) && $grams > 0 ? $grams : null;
		}
		return null;
	}

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
    basicQuantityUnit
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
		$packId = $this->FindUnitId(['pack', 'package', 'pakkaus', 'paketti', 'pkt']);
		$gramId = $this->FindUnitId(['gram', 'grams', 'gramma', 'grammaa', 'g']);
		$grams = $this->PackageGrams($product);
		$useWeight = $grams !== null && $packId !== null && $gramId !== null;

		$result = [
			'name' => $product['name'],
			'description' => $description,
			'location_id' => $locationId,
			'qu_id_purchase' => $useWeight ? $packId : $quId,
			'qu_id_stock' => $useWeight ? $gramId : $quId,
			'__qu_factor_purchase_to_stock' => $useWeight ? $grams : 1,
			'__barcode' => (string)$barcode
		];
		return $result;
	}
}
