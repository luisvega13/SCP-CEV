-- Permite configurar becas porcentuales o por un monto fijo.
-- Las becas y asignaciones existentes conservan el comportamiento porcentual.

do $$
begin
  create type public.tipo_descuento_beca as enum ('porcentaje', 'monto_fijo');
exception
  when duplicate_object then null;
end
$$;

alter table public.becas
  add column if not exists tipo_descuento public.tipo_descuento_beca not null default 'porcentaje',
  add column if not exists monto_fijo numeric(12, 2) not null default 0;

alter table public.becas
  drop constraint if exists becas_porcentaje_check,
  drop constraint if exists becas_descuento_valido_check;

alter table public.becas
  add constraint becas_descuento_valido_check check (
    (tipo_descuento = 'porcentaje' and porcentaje > 0 and porcentaje <= 100 and monto_fijo = 0)
    or
    (tipo_descuento = 'monto_fijo' and porcentaje = 0 and monto_fijo > 0)
  );

alter table public.alumnos_becas
  add column if not exists tipo_descuento_aplicado public.tipo_descuento_beca not null default 'porcentaje',
  add column if not exists monto_fijo_aplicado numeric(12, 2) not null default 0;

alter table public.alumnos_becas
  drop constraint if exists alumnos_becas_porcentaje_aplicado_check,
  drop constraint if exists alumnos_becas_descuento_aplicado_valido_check;

alter table public.alumnos_becas
  add constraint alumnos_becas_descuento_aplicado_valido_check check (
    (tipo_descuento_aplicado = 'porcentaje' and porcentaje_aplicado > 0 and porcentaje_aplicado <= 100 and monto_fijo_aplicado = 0)
    or
    (tipo_descuento_aplicado = 'monto_fijo' and porcentaje_aplicado = 0 and monto_fijo_aplicado > 0)
  );

alter table public.auditoria_asignaciones_becas
  add column if not exists tipo_descuento_aplicado public.tipo_descuento_beca not null default 'porcentaje',
  add column if not exists monto_fijo_aplicado numeric(12, 2) not null default 0;

create or replace function public.costo_con_descuento_beca(
  p_costo numeric,
  p_tipo_descuento public.tipo_descuento_beca,
  p_porcentaje numeric,
  p_monto_fijo numeric,
  p_aplica boolean
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(
    case
      when not coalesce(p_aplica, false) then coalesce(p_costo, 0)
      when coalesce(p_tipo_descuento, 'porcentaje') = 'monto_fijo'
        then coalesce(p_costo, 0) - coalesce(p_monto_fijo, 0)
      else coalesce(p_costo, 0) * (100 - coalesce(p_porcentaje, 0)) / 100
    end,
    0
  ), 2);
$$;

