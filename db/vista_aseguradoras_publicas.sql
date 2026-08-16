-- Vista pública (solo nombre, sin datos de contacto) para que la landing
-- pueda mostrar la lista de aseguradoras con las que trabajás, sin tener que
-- abrir la tabla "aseguradoras" completa a cualquiera.
--
-- A propósito NO lleva "security_invoker = true": corre con permisos del
-- dueño de la vista, así que expone estos nombres sin necesitar (ni dar)
-- permiso de lectura sobre la tabla real a nadie más. Como la vista solo
-- selecciona la columna "nombre", el resto de la tabla sigue protegido.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE VIEW vista_aseguradoras_publicas AS
SELECT nombre FROM aseguradoras ORDER BY nombre;

GRANT SELECT ON vista_aseguradoras_publicas TO anon;
