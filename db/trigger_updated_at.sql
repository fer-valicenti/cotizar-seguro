-- Hace que "updated_at" de polizas se actualice solo en cada cambio (no solo al
-- crear la fila). Sin esto, el reporte semanal no puede saber si una póliza
-- pasó a "renovada"/"cancelada"/"vencida" esta semana o hace un año.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION tocar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_polizas_updated_at
    BEFORE UPDATE ON polizas
    FOR EACH ROW
    EXECUTE FUNCTION tocar_updated_at();
