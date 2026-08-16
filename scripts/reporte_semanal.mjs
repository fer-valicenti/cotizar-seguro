// reporte_semanal.mjs
// Corre una vez por semana (GitHub Actions) para armar un PDF con toda la
// actividad de los últimos 7 días (clientes, pólizas, alertas, cobranzas,
// interacciones) y mandarlo por mail.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import PDFDocument from 'pdfkit';
import { writeFileSync } from 'fs';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const dryRun = process.argv.includes('--dry-run');

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

const COLOR_DARK = '#0F172A';
const COLOR_MUTED = '#64748B';
const COLOR_TEXT = '#334155';
const COLOR_EMPTY = '#94A3B8';

function hoyArgentinaISODate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ARGENTINA_TZ }); // 'YYYY-MM-DD'
}

function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString('es-AR', { timeZone: ARGENTINA_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Últimos 7 días (calendario Argentina) terminando hoy a las 00:00 — corre
// todos los lunes, pero funciona igual si se dispara manualmente otro día.
function rangoSemanal() {
  const fin = new Date(`${hoyArgentinaISODate()}T00:00:00-03:00`);
  const inicio = new Date(fin);
  inicio.setUTCDate(inicio.getUTCDate() - 7);
  const ultimoDiaInclusive = new Date(fin.getTime() - 1);

  return {
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString(),
    inicioStr: inicio.toISOString().slice(0, 10),
    finStr: fin.toISOString().slice(0, 10),
    label: `${formatearFechaCorta(inicio)} al ${formatearFechaCorta(ultimoDiaInclusive)}`,
  };
}

function nombreRamo(ramo, detalle) {
  return detalle ? `${ramo} (${detalle})` : ramo;
}

function moneyFmt(n) {
  return n == null ? '-' : `$${Number(n).toLocaleString('es-AR')}`;
}

async function recolectarDatos() {
  const rango = rangoSemanal();
  const { inicioISO, finISO, inicioStr, finStr } = rango;

  const consultas = {
    clientesNuevos: supabase.from('clientes')
      .select('nombre,apellido,telefono,origen_lead')
      .gte('created_at', inicioISO).lt('created_at', finISO).order('created_at'),
    polizasNuevas: supabase.from('polizas')
      .select('numero_poliza,prima,detalle_ramo,clientes(nombre,apellido),ramos(nombre)')
      .gte('created_at', inicioISO).lt('created_at', finISO).order('created_at'),
    polizasRenovadas: supabase.from('polizas')
      .select('numero_poliza,clientes(nombre,apellido),ramos(nombre)')
      .eq('estado', 'renovada').gte('updated_at', inicioISO).lt('updated_at', finISO),
    polizasCanceladas: supabase.from('polizas')
      .select('numero_poliza,clientes(nombre,apellido),ramos(nombre)')
      .eq('estado', 'cancelada').gte('updated_at', inicioISO).lt('updated_at', finISO),
    polizasVencidas: supabase.from('polizas')
      .select('numero_poliza,clientes(nombre,apellido),ramos(nombre)')
      .eq('estado', 'vencida').gte('updated_at', inicioISO).lt('updated_at', finISO),
    alertasGeneradas: supabase.from('alertas')
      .select('tipo').gte('created_at', inicioISO).lt('created_at', finISO),
    alertasPendientes: supabase.from('alertas')
      .select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    cuotasPagadas: supabase.from('cuotas')
      .select('monto,numero_cuota,polizas(numero_poliza,clientes(nombre,apellido))')
      .eq('estado', 'pagada').gte('fecha_pago', inicioStr).lt('fecha_pago', finStr),
    cuotasPendientes: supabase.from('cuotas')
      .select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    interacciones: supabase.from('interacciones')
      .select('tipo,resultado').gte('fecha', inicioISO).lt('fecha', finISO),
  };

  const claves = Object.keys(consultas);
  const resultados = await Promise.all(Object.values(consultas));

  const datos = { rango };
  claves.forEach((clave, i) => {
    const { data, count, error } = resultados[i];
    if (error) throw new Error(`Error consultando "${clave}": ${error.message}`);
    datos[clave] = data ?? count ?? 0;
  });
  return datos;
}

function seccion(doc, titulo, items, formatear) {
  doc.moveDown(0.9);
  doc.fontSize(13).fillColor(COLOR_DARK).font('Helvetica-Bold').text(titulo);
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica');
  if (!items.length) {
    doc.fillColor(COLOR_EMPTY).text('Sin novedades esta semana.');
    return;
  }
  items.forEach((item) => doc.fillColor(COLOR_TEXT).text(`•  ${formatear(item)}`));
}

function generarPdf(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor(COLOR_DARK).font('Helvetica-Bold').text('Reporte semanal — Seguros CRM');
    doc.fontSize(11).fillColor(COLOR_MUTED).font('Helvetica').text(`Semana del ${datos.rango.label}`);

    doc.moveDown(1);
    doc.fontSize(13).fillColor(COLOR_DARK).font('Helvetica-Bold').text('Resumen de la semana');
    doc.moveDown(0.3);

    const montoCobrado = datos.cuotasPagadas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
    const kpis = [
      ['Clientes nuevos', datos.clientesNuevos.length],
      ['Pólizas nuevas', datos.polizasNuevas.length],
      ['Pólizas renovadas', datos.polizasRenovadas.length],
      ['Pólizas canceladas', datos.polizasCanceladas.length],
      ['Pólizas vencidas sin renovar', datos.polizasVencidas.length],
      ['Alertas enviadas al cliente', datos.alertasGeneradas.length],
      ['Alertas pendientes de gestionar (a hoy)', datos.alertasPendientes],
      ['Cuotas cobradas', datos.cuotasPagadas.length],
      ['Monto cobrado', moneyFmt(montoCobrado)],
      ['Cuotas pendientes de cobro (a hoy)', datos.cuotasPendientes],
    ];
    doc.fontSize(11).font('Helvetica');
    kpis.forEach(([label, valor]) => {
      doc.fillColor(COLOR_MUTED).text(label, { continued: true, width: 320 });
      doc.fillColor(COLOR_DARK).font('Helvetica-Bold').text(`  ${valor}`);
      doc.font('Helvetica');
    });

    seccion(doc, 'Clientes nuevos', datos.clientesNuevos,
      (c) => `${c.nombre} ${c.apellido} — ${c.telefono}${c.origen_lead ? ` (${c.origen_lead})` : ''}`);

    seccion(doc, 'Pólizas nuevas', datos.polizasNuevas,
      (p) => `${p.clientes.nombre} ${p.clientes.apellido} — ${nombreRamo(p.ramos.nombre, p.detalle_ramo)} — Póliza ${p.numero_poliza}${p.prima ? ` — ${moneyFmt(p.prima)}` : ''}`);

    seccion(doc, 'Pólizas renovadas', datos.polizasRenovadas,
      (p) => `${p.clientes.nombre} ${p.clientes.apellido} — ${p.ramos.nombre} — Póliza ${p.numero_poliza}`);

    seccion(doc, 'Pólizas canceladas', datos.polizasCanceladas,
      (p) => `${p.clientes.nombre} ${p.clientes.apellido} — ${p.ramos.nombre} — Póliza ${p.numero_poliza}`);

    seccion(doc, 'Pólizas vencidas sin renovar', datos.polizasVencidas,
      (p) => `${p.clientes.nombre} ${p.clientes.apellido} — ${p.ramos.nombre} — Póliza ${p.numero_poliza}`);

    seccion(doc, 'Cuotas cobradas', datos.cuotasPagadas,
      (c) => `${c.polizas.clientes.nombre} ${c.polizas.clientes.apellido} — Póliza ${c.polizas.numero_poliza} — Cuota ${c.numero_cuota} — ${moneyFmt(c.monto)}`);

    doc.moveDown(0.9);
    doc.fontSize(13).fillColor(COLOR_DARK).font('Helvetica-Bold').text('Interacciones registradas');
    doc.moveDown(0.2);
    doc.fontSize(10).font('Helvetica');
    if (!datos.interacciones.length) {
      doc.fillColor(COLOR_EMPTY).text('Sin interacciones registradas esta semana.');
    } else {
      const porTipo = {};
      datos.interacciones.forEach((i) => {
        const tipo = i.tipo || 'sin tipo';
        porTipo[tipo] = (porTipo[tipo] || 0) + 1;
      });
      doc.fillColor(COLOR_TEXT).text(`Total: ${datos.interacciones.length}`);
      Object.entries(porTipo).forEach(([tipo, cant]) => doc.fillColor(COLOR_TEXT).text(`•  ${tipo}: ${cant}`));
    }

    doc.moveDown(1.2);
    doc.fontSize(8).fillColor(COLOR_MUTED)
      .text(`Generado automáticamente el ${new Date().toLocaleString('es-AR', { timeZone: ARGENTINA_TZ })}hs (Argentina).`);

    doc.end();
  });
}

