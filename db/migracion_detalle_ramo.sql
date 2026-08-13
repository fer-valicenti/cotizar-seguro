-- Migración: agrega un campo para especificar qué es exactamente cuando el
-- ramo de la póliza es "Otros" (ej: "seguro de viajero", "seguro de mascota").
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE polizas ADD COLUMN detalle_ramo TEXT;

DROP VIEW IF EXISTS vista_alertas;
CREATE OR REPLACE VIEW vista_alertas AS
SELECT
    a.id,
    c.nombre,
    c.apellido,
    c.telefono,
    r.nombre AS ramo,
    p.detalle_ramo,
    p.numero_poliza,
    pr.nombre AS productor,
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
LEFT JOIN productores pr ON pr.id = p.productor_id
ORDER BY a.fecha_alerta ASC, a.dias_anticipacion ASC;
