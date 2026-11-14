<?php
/**
 * API REST de hallazgos (PHP puro).
 *
 *   GET  /api/hallazgos.php  -> lista de hallazgos (array JSON)
 *   POST /api/hallazgos.php  -> guarda { x, y, banda, epoca, comentario, tipo? }
 *
 * Los datos se persisten en backend/data/hallazgos.json.
 */

declare(strict_types=1);

const ARCHIVO_DATOS = __DIR__ . '/../data/hallazgos.json';
const BANDAS_VALIDAS = ['banda1', 'banda2', 'banda3', 'banda4'];
const EPOCAS_VALIDAS = ['A', 'B'];
const TIPOS_VALIDOS = ['asteroide', 'cometa', 'planeta'];
const MAX_COORDENADA = 4096;
const MAX_COMENTARIO = 500;

// --- CORS -----------------------------------------------------------------
// Origen permitido configurable con la variable de entorno CORS_ORIGIN (por defecto *).
$origenPermitido = getenv('CORS_ORIGIN') ?: '*';
header("Access-Control-Allow-Origin: {$origenPermitido}");
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

function responder(int $codigo, $datos): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function leerHallazgos(): array
{
    if (!is_file(ARCHIVO_DATOS)) {
        return [];
    }
    $contenido = file_get_contents(ARCHIVO_DATOS);
    $datos = json_decode($contenido ?: '[]', true);
    return is_array($datos) ? $datos : [];
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

    if ($errores) {
        responder(400, ['error' => implode('; ', $errores)]);
    }

    $hallazgo = [
        'x' => (int) round((float) $entrada['x']),
        'y' => (int) round((float) $entrada['y']),
        'banda' => $entrada['banda'],
        'epoca' => $entrada['epoca'],
        'comentario' => $comentario,
    ];
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
        responder(200, leerHallazgos());

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