create or replace function public.aplicar_beca_estado_cuenta(
  p_alumno_id uuid,
  p_ciclo_escolar text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nivel public.nivel_escolar;
  v_inscripcion numeric(12, 2);
  v_mensualidad numeric(12, 2);
  v_tipo_descuento public.tipo_descuento_beca := 'porcentaje';
  v_porcentaje numeric(5, 2) := 0;
  v_monto_fijo numeric(12, 2) := 0;
  v_alcance public.alcance_beca;
  v_vigencia_desde date;
begin
  select nivel into v_nivel from public.alumnos where id = p_alumno_id;
  if not found then raise exception 'El alumno no existe'; end if;

  select costo_inscripcion, costo_mensualidad
  into v_inscripcion, v_mensualidad
  from public.configuracion_costos
  where nivel = v_nivel and ciclo_escolar = p_ciclo_escolar;
  if not found then
    raise exception 'Configura los costos del nivel antes de asignar la beca';
  end if;

  select tipo_descuento_aplicado, porcentaje_aplicado,
         monto_fijo_aplicado, alcance_aplicado, vigencia_desde
  into v_tipo_descuento, v_porcentaje,
       v_monto_fijo, v_alcance, v_vigencia_desde
  from public.alumnos_becas
  where alumno_id = p_alumno_id and ciclo_escolar = p_ciclo_escolar;

  update public.estado_cuenta
  set monto_esperado = greatest(monto_pagado, public.costo_con_descuento_beca(
    case when tipo_pago = 'inscripcion' then v_inscripcion else v_mensualidad end,
    coalesce(v_tipo_descuento, 'porcentaje'),
    coalesce(v_porcentaje, 0),
    coalesce(v_monto_fijo, 0),
    public.beca_aplica_en_periodo(
      v_alcance, v_vigencia_desde, tipo_pago, mes, anio
    )
  ))
  where alumno_id = p_alumno_id
    and public.ciclo_de_pago(mes, anio) = p_ciclo_escolar;

  perform public.recalcular_deuda_alumno(p_alumno_id, p_ciclo_escolar);
end;
$$;

-- Conserva la validación secuencial vigente: solo exige un mes anterior si
-- existe un cargo de estado de cuenta para ese alumno.
create or replace function public.descontar_saldo_al_registrar_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nivel public.nivel_escolar;
  v_deuda_inscripcion numeric(12, 2);
  v_ciclo text;
  v_costo_inscripcion numeric(12, 2);
  v_costo_mensualidad numeric(12, 2);
  v_costo_actual numeric(12, 2);
  v_costo_anterior numeric(12, 2);
  v_tipo_descuento public.tipo_descuento_beca := 'porcentaje';
  v_porcentaje numeric(5, 2) := 0;
  v_monto_fijo numeric(12, 2) := 0;
  v_alcance public.alcance_beca;
  v_vigencia_desde date;
  v_mes_numero smallint;
  v_mes_anterior public.mes_pago;
  v_anio_anterior smallint;
  v_pagado_actual numeric(12, 2);
  v_pagado_anterior numeric(12, 2);
  v_cargo_anterior_encontrado boolean := false;
begin
  select nivel, deuda_inscripcion
  into v_nivel, v_deuda_inscripcion
  from public.alumnos
  where id = new.alumno_id
  for update;
  if not found then raise exception 'El alumno no existe'; end if;

  v_ciclo := public.ciclo_de_pago(new.mes, new.anio);
  select costo_inscripcion, costo_mensualidad
  into v_costo_inscripcion, v_costo_mensualidad
  from public.configuracion_costos
  where nivel = v_nivel and ciclo_escolar = v_ciclo;
  if not found then
    raise exception 'Configura los costos de % para el ciclo %', v_nivel, v_ciclo;
  end if;

  select tipo_descuento_aplicado, porcentaje_aplicado,
         monto_fijo_aplicado, alcance_aplicado, vigencia_desde
  into v_tipo_descuento, v_porcentaje,
       v_monto_fijo, v_alcance, v_vigencia_desde
  from public.alumnos_becas
  where alumno_id = new.alumno_id and ciclo_escolar = v_ciclo;

  v_costo_actual := public.costo_con_descuento_beca(
    case when new.tipo_pago = 'inscripcion' then v_costo_inscripcion else v_costo_mensualidad end,
    coalesce(v_tipo_descuento, 'porcentaje'),
    coalesce(v_porcentaje, 0),
    coalesce(v_monto_fijo, 0),
    public.beca_aplica_en_periodo(
      v_alcance, v_vigencia_desde, new.tipo_pago, new.mes, new.anio
    )
  );

  select coalesce(sum(monto), 0) into v_pagado_actual
  from public.pagos
  where alumno_id = new.alumno_id
    and tipo_pago = new.tipo_pago
    and mes = new.mes
    and anio = new.anio;

  if new.tipo_pago = 'inscripcion' then
    if new.mes <> 'agosto' then
      raise exception 'La inscripción solo puede registrarse en agosto';
    end if;
    if v_pagado_actual + new.monto > v_costo_actual then
      raise exception 'El pago excede el saldo de inscripción vigente';
    end if;
  else
    if v_deuda_inscripcion > 0 then
      raise exception 'Debe liquidarse la inscripción antes de pagar mensualidades';
    end if;
    if v_pagado_actual + new.monto > v_costo_actual then
      raise exception 'El pago excede el costo vigente de la mensualidad';
    end if;

    v_mes_numero := public.numero_mes(new.mes);
    if v_mes_numero <> 8 then
      if v_mes_numero = 1 then
        v_mes_anterior := 'diciembre';
        v_anio_anterior := new.anio - 1;
      else
        v_mes_anterior := public.mes_desde_numero((v_mes_numero - 1)::smallint);
        v_anio_anterior := new.anio;
      end if;

      select monto_esperado, monto_pagado
      into v_costo_anterior, v_pagado_anterior
      from public.estado_cuenta
      where alumno_id = new.alumno_id
        and tipo_pago = 'mensualidad'
        and mes = v_mes_anterior
        and anio = v_anio_anterior;
      v_cargo_anterior_encontrado := found;

      if v_cargo_anterior_encontrado and v_pagado_anterior < v_costo_anterior then
        raise exception 'Debe liquidarse % de % antes de continuar',
          v_mes_anterior, v_anio_anterior;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.asignar_beca_alumno(
  p_alumno_id uuid,
  p_beca_id uuid,
  p_ciclo_escolar text,
  p_observaciones text default ''
)
returns public.alumnos_becas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beca public.becas;
  v_asignacion public.alumnos_becas;
  v_inicio_ciclo date;
  v_fin_ciclo date;
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_vigencia_desde date;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede asignar becas' using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^[0-9]{4}-[0-9]{4}$'
    or split_part(p_ciclo_escolar, '-', 2)::integer <> split_part(p_ciclo_escolar, '-', 1)::integer + 1 then
    raise exception 'El ciclo escolar no es válido';
  end if;
  if not exists (select 1 from public.alumnos where id = p_alumno_id and estado <> 'baja') then
    raise exception 'El alumno no existe o se encuentra dado de baja';
  end if;

  select * into v_beca from public.becas where id = p_beca_id and activa;
  if not found then raise exception 'La beca no existe o está inactiva'; end if;

  v_inicio_ciclo := make_date(split_part(p_ciclo_escolar, '-', 1)::integer, 8, 1);
  v_fin_ciclo := make_date(split_part(p_ciclo_escolar, '-', 2)::integer, 7, 31);
  if v_hoy < v_inicio_ciclo then
    v_vigencia_desde := v_inicio_ciclo;
  elsif v_hoy <= v_fin_ciclo then
    v_vigencia_desde := (date_trunc('month', v_hoy) + interval '1 month')::date;
  else
    raise exception 'No se pueden asignar becas a un ciclo que ya terminó';
  end if;
  if v_vigencia_desde > v_fin_ciclo then
    raise exception 'El ciclo ya no tiene meses futuros disponibles para aplicar la beca';
  end if;

  insert into public.alumnos_becas (
    alumno_id, beca_id, ciclo_escolar, observaciones,
    tipo_descuento_aplicado, porcentaje_aplicado, monto_fijo_aplicado,
    alcance_aplicado, vigencia_desde
  ) values (
    p_alumno_id, p_beca_id, p_ciclo_escolar, trim(coalesce(p_observaciones, '')),
    v_beca.tipo_descuento, v_beca.porcentaje, v_beca.monto_fijo,
    v_beca.alcance, v_vigencia_desde
  ) returning * into v_asignacion;

  insert into public.auditoria_asignaciones_becas (
    asignacion_id, alumno_id, beca_id, beca_nombre, ciclo_escolar,
    tipo_descuento_aplicado, porcentaje_aplicado, monto_fijo_aplicado,
    alcance_aplicado, vigencia_desde, observaciones, asignado_por
  ) values (
    v_asignacion.id, p_alumno_id, p_beca_id, v_beca.nombre, p_ciclo_escolar,
    v_beca.tipo_descuento, v_beca.porcentaje, v_beca.monto_fijo,
    v_beca.alcance, v_vigencia_desde,
    trim(coalesce(p_observaciones, '')), auth.uid()
  );

  perform public.aplicar_beca_estado_cuenta(p_alumno_id, p_ciclo_escolar);
  return v_asignacion;
end;
$$;

create or replace function public.obtener_becados_por_tipo(p_ciclo_escolar text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede exportar alumnos becados' using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^[0-9]{4}-[0-9]{4}$'
    or split_part(p_ciclo_escolar, '-', 2)::integer <> split_part(p_ciclo_escolar, '-', 1)::integer + 1 then
    raise exception 'El ciclo escolar no es válido';
  end if;

  with base as (
    select b.id as beca_id, b.nombre as tipo_beca,
      ab.tipo_descuento_aplicado, ab.porcentaje_aplicado, ab.monto_fijo_aplicado,
      ab.alcance_aplicado, ab.vigencia_desde,
      a.matricula as curp,
      concat_ws(' ', a.nombre, a.apellido_paterno, nullif(a.apellido_materno, '')) as alumno,
      a.nivel, a.grado, a.grupo, a.estado
    from public.alumnos_becas ab
    join public.becas b on b.id = ab.beca_id
    join public.alumnos a on a.id = ab.alumno_id
    where ab.ciclo_escolar = p_ciclo_escolar
  ), tipos as (
    select beca_id, tipo_beca, count(*)::integer as total
    from base group by beca_id, tipo_beca
  )
  select jsonb_build_object(
    'ciclo_escolar', p_ciclo_escolar,
    'generado_en', now(),
    'total_becados', (select count(*) from base),
    'tipos', coalesce(jsonb_agg(jsonb_build_object(
      'beca_id', t.beca_id,
      'tipo_beca', t.tipo_beca,
      'total', t.total,
      'alumnos', (
        select jsonb_agg(jsonb_build_object(
          'nombre', b.alumno, 'curp', b.curp, 'nivel', b.nivel,
          'grado', b.grado, 'grupo', b.grupo, 'estado', b.estado,
          'tipo_descuento', b.tipo_descuento_aplicado,
          'porcentaje', b.porcentaje_aplicado,
          'monto_fijo', b.monto_fijo_aplicado,
          'alcance', b.alcance_aplicado,
          'vigencia_desde', b.vigencia_desde
        ) order by b.alumno)
        from base b where b.beca_id = t.beca_id
      )
    ) order by t.tipo_beca), '[]'::jsonb)
  ) into v_resultado
  from tipos t;

  return v_resultado;
end;
$$;

revoke all on function public.costo_con_descuento_beca(
  numeric, public.tipo_descuento_beca, numeric, numeric, boolean
) from public;
revoke all on function public.aplicar_beca_estado_cuenta(uuid, text) from public;
revoke all on function public.asignar_beca_alumno(uuid, uuid, text, text) from public;
revoke all on function public.obtener_becados_por_tipo(text) from public;
grant execute on function public.asignar_beca_alumno(uuid, uuid, text, text) to authenticated;
grant execute on function public.obtener_becados_por_tipo(text) to authenticated;
