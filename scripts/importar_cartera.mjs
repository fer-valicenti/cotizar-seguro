// importar_cartera.mjs
// Carga masiva de clientes y pólizas desde un Excel (.xlsx) o CSV.
//
// Uso:
//   node scripts/importar_cartera.mjs archivo.xlsx           (carga real)
//   node scripts/importar_cartera.mjs archivo.xlsx --dry-run (solo valida, no toca la base)
//
// Columnas esperadas (ver plantilla_cartera.csv): una fila por póliza. Si un
// mismo cliente tiene varias pólizas, repetí sus datos en cada fila — el
// script lo reconoce por teléfono y no lo duplica.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import xlsx from 'xlsx';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const archivo = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!archivo) {
  console.error('Uso: node scripts/importar_cartera.mjs archivo.xlsx [--dry-run]');
  process.exit(1);
}

const MESES_POR_CUOTA = { mensual: 1, debito_automatico: 1, trimestral: 3, semestral: 6, anual: 12, contado: null };

function mesesEntre(inicio, fin) {
  let meses = (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth());
  if (fin.getDate() < inicio.getDate()) meses -= 1;
  return Math.max(meses, 0);
}

function calcularCantidadCuotas(formaPago, inicioIso, vencimientoIso) {
  const mesesPorCuota = MESES_POR_CUOTA[(formaPago || 'contado').trim()];
  if (!mesesPorCuota) return 1;
  const meses = mesesEntre(new Date(inicioIso), new Date(vencimientoIso));
  return Math.max(Math.round(meses / mesesPorCuota), 1);
}

// Admite "YYYY-MM-DD", "DD/MM/YYYY", una fecha ya parseada como Date, o el
// número de serie de fecha de Excel (lo más común: hasta un CSV lo convierte
// solo si la celda "parece" una fecha).
function parsearFechaAIso(valor) {
  if (!valor && valor !== 0) return null;

  if (typeof valor === 'number') {
    const { y, m, d } = xlsx.SSF.parse_date_code(valor);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00-03:00`;
  }

  if (valor instanceof Date) {
    const y = valor.getUTCFullYear();
    const m = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(valor.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}T12:00:00-03:00`;
  }

  const str = String(valor).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00-03:00`;

  const arMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (arMatch) {
    const [, d, m, y] = arMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00-03:00`;
  }

  return null;
}

function normalizarTelefono(valor) {
  return String(valor || '').replace(/[^\d]/g, '');
}

