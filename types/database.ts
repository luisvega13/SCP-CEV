export type NivelEscolar = "primaria" | "secundaria" | "bachillerato";
export type EstadoAlumno = "activo" | "pausa" | "baja";
export type SexoAlumno = "hombre" | "mujer";
export type TipoPago = "inscripcion" | "mensualidad";
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
};

export type AlumnoInsert = Omit<
  Alumno,
  "id" | "matricula" | "estado" | "deuda_mensualidad" | "deuda_inscripcion"
> & {
  id?: string;
  matricula: string;
  estado?: EstadoAlumno;
  deuda_mensualidad?: number;
  deuda_inscripcion?: number;
};
export type AlumnoUpdate = Partial<AlumnoInsert>;

export type Pago = {
  id: string;
  alumno_id: string;
  monto: number;
  tipo_pago: TipoPago;
  fecha_pago: string;
  mes: MesPago;
  anio: number;
};

export type PagoInsert = Omit<Pago, "id" | "fecha_pago"> & {
  id?: string;
  fecha_pago?: string;
};
export type PagoUpdate = Partial<PagoInsert>;

export type ConfiguracionCostos = {
  nivel: NivelEscolar;
  costo_inscripcion: number;
  costo_mensualidad: number;
  ciclo_escolar: string;
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
    };
    Enums: {
      nivel_escolar: NivelEscolar;
      estado_alumno: EstadoAlumno;
      sexo_alumno: SexoAlumno;
      tipo_pago: TipoPago;
      mes_pago: MesPago;
      estatus_cobro: EstatusCobro;
    };
    CompositeTypes: Record<string, never>;
  };
};
