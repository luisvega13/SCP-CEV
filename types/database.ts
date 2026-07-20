export type NivelEscolar = "primaria" | "secundaria" | "bachillerato";
export type EstadoAlumno = "activo" | "pausa" | "baja";
export type SexoAlumno = "hombre" | "mujer";
export type TipoPago = "inscripcion" | "mensualidad";
export type MetodoPago =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "deposito";
export type AlcanceBeca = "mensualidad" | "inscripcion" | "ambas";
export type EstatusCobro =
  | "pagado"
  | "vencido"
  | "parcial"
  | "pendiente";
export type MesPago =
  | "enero"
  | "febrero"
  | "marzo"
  | "abril"
  | "mayo"
  | "junio"
  | "julio"
  | "agosto"
  | "septiembre"
  | "octubre"
  | "noviembre"
  | "diciembre";

export type Alumno = {
  id: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  matricula: string;
  nivel: NivelEscolar;
  grado: number;
  grupo: string;
  estado: EstadoAlumno;
  deuda_mensualidad: number;
  deuda_inscripcion: number;
  sexo: SexoAlumno;
  usuario_id: string;
  ciclo_grado_actual: string;
  promocion_habilitada: boolean;
  pausa_automatica_inscripcion: boolean;
  fecha_pausa_inscripcion: string | null;
};

export type AlumnoInsert = Omit<
  Alumno,
  | "id"
  | "matricula"
  | "estado"
  | "deuda_mensualidad"
  | "deuda_inscripcion"
  | "ciclo_grado_actual"
  | "promocion_habilitada"
  | "pausa_automatica_inscripcion"
  | "fecha_pausa_inscripcion"
> & {
  id?: string;
  matricula: string;
  estado?: EstadoAlumno;
  deuda_mensualidad?: number;
  deuda_inscripcion?: number;
  ciclo_grado_actual?: string;
  promocion_habilitada?: boolean;
  pausa_automatica_inscripcion?: boolean;
  fecha_pausa_inscripcion?: string | null;
};
export type AlumnoUpdate = Partial<AlumnoInsert>;

export type Pago = {
  id: string;
  alumno_id: string;
  nivel_cobro: NivelEscolar;
  monto: number;
  tipo_pago: TipoPago;
  metodo_pago: MetodoPago;
  fecha_pago: string;
  mes: MesPago;
  anio: number;
  ciclo_escolar: string;
};

export type PagoInsert = Omit<
  Pago,
  "id" | "fecha_pago" | "ciclo_escolar" | "nivel_cobro"
> & {
  id?: string;
  fecha_pago?: string;
};
export type PagoUpdate = Partial<PagoInsert>;

export type AuditoriaPago = {
  id: string;
  pago_id: string;
  monto_anterior: number;
  monto_nuevo: number;
  metodo_anterior: MetodoPago | null;
  metodo_nuevo: MetodoPago | null;
  motivo: string;
  modificado_por: string;
  fecha_modificacion: string;
};

export type AuditoriaPagoEliminado = {
  id: string;
  pago_id: string;
  alumno_id: string;
  monto: number;
  tipo_pago: TipoPago;
  metodo_pago: MetodoPago;
  mes: MesPago;
  anio: number;
  fecha_pago_original: string;
  motivo: string;
  eliminado_por: string;
  fecha_eliminacion: string;
};

export type ConfiguracionCostos = {
  nivel: NivelEscolar;
  costo_inscripcion: number;
  costo_mensualidad: number;
  ciclo_escolar: string;
  fecha_limite_inscripcion: string;
};

export type ConfiguracionCostosInsert = ConfiguracionCostos;
export type ConfiguracionCostosUpdate = Partial<
  Pick<ConfiguracionCostos, "costo_inscripcion" | "costo_mensualidad">
>;

export type EstadoCuenta = {
  id: string;
  alumno_id: string;
  concepto: string;
  tipo_pago: TipoPago;
  mes: MesPago;
  anio: number;
  monto_esperado: number;
  monto_pagado: number;
  fecha_limite: string;
  estatus: EstatusCobro;
  created_at: string;
  updated_at: string;
};

