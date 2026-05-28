-- Kiku Sushi - datos fiscales reales (PDF constancia ARCA 26/05/2026)
-- Pisa el registro de facturacion_config con los datos del contribuyente.

do $$
begin
  if to_regclass('public.facturacion_config') is null then
    raise notice 'facturacion_config no existe todavia; correr antes 20260523000000_facturacion_impresion.sql';
    return;
  end if;

  -- Si no hay registro, crearlo
  if not exists (select 1 from public.facturacion_config) then
    insert into public.facturacion_config (nombre_fantasia, ambiente, alicuota_iva)
    values ('Kiku Sushi', 'homologacion', 21);
  end if;

  -- Pisar datos
  update public.facturacion_config
  set
    razon_social = 'KIKU SUSHI S.A.S.',
    nombre_fantasia = 'Kiku Sushi',
    cuit = '30719431751',
    condicion_iva = 'Responsable Inscripto',
    domicilio = 'Callao Bis 139, Rosario, Santa Fe (CP 2000)',
    ingresos_brutos = '0215652537',
    inicio_actividades = '2026-05-01',
    punto_venta = 2,
    ambiente = 'homologacion',   -- pasar a 'produccion' cuando esté el cert real
    alicuota_iva = 21,
    permite_factura_a = true,
    updated_at = now()
  where id = (select id from public.facturacion_config order by created_at asc limit 1);
end;
$$;

notify pgrst, 'reload schema';
