// alertas.js
// Corre diariamente (cron / n8n / GitHub Actions) para detectar
// pólizas y cuotas que vencen en 15 o 5 días, y generar el link de WhatsApp.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role: el cron corre server-side
);

const DIAS_ANTICIPACION = [15, 5];

const PLANTILLAS = {
  // Fin de la COBERTURA (la póliza deja de estar vigente) — distinto de una
  // cuota, que es solo un pago dentro de una póliza que sigue activa.
  vencimiento_poliza: (nombre, ramo, fecha, dias) =>
    `Hola ${nombre}! 👋 Te escribo de tu Productor de Seguros para avisarte que ` +
    `tu cobertura de *${ramo}* finaliza el *${fecha}* (en ${dias} días). ` +
    `Cualquier consulta, quedo atento 🙌`,
  // Vencimiento de un PAGO puntual — la póliza sigue vigente, es solo cobranza.
  vencimiento_cuota: (nombre, ramo, fecha, dias) =>
    `Hola ${nombre}! 👋 Te recuerdo que el *${fecha}* (en ${dias} días) vence el pago de una ` +
    `cuota de tu póliza de *${ramo}*. Tu cobertura sigue vigente, es solo un recordatorio de ` +
    `pago. Cualquier consulta, avisame 🙌`,
};

// Cuando el ramo es "Otros" (o cualquiera con detalle cargado), lo mostramos
// junto al detalle: "Otros (seguro de viajero)" en vez de solo "Otros".
function nombreRamo(ramo, detalle) {
  return detalle ? `${ramo} (${detalle})` : ramo;
}

function generarLinkWhatsapp(telefono, mensaje) {
  const telefonoLimpio = telefono.replace(/[^\d]/g, ''); // solo dígitos, con código de país
  const textoCodificado = encodeURIComponent(mensaje);
  return `https://wa.me/${telefonoLimpio}?text=${textoCodificado}`;
}

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

// La cobertura de una póliza vence a una hora exacta (12:00hs por convención),
// no "en algún momento del día". Formateamos mostrando esa hora para que el
// cliente sepa con precisión hasta cuándo está cubierto.
function formatearFecha(fecha) {
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ARGENTINA_TZ,
  }).replace(',', ' a las') + 'hs';
}

// Las cuotas no tienen hora exacta de vencimiento (a diferencia de la vigencia
// de la póliza), así que se muestran solo con el día.
function formatearFechaSimple(fecha) {
  return new Date(fecha + 'T12:00:00-03:00').toLocaleDateString('es-AR', { timeZone: ARGENTINA_TZ });
}

// El servidor (GitHub Actions) corre en UTC, pero "hoy" para este negocio es
// el día calendario en Argentina. Lo calculamos explícito para no desfasarnos
// un día en casos límite (ej: correrlo pasada la medianoche UTC).
function hoyArgentinaISODate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ARGENTINA_TZ }); // 'YYYY-MM-DD'
}