export type EstadoCuentaInsert = Omit<
  EstadoCuenta,
  "id" | "estatus" | "created_at" | "updated_at" | "monto_pagado"
> & {
  id?: string;
  estatus?: EstatusCobro;
  monto_pagado?: number;
  created_at?: string;
  updated_at?: string;
};

export type EstadoCuentaUpdate = Partial<EstadoCuentaInsert>;

export type FinancialReportKpis = {
  total_recaudado: number;
  saldo_actual_vencido: number;
  proyeccion_ingresos: number;
  alumnos_con_adeudo: number;
};

export type AdminDashboardOverview = {
  cycle: string;
  generated_at: string;
  students: {
    total: number;
    active: number;
    paused: number;
    withdrawn: number;
  };
  finance: {
    collected_month: number;
    payment_count_month: number;
    average_ticket_month: number;
    collected_today: number;
    payment_count_today: number;
    collected_previous_month: number;
    month_change_percent: number | null;
    collected_cycle: number;
    overdue_balance: number;
    overdue_charges: number;
    students_with_overdue: number;
    total_receivable: number;
    due_next_30_days: number;
    collection_rate: number;
  };
  scholarships: {
    assignments: number;
    students: number;
    average_percentage: number;
  };
  audit: {
    edits_this_month: number;
    deletions_this_month: number;
  };
  students_by_level: Array<{
    level: NivelEscolar;
    total: number;
    active: number;
    collected_cycle: number;
    outstanding: number;
  }>;
  payments_by_type: Array<{
    type: TipoPago;
    amount: number;
    count: number;
  }>;
  payments_by_method: Array<{
    method: MetodoPago;
    amount: number;
    count: number;
  }>;
  account_status: Array<{
    status: EstatusCobro;
    count: number;
    balance: number;
  }>;
  monthly_trend: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
  recent_payments: Array<{
    id: string;
    student_name: string;
    matricula: string;
    monto: number;
    tipo_pago: TipoPago;
    metodo_pago: MetodoPago;
    fecha_pago: string;
  }>;
};

export type PromocionAcademica = {
  id: string;
  alumno_id: string;
  ciclo_escolar: string;
  nivel_anterior: NivelEscolar;
  grado_anterior: number;
  nivel_nuevo: NivelEscolar;
  grado_nuevo: number;
  fecha_promocion: string;
};

export type StudentFilterOptions = {
  grados: number[];
  grupos: string[];
};

export type Beca = {
  id: string;
  nombre: string;
  porcentaje: number;
  alcance: AlcanceBeca;
  descripcion: string;
  activa: boolean;
  created_at: string;
  updated_at: string;
};

export type AlumnoBeca = {
  id: string;
  alumno_id: string;
  beca_id: string;
  ciclo_escolar: string;
  observaciones: string;
  porcentaje_aplicado: number;
  alcance_aplicado: AlcanceBeca;
  fecha_asignacion: string;
};

