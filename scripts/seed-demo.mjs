import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnvironment();

if (!process.argv.includes("--confirm")) {
  console.error(
    "Carga cancelada. Ejecuta: npm run seed:demo -- --confirm",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secretKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const now = new Date();
const currentStartYear = now.getMonth() >= 7
  ? now.getFullYear()
  : now.getFullYear() - 1;
const cycle = process.env.DEMO_ACADEMIC_CYCLE
  ?? `${currentStartYear}-${currentStartYear + 1}`;
const cycleStartYear = Number(cycle.split("-")[0]);

if (!/^\d{4}-\d{4}$/.test(cycle)
  || Number(cycle.split("-")[1]) !== cycleStartYear + 1) {
  throw new Error("DEMO_ACADEMIC_CYCLE debe usar años consecutivos, por ejemplo 2026-2027.");
}

const LEVELS = [
  {
    value: "preescolar",
    code: "PE",
    grades: 3,
    groups: ["A", "B"],
    enrollmentCost: 1800,
    monthlyCost: 1500,
  },
  {
    value: "primaria",
    code: "PR",
    grades: 6,
    groups: ["A", "B"],
    enrollmentCost: 2400,
    monthlyCost: 1950,
  },
  {
    value: "secundaria",
    code: "SE",
    grades: 3,
    groups: ["A", "B", "C"],
    enrollmentCost: 3100,
    monthlyCost: 2450,
  },
  {
    value: "bachillerato",
    code: "BA",
    grades: 6,
    groups: ["A", "B", "C"],
    enrollmentCost: 3900,
    monthlyCost: 2950,
  },
];

const FIRST_NAMES = [
  "Sofia", "Mateo", "Valeria", "Santiago", "Camila", "Leonardo",
  "Regina", "Emiliano", "Daniela", "Sebastian", "Renata", "Diego",
  "Natalia", "Alejandro", "Fernanda", "Rodrigo", "Mariana", "Javier",
  "Paula", "Andres", "Lucia", "Fernando", "Elena", "Carlos",
  "Victoria", "Miguel", "Andrea", "Rafael", "Isabella", "Nicolas",
];
const PATERNAL_SURNAMES = [
  "Garcia", "Hernandez", "Martinez", "Lopez", "Gonzalez", "Perez",
  "Rodriguez", "Sanchez", "Ramirez", "Cruz", "Flores", "Gomez",
  "Morales", "Vazquez", "Reyes", "Jimenez", "Torres", "Diaz",
  "Gutierrez", "Ruiz", "Mendoza", "Aguilar", "Ortiz", "Castillo",
];
const MATERNAL_SURNAMES = [
  "Moreno", "Romero", "Navarro", "Rojas", "Medina", "Campos",
  "Vega", "Silva", "Castro", "Ortega", "Delgado", "Mendez",
  "Guerrero", "Cabrera", "Valdez", "Contreras", "Fuentes", "Herrera",
  "Luna", "Soto", "Salazar", "Miranda", "Carrillo", "Nunez",
];
const PAYMENT_METHODS = ["efectivo", "tarjeta", "transferencia", "deposito"];
const CURP_DICTIONARY = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

function curpCheckDigit(firstSeventeenCharacters) {
  const sum = [...firstSeventeenCharacters].reduce(
    (total, character, position) =>
      total + CURP_DICTIONARY.indexOf(character) * (18 - position),
    0,
  );
  return String((10 - (sum % 10)) % 10);
}

function demoBirthYear(level, grade) {
  if (level === "preescolar") return cycleStartYear - (grade + 2);
  if (level === "primaria") return cycleStartYear - (grade + 5);
  if (level === "secundaria") return cycleStartYear - (grade + 11);
  return cycleStartYear - (14 + Math.ceil(grade / 2));
}

function generateDemoCurp(index, sex, level, grade) {
  const year = String(demoBirthYear(level, grade)).slice(-2);
  const month = String((index % 12) + 1).padStart(2, "0");
  const day = String((Math.floor(index / 12) % 28) + 1).padStart(2, "0");
  const firstSeventeen = `DEMO${year}${month}${day}${sex === "mujer" ? "M" : "H"}DFBCDA`;
  return `${firstSeventeen}${curpCheckDigit(firstSeventeen)}`;
}

function temporaryPassword(firstName, enrollment) {
  return `${firstName.slice(0, 2).toUpperCase()}${enrollment.slice(-4)}`;
}

function isoDate(monthIndex, day, hour = 12) {
  return new Date(Date.UTC(cycleStartYear, monthIndex, day, hour)).toISOString();
}

function getExpectedCost(student, type) {
  const level = LEVELS.find((item) => item.value === student.nivel);
  const base = type === "inscripcion"
    ? level.enrollmentCost
    : level.monthlyCost;
  const scholarshipApplies = student.scholarship
    && (student.scholarshipScope === "ambas"
      || student.scholarshipScope === type);
  return scholarshipApplies
    ? Math.round(base * (100 - student.scholarshipPercentage)) / 100
    : base;
}

async function deleteWhereIn(table, column, values) {
  if (values.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, values);
  if (error && error.code !== "42P01") throw error;
}

async function cleanPreviousDemoData() {
  const { data: demoStudents, error } = await supabase
    .from("alumnos")
    .select("id, usuario_id")
    .like("matricula", "DEMO%");
  if (error) throw error;

  const studentIds = (demoStudents ?? []).map((student) => student.id);
  const userIds = (demoStudents ?? []).map((student) => student.usuario_id);

  if (studentIds.length > 0) {
    const { data: demoPayments, error: paymentError } = await supabase
      .from("pagos")
      .select("id")
      .in("alumno_id", studentIds);
    if (paymentError) throw paymentError;
    const paymentIds = (demoPayments ?? []).map((payment) => payment.id);

    await deleteWhereIn("auditoria_pagos", "pago_id", paymentIds);
    await deleteWhereIn("auditoria_pagos_eliminados", "alumno_id", studentIds);
    await deleteWhereIn("estado_cuenta", "alumno_id", studentIds);
    await deleteWhereIn("pagos", "alumno_id", studentIds);
    await deleteWhereIn("alumnos_becas", "alumno_id", studentIds);
    await deleteWhereIn("promociones_academicas", "alumno_id", studentIds);
    await deleteWhereIn("alumnos", "id", studentIds);
  }

  for (const userId of userIds) {
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;
  }
}

function buildStudentDefinitions() {
  const definitions = [];
  let index = 0;
  for (const level of LEVELS) {
    for (let grade = 1; grade <= level.grades; grade += 1) {
      for (const group of level.groups) {
        for (let seat = 1; seat <= 2; seat += 1) {
          const name = FIRST_NAMES[index % FIRST_NAMES.length];
          const paternal = PATERNAL_SURNAMES[(index * 5) % PATERNAL_SURNAMES.length];
          const maternal = MATERNAL_SURNAMES[(index * 7 + 3) % MATERNAL_SURNAMES.length];
          const sex = index % 2 === 0 ? "mujer" : "hombre";
          const enrollment = generateDemoCurp(index, sex, level.value, grade);
          const scholarship = index % 9 === 3;
          definitions.push({
            index,
            nombre: name,
            apellido_paterno: paternal,
            apellido_materno: maternal,
            matricula: enrollment,
            email: `${enrollment.toLowerCase()}@alumno.com`,
            password: temporaryPassword(name, enrollment),
            nivel: level.value,
            grado: grade,
            grupo: group,
            sexo: sex,
            scholarship,
            scholarshipPercentage: scholarship ? 25 : 0,
            scholarshipScope: scholarship ? "mensualidad" : null,
          });
          index += 1;
        }
      }
    }
  }
  return definitions;
}

async function insertInBatches(table, rows, batchSize = 300) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const { error } = await supabase
      .from(table)
      .insert(rows.slice(start, start + batchSize));
    if (error) throw error;
  }
}

