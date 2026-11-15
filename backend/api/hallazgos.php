<?php
/**
 * API REST de hallazgos (PHP puro).
 *
 *   GET  /api/hallazgos.php                -> lista de hallazgos (array JSON)
 *   GET  /api/hallazgos.php?formato=csv    -> descarga hallazgos.csv
 *   GET  /api/hallazgos.php?formato=json   -> descarga hallazgos.json
 *   POST /api/hallazgos.php                -> guarda { x, y, banda, epoca, comentario, tipo?, region_id?, x2?, y2? }
 *
 * Los datos se persisten en backend/data/hallazgos.json (o en la ruta de HALLAZGOS_ARCHIVO).
 */

declare(strict_types=1);

// Ruta configurable con HALLAZGOS_ARCHIVO (p. ej. un disco persistente en Render/Railway).
define('ARCHIVO_DATOS', getenv('HALLAZGOS_ARCHIVO') ?: __DIR__ . '/../data/hallazgos.json');
// banda1..4: región sintética · w1/w2: WISE 3.4 / 4.6 µm (regiones reales).
const BANDAS_VALIDAS = ['banda1', 'banda2', 'banda3', 'banda4', 'w1', 'w2'];
const PATRON_REGION = '/^[a-z0-9][a-z0-9+\-]{0,39}$/';
const COLUMNAS_CSV = ['id', 'fecha', 'region_id', 'banda', 'epoca', 'x', 'y', 'x2', 'y2', 'tipo', 'comentario'];
const EPOCAS_VALIDAS = ['A', 'B'];
const TIPOS_VALIDOS = ['asteroide', 'cometa', 'planeta'];
const MAX_COORDENADA = 4096;
const MAX_COMENTARIO = 500;
const REGION_POR_DEFECTO = 'spx-j0412+53';

// --- CORS -----------------------------------------------------------------
// Origen permitido configurable con la variable de entorno CORS_ORIGIN (por defecto *).
$origenPermitido = getenv('CORS_ORIGIN') ?: '*';
header("Access-Control-Allow-Origin: {$origenPermitido}");
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Max-Age: 86400');
header('Access-Control-Expose-Headers: Content-Disposition');
header('Content-Type: application/json; charset=utf-8');

function responder(int $codigo, $datos): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Devuelve la lista guardada, o null si el archivo existe pero no se puede leer o no es JSON válido. */
function leerHallazgos(): ?array
{
    if (!is_file(ARCHIVO_DATOS)) {
        return [];
    }
    $contenido = file_get_contents(ARCHIVO_DATOS);
    if ($contenido === false) {
        return null;
    }
    $datos = json_decode($contenido, true);
    return is_array($datos) ? $datos : null;
}

/**
 * Añade un hallazgo bajo un bloqueo exclusivo (hallazgos.json.lock) y escribe en un archivo
 * temporal que luego se renombra: rename() es atómico, así que los lectores nunca ven un JSON
 * a medias y un fallo de escritura no destruye los datos previos.
 */
function agregarHallazgo(array $hallazgo): array
{
    $dir = dirname(ARCHIVO_DATOS);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        responder(500, ['error' => 'No se pudo crear el directorio de datos']);
    }
    $candado = fopen(ARCHIVO_DATOS . '.lock', 'c');
    if ($candado === false || !flock($candado, LOCK_EX)) {
        responder(500, ['error' => 'No se pudo bloquear hallazgos.json']);
    }

    try {
        $lista = leerHallazgos();
        if ($lista === null) {
            responder(500, ['error' => 'hallazgos.json está dañado o no se puede leer; no se sobrescribe']);
        }
        $ultimoId = 0;
        foreach ($lista as $h) {
            $ultimoId = max($ultimoId, (int) ($h['id'] ?? 0));
        }
        $hallazgo = ['id' => $ultimoId + 1] + $hallazgo + ['fecha' => gmdate('c')];
        $lista[] = $hallazgo;

        $json = json_encode($lista, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $temporal = ARCHIVO_DATOS . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $escrito = $json === false ? false : file_put_contents($temporal, $json);
        if ($escrito !== strlen((string) $json) || !rename($temporal, ARCHIVO_DATOS)) {
            @unlink($temporal);
            responder(500, ['error' => 'No se pudo guardar el hallazgo']);
        }
        return $hallazgo;
    } finally {
        flock($candado, LOCK_UN);
        fclose($candado);
    }
}

/** Región de un hallazgo; los guardados antes de `region_id` usaban `region` o ninguna (sintética). */
function regionDe(array $h): string
{
    return (string) ($h['region_id'] ?? $h['region'] ?? REGION_POR_DEFECTO);
}

/** Evita que Excel/LibreOffice interpreten un comentario como fórmula (inyección CSV). */
function celdaSegura($valor): string
{
    $texto = (string) $valor;
    return preg_match('/^[=+\-@\t\r]/', $texto) ? "'" . $texto : $texto;
}

