import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { data: ramos, error: ramosError } = await supabase.from('ramos').select('id, nombre');
  if (ramosError) throw ramosError;
  const ramoId = (nombre) => ramos.find(r => r.nombre === nombre).id;

  const clientesData = [
    { nombre: 'Juan', apellido: 'Perez', telefono: '5491122334455', origen_lead: 'cartera PAS' },
    { nombre: 'Maria', apellido: 'Gomez', telefono: '5491133445566', origen_lead: 'cartera PAS' },
    { nombre: 'Carlos', apellido: 'Diaz', telefono: '5491144556677', origen_lead: 'cartera PAS' },
  ];

  const { data: clientes, error: clientesError } = await supabase
    .from('clientes')
    .insert(clientesData)
    .select();
  if (clientesError) throw clientesError;

  const polizasData = [
    { cliente_id: clientes[0].id, ramo_id: ramoId('Auto'), numero_poliza: 'TEST-AUTO-001', fecha_inicio_vigencia: addDays(-335), fecha_vencimiento: addDays(30), prima: 50000, estado: 'activa' },
    { cliente_id: clientes[1].id, ramo_id: ramoId('Hogar'), numero_poliza: 'TEST-HOGAR-001', fecha_inicio_vigencia: addDays(-350), fecha_vencimiento: addDays(15), prima: 20000, estado: 'activa' },
    { cliente_id: clientes[2].id, ramo_id: ramoId('Vida'), numero_poliza: 'TEST-VIDA-001', fecha_inicio_vigencia: addDays(-360), fecha_vencimiento: addDays(5), prima: 15000, estado: 'activa' },
  ];

  const { error: polizasError } = await supabase.from('polizas').insert(polizasData);
  if (polizasError) throw polizasError;

  console.log('✅ Datos de prueba cargados: 3 clientes, 3 pólizas (vencen en 30, 15 y 5 días).');
}

main().catch((err) => {
  console.error('Error cargando datos de prueba:', err);
  process.exit(1);
});
