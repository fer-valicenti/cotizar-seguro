-- Vista de lectura fácil para la tabla "alertas".
-- Junta cliente + póliza + ramo en una sola fila, para no tener que
-- ir saltando entre tablas para saber "a quién hay que escribirle".
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- Después va a aparecer como "vista_alertas" en Table Editor, en la
-- sección "Views" (debajo de las tablas normales).

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

-- Sin esto, la vista corre con los permisos de quien la creó (superusuario)
-- en vez de los de quien la consulta, saltándose el RLS de las tablas que
-- junta. Con security_invoker, respeta los permisos reales del usuario.
ALTER VIEW vista_alertas SET (security_invoker = true);
