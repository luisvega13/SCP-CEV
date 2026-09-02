# Datos ficticios de operación

La carga crea 90 alumnos ficticios (dos por grupo) para el ciclo escolar
actual, distribuidos así:

- Preescolar: 3 grados, grupos A y B (12 alumnos).
- Primaria: 6 grados, grupos A y B (24 alumnos).
- Secundaria: 3 grados, grupos A, B y C (18 alumnos).
- Bachillerato: 6 semestres, grupos A, B y C (36 alumnos).

También crea costos por nivel, una beca de prueba, asignaciones, los 13 cargos
del ciclo por alumno y pagos variados de inscripción, agosto y septiembre.
Incluye alumnos activos, en pausa y de baja; pagos completos, parciales y
pendientes; y los cuatro métodos de pago.

## Preparación

1. Ejecuta `025_add_preschool_level.sql` en Supabase.
2. En una consulta nueva, ejecuta `026_preschool_and_high_school_grades.sql`.
3. Agrega a `.env.local` la clave privada, únicamente para ejecutar la semilla:

   `SUPABASE_SECRET_KEY=sb_secret_tu_clave`

La clave secreta se obtiene en Supabase, Project Settings, API Keys. Si el
proyecto todavía usa las llaves heredadas, el script también acepta
`SUPABASE_SERVICE_ROLE_KEY`. Ninguna debe usar el prefijo `NEXT_PUBLIC_`,
subirse a Git ni utilizarse en el navegador.

## Ejecución

```powershell
npm run seed:demo -- --confirm
```

El comando reemplaza exclusivamente registros cuya matrícula comienza con
`DEMO`; no elimina alumnos reales. Al finalizar crea
`datos-demo-credenciales.csv` con los accesos de los alumnos ficticios.

Para usar otro ciclo consecutivo:

```powershell
$env:DEMO_ACADEMIC_CYCLE="2027-2028"
npm run seed:demo -- --confirm
```

No conserves la clave secreta en equipos no confiables ni
en Vercel si no habrá procesos administrativos que realmente la necesiten.
