-- Migración: la vigencia de una póliza depende de la hora exacta de inicio y fin
-- (por convención, 12:00hs Argentina), no solo del día calendario.
-- Pasamos fecha_inicio_vigencia y fecha_vencimiento de DATE a TIMESTAMPTZ.
-- Las fechas que ya tenías cargadas se completan a las 12:00hs de ese mismo día.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- vista_alertas depende de fecha_vencimiento, hay que sacarla del medio primero.
DROP VIEW IF EXISTS vista_alertas;

ALTER TABLE polizas
  ALTER COLUMN fecha_inicio_vigencia TYPE TIMESTAMPTZ
    USING (fecha_inicio_vigencia + INTERVAL '12 hours') AT TIME ZONE 'America/Argentina/Buenos_Aires';

ALTER TABLE polizas
  ALTER COLUMN fecha_vencimiento TYPE TIMESTAMPTZ
    USING (fecha_vencimiento + INTERVAL '12 hours') AT TIME ZONE 'America/Argentina/Buenos_Aires';

-- La recreamos igual que antes.
CREATE OR REPLACE VIEW vista_alertas AS
SELECT
    a.id,
    c.nombre,
    c.apellido,
    c.telefono,
    r.nombre AS ramo,
    p.numero_poliza,
    a.tipo,
    a.dias_anticipacion,
    a.fecha_alerta,
    p.fecha_vencimiento,
    a.estado,
    a.enlace_whatsapp
FROM alertas a
JOIN polizas p ON p.id = a.poliza_id
JOIN clientes c ON c.id = p.cliente_id
JOIN ramos r ON r.id = p.ramo_id
ORDER BY a.fecha_alerta ASC, a.dias_anticipacion ASC;