async function enviarPorMail(pdfBuffer, rango) {
  // Admite uno o varios mails separados por coma (ej: "vos@mail.com, socio@mail.com").
  const destino = process.env.REPORTE_EMAIL_DESTINO.split(',').map((m) => m.trim()).filter(Boolean);
  const nombreArchivo = `reporte-semanal-${rango.inicioStr}-a-${rango.finStr}.pdf`;

  const { data, error } = await resend.emails.send({
    from: 'Seguros CRM <onboarding@resend.dev>',
    to: destino,
    subject: `Reporte semanal — ${rango.label}`,
    html: `<p>Hola! Te comparto el reporte semanal de actividad del CRM, correspondiente a la semana del ${rango.label}.</p>`,
    attachments: [{ filename: nombreArchivo, content: pdfBuffer.toString('base64') }],
  });

  if (error) throw new Error(`Error enviando el mail: ${JSON.stringify(error)}`);
  console.log(`Reporte enviado a ${destino.join(', ')} (id: ${data.id})`);
}

async function main() {
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Recolectando datos de la semana...`);
  const datos = await recolectarDatos();
  console.log('Generando PDF...');
  const pdfBuffer = await generarPdf(datos);

  if (dryRun) {
    const archivo = `reporte-semanal-preview-${datos.rango.inicioStr}-a-${datos.rango.finStr}.pdf`;
    writeFileSync(archivo, pdfBuffer);
    console.log(`Reporte guardado localmente en "${archivo}" (no se envió mail).`);
    return;
  }

  console.log('Enviando por mail...');
  await enviarPorMail(pdfBuffer, datos.rango);
  console.log('Listo.');
}

main().catch((err) => {
  console.error('Error generando/enviando el reporte semanal:', err);
  process.exit(1);
});
