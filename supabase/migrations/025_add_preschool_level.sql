-- Se mantiene separado porque PostgreSQL no permite usar un valor nuevo de
-- enum dentro de la misma transaccion en la que se agrega.
alter type public.nivel_escolar
  add value if not exists 'preescolar' before 'primaria';
