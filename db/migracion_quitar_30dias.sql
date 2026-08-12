-- Migración: elimina la opción de alerta a 30 días (solo quedan 15 y 5).
-- Ejecutar una sola vez en el SQL Editor de Supabase sobre la base ya existente.

-- Borra las alertas de 30 días que ya se hayan generado (si no lo hacemos,
-- el paso siguiente falla porque esas filas violarían la nueva regla).
DELETE FROM alertas WHERE dias_anticipacion = 30;

-- Reemplaza la regla de la columna para que solo acepte 15 o 5 de ahora en más.
ALTER TABLE alertas DROP CONSTRAINT IF EXISTS alertas_dias_anticipacion_check;
ALTER TABLE alertas ADD CONSTRAINT alertas_dias_anticipacion_check CHECK (dias_anticipacion IN (15,5));
