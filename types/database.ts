export type NivelEscolar = "primaria" | "secundaria" | "bachillerato";
export type EstadoAlumno = "activo" | "baja";
export type SexoAlumno = "hombre" | "mujer";
export type TipoPago = "inscripcion" | "mensualidad";

export type Alumno = {
  id: string;
  nombre: string;
  nivel: NivelEscolar;
  grado: number;
  grupo: string;
  estado: EstadoAlumno;
  deuda_mensualidad: number;
  deuda_inscripcion: number;
  sexo: SexoAlumno;
  usuario_id: string;
};

export type AlumnoInsert = Omit<Alumno, "id"> & { id?: string };
export type AlumnoUpdate = Partial<AlumnoInsert>;

export type Pago = {
  id: string;
  alumno_id: string;
  monto: number;
  tipo_pago: TipoPago;
  fecha_pago: string;
};

export type PagoInsert = Omit<Pago, "id" | "fecha_pago"> & {
  id?: string;
  fecha_pago?: string;
};
export type PagoUpdate = Partial<PagoInsert>;

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
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      nivel_escolar: NivelEscolar;
      estado_alumno: EstadoAlumno;
      sexo_alumno: SexoAlumno;
      tipo_pago: TipoPago;
    };
    CompositeTypes: Record<string, never>;
  };
};
