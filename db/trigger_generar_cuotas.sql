-- Genera automáticamente las cuotas de una póliza al cargarla, en vez de
-- tener que cargarlas una por una a mano. Reparte el período de vigencia
-- (fecha_inicio_vigencia → fecha_vencimiento) en "cantidad_cuotas" partes
-- iguales, con el monto de cada cuota = prima / cantidad_cuotas.
--
-- Si cantidad_cuotas es 1 (pago contado) o no se especifica, no genera
-- ninguna cuota — se asume pagada por completo al inicio.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION generar_cuotas_poliza()
RETURNS TRIGGER AS $$
DECLARE
  i INT;
  meses_totales INT;
  intervalo_meses INT;
  monto_cuota NUMERIC(12,2);
BEGIN
  IF NEW.cantidad_cuotas IS NULL OR NEW.cantidad_cuotas <= 1 THEN
    RETURN NEW;
  END IF;

  -- Cantidad de meses entre inicio y fin de vigencia (normalmente 12).
  meses_totales := EXTRACT(YEAR FROM AGE(NEW.fecha_vencimiento, NEW.fecha_inicio_vigencia))::INT * 12
                  + EXTRACT(MONTH FROM AGE(NEW.fecha_vencimiento, NEW.fecha_inicio_vigencia))::INT;
  intervalo_meses := GREATEST(ROUND(meses_totales::NUMERIC / NEW.cantidad_cuotas), 1);
  monto_cuota := ROUND(COALESCE(NEW.prima, 0) / NEW.cantidad_cuotas, 2);

  FOR i IN 1..NEW.cantidad_cuotas LOOP
    INSERT INTO cuotas (poliza_id, numero_cuota, fecha_vencimiento_cuota, monto, estado)
    VALUES (
      NEW.id,
      i,
      -- Sumar meses completos conserva el mismo día del mes que la fecha de
      -- inicio de vigencia (ej: emitida el 15 -> cuotas vencen el 15 de cada mes).
      ((NEW.fecha_inicio_vigencia + (intervalo_meses * i || ' months')::interval) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      monto_cuota,
      'pendiente'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generar_cuotas ON polizas;
CREATE TRIGGER trigger_generar_cuotas
  AFTER INSERT ON polizas
  FOR EACH ROW
  EXECUTE FUNCTION generar_cuotas_poliza();
