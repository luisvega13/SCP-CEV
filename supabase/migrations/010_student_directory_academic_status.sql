-- Tercer estado académico: pausa temporal.
alter type public.estado_alumno
  add value if not exists 'pausa' after 'activo';

-- Completa matrículas faltantes de registros históricos antes de hacerlas obligatorias.
update public.alumnos
set matricula = 'LEG' || upper(substr(replace(id::text, '-', ''), 1, 12))
where matricula is null or trim(matricula) = '';

alter table public.alumnos
  alter column matricula set not null;

create index if not exists alumnos_estado_nivel_grado_grupo_idx
  on public.alumnos (estado, nivel, grado, grupo);

comment on column public.alumnos.estado is
  'Estado académico: activo (cursando), pausa (suspensión temporal) o baja (salida definitiva).';

comment on column public.alumnos.matricula is
  'Identificador institucional único y obligatorio del alumno.';
