<?php

// Standalone lookup regression checks: php debug/test-grocy-weight.php
namespace Grocy\Helpers {

abstract class BaseBarcodeLookupPlugin
{
	public function __construct(protected $Locations, protected $QuantityUnits, protected $UserSettings) {}
	public function Lookup($barcode) { return $this->ExecuteLookup($barcode); }
}

}

namespace GrocyWeightTest {

// Exercise the real lookup with a deterministic catalogue response, without HTTP or DB writes.
function curl_init($url) { return null; }
function curl_setopt_array($curl, $options) {}
function curl_exec($curl) { return json_encode(['data' => ['product' => $GLOBALS['product']]]); }
function curl_getinfo($curl, $option) { return 200; }
function curl_close($curl) {}

$source = $GLOBALS['plugin_source'] ?? file_get_contents(__DIR__ . '/../apps/grocy/SKaupatBarcodeLookupPlugin.php');
eval(preg_replace('/^<\?php/', 'namespace GrocyWeightTest;', $source));
$units = [(object)['id' => 2, 'name' => 'Piece'], (object)['id' => 3, 'name' => 'Pack'], (object)['id' => 4, 'name' => 'Gram']];
$settings = ['product_presets_location_id' => -1, 'product_presets_qu_id' => 2];
$checks = 0;

function check($name, $product, $expected, $unitsOverride = null)
{
	global $units, $settings, $checks;
	$GLOBALS['product'] = $product;
	$plugin = new SKaupatBarcodeLookupPlugin([(object)['id' => 1]], $unitsOverride ?? $units, $settings);
	$result = $plugin->Lookup('6410000000001');
	foreach ($expected as $key => $value)
	{
		if (($result[$key] ?? null) != $value)
		{
			throw new \RuntimeException($name . ': ' . $key . ' expected ' . json_encode($value) . ', got ' . json_encode($result[$key] ?? null));
		}
	}
	$checks++;
}

check('500 g package', ['name' => 'Pasta 500 g'], ['qu_id_purchase' => 3, 'qu_id_stock' => 4, '__qu_factor_purchase_to_stock' => 500]);
check('decimal kilograms', ['name' => 'Flour 1,5kg'], ['__qu_factor_purchase_to_stock' => 1500]);
check('multipack', ['name' => 'Bars 6 x 25 g'], ['__qu_factor_purchase_to_stock' => 150]);
check('volume is not weight', ['name' => 'Milk 1 l', 'measurement' => ['netWeight' => 1]], ['qu_id_stock' => 2, '__qu_factor_purchase_to_stock' => 1]);
check('unknown numeric unit', ['name' => 'Pasta', 'measurement' => ['netWeight' => 0.5]], ['qu_id_stock' => 2]);
check('explicit net weight', ['name' => 'Pasta', 'measurement' => ['netWeight' => '500 g']], ['qu_id_stock' => 4, '__qu_factor_purchase_to_stock' => 500]);
check('variable weight', ['name' => 'Cheese n. 500 g', 'basicQuantityUnit' => 'KG'], ['qu_id_stock' => 2]);
check('zero weight', ['name' => 'Empty 0 g'], ['qu_id_stock' => 2]);
check('ambiguous weights', ['name' => 'Tuna 200 g / 150 g'], ['qu_id_stock' => 2]);
check('missing gram unit', ['name' => 'Pasta 500 g'], ['qu_id_stock' => 2], [$units[0], $units[1]]);
check('Finnish unit names', ['name' => 'Pasta 500 g'], ['qu_id_purchase' => 3, 'qu_id_stock' => 4], [(object)['id' => 2, 'name' => 'kappale'], (object)['id' => 3, 'name' => 'pakkaus'], (object)['id' => 4, 'name' => 'gramma']]);
echo "PASS: $checks lookup checks\n";

}
