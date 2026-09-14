export type NivelEscolar =
  | "preescolar"
  | "primaria"
  | "secundaria"
  | "bachillerato";
export type EstadoAlumno = "activo" | "pausa" | "baja";
export type SexoAlumno = "hombre" | "mujer";
export type TipoPago = "inscripcion" | "mensualidad";
export type MetodoPago =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "deposito";
export type AlcanceBeca = "mensualidad" | "inscripcion" | "ambas";
export type TipoDescuentoBeca = "porcentaje" | "monto_fijo";
export type TipoPersonaFiscal = "fisica" | "moral";
export type RelacionResponsableFiscal =
  | "madre"
  | "padre"
  | "tutor"
  | "alumno"
  | "empresa"
  | "otro";
export type RelacionTutor = "madre" | "padre" | "tutor";
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
  fecha_alta: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  matricula: string;
  correo_acceso: string | null;
  iniciales_clave_temporal: string | null;
  contrasena_temporal_activa: boolean;
  contrasena_actualizada_at: string | null;
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
  ciclo_cobro_completo: string | null;
  factura_habitual: boolean;
};

export type AlumnoInsert = Omit<
  Alumno,
  | "id"
  | "fecha_alta"
  | "matricula"
  | "correo_acceso"
  | "iniciales_clave_temporal"
  | "contrasena_temporal_activa"
  | "contrasena_actualizada_at"
  | "estado"
  | "deuda_mensualidad"
  | "deuda_inscripcion"
  | "ciclo_grado_actual"
  | "promocion_habilitada"
  | "pausa_automatica_inscripcion"
  | "fecha_pausa_inscripcion"
  | "ciclo_cobro_completo"
  | "factura_habitual"
> & {
  id?: string;
  fecha_alta?: string;
  matricula: string;
  correo_acceso?: string | null;
  iniciales_clave_temporal?: string | null;
  contrasena_temporal_activa?: boolean;
  contrasena_actualizada_at?: string | null;
  estado?: EstadoAlumno;
  deuda_mensualidad?: number;
  deuda_inscripcion?: number;
  ciclo_grado_actual?: string;
  promocion_habilitada?: boolean;
  pausa_automatica_inscripcion?: boolean;
  fecha_pausa_inscripcion?: string | null;
  ciclo_cobro_completo?: string | null;
  factura_habitual?: boolean;
};
export type AlumnoUpdate = Partial<AlumnoInsert>;

export type Pago = {
  id: string;
  folio_comprobante: string;
  alumno_id: string;
  nivel_cobro: NivelEscolar;
  monto: number;
  tipo_pago: TipoPago;
  metodo_pago: MetodoPago;
  facturado: boolean;
  fecha_pago: string;
  mes: MesPago;
  anio: number;
  ciclo_escolar: string;
};

export type PagoInsert = Omit<
  Pago,
  "id" | "folio_comprobante" | "fecha_pago" | "ciclo_escolar" | "nivel_cobro" | "facturado"
> & {
  id?: string;
  folio_comprobante?: string;
  fecha_pago?: string;
  facturado?: boolean;
};
export type PagoUpdate = Partial<PagoInsert>;

export type AuditoriaPago = {
  id: string;
  pago_id: string;
  monto_anterior: number;
  monto_nuevo: number;
  metodo_anterior: MetodoPago | null;
  metodo_nuevo: MetodoPago | null;
  facturado_anterior: boolean | null;
  facturado_nuevo: boolean | null;
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
  facturado: boolean;
  folio_comprobante: string | null;
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
  proyeccion_mensual: number;
  pagado_aplicado_periodo: number;
  adeudo_pendiente_mes: number;
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
  tipo_descuento: TipoDescuentoBeca;
  monto_fijo: number;
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
  tipo_descuento_aplicado: TipoDescuentoBeca;
  monto_fijo_aplicado: number;
  alcance_aplicado: AlcanceBeca;
  vigencia_desde: string;
  fecha_asignacion: string;
};

export type AuditoriaAsignacionBeca = {
  id: string;
  asignacion_id: string | null;
  alumno_id: string;
  beca_id: string | null;
  beca_nombre: string;
  ciclo_escolar: string;
  porcentaje_aplicado: number;
  tipo_descuento_aplicado: TipoDescuentoBeca;
  monto_fijo_aplicado: number;
  alcance_aplicado: AlcanceBeca;
  vigencia_desde: string;
  observaciones: string;
  asignado_por: string;
  fecha_evento: string;
};