// Convierte "hoy (Argentina) + N días" al rango [00:00, 24:00) de ese día
// calendario, en formato ISO con offset fijo -03:00 (Argentina no usa horario
// de verano). Sirve para encontrar pólizas que vencen ese día, sin importar
// la hora exacta de vencimiento dentro del día.
function rangoDelDia(diasDesdeHoy) {
  const base = new Date(`${hoyArgentinaISODate()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + diasDesdeHoy);
  const fechaStr = base.toISOString().slice(0, 10);

  const inicio = `${fechaStr}T00:00:00-03:00`;
  const finBase = new Date(`${fechaStr}T00:00:00-03:00`);
  finBase.setUTCDate(finBase.getUTCDate() + 1);
  const fin = finBase.toISOString();

  return { fechaStr, inicio, fin };
}

async function detectarVencimientosPolizas() {
  const hoyStr = hoyArgentinaISODate();

  for (const dias of DIAS_ANTICIPACION) {
    const { inicio, fin } = rangoDelDia(dias);

    const { data: polizas, error } = await supabase
      .from('polizas')
      .select('id, numero_poliza, fecha_vencimiento, detalle_ramo, cliente_id, clientes(nombre, apellido, telefono), ramos(nombre)')
      .eq('estado', 'activa')
      .gte('fecha_vencimiento', inicio)
      .lt('fecha_vencimiento', fin);

    if (error) throw error;

    for (const poliza of polizas) {
      const nombreCompleto = `${poliza.clientes.nombre} ${poliza.clientes.apellido}`;
      const mensaje = PLANTILLAS.vencimiento_poliza(
        poliza.clientes.nombre,
        nombreRamo(poliza.ramos.nombre, poliza.detalle_ramo),
        formatearFecha(poliza.fecha_vencimiento),
        dias
      );
      const enlace = generarLinkWhatsapp(poliza.clientes.telefono, mensaje);

      // upsert evita duplicar gracias al UNIQUE(poliza_id, tipo, dias_anticipacion)
      const { error: upsertError } = await supabase.from('alertas').upsert(
        {
          poliza_id: poliza.id,
          tipo: 'vencimiento_poliza',
          dias_anticipacion: dias,
          fecha_alerta: hoyStr,
          enlace_whatsapp: enlace,
          estado: 'pendiente',
        },
        { onConflict: 'poliza_id,tipo,dias_anticipacion' }
      );

      if (upsertError) console.error(`Error alerta póliza ${poliza.numero_poliza}:`, upsertError);
      else console.log(`✅ Alerta generada (${dias}d) para ${nombreCompleto} - Póliza ${poliza.numero_poliza}`);
    }
  }
}

async function detectarVencimientosCuotas() {
  const hoyStr = hoyArgentinaISODate();

  for (const dias of DIAS_ANTICIPACION) {
    const { fechaStr: fechaObjetivoStr } = rangoDelDia(dias);

    const { data: todasLasCuotas, error } = await supabase
      .from('cuotas')
      .select('id, poliza_id, fecha_vencimiento_cuota, polizas(numero_poliza, detalle_ramo, forma_pago, cliente_id, clientes(nombre, telefono), ramos(nombre))')
      .eq('estado', 'pendiente')
      .eq('fecha_vencimiento_cuota', fechaObjetivoStr);

    if (error) throw error;

    // Con débito automático el pago se cobra solo — no hace falta recordarle
    // la cuota al cliente (sí se lo sigue avisando del vencimiento total de
    // la póliza, eso pasa en detectarVencimientosPolizas independientemente).
    const cuotas = todasLasCuotas.filter(c => c.polizas.forma_pago !== 'debito_automatico');

    for (const cuota of cuotas) {
      const cliente = cuota.polizas.clientes;
      const mensaje = PLANTILLAS.vencimiento_cuota(
        cliente.nombre,
        nombreRamo(cuota.polizas.ramos.nombre, cuota.polizas.detalle_ramo),
        formatearFechaSimple(cuota.fecha_vencimiento_cuota),
        dias
      );
      const enlace = generarLinkWhatsapp(cliente.telefono, mensaje);

      const { error: upsertError } = await supabase.from('alertas').upsert(
        {
          poliza_id: cuota.poliza_id,
          cuota_id: cuota.id,
          tipo: 'vencimiento_cuota',
          dias_anticipacion: dias,
          fecha_alerta: hoyStr,
          enlace_whatsapp: enlace,
          estado: 'pendiente',
        },
        { onConflict: 'poliza_id,tipo,dias_anticipacion' }
      );

      if (upsertError) console.error('Error alerta cuota:', upsertError);
      else console.log(`✅ Alerta de cobranza generada (${dias}d) para ${cliente.nombre}`);
    }
  }
}

// Pasa a "vencida" cualquier póliza activa cuya vigencia ya terminó. Nunca
// se borra nada — el cliente y el historial de la póliza quedan intactos
// por si el día de mañana la renueva.
async function marcarPolizasVencidas() {
  const ahoraISO = new Date().toISOString();
  const { data, error } = await supabase
    .from('polizas')
    .update({ estado: 'vencida' })
    .eq('estado', 'activa')
    .lt('fecha_vencimiento', ahoraISO)
    .select('numero_poliza');

  if (error) throw error;
  if (data.length) {
    console.log(`📋 ${data.length} póliza(s) pasaron a "vencida" automáticamente: ${data.map(p => p.numero_poliza).join(', ')}`);
  }
}

async function main() {
  await marcarPolizasVencidas();
  await detectarVencimientosPolizas();
  await detectarVencimientosCuotas();
  console.log('Listo. Revisá la tabla "alertas" en Supabase para ver los links generados.');
}

main().catch((err) => {
  console.error('Error corriendo el script de alertas:', err);
  process.exit(1);
});
