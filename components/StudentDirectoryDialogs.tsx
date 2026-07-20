"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { LoaderCircle, X } from "lucide-react";
import type { StudentListItem } from "@/lib/admin-data";
import { invalidateAdminData } from "@/lib/admin-data";
import {
  ACADEMIC_MONTHS,
  getAcademicMonthYear,
  getCurrentAcademicCycle,
  getFullStudentName,
  getReEnrollmentLevel,
} from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/payments";
import {
  getDiscountedCost,
  type AppliedScholarship,
} from "@/lib/scholarships";
import type {
  AlumnoInsert,
  ConfiguracionCostos,
  Database,
  EstadoAlumno,
  MetodoPago,
  MesPago,
  NivelEscolar,
  Pago,
  SexoAlumno,
  TipoPago,
} from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

type QuickPayment = {
  totalBalance: number;
  concept: string;
  pendingAmount: number;
  paymentType: TipoPago;
  month: MesPago;
  year: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function generateTemporaryPassword(name: string, enrollment: string) {
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  return `${firstName.slice(0, 2).toLocaleUpperCase("es-MX")}${enrollment.slice(-4).toUpperCase()}`;
}

function createIsolatedSignUpClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Falta la configuración de Supabase.");

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function QuickPaymentModal({
  student,
  onClose,
  onSuccess,
}: {
  student: StudentListItem;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [details, setDetails] = useState<QuickPayment | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<MetodoPago>("efectivo");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const cycle = useMemo(() => getCurrentAcademicCycle(), []);

  useEffect(() => {
    let mounted = true;

    async function loadBalance() {
      setIsLoading(true);
      setError("");
      try {
        const supabase = getSupabaseBrowserClient();
        const billingLevel = getReEnrollmentLevel(student, cycle);
        const [studentResult, configurationResult, paymentsResult, scholarshipResult] =
          await Promise.all([
            supabase
              .from("alumnos")
              .select("deuda_inscripcion, deuda_mensualidad")
              .eq("id", student.id)
              .single(),
            supabase
              .from("configuracion_costos")
              .select("nivel, costo_inscripcion, costo_mensualidad, ciclo_escolar, fecha_limite_inscripcion")
              .eq("nivel", billingLevel)
              .eq("ciclo_escolar", cycle)
              .maybeSingle(),
            supabase
              .from("pagos")
              .select("id, alumno_id, monto, tipo_pago, fecha_pago, mes, anio")
              .eq("alumno_id", student.id),
            supabase
              .from("alumnos_becas")
              .select("porcentaje_aplicado, alcance_aplicado, becas!inner(nombre)")
              .eq("alumno_id", student.id)
              .eq("ciclo_escolar", cycle)
              .maybeSingle(),
          ]);

        if (studentResult.error) throw studentResult.error;
        if (configurationResult.error) throw configurationResult.error;
        if (paymentsResult.error) throw paymentsResult.error;
        if (scholarshipResult.error) throw scholarshipResult.error;
        if (!configurationResult.data) {
          throw new Error(`No hay costos configurados para ${billingLevel} en ${cycle}.`);
        }

        const balance = studentResult.data;
        const configuration = configurationResult.data as ConfiguracionCostos;
        const payments = paymentsResult.data as Pago[];
        const scholarship = scholarshipResult.data as unknown as AppliedScholarship | null;
        const effectiveMonthlyCost = getDiscountedCost(
          configuration.costo_mensualidad,
          scholarship,
          "mensualidad",
        );
        let nextPayment: QuickPayment | null = null;

        if (balance.deuda_inscripcion > 0) {
          nextPayment = {
            totalBalance: balance.deuda_inscripcion + balance.deuda_mensualidad,
            concept: `Inscripción agosto ${getAcademicMonthYear("agosto", cycle)}`,
            pendingAmount: balance.deuda_inscripcion,
            paymentType: "inscripcion",
            month: "agosto",
            year: getAcademicMonthYear("agosto", cycle),
          };
        } else {
          for (const academicMonth of ACADEMIC_MONTHS) {
            const year = getAcademicMonthYear(academicMonth.value, cycle);
            const paid = payments
              .filter(
                (payment) =>
                  payment.tipo_pago === "mensualidad" &&
                  payment.mes === academicMonth.value &&
                  payment.anio === year,
              )
              .reduce((total, payment) => total + payment.monto, 0);
            const pending = Math.max(effectiveMonthlyCost - paid, 0);
            if (pending > 0) {
              nextPayment = {
                totalBalance: balance.deuda_mensualidad,
                concept: `Mensualidad ${academicMonth.label} ${year}`,
                pendingAmount: pending,
                paymentType: "mensualidad",
                month: academicMonth.value,
                year,
              };
              break;
            }
          }
        }

        if (!mounted) return;
        setDetails(nextPayment);
        setAmount(nextPayment ? String(nextPayment.pendingAmount) : "");
      } catch (caughtError) {
        if (mounted) setError(getErrorMessage(caughtError, "No fue posible consultar el saldo."));
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadBalance();
    return () => {
      mounted = false;
    };
  }, [cycle, student]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Ingresa un monto mayor a cero.");
      return;
    }
    if (numericAmount > details.pendingAmount) {
      setError(`El monto no puede superar ${currencyFormatter.format(details.pendingAmount)}.`);
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("pagos").insert({
        alumno_id: student.id,
        monto: numericAmount,
        tipo_pago: details.paymentType,
        metodo_pago: paymentMethod,
        mes: details.month,
        anio: details.year,
      });
      if (insertError) throw insertError;

      invalidateAdminData("students:");
      invalidateAdminData("payments:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      await onSuccess(`Pago de ${currencyFormatter.format(numericAmount)} registrado para ${getFullStudentName(student)}.`);
      onClose();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No fue posible registrar el pago."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="quick-payment-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-sky-600">Cobro rápido</p><h2 id="quick-payment-title" className="mt-1 text-xl font-bold text-slate-950">{getFullStudentName(student)}</h2></div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Cerrar cobro rápido" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        {isLoading ? (
          <div role="status" className="mt-8 flex items-center justify-center gap-3 py-10 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Consultando saldo...</div>
        ) : details ? (
          <form onSubmit={handleSubmit} className="mt-7">
            <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Saldo total</dt><dd className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(details.totalBalance)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Siguiente concepto</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{details.concept}</dd></div>
            </dl>
            <label htmlFor="quick-payment-amount" className="mt-5 block text-sm font-medium text-slate-700">Monto a pagar</label>
            <input id="quick-payment-amount" type="number" min="0.01" max={details.pendingAmount} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className={fieldClass} />
            <p className="mt-2 text-xs text-slate-500">Saldo del concepto: {currencyFormatter.format(details.pendingAmount)}</p>
            <label htmlFor="quick-payment-method" className="mt-5 block text-sm font-medium text-slate-700">Método de pago</label>
            <select id="quick-payment-method" required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as MetodoPago)} className={fieldClass}>
              {PAYMENT_METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={isSaving} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}{isSaving ? "Registrando..." : "Registrar pago"}</button>
          </form>
        ) : (
          <div className="mt-7 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{error || "El alumno no tiene cargos pendientes en el ciclo actual."}</div>
        )}
      </section>
    </div>
  );
}

export function StudentDrawer({
  mode,
  student,
  onClose,
  onSuccess,
}: {
  mode: "new" | "edit";
  student: StudentListItem | null;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(student?.nombre ?? "");
  const [paternalSurname, setPaternalSurname] = useState(student?.apellido_paterno ?? "");
  const [maternalSurname, setMaternalSurname] = useState(student?.apellido_materno ?? "");
  const [enrollment, setEnrollment] = useState(student?.matricula ?? "");
  const [level, setLevel] = useState<NivelEscolar>(student?.nivel ?? "primaria");
  const [grade, setGrade] = useState(String(student?.grado ?? 1));
  const [group, setGroup] = useState(student?.grupo ?? "");
  const [sex, setSex] = useState<SexoAlumno>(student?.sexo ?? "mujer");
  const [status, setStatus] = useState<EstadoAlumno>(student?.estado ?? "activo");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const maximumGrade = level === "primaria" ? 6 : 3;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim().replace(/\s+/g, " ");
    const normalizedPaternalSurname = paternalSurname.trim().replace(/\s+/g, " ");
    const normalizedMaternalSurname = maternalSurname.trim().replace(/\s+/g, " ");
    const normalizedEnrollment = enrollment.trim().toUpperCase();
    const normalizedGroup = group.trim().toUpperCase();
    const numericGrade = Number(grade);

    if (normalizedName.length < 2 || !normalizedPaternalSurname || !normalizedGroup) {
      setError("Nombre, apellido paterno y grupo son obligatorios.");
      return;
    }
    if (!/^[A-Z0-9]{4,30}$/.test(normalizedEnrollment)) {
      setError("La matrícula debe contener entre 4 y 30 letras o números.");
      return;
    }
    if (!Number.isInteger(numericGrade) || numericGrade < 1 || numericGrade > maximumGrade) {
      setError("Selecciona un grado válido para el nivel indicado.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "edit" && student) {
        const { error: updateError } = await supabase
          .from("alumnos")
          .update({
            nombre: normalizedName,
            apellido_paterno: normalizedPaternalSurname,
            apellido_materno: normalizedMaternalSurname,
            nivel: level,
            grado: numericGrade,
            grupo: normalizedGroup,
            sexo: sex,
            estado: status,
          })
          .eq("id", student.id);
        if (updateError) throw updateError;
        invalidateAdminData("students:");
        invalidateAdminData("dashboard:");
        invalidateAdminData("reports:");
        await onSuccess(`La información de ${getFullStudentName({ nombre: normalizedName, apellido_paterno: normalizedPaternalSurname, apellido_materno: normalizedMaternalSurname })} se actualizó correctamente.`);
      } else {
        const { data: existingStudent, error: lookupError } = await supabase
          .from("alumnos")
          .select("id")
          .eq("matricula", normalizedEnrollment)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existingStudent) throw new Error("Ya existe un alumno con esa matrícula.");

        const email = `${normalizedEnrollment.toLowerCase()}@alumno.com`;
        const temporaryPassword = generateTemporaryPassword(normalizedName, normalizedEnrollment);
        const signUpClient = createIsolatedSignUpClient();
        const { data: authData, error: signUpError } = await signUpClient.auth.signUp({
          email,
          password: temporaryPassword,
          options: { data: { nombre: normalizedName, apellido_paterno: normalizedPaternalSurname, apellido_materno: normalizedMaternalSurname, matricula: normalizedEnrollment } },
        });
        if (signUpError) throw signUpError;
        if (!authData.user || authData.user.identities?.length === 0) throw new Error("Ya existe una cuenta asociada a esta matrícula.");

        const newStudent: AlumnoInsert = {
          nombre: normalizedName,
          apellido_paterno: normalizedPaternalSurname,
          apellido_materno: normalizedMaternalSurname,
          matricula: normalizedEnrollment,
          nivel: level,
          grado: numericGrade,
          grupo: normalizedGroup,
          sexo: sex,
          estado: status,
          usuario_id: authData.user.id,
        };
        const { error: insertError } = await supabase.from("alumnos").insert(newStudent);
        if (insertError) throw insertError;
        invalidateAdminData("students:");
        invalidateAdminData("dashboard:");
        invalidateAdminData("reports:");
        await onSuccess(`Alumno registrado. Acceso: ${email} · Contraseña temporal: ${temporaryPassword}`);
      }
      onClose();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, mode === "edit" ? "No fue posible actualizar al alumno." : "No fue posible registrar al alumno."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[1px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="student-drawer-title" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div><p className="text-sm font-medium text-sky-600">Administración académica</p><h2 id="student-drawer-title" className="mt-1 text-2xl font-bold text-slate-950">{mode === "new" ? "Nuevo alumno" : "Editar alumno"}</h2></div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Cerrar formulario" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </header>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Nombre(s)<input required value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
            <label className="text-sm font-medium text-slate-700">Apellido paterno<input required value={paternalSurname} onChange={(event) => setPaternalSurname(event.target.value)} className={fieldClass} /></label>
            <label className="text-sm font-medium text-slate-700">Apellido materno<input value={maternalSurname} onChange={(event) => setMaternalSurname(event.target.value)} className={fieldClass} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Matrícula<input required disabled={mode === "edit"} minLength={4} maxLength={30} value={enrollment} onChange={(event) => setEnrollment(event.target.value)} className={fieldClass} /><span className="mt-1 block text-xs font-normal text-slate-500">{mode === "edit" ? "La matrícula no se modifica porque identifica también la cuenta de acceso." : "Se utilizará para generar el acceso del alumno."}</span></label>
            <label className="text-sm font-medium text-slate-700">Nivel<select value={level} onChange={(event) => { setLevel(event.target.value as NivelEscolar); setGrade("1"); }} className={fieldClass}><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option><option value="bachillerato">Bachillerato</option></select></label>
            <label className="text-sm font-medium text-slate-700">Grado<select value={grade} onChange={(event) => setGrade(event.target.value)} className={fieldClass}>{Array.from({ length: maximumGrade }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}°</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Grupo<input required maxLength={10} value={group} onChange={(event) => setGroup(event.target.value)} className={fieldClass} /></label>
            <label className="text-sm font-medium text-slate-700">Sexo<select value={sex} onChange={(event) => setSex(event.target.value as SexoAlumno)} className={fieldClass}><option value="mujer">Mujer</option><option value="hombre">Hombre</option></select></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Estado académico<select value={status} onChange={(event) => setStatus(event.target.value as EstadoAlumno)} className={fieldClass}><option value="activo">Activo</option><option value="pausa">Pausa temporal</option><option value="baja">Baja definitiva</option></select></label>
          </div>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="mt-7 flex justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}{isSaving ? "Guardando..." : mode === "new" ? "Registrar alumno" : "Guardar cambios"}</button></div>
        </form>
      </section>
    </div>
  );
}
