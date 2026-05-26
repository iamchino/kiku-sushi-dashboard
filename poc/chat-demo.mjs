#!/usr/bin/env node
/**
 * POC mini — Asistente conversacional con tool-calling.
 *
 * Demuestra que Qwen2.5 14B (via Groq) puede interpretar pedidos en español
 * tipo "abrime mesa 5 para 4 personas" y producir llamadas estructuradas a
 * tools. NO ejecuta nada real, solo imprime qué haria.
 *
 * Uso:
 *   GROQ_API_KEY=gsk_xxx node chat-demo.mjs "abrime mesa 7 para 4 personas, vienen los Gomez"
 *
 * Requisitos:
 *   - Cuenta gratuita en https://console.groq.com (incluye crédito sin tarjeta)
 *   - Token: https://console.groq.com/keys
 */

const KEY = process.env.GROQ_API_KEY
if (!KEY) {
  console.error('Falta GROQ_API_KEY. Conseguilo gratis en https://console.groq.com/keys')
  process.exit(1)
}

// Definición de tools que la IA puede invocar (formato OpenAI-compatible)
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'abrir_mesa',
      description: 'Abre una mesa con la cantidad de personas y opcionalmente nombre del cliente.',
      parameters: {
        type: 'object',
        properties: {
          mesa_numero: { type: 'integer', description: 'Número de mesa visible en el salón' },
          personas:    { type: 'integer', minimum: 1, maximum: 30 },
          cliente_nombre:   { type: 'string', description: 'Opcional, nombre del cliente' },
          cliente_telefono: { type: 'string', description: 'Opcional' },
        },
        required: ['mesa_numero', 'personas'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_items_a_mesa',
      description: 'Agrega productos al pedido de una mesa ya abierta.',
      parameters: {
        type: 'object',
        properties: {
          mesa_numero: { type: 'integer' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nombre:   { type: 'string' },
                cantidad: { type: 'integer', minimum: 1 },
                notas:    { type: 'string' },
              },
              required: ['nombre', 'cantidad'],
            },
          },
        },
        required: ['mesa_numero', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cobrar_mesa',
      description: 'Cobra y opcionalmente factura una mesa. Acción de alto riesgo.',
      parameters: {
        type: 'object',
        properties: {
          mesa_numero: { type: 'integer' },
          medio_pago: { type: 'string', enum: ['efectivo', 'tarjeta', 'transferencia', 'qr'] },
          facturar:   { type: 'boolean', description: 'Si emite factura electrónica via ARCA' },
        },
        required: ['mesa_numero', 'medio_pago', 'facturar'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_reserva',
      description: 'Crea una nueva reserva en el sistema.',
      parameters: {
        type: 'object',
        properties: {
          fecha:    { type: 'string', description: 'YYYY-MM-DD' },
          hora:     { type: 'string', description: 'HH:MM en 24hs' },
          personas: { type: 'integer', minimum: 1 },
          cliente_nombre:   { type: 'string' },
          cliente_telefono: { type: 'string' },
        },
        required: ['fecha', 'hora', 'personas', 'cliente_nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_ventas',
      description: 'Devuelve un resumen de ventas en un rango.',
      parameters: {
        type: 'object',
        properties: {
          rango: { type: 'string', enum: ['hoy', 'ayer', 'esta_semana', 'este_mes'] },
        },
        required: ['rango'],
      },
    },
  },
]

const SYSTEM = `Sos "Kiku Copilot", el asistente del dashboard de KIKU SUSHI.
Tu trabajo es ayudar al equipo del restaurante a ejecutar acciones operativas
en lenguaje natural (español argentino, podés tutear).

Reglas:
- Usá las tools provistas para acciones concretas (abrir mesa, cobrar, reservar, etc).
- Si falta un dato obligatorio, preguntá amablemente antes de invocar la tool.
- Si la acción es "destructiva" (cobrar, cancelar), confirmá una vez antes.
- Si el usuario solo pregunta algo (consultar), respondé directo después de la tool.
- Hora actual del restaurante: usá la fecha de hoy implícita si dicen "hoy", "mañana", etc.
- Fecha hoy: ${new Date().toISOString().slice(0, 10)}`

async function chat(userMessage) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-2.5-32b',  // ajustar si no está disponible: 'llama-3.3-70b-versatile'
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: userMessage },
      ],
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

const userMsg = process.argv.slice(2).join(' ').trim()
if (!userMsg) {
  console.log('Uso: node chat-demo.mjs "tu mensaje en español"')
  console.log('Ejemplos:')
  console.log('  "abrime mesa 7 para 4 personas, vienen los Gomez"')
  console.log('  "agregale a la 7 dos rolls de salmon y un tea pot"')
  console.log('  "cobrale a la 4 con tarjeta y facturá"')
  console.log('  "reservame mañana 21hs para 6 personas, Vázquez 3416167617"')
  console.log('  "cuánto vendimos hoy"')
  process.exit(1)
}

console.log(`\n🧑 Usuario: ${userMsg}\n`)
const t0 = Date.now()
const response = await chat(userMsg)
const latency = ((Date.now() - t0) / 1000).toFixed(2)

const choice = response.choices[0]
const msg = choice.message

if (msg.tool_calls?.length) {
  console.log(`🤖 Kiku Copilot quiere ejecutar ${msg.tool_calls.length} acción(es) (${latency}s):\n`)
  for (const tc of msg.tool_calls) {
    console.log(`  → ${tc.function.name}(`)
    const args = JSON.parse(tc.function.arguments)
    for (const [k, v] of Object.entries(args)) {
      console.log(`      ${k}: ${JSON.stringify(v)}`)
    }
    console.log(`    )`)
  }
  if (msg.content) {
    console.log(`\n💬 Mensaje al usuario:\n  "${msg.content}"`)
  }
} else {
  console.log(`🤖 Kiku Copilot responde (${latency}s):\n  "${msg.content}"`)
}

console.log(`\n— Tokens usados: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`)