export type Database = {
  public: {
    Tables: {
      alumnos: {
        Row: Alumno;
        Insert: AlumnoInsert;
        Update: AlumnoUpdate;
        Relationships: [];
      };
      pagos: {
        Row: Pago;
        Insert: PagoInsert;
        Update: PagoUpdate;
        Relationships: [
          {
            foreignKeyName: "pagos_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria_pagos: {
        Row: AuditoriaPago;
        Insert: Omit<AuditoriaPago, "id" | "fecha_modificacion"> & {
          id?: string;
          fecha_modificacion?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "auditoria_pagos_pago_id_fkey";
            columns: ["pago_id"];
            isOneToOne: false;
            referencedRelation: "pagos";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria_pagos_eliminados: {
        Row: AuditoriaPagoEliminado;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      becas: {
        Row: Beca;
        Insert: Omit<Beca, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Beca, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      alumnos_becas: {
        Row: AlumnoBeca;
        Insert: Omit<AlumnoBeca, "id" | "fecha_asignacion"> & {
          id?: string;
          fecha_asignacion?: string;
        };
        Update: Partial<Pick<AlumnoBeca, "beca_id" | "observaciones">>;
        Relationships: [
          {
            foreignKeyName: "alumnos_becas_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alumnos_becas_beca_id_fkey";
            columns: ["beca_id"];
            isOneToOne: false;
            referencedRelation: "becas";
            referencedColumns: ["id"];
          },
        ];
      };
      configuracion_costos: {
        Row: ConfiguracionCostos;
        Insert: ConfiguracionCostosInsert;
        Update: ConfiguracionCostosUpdate;
        Relationships: [];
      };
      estado_cuenta: {
        Row: EstadoCuenta;
        Insert: EstadoCuentaInsert;
        Update: EstadoCuentaUpdate;
        Relationships: [
          {
            foreignKeyName: "estado_cuenta_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
        ];
      };
      promociones_academicas: {
        Row: PromocionAcademica;
        Insert: Omit<PromocionAcademica, "id" | "fecha_promocion"> & {
          id?: string;
          fecha_promocion?: string;
        };
        Update: Partial<PromocionAcademica>;
        Relationships: [
          {
            foreignKeyName: "promociones_academicas_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      actualizar_configuracion_costos: {
        Args: {
          p_nivel: NivelEscolar;
          p_costo_inscripcion: number;
          p_costo_mensualidad: number;
          p_ciclo_escolar: string;
        };
        Returns: ConfiguracionCostos;
      };
      actualizar_configuracion_escolar: {
        Args: {
          p_nivel: NivelEscolar;
          p_costo_inscripcion: number;
          p_costo_mensualidad: number;
          p_ciclo_escolar: string;
          p_fecha_limite_inscripcion: string;
        };
        Returns: ConfiguracionCostos;
      };
      aplicar_pausas_por_inscripcion_vencida: {
        Args: Record<string, never>;
        Returns: {
          cycle: string;
          paused: number;
          reactivated: number;
          evaluated_at: string;
        };
      };
      actualizar_estatus_estado_cuenta: {
        Args: Record<string, never>;
        Returns: number;
      };
      generar_estado_cuenta_ciclo: {
        Args: {
          p_ciclo_escolar: string;
          p_dia_limite?: number;
        };
        Returns: number;
      };
      obtener_kpis_reportes_financieros: {
        Args: Record<string, never>;
        Returns: FinancialReportKpis;
      };
      obtener_resumen_administrativo: {
        Args: { p_ciclo_escolar: string };
        Returns: AdminDashboardOverview;
      };
      existen_pagos_nivel_ciclo: {
        Args: {
          p_nivel: NivelEscolar;
          p_ciclo_escolar: string;
        };
        Returns: boolean;
      };
      modificar_pago_auditado: {
        Args: {
          p_pago_id: string;
          p_nuevo_monto: number;
          p_metodo_pago: MetodoPago;
          p_motivo: string;
        };
        Returns: Pago;
      };
      asignar_beca_alumno: {
        Args: {
          p_alumno_id: string;
          p_beca_id: string;
          p_ciclo_escolar: string;
          p_observaciones?: string;
        };
        Returns: AlumnoBeca;
      };
      retirar_beca_alumno: {
        Args: { p_asignacion_id: string };
        Returns: undefined;
      };
      eliminar_pago_auditado: {
        Args: { p_pago_id: string; p_motivo: string };
        Returns: undefined;
      };
      obtener_filtros_directorio_alumnos: {
        Args: Record<string, never>;
        Returns: StudentFilterOptions;
      };
    };
    Enums: {
      nivel_escolar: NivelEscolar;
      estado_alumno: EstadoAlumno;
      sexo_alumno: SexoAlumno;
      tipo_pago: TipoPago;
      metodo_pago: MetodoPago;
      alcance_beca: AlcanceBeca;
      mes_pago: MesPago;
      estatus_cobro: EstatusCobro;
    };
    CompositeTypes: Record<string, never>;
  };
};
