// backup.mjs
// Corre diariamente (GitHub Actions) y guarda una copia completa de todas
// las tablas en un bucket privado de Supabase Storage. Nadie puede acceder
// a ese bucket salvo con la service_role key (ni siquiera un usuario
// logueado en el panel) — no está pensado para restaurar solo, sino para
// tener con qué recuperar datos si algo se borra por error.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLAS = ['clientes', 'polizas', 'cuotas', 'interacciones', 'alertas', 'ramos', 'aseguradoras', 'productores'];
const RETENCION_DIAS = 30;

async function exportarTablas() {
  const backup = { generado_en: new Date().toISOString(), tablas: {} };

  for (const tabla of TABLAS) {
    const { data, error } = await supabase.from(tabla).select('*');
    if (error) throw new Error(`Error exportando ${tabla}: ${error.message}`);
    backup.tablas[tabla] = data;
  }

  return backup;
}

async function subirBackup(backup) {
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `backup-${fecha}.json`;

  const { error } = await supabase.storage
    .from('backups')
    .upload(nombreArchivo, JSON.stringify(backup, null, 2), {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) throw error;
  console.log(`✅ Backup subido: ${nombreArchivo}`);
}

async function limpiarBackupsViejos() {
  const { data: archivos, error } = await supabase.storage.from('backups').list();
  if (error) throw error;

  const limite = new Date();
  limite.setDate(limite.getDate() - RETENCION_DIAS);

  const viejos = archivos.filter((a) => {
    const match = a.name.match(/^backup-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) return false;
    return new Date(match[1]) < limite;
  });

  if (viejos.length) {
    await supabase.storage.from('backups').remove(viejos.map((a) => a.name));
    console.log(`🗑️ ${viejos.length} backup(s) de más de ${RETENCION_DIAS} días eliminados.`);
  }
}

async function main() {
  const backup = await exportarTablas();
  const totalFilas = Object.values(backup.tablas).reduce((acc, filas) => acc + filas.length, 0);
  console.log(`Exportadas ${TABLAS.length} tablas, ${totalFilas} filas en total.`);

  await subirBackup(backup);
  await limpiarBackupsViejos();
}

main().catch((err) => {
  console.error('Error corriendo el backup:', err);
  process.exit(1);
});