async function main() {
  const buffer = readFileSync(archivo);
  const libro = xlsx.read(buffer, { type: 'buffer' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = xlsx.utils.sheet_to_json(hoja, { defval: '' });

  if (!filas.length) {
    console.log('El archivo no tiene filas para importar.');
    return;
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Procesando ${filas.length} fila(s) de "${archivo}"...\n`);

  const { data: ramos } = await supabase.from('ramos').select('id, nombre');
  const ramoIdPorNombre = new Map(ramos.map((r) => [r.nombre.toLowerCase(), r.id]));

  const cacheAseguradoras = new Map(); // nombre -> id (incluye las ya existentes en la base)
  const { data: aseguradorasExistentes } = await supabase.from('aseguradoras').select('id, nombre');
  aseguradorasExistentes.forEach((a) => cacheAseguradoras.set(a.nombre.toLowerCase(), a.id));

  const cacheProductores = new Map();
  const { data: productoresExistentes } = await supabase.from('productores').select('id, nombre');
  productoresExistentes.forEach((p) => cacheProductores.set(p.nombre.toLowerCase(), p.id));

  const cacheClientes = new Map(); // telefono normalizado -> id
  const { data: clientesExistentes } = await supabase.from('clientes').select('id, telefono');
  clientesExistentes.forEach((c) => cacheClientes.set(normalizarTelefono(c.telefono), c.id));

  const { data: polizasExistentes } = await supabase.from('polizas').select('numero_poliza');
  const numerosPolizaExistentes = new Set(polizasExistentes.map((p) => p.numero_poliza));

  let clientesCreados = 0;
  let clientesReutilizados = 0;
  let polizasCreadas = 0;
  const errores = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nFila = i + 2; // +2: fila 1 es el encabezado, y las planillas empiezan en 1

    try {
      const nombre = String(fila.Nombre || '').trim();
      const apellido = String(fila.Apellido || '').trim();
      const telefono = normalizarTelefono(fila.Telefono);
      const ramoNombre = String(fila.Ramo || '').trim();
      const numeroPoliza = String(fila.Numero_Poliza || '').trim();
      const fechaInicio = parsearFechaAIso(fila.Fecha_Inicio_Vigencia);
      const fechaVencimiento = parsearFechaAIso(fila.Fecha_Vencimiento);

      if (!nombre || !apellido || !telefono) throw new Error('Faltan Nombre, Apellido o Telefono');
      if (!ramoNombre) throw new Error('Falta Ramo');
      if (!numeroPoliza) throw new Error('Falta Numero_Poliza');
      if (!fechaInicio || !fechaVencimiento) throw new Error('Fecha_Inicio_Vigencia o Fecha_Vencimiento inválida (usar YYYY-MM-DD o DD/MM/YYYY)');

      const ramoId = ramoIdPorNombre.get(ramoNombre.toLowerCase());
      if (!ramoId) throw new Error(`Ramo "${ramoNombre}" no existe. Válidos: ${[...ramoIdPorNombre.keys()].join(', ')}`);

      if (numerosPolizaExistentes.has(numeroPoliza)) throw new Error(`Numero_Poliza "${numeroPoliza}" ya existe en la base`);

      // Aseguradora (opcional, se crea si no existe)
      let aseguradoraId = null;
      const aseguradoraNombre = String(fila.Aseguradora || '').trim();
      if (aseguradoraNombre) {
        aseguradoraId = cacheAseguradoras.get(aseguradoraNombre.toLowerCase());
        if (!aseguradoraId) {
          if (!dryRun) {
            const { data, error } = await supabase.from('aseguradoras').insert({ nombre: aseguradoraNombre }).select().single();
            if (error) throw error;
            aseguradoraId = data.id;
          }
          cacheAseguradoras.set(aseguradoraNombre.toLowerCase(), aseguradoraId || 'dry-run');
        }
      }

      // Productor (opcional, se crea si no existe)
      let productorId = null;
      const productorNombre = String(fila.Productor || '').trim();
      if (productorNombre) {
        productorId = cacheProductores.get(productorNombre.toLowerCase());
        if (!productorId) {
          if (!dryRun) {
            const { data, error } = await supabase.from('productores').insert({ nombre: productorNombre }).select().single();
            if (error) throw error;
            productorId = data.id;
          }
          cacheProductores.set(productorNombre.toLowerCase(), productorId || 'dry-run');
        }
      }

      // Cliente (por teléfono; se reutiliza si ya existe)
      let clienteId = cacheClientes.get(telefono);
      let clienteEsNuevo = false;
      if (!clienteId) {
        clienteEsNuevo = true;
        if (!dryRun) {
          const { data, error } = await supabase.from('clientes').insert({
            nombre,
            apellido,
            telefono,
            email: String(fila.Email || '').trim() || null,
            dni_cuit: String(fila.DNI_CUIT || '').trim() || null,
            fecha_nacimiento: parsearFechaAIso(fila.Fecha_Nacimiento)?.slice(0, 10) || null,
            origen_lead: 'cartera PAS',
          }).select().single();
          if (error) throw error;
          clienteId = data.id;
        } else {
          clienteId = 'dry-run';
        }
        cacheClientes.set(telefono, clienteId);
        clientesCreados++;
      } else {
        clientesReutilizados++;
      }

      const formaPago = String(fila.Forma_Pago || 'contado').trim();
      const cantidadCuotas = calcularCantidadCuotas(formaPago, fechaInicio, fechaVencimiento);

      if (!dryRun) {
        const { error } = await supabase.from('polizas').insert({
          cliente_id: clienteId,
          ramo_id: ramoId,
          detalle_ramo: String(fila.Detalle_Ramo || '').trim() || null,
          aseguradora_id: aseguradoraId,
          productor_id: productorId,
          numero_poliza: numeroPoliza,
          fecha_inicio_vigencia: fechaInicio,
          fecha_vencimiento: fechaVencimiento,
          prima: fila.Prima || null,
          cantidad_cuotas: cantidadCuotas,
          forma_pago: formaPago,
          estado: 'activa',
        });
        if (error) throw error;
      }
      numerosPolizaExistentes.add(numeroPoliza);
      polizasCreadas++;

      console.log(`✅ Fila ${nFila}: ${nombre} ${apellido} — ${ramoNombre} (${numeroPoliza})${clienteEsNuevo ? '' : ' [cliente ya existía]'}${cantidadCuotas > 1 ? ` — ${cantidadCuotas} cuotas` : ''}`);
    } catch (err) {
      errores.push({ fila: nFila, motivo: err.message });
      console.log(`❌ Fila ${nFila}: ${err.message}`);
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Clientes nuevos: ${clientesCreados}`);
  console.log(`Clientes reutilizados (ya existían): ${clientesReutilizados}`);
  console.log(`Pólizas ${dryRun ? 'que se crearían' : 'creadas'}: ${polizasCreadas}`);
  console.log(`Errores: ${errores.length}`);
  if (dryRun) console.log('\nEsto fue un DRY RUN — no se escribió nada en la base. Corré sin --dry-run para importar de verdad.');
}

main().catch((err) => {
  console.error('Error corriendo la importación:', err);
  process.exit(1);
});