export type BecadosPorTipo = {
  ciclo_escolar: string;
  generado_en: string;
  total_becados: number;
  tipos: Array<{
    beca_id: string;
    tipo_beca: string;
    total: number;
    alumnos: Array<{
      nombre: string;
      curp: string;
      nivel: NivelEscolar;
      grado: number;
      grupo: string;
      estado: EstadoAlumno;
      porcentaje: number;
      tipo_descuento: TipoDescuentoBeca;
      monto_fijo: number;
      alcance: AlcanceBeca;
      vigencia_desde: string;
    }>;
  }>;
};

export type CatalogoRegimenFiscal = {
  clave: string;
  descripcion: string;
  aplica_fisica: boolean;
  aplica_moral: boolean;
  activo: boolean;
};

export type CatalogoUsoCfdi = CatalogoRegimenFiscal;

export type ResponsableFiscal = {
  id: string;
  tipo_persona: TipoPersonaFiscal;
  rfc: string;
  nombre_razon_social: string;
  codigo_postal_fiscal: string;
  regimen_fiscal: string;
  uso_cfdi_predeterminado: string;
  correo_facturacion: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type AlumnoResponsableFiscal = {
  id: string;
  alumno_id: string;
  responsable_fiscal_id: string;
  relacion: RelacionResponsableFiscal;
  es_predeterminado: boolean;
  created_at: string;
};

export type TutorAlumno = {
  id: string;
  alumno_id: string;
  posicion: 1 | 2;
  relacion: RelacionTutor;
  nombre: string;
  telefono: string;
  correo: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditoriaCurpAlumno = {
  id: string;
  alumno_id: string;
  curp_anterior: string;
  curp_nueva: string;
  modificado_por: string;
  fecha_modificacion: string;
};

export type TipoEventoAuditoria =
  | "pago_modificado"
  | "pago_eliminado"
  | "beca_asignada"
  | "curp_modificada"
  | "estado_alumno";

export type EventoAuditoriaAdministrativa = {
  id: string;
  tipo_evento: TipoEventoAuditoria;
  categoria: "pagos" | "becas" | "alumnos";
  fecha: string;
  alumno_id: string | null;
  matricula: string | null;
  alumno: string | null;
  responsable: string;
  motivo: string | null;
  resumen: string;
  detalle: Record<string, string | number | boolean | null>;
};

export type ConsultaAuditoriaAdministrativa = {
  total: number;
  pagos: number;
  becas: number;
  alumnos: number;
  registros: EventoAuditoriaAdministrativa[];
};

export type CarteraVencidaAlumno = {
  alumno_id: string;
  matricula: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  nivel: NivelEscolar;
  grado: number;
  grupo: string;
  cantidad_cargos: number;
  saldo_vencido: number;
  fecha_vencimiento_mas_antigua: string;
  cargos: Array<{
    id: string;
    concepto: string;
    tipo_pago: TipoPago;
    fecha_limite: string;
    saldo: number;
  }>;
};

export type ConsultaCarteraVencida = {
  total_alumnos: number;
  total_saldo_vencido: number;
  registros: CarteraVencidaAlumno[];
};

export type CorteDiario = {
  fecha: string;
  generado_en: string;
  total_movimientos: number;
  movimientos_sin_factura: number;
  movimientos_con_factura: number;
  total_recaudado: number;
  recaudado_sin_factura: number;
  recaudado_con_factura: number;
  por_metodo: Array<{
    metodo: MetodoPago;
    movimientos: number;
    movimientos_sin_factura: number;
    movimientos_con_factura: number;
    total: number;
    recaudado_sin_factura: number;
    recaudado_con_factura: number;
  }>;
  pagos: Array<{
    id: string;
    folio_comprobante: string;
    fecha_pago: string;
    hora_local: string;
    alumno: string;
    curp: string;
    tipo_pago: TipoPago;
    periodo: string;
    metodo_pago: MetodoPago;
    facturado: boolean;
    monto: number;
  }>;
};

export type ResumenFinancieroMensual = {
  ciclo_escolar: string;
  generado_en: string;
  total_proyectado: number;
  total_pagado: number;
  total_adeudo: number;
  meses: Array<{
    orden: number;
    mes: MesPago;
    etiqueta: string;
    anio: number;
    proyectado: number;
    pagado: number;
    adeudo: number;
  }>;
};

export type DesgloseAlumnos = {
  ciclo_escolar: string;
  generado_en: string;
  total_general: number;
  total_hombres: number;
  total_mujeres: number;
  total_activos: number;
  total_pausas: number;
  total_bajas: number;
  niveles: Array<{
    nivel: NivelEscolar;
    total: number;
    hombres: number;
    mujeres: number;
    activos: number;
    pausas: number;
    bajas: number;
    grados: Array<{
      grado: number;
      total: number;
      hombres: number;
      mujeres: number;
      activos: number;
      pausas: number;
      bajas: number;
    }>;
  }>;
};

export type BajaAlumno = {
  id: string;
  alumno_id: string;
  ciclo_escolar: string;
  fecha_baja: string | null;
  registrado_en: string;
  dado_baja_por: string | null;
  matricula: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  nivel: NivelEscolar;
  grado: number;
  grupo: string;
  sexo: SexoAlumno;
  tipo_baja: "baja" | "pausa";
};

export type ConsultaBajasAlumnos = {
  ciclo_escolar: string;
  total: number;
  hombres: number;
  mujeres: number;
  grados_disponibles: number[];
  grupos_disponibles: string[];
  registros: BajaAlumno[];
};

export type HistorialEstadoAlumno = {
  id: string;
  alumno_id: string;
  ciclo_escolar: string;
  estado_anterior: EstadoAlumno | null;
  estado_nuevo: EstadoAlumno;
  fecha_evento: string | null;
  registrado_en: string;
  dato_historico: boolean;
  matricula: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  nivel: NivelEscolar;
  grado: number;
  grupo: string;
  sexo: SexoAlumno;
};

export type ConsultaHistorialBajas = {
  ciclo_escolar: string;
  total_eventos: number;
  total_salidas: number;
  alumnos_reactivados: number;
  total_reactivaciones: number;
  registros: HistorialEstadoAlumno[];
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
      alumnos_bajas: {
        Row: BajaAlumno;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "alumnos_bajas_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
        ];
      };
      historial_estados_alumnos: {
        Row: HistorialEstadoAlumno;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "historial_estados_alumnos_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [];
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
        Insert: Omit<AlumnoBeca, "id" | "fecha_asignacion" | "vigencia_desde"> & {
          id?: string;
          fecha_asignacion?: string;
          vigencia_desde?: string;
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
      auditoria_asignaciones_becas: {
        Row: AuditoriaAsignacionBeca;
        Insert: never;
        Update: never;
        Relationships: [];
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
      catalogo_regimenes_fiscales: {
        Row: CatalogoRegimenFiscal;
        Insert: CatalogoRegimenFiscal;
        Update: Partial<CatalogoRegimenFiscal>;
        Relationships: [];
      };
      catalogo_usos_cfdi: {
        Row: CatalogoUsoCfdi;
        Insert: CatalogoUsoCfdi;
        Update: Partial<CatalogoUsoCfdi>;
        Relationships: [];
      };
      responsables_fiscales: {
        Row: ResponsableFiscal;
        Insert: Omit<ResponsableFiscal, "id" | "created_at" | "updated_at" | "updated_by"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Omit<ResponsableFiscal, "id" | "created_at">>;
        Relationships: [];
      };
      alumnos_responsables_fiscales: {
        Row: AlumnoResponsableFiscal;
        Insert: Omit<AlumnoResponsableFiscal, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Pick<AlumnoResponsableFiscal, "relacion" | "es_predeterminado">>;
        Relationships: [
          {
            foreignKeyName: "alumnos_responsables_fiscales_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alumnos_responsables_fiscales_responsable_fiscal_id_fkey";
            columns: ["responsable_fiscal_id"];
            isOneToOne: false;
            referencedRelation: "responsables_fiscales";
            referencedColumns: ["id"];
          },
        ];
      };
      tutores_alumnos: {
        Row: TutorAlumno;
        Insert: Omit<TutorAlumno, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<TutorAlumno, "posicion" | "relacion" | "nombre" | "telefono" | "correo">
        >;
        Relationships: [
          {
            foreignKeyName: "tutores_alumnos_alumno_id_fkey";
            columns: ["alumno_id"];
            isOneToOne: false;
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria_curp_alumnos: {
        Row: AuditoriaCurpAlumno;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "auditoria_curp_alumnos_alumno_id_fkey";
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
      generar_correo_acceso_alumno: {
        Args: Record<string, never>;
        Returns: string;
      };
      obtener_kpis_reportes_financieros: {
        Args: Record<string, never>;
        Returns: {
          total_recaudado: number;
          saldo_actual_vencido: number;
          proyeccion_ingresos: number;
          alumnos_con_adeudo: number;
        };
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
          p_facturado: boolean;
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
      obtener_becados_por_tipo: {
        Args: { p_ciclo_escolar: string };
        Returns: BecadosPorTipo;
      };
      eliminar_pago_auditado: {
        Args: { p_pago_id: string; p_motivo: string };
        Returns: undefined;
      };
      obtener_filtros_directorio_alumnos: {
        Args: Record<string, never>;
        Returns: StudentFilterOptions;
      };
      actualizar_preferencia_facturacion_alumno: {
        Args: {
          p_alumno_id: string;
          p_factura_habitual: boolean;
        };
        Returns: boolean;
      };
      guardar_responsable_fiscal_alumno: {
        Args: {
          p_alumno_id: string;
          p_responsable_id: string | null;
          p_tipo_persona: TipoPersonaFiscal;
          p_rfc: string;
          p_nombre_razon_social: string;
          p_codigo_postal_fiscal: string;
          p_regimen_fiscal: string;
          p_uso_cfdi: string;
          p_correo_facturacion: string;
          p_relacion: RelacionResponsableFiscal;
          p_es_predeterminado: boolean;
        };
        Returns: { relation_id: string; responsible_id: string };
      };
      guardar_tutores_alumno: {
        Args: {
          p_alumno_id: string;
          p_tutores: Array<{
            posicion: 1 | 2;
            relacion: RelacionTutor;
            nombre: string;
            telefono: string;
            correo: string;
          }>;
        };
        Returns: TutorAlumno[];
      };
      actualizar_curp_alumno: {
        Args: { p_alumno_id: string; p_curp: string };
        Returns: Alumno;
      };
      obtener_corte_diario: {
        Args: { p_fecha: string };
        Returns: CorteDiario;
      };
      obtener_resumen_financiero_mensual: {
        Args: { p_ciclo_escolar: string };
        Returns: ResumenFinancieroMensual;
      };
      obtener_desglose_alumnos: {
        Args: { p_ciclo_escolar: string };
        Returns: DesgloseAlumnos;
      };
      obtener_plantilla_recordatorio_whatsapp: {
        Args: Record<string, never>;
        Returns: string;
      };
      actualizar_plantilla_recordatorio_whatsapp: {
        Args: { p_plantilla: string };
        Returns: string;
      };
      consultar_bajas_alumnos: {
        Args: {
          p_ciclo_escolar: string;
          p_tipo_baja?: "baja" | "pausa" | null;
          p_nivel?: NivelEscolar | null;
          p_grado?: number | null;
          p_grupo?: string | null;
          p_busqueda?: string;
          p_limite?: number;
          p_offset?: number;
        };
        Returns: ConsultaBajasAlumnos;
      };
      consultar_historial_bajas_alumnos: {
        Args: {
          p_ciclo_escolar: string;
          p_tipo_baja?: "baja" | "pausa" | null;
          p_nivel?: NivelEscolar | null;
          p_grado?: number | null;
          p_grupo?: string | null;
          p_busqueda?: string;
          p_limite?: number;
          p_offset?: number;
        };
        Returns: ConsultaHistorialBajas;
      };
      consultar_auditoria_administrativa: {
        Args: {
          p_tipo_evento?: TipoEventoAuditoria | null;
          p_desde?: string | null;
          p_hasta?: string | null;
          p_busqueda?: string;
          p_limite?: number;
          p_offset?: number;
        };
        Returns: ConsultaAuditoriaAdministrativa;
      };
      consultar_cartera_vencida_alumnos: {
        Args: {
          p_nivel?: NivelEscolar | null;
          p_grado?: number | null;
          p_grupo?: string | null;
          p_tipo_pago?: TipoPago | null;
          p_busqueda?: string;
          p_limite?: number;
          p_offset?: number;
        };
        Returns: ConsultaCarteraVencida;
      };
    };
    Enums: {
      nivel_escolar: NivelEscolar;
      estado_alumno: EstadoAlumno;
      sexo_alumno: SexoAlumno;
      tipo_pago: TipoPago;
      metodo_pago: MetodoPago;
      alcance_beca: AlcanceBeca;
      tipo_persona_fiscal: TipoPersonaFiscal;
      relacion_responsable_fiscal: RelacionResponsableFiscal;
      relacion_tutor: RelacionTutor;
      mes_pago: MesPago;
      estatus_cobro: EstatusCobro;
    };
    CompositeTypes: Record<string, never>;
  };
};
