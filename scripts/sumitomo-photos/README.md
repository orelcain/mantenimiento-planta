# Fotos de los motores SUMITOMO (seed-sumitomo-motors.js)

Coloca aquí las fotos de los motores, **nombradas por código SAP**. El script
`scripts/seed-sumitomo-motors.js` busca un archivo por cada motor según su SAP y
lo sube a Firebase Storage como imagen principal del asset.

## Archivos esperados (formatos: .jpg .jpeg .png .webp)

| Archivo            | Motor(es) que recibe(n) la foto                                                                 | Descripción SAP (etiqueta)          |
|--------------------|--------------------------------------------------------------------------------------------------|-------------------------------------|
| `3300124070.jpg`   | Cinta alimentación Gea                                                                            | MOTOR REDUCTOR MOD RNYM05 207 RPM   |
| `3300124071.jpg`   | Cinta alimentación Baader 142                                                                     | MOTOR REDUCTOR MOD RNYM1 207RPM     |
| `3300124072.jpg`   | Cinta Z elevadora HG                                                                              | MOTOR REDUCTOR MOD RNYM1 48.3 RPM   |
| `3300124073.jpg`   | Cinta desperdicio Baader 200 · Cinta desperdicio filete · Cinta filete · Cinta transversal Baader 142 · Cinta curva | MOTOR REDUCTOR MOD RNYM08 48,3 RPM |

> El SAP `3300124073` lo comparten 5 motores (mismo modelo físico): esa única foto
> se sube a los 5 assets.

Si falta alguna foto, ese motor se crea **sin imagen** (no es error); puedes volver
a correr el script con `--force` cuando agregues la foto para adjuntarla.

Las fotos NO se commitean al repo (ver `.gitignore`); viven solo localmente al correr el seed.