/** Envía la lista completa como archivo descargable (CSV o JSON). */
function exportar(array $lista, string $formato): void
{
    $nombre = 'hallazgos-' . gmdate('Ymd-His');
    if ($formato === 'json') {
        header('Content-Disposition: attachment; filename="' . $nombre . '.json"');
        http_response_code(200);
        echo json_encode($lista, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $nombre . '.csv"');
    http_response_code(200);
    $salida = fopen('php://output', 'w');
    fwrite($salida, "\xEF\xBB\xBF"); // BOM: Excel detecta UTF-8 (acentos, µ)
    fputcsv($salida, COLUMNAS_CSV, ',', '"', '');
    foreach ($lista as $h) {
        $fila = [];
        foreach (COLUMNAS_CSV as $col) {
            $valor = $col === 'region_id' ? regionDe($h) : ($h[$col] ?? '');
            $fila[] = celdaSegura(is_scalar($valor) ? $valor : json_encode($valor));
        }
        fputcsv($salida, $fila, ',', '"', '');
    }
    fclose($salida);
    exit;
}

function validar(array $entrada): array
{
    $errores = [];

    foreach (['x', 'y'] as $eje) {
        if (!isset($entrada[$eje]) || !is_numeric($entrada[$eje])) {
            $errores[] = "'{$eje}' debe ser numérico";
        } elseif ($entrada[$eje] < 0 || $entrada[$eje] > MAX_COORDENADA) {
            $errores[] = "'{$eje}' fuera de rango (0-" . MAX_COORDENADA . ')';
        }
    }
    // Destino opcional (x2, y2) en la Época B: vector de trayectoria desde (x, y). Van los dos o ninguno.
    $conDestino = isset($entrada['x2']) || isset($entrada['y2']);
    if ($conDestino) {
        foreach (['x2', 'y2'] as $eje) {
            if (!isset($entrada[$eje]) || !is_numeric($entrada[$eje])) {
                $errores[] = "'x2' e 'y2' deben ser numéricos y enviarse juntos";
                break;
            }
            if ($entrada[$eje] < 0 || $entrada[$eje] > MAX_COORDENADA) {
                $errores[] = "'{$eje}' fuera de rango (0-" . MAX_COORDENADA . ')';
            }
        }
    }
    if (!in_array($entrada['banda'] ?? null, BANDAS_VALIDAS, true)) {
        $errores[] = "'banda' debe ser una de: " . implode(', ', BANDAS_VALIDAS);
    }
    if (!in_array($entrada['epoca'] ?? null, EPOCAS_VALIDAS, true)) {
        $errores[] = "'epoca' debe ser 'A' o 'B'";
    }
    $comentario = $entrada['comentario'] ?? '';
    if (!is_string($comentario)) {
        $errores[] = "'comentario' debe ser texto";
        $comentario = '';
    }
    $comentario = trim($comentario);
    $longitud = function_exists('mb_strlen') ? mb_strlen($comentario, 'UTF-8') : preg_match_all('/./us', $comentario);
    if ($longitud > MAX_COMENTARIO) {
        $errores[] = "'comentario' supera " . MAX_COMENTARIO . ' caracteres';
    }
    $tipo = $entrada['tipo'] ?? null;
    if ($tipo !== null && !in_array($tipo, TIPOS_VALIDOS, true)) {
        $errores[] = "'tipo' debe ser uno de: " . implode(', ', TIPOS_VALIDOS);
    }
    // `region` se sigue aceptando como alias de clientes anteriores.
    $region = $entrada['region_id'] ?? $entrada['region'] ?? REGION_POR_DEFECTO;
    if (!is_string($region) || !preg_match(PATRON_REGION, $region)) {
        $errores[] = "'region_id' debe ser un identificador en minúsculas (a-z, 0-9, + o -)";
    }

    if ($errores) {
        responder(400, ['error' => implode('; ', $errores)]);
    }

    $hallazgo = [
        'region_id' => $region,
        'x' => (int) round((float) $entrada['x']),
        'y' => (int) round((float) $entrada['y']),
        'banda' => $entrada['banda'],
        'epoca' => $entrada['epoca'],
        'comentario' => $comentario,
    ];
    if ($conDestino) {
        $hallazgo['x2'] = (int) round((float) $entrada['x2']);
        $hallazgo['y2'] = (int) round((float) $entrada['y2']);
    }
    if ($tipo !== null) {
        $hallazgo['tipo'] = $tipo;
    }
    return $hallazgo;
}

// --- Enrutado por método HTTP ----------------------------------------------
switch ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
    case 'OPTIONS':
        // Preflight CORS: el navegador pregunta antes de un POST con Content-Type: application/json.
        http_response_code(204);
        exit;

    case 'GET':
        $lista = leerHallazgos();
        if ($lista === null) {
            responder(500, ['error' => 'hallazgos.json está dañado o no se puede leer']);
        }
        $lista = array_map(fn(array $h): array => ['region_id' => regionDe($h)] + $h, $lista);
        $formato = $_GET['formato'] ?? null;
        if ($formato !== null) {
            if (!in_array($formato, ['csv', 'json'], true)) {
                responder(400, ['error' => "'formato' debe ser 'csv' o 'json'"]);
            }
            exportar($lista, $formato);
        }
        responder(200, $lista);

    case 'POST':
        $entrada = json_decode(file_get_contents('php://input') ?: '', true);
        if (!is_array($entrada)) {
            responder(400, ['error' => 'El cuerpo debe ser un objeto JSON válido']);
        }
        $hallazgo = agregarHallazgo(validar($entrada));
        responder(201, ['ok' => true, 'hallazgo' => $hallazgo]);

    default:
        header('Allow: GET, POST, OPTIONS');
        responder(405, ['error' => 'Método no permitido']);
}
