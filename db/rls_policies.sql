-- Políticas de seguridad (RLS) para exponer la key pública en la landing sin riesgo.
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql, ANTES de publicar la landing.
--
-- Con RLS activado, la key pública (anon) queda restringida a lo que digan las políticas.
-- El backend (alertas.js, futuro panel de CRM) sigue usando la service_role key,
-- que siempre puede saltarse RLS, así que no pierde ninguna funcionalidad.

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE polizas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE interacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aseguradoras ENABLE ROW LEVEL SECURITY;

-- Único permiso público: la landing puede INSERTAR un lead nuevo en "clientes".
-- No puede leer, editar ni borrar nada (ni su propio registro ni el de nadie más).
CREATE POLICY "landing_insert_clientes"
    ON clientes
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Ninguna otra tabla tiene políticas para "anon" -> quedan totalmente bloqueadas
-- para la key pública. Solo la service_role key (uso interno/backend) accede a ellas.
