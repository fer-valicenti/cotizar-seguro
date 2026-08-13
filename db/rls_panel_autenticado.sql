-- Permisos para el panel interno: un usuario logueado (vía Supabase Auth)
-- puede leer y cargar datos en las tablas de trabajo. Nadie sin login puede
-- tocar nada de esto (la landing pública sigue igual, solo puede insertar
-- en "clientes" con la key anónima).
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE POLICY "panel_select_clientes" ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_insert_clientes" ON clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "panel_update_clientes" ON clientes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "panel_select_polizas" ON polizas FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_insert_polizas" ON polizas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "panel_update_polizas" ON polizas FOR UPDATE TO authenticated USING (true);

CREATE POLICY "panel_select_cuotas" ON cuotas FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_update_cuotas" ON cuotas FOR UPDATE TO authenticated USING (true);

CREATE POLICY "panel_select_ramos" ON ramos FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_select_aseguradoras" ON aseguradoras FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_insert_aseguradoras" ON aseguradoras FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "panel_select_productores" ON productores FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_insert_productores" ON productores FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "panel_select_alertas" ON alertas FOR SELECT TO authenticated USING (true);
CREATE POLICY "panel_update_alertas" ON alertas FOR UPDATE TO authenticated USING (true);

-- Nota: no se otorga DELETE por este camino a propósito — borrar registros
-- se sigue haciendo desde Table Editor en Supabase, como medida de seguridad
-- extra contra un borrado accidental desde el panel.
