-- Schema CRM Seguros - PAS
-- Ejecutar en Supabase: Dashboard > SQL Editor > New Query > pegar y RUN

-- ===== CATÁLOGOS =====
CREATE TABLE ramos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE, -- Auto, Hogar, Accidentes Personales, Comercio, Vida
    plantilla_mensaje TEXT       -- template base de WhatsApp para este ramo
);

CREATE TABLE aseguradoras (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
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
    numero_poliza TEXT NOT NULL,
    fecha_emision DATE,
    fecha_inicio_vigencia DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
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
    dias_anticipacion INT NOT NULL CHECK (dias_anticipacion IN (30,15,5)),
    fecha_alerta DATE NOT NULL,
    enlace_whatsapp TEXT,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviada','ignorada')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (poliza_id, tipo, dias_anticipacion) -- evita duplicar la misma alerta
);

-- ===== DATOS INICIALES DE CATÁLOGO =====
INSERT INTO ramos (nombre) VALUES
    ('Auto'),
    ('Hogar'),
    ('Accidentes Personales'),
    ('Comercio'),
    ('Vida');
