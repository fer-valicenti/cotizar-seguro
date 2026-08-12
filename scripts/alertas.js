// alertas.js
// Corre diariamente (cron / n8n / GitHub Actions) para detectar
// pólizas y cuotas que vencen en 30, 15 o 5 días, y generar el link de WhatsApp.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role: el cron corre server-side
);

const DIAS_ANTICIPACION = [30, 15, 5];

const PLANTILLAS = {
  vencimiento_poliza: (nombre, ramo, fecha, dias) =>
    `Hola ${nombre}! 👋 Te escribo de tu Productor de Seguros. ` +
    `Tu póliza de *${ramo}* vence el *${fecha}* (en ${dias} días). ` +
    `¿Querés que te prepare la renovación o cotizamos alguna mejora? Quedo atento 🙌`,
  vencimiento_cuota: (nombre, ramo, fecha, dias) =>
    `Hola ${nombre}! 👋 Te recuerdo que la cuota de tu póliza de *${ramo}* ` +
    `vence el *${fecha}* (en ${dias} días). Cualquier consulta sobre el pago, avisame por acá 🙌`,
};

function generarLinkWhatsapp(telefono, mensaje) {
  const telefonoLimpio = telefono.replace(/[^\d]/g, ''); // solo dígitos, con código de país
  const textoCodificado = encodeURIComponent(mensaje);
  return `https://wa.me/${telefonoLimpio}?text=${textoCodificado}`;
}

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-AR');
}

async function detectarVencimientosPolizas() {
  const hoy = new Date();

  for (const dias of DIAS_ANTICIPACION) {
    const fechaObjetivo = new Date(hoy);
    fechaObjetivo.setDate(hoy.getDate() + dias);
    const fechaObjetivoStr = fechaObjetivo.toISOString().slice(0, 10);

    const { data: polizas, error } = await supabase
      .from('polizas')
      .select('id, numero_poliza, fecha_vencimiento, cliente_id, clientes(nombre, apellido, telefono), ramos(nombre)')
      .eq('estado', 'activa')
      .eq('fecha_vencimiento', fechaObjetivoStr);

    if (error) throw error;

    for (const poliza of polizas) {
      const nombreCompleto = `${poliza.clientes.nombre} ${poliza.clientes.apellido}`;
      const mensaje = PLANTILLAS.vencimiento_poliza(
        poliza.clientes.nombre,
        poliza.ramos.nombre,
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
          fecha_alerta: hoy.toISOString().slice(0, 10),
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
  const hoy = new Date();

  for (const dias of DIAS_ANTICIPACION) {
    const fechaObjetivo = new Date(hoy);
    fechaObjetivo.setDate(hoy.getDate() + dias);
    const fechaObjetivoStr = fechaObjetivo.toISOString().slice(0, 10);

    const { data: cuotas, error } = await supabase
      .from('cuotas')
      .select('id, poliza_id, fecha_vencimiento_cuota, monto, polizas(numero_poliza, cliente_id, clientes(nombre, telefono), ramos(nombre))')
      .eq('estado', 'pendiente')
      .eq('fecha_vencimiento_cuota', fechaObjetivoStr);

    if (error) throw error;

    for (const cuota of cuotas) {
      const cliente = cuota.polizas.clientes;
      const mensaje = PLANTILLAS.vencimiento_cuota(
        cliente.nombre,
        cuota.polizas.ramos.nombre,
        formatearFecha(cuota.fecha_vencimiento_cuota),
        dias
      );
      const enlace = generarLinkWhatsapp(cliente.telefono, mensaje);

      const { error: upsertError } = await supabase.from('alertas').upsert(
        {
          poliza_id: cuota.poliza_id,
          cuota_id: cuota.id,
          tipo: 'vencimiento_cuota',
          dias_anticipacion: dias,
          fecha_alerta: hoy.toISOString().slice(0, 10),
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

async function main() {
  await detectarVencimientosPolizas();
  await detectarVencimientosCuotas();
  console.log('Listo. Revisá la tabla "alertas" en Supabase para ver los links generados.');
}

main().catch((err) => {
  console.error('Error corriendo el script de alertas:', err);
  process.exit(1);
});
