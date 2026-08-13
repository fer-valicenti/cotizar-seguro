-- Schema CRM Seguros - PAS
-- Ejecutar en Supabase: Dashboard > SQL Editor > New Query > pegar y RUN

-- ===== CATÁLOGOS =====
CREATE TABLE ramos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE, -- Vehiculo, Hogar, Accidentes Personales, Comercio, Vida, Otros
    plantilla_mensaje TEXT       -- template base de WhatsApp para este ramo
);

CREATE TABLE aseguradoras (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    contacto TEXT
);

CREATE TABLE productores (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    matricula TEXT,
    contacto TEXT
);

-- ===== CLIENTES =====
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    telefono TEXT NOT NULL,          -- formato E.164: 549XXXXXXXXXX
    email TEXT,
    dni_cuit TEXT,
    fecha_nacimiento DATE,
    direccion TEXT,
    origen_lead TEXT,                -- landing, referido, cartera PAS, etc.
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_clientes_telefono ON clientes(telefono);

-- ===== PÓLIZAS =====
CREATE TABLE polizas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    ramo_id INT NOT NULL REFERENCES ramos(id),
    aseguradora_id INT REFERENCES aseguradoras(id),
    productor_id INT REFERENCES productores(id),
    numero_poliza TEXT NOT NULL,
    detalle_ramo TEXT,                -- qué es exactamente cuando ramo_id = "Otros" (ej: "seguro de viajero")
    fecha_emision DATE,
    -- Con hora y minuto exactos: el contrato de seguro fija el momento preciso en que
    -- empieza y termina la cobertura (por convención, 12:00hs), no solo el día.
    fecha_inicio_vigencia TIMESTAMPTZ NOT NULL,
    fecha_vencimiento TIMESTAMPTZ NOT NULL,
    prima NUMERIC(12,2),
    forma_pago TEXT,                 -- mensual, trimestral, anual, contado
    cantidad_cuotas INT DEFAULT 1,
    estado TEXT DEFAULT 'activa' CHECK (estado IN ('activa','vencida','cancelada','renovada')),
    comision_total_pct NUMERIC(5,2),
    pas_share_pct NUMERIC(5,2) DEFAULT 60,
    gestor_share_pct NUMERIC(5,2) DEFAULT 40,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_polizas_vencimiento ON polizas(fecha_vencimiento);
CREATE INDEX idx_polizas_cliente ON polizas(cliente_id);

-- ===== CUOTAS / COBRANZAS =====
CREATE TABLE cuotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poliza_id UUID NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
    numero_cuota INT NOT NULL,
    fecha_vencimiento_cuota DATE NOT NULL,
    monto NUMERIC(12,2),
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagada','vencida')),
    fecha_pago DATE
);
CREATE INDEX idx_cuotas_vencimiento ON cuotas(fecha_vencimiento_cuota);

-- Genera automáticamente las cuotas de una póliza al cargarla (si tiene más
-- de 1), repartiendo el período de vigencia en partes iguales.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- SECURITY DEFINER: las cuotas se generan con permisos propios del trigger,
-- sin necesidad de darle a nadie (ni al panel logueado) permiso para
-- insertar en "cuotas" directamente. Así solo se crean por esta vía.

CREATE TRIGGER trigger_generar_cuotas
    AFTER INSERT ON polizas
    FOR EACH ROW
    EXECUTE FUNCTION generar_cuotas_poliza();

-- ===== INTERACCIONES (historial de contacto) =====
CREATE TABLE interacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    poliza_id UUID REFERENCES polizas(id) ON DELETE SET NULL,
    canal TEXT DEFAULT 'whatsapp',
    tipo TEXT,                       -- cotizacion, seguimiento, cobranza, renovacion
    mensaje TEXT,
    fecha TIMESTAMPTZ DEFAULT now(),
    resultado TEXT                   -- respondido, sin respuesta, cerrado, perdido
);

-- ===== ALERTAS GENERADAS =====
CREATE TABLE alertas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poliza_id UUID NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
    cuota_id UUID REFERENCES cuotas(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,              -- vencimiento_poliza, vencimiento_cuota
    dias_anticipacion INT NOT NULL CHECK (dias_anticipacion IN (15,5)),
    fecha_alerta DATE NOT NULL,
    enlace_whatsapp TEXT,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviada','ignorada')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (poliza_id, tipo, dias_anticipacion) -- evita duplicar la misma alerta
);

-- ===== DATOS INICIALES DE CATÁLOGO =====
INSERT INTO ramos (nombre) VALUES
    ('Vehiculo'),
    ('Hogar'),
    ('Accidentes Personales'),
    ('Comercio'),
    ('Vida'),
    ('Otros');