async function run() {
  console.log(`Preparando datos demo para el ciclo ${cycle}...`);
  await cleanPreviousDemoData();

  const { error: costError } = await supabase
    .from("configuracion_costos")
    .upsert(
      LEVELS.map((level) => ({
        nivel: level.value,
        costo_inscripcion: level.enrollmentCost,
        costo_mensualidad: level.monthlyCost,
        ciclo_escolar: cycle,
        fecha_limite_inscripcion: `${cycleStartYear}-08-31`,
      })),
      { onConflict: "nivel,ciclo_escolar" },
    );
  if (costError) throw costError;

  const { data: scholarship, error: scholarshipError } = await supabase
    .from("becas")
    .upsert({
      nombre: "Beca demo académica 25%",
      porcentaje: 25,
      alcance: "mensualidad",
      descripcion: "Beca ficticia para validar reportes y estados de cuenta.",
      activa: true,
    }, { onConflict: "nombre" })
    .select("id")
    .single();
  if (scholarshipError) throw scholarshipError;

  const definitions = buildStudentDefinitions();
  const createdStudents = [];

  for (const definition of definitions) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: definition.email,
      password: definition.password,
      email_confirm: true,
      app_metadata: { role: "student" },
      user_metadata: {
        nombre: definition.nombre,
        apellido_paterno: definition.apellido_paterno,
        apellido_materno: definition.apellido_materno,
        matricula: definition.matricula,
        demo: true,
      },
    });
    if (authError) throw authError;

    const { data: student, error: studentError } = await supabase
      .from("alumnos")
      .insert({
        nombre: definition.nombre,
        apellido_paterno: definition.apellido_paterno,
        apellido_materno: definition.apellido_materno,
        matricula: definition.matricula,
        fecha_alta: `${cycleStartYear}-08-01`,
        nivel: definition.nivel,
        grado: definition.grado,
        grupo: definition.grupo,
        sexo: definition.sexo,
        estado: "activo",
        usuario_id: authData.user.id,
        ciclo_grado_actual: cycle,
        promocion_habilitada: false,
      })
      .select("id")
      .single();

    if (studentError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw studentError;
    }

    createdStudents.push({
      ...definition,
      id: student.id,
      usuario_id: authData.user.id,
    });
    if (createdStudents.length % 10 === 0) {
      console.log(`Usuarios y alumnos creados: ${createdStudents.length}/${definitions.length}`);
    }
  }

  const scholarshipRows = createdStudents
    .filter((student) => student.scholarship)
    .map((student) => ({
      alumno_id: student.id,
      beca_id: scholarship.id,
      ciclo_escolar: cycle,
      observaciones: "Asignación ficticia para pruebas integrales.",
      porcentaje_aplicado: student.scholarshipPercentage,
      alcance_aplicado: student.scholarshipScope,
      vigencia_desde: `${cycleStartYear}-08-01`,
    }));
  await insertInBatches("alumnos_becas", scholarshipRows);

  for (const student of createdStudents.filter(({ scholarship }) => scholarship)) {
    const { error } = await supabase
      .from("alumnos")
      .update({
        deuda_mensualidad: getExpectedCost(student, "mensualidad") * 12,
      })
      .eq("id", student.id);
    if (error) throw error;
  }

  // Si la fecha límite ya pasó, el trigger de producción pone en pausa al
  // alumno recién creado. Se reactiva de forma temporal para poder generar
  // todos sus cargos; al final se restaura la deuda de quienes no pagaron.
  const { error: temporaryActivationError } = await supabase
    .from("alumnos")
    .update({ deuda_inscripcion: 0 })
    .in("id", createdStudents.map((student) => student.id));
  if (temporaryActivationError) throw temporaryActivationError;

  const accountRows = [];
  for (const student of createdStudents) {
    accountRows.push({
      alumno_id: student.id,
      concepto: `Inscripción ${cycleStartYear}`,
      tipo_pago: "inscripcion",
      mes: "agosto",
      anio: cycleStartYear,
      monto_esperado: getExpectedCost(student, "inscripcion"),
      monto_pagado: 0,
      fecha_limite: `${cycleStartYear}-08-31`,
    });
    const months = [
      ["agosto", 8, cycleStartYear], ["septiembre", 9, cycleStartYear],
      ["octubre", 10, cycleStartYear], ["noviembre", 11, cycleStartYear],
      ["diciembre", 12, cycleStartYear], ["enero", 1, cycleStartYear + 1],
      ["febrero", 2, cycleStartYear + 1], ["marzo", 3, cycleStartYear + 1],
      ["abril", 4, cycleStartYear + 1], ["mayo", 5, cycleStartYear + 1],
      ["junio", 6, cycleStartYear + 1], ["julio", 7, cycleStartYear + 1],
    ];
    for (const [month, monthNumber, year] of months) {
      accountRows.push({
        alumno_id: student.id,
        concepto: `Colegiatura ${month[0].toUpperCase()}${month.slice(1)}`,
        tipo_pago: "mensualidad",
        mes: month,
        anio: year,
        monto_esperado: getExpectedCost(student, "mensualidad"),
        monto_pagado: 0,
        fecha_limite: `${year}-${String(monthNumber).padStart(2, "0")}-10`,
      });
    }
  }
  await insertInBatches("estado_cuenta", accountRows);

  const paymentRows = [];
  for (const student of createdStudents) {
    // Uno de cada diez conserva la inscripción pendiente.
    if (student.index % 10 === 0) continue;
    paymentRows.push({
      alumno_id: student.id,
      monto: getExpectedCost(student, "inscripcion"),
      tipo_pago: "inscripcion",
      metodo_pago: PAYMENT_METHODS[student.index % PAYMENT_METHODS.length],
      facturado: student.index % 3 === 0,
      mes: "agosto",
      anio: cycleStartYear,
      fecha_pago: isoDate(7, 3 + (student.index % 20), 14),
    });
    paymentRows.push({
      alumno_id: student.id,
      monto: getExpectedCost(student, "mensualidad"),
      tipo_pago: "mensualidad",
      metodo_pago: PAYMENT_METHODS[(student.index + 1) % PAYMENT_METHODS.length],
      facturado: student.index % 4 === 0,
      mes: "agosto",
      anio: cycleStartYear,
      fecha_pago: isoDate(7, 5 + (student.index % 18), 16),
    });

    // Septiembre queda distribuido entre pagado, parcial y pendiente.
    if (student.index % 4 === 0) {
      paymentRows.push({
        alumno_id: student.id,
        monto: getExpectedCost(student, "mensualidad") / 2,
        tipo_pago: "mensualidad",
        metodo_pago: PAYMENT_METHODS[(student.index + 2) % PAYMENT_METHODS.length],
        facturado: student.index % 5 === 0,
        mes: "septiembre",
        anio: cycleStartYear,
        fecha_pago: isoDate(8, 1 + (student.index % 5), 13),
      });
    } else if (student.index % 4 >= 2) {
      paymentRows.push({
        alumno_id: student.id,
        monto: getExpectedCost(student, "mensualidad"),
        tipo_pago: "mensualidad",
        metodo_pago: PAYMENT_METHODS[(student.index + 2) % PAYMENT_METHODS.length],
        facturado: student.index % 5 === 0,
        mes: "septiembre",
        anio: cycleStartYear,
        fecha_pago: isoDate(8, 1 + (student.index % 5), 13),
      });
    }
  }

  // Se insertan en orden para respetar inscripción -> agosto -> septiembre.
  for (const payment of paymentRows) {
    const { error } = await supabase.from("pagos").insert(payment);
    if (error) throw error;
  }

  for (const student of createdStudents.filter(({ index }) => index % 10 === 0)) {
    const { error } = await supabase
      .from("alumnos")
      .update({ deuda_inscripcion: getExpectedCost(student, "inscripcion") })
      .eq("id", student.id);
    if (error) throw error;
  }

  const manuallyPaused = createdStudents
    .filter((student) => student.index % 17 === 8)
    .map((student) => student.id);
  const withdrawn = createdStudents
    .filter((student) => student.index % 23 === 11)
    .map((student) => student.id);
  if (manuallyPaused.length > 0) {
    const { error } = await supabase
      .from("alumnos")
      .update({ estado: "pausa", pausa_automatica_inscripcion: false })
      .in("id", manuallyPaused);
    if (error) throw error;
  }
  if (withdrawn.length > 0) {
    const { error } = await supabase
      .from("alumnos")
      .update({ estado: "baja", pausa_automatica_inscripcion: false })
      .in("id", withdrawn);
    if (error) throw error;
  }

  const credentialsPath = resolve(process.cwd(), "datos-demo-credenciales.csv");
  const csv = [
    "curp,nombre,email,password,nivel,grado,grupo",
    ...createdStudents.map((student) => [
      student.matricula,
      `${student.nombre} ${student.apellido_paterno} ${student.apellido_materno}`,
      student.email,
      student.password,
      student.nivel,
      student.grado,
      student.grupo,
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")),
  ].join("\n");
  writeFileSync(credentialsPath, csv, "utf8");

  console.log("Carga demo terminada correctamente.");
  console.log(`Alumnos: ${createdStudents.length}`);
  console.log(`Becas asignadas: ${scholarshipRows.length}`);
  console.log(`Pagos registrados: ${paymentRows.length}`);
  console.log(`Credenciales: ${credentialsPath}`);
}

run().catch((error) => {
  console.error("No fue posible completar la carga demo:", error.message ?? error);
  process.exitCode = 1;
});
