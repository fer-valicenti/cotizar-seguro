-- Migración: agrega el catálogo de productores (PAS) y lo vincula a cada póliza.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE productores (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    matricula TEXT,
    contacto TEXT
);
ALTER TABLE productores ENABLE ROW LEVEL SECURITY;

ALTER TABLE polizas ADD COLUMN productor_id INT REFERENCES productores(id);

-- Actualizamos vista_alertas para que también muestre el productor de cada póliza.
DROP VIEW IF EXISTS vista_alertas;
CREATE OR REPLACE VIEW vista_alertas AS
SELECT
    a.id,
    c.nombre,
    c.apellido,
    c.telefono,
    r.nombre AS ramo,
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
