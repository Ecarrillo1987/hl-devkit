---
name: spec
description: Genera la spec de migración de un endpoint (qué hace hoy el PHP legacy) en la carpeta de specs del dev. Usar solo cuando el dev la pide con el nombre del endpoint.
disable-model-invocation: true
argument-hint: <endpoint>
---

# Spec de migración — qué hace hoy el endpoint

Endpoint: `$ARGUMENTS`

## Rutas

- Carpeta de specs: `${user_config.specs_path}`
- Código legacy (solo lectura): `${user_config.legacy_path}`

Si alguna de las dos aparece vacía o como texto `${...}`, usar las rutas de "Esta estación de trabajo" del contexto de la sesión. Si tampoco están ahí, parar y pedirle al dev que corra `configure-dev.js` con `--specs`.

## Reglas

- La spec describe el legacy **tal como es hoy**. No propone diseño NestJS: eso es el plan.
- El legacy se lee, nunca se modifica.
- Sin credenciales, tokens, IPs ni datos de clientes en la spec. Si un archivo del legacy es de configuración con credenciales, no se abre: se anota "config de credenciales, no leída".
- Cada regla y validación cita su origen como `archivo:línea`.
- Antes de declarar una dependencia externa (integrador, API, servicio), verificar la cadena real de llamadas en el PHP. El inventario se equivocó en esto varias veces.
- Lo que no se puede confirmar leyendo el código va a "Preguntas abiertas", no se supone.
- La spec se escribe solo en `<carpeta de specs>/<endpoint>/spec.md`. Nunca dentro del repo de trabajo.

## Pasos

1. Validar que el endpoint tenga formato `^[A-Za-z0-9_-]+$`. Si no, parar.
2. Si ya existe `<carpeta de specs>/<endpoint>/spec.md`, mostrar su estado y preguntar si se actualiza o se deja. No sobrescribir sin OK.
3. Ubicar el endpoint en el legacy: controller (v1 o v2), método, rutas, modelos, librerías y stored procedures que usa. Mostrar la lista de archivos que se van a leer y leerlos completos.
4. Escribir `spec.md` con el formato de abajo.
5. Mostrar la spec completa al dev y preguntar si se aprueba. Si se aprueba, cambiar `Estado: borrador` por `Estado: aprobado (<fecha>)`. Si no, ajustar y volver a mostrar.

## Formato de spec.md

```markdown
# Spec — <endpoint>

Estado: borrador
Dev: <nombre> | Fecha: <AAAA-MM-DD>
Archivos legacy leídos:
- <ruta relativa al legacy>

## 1. Propósito
<qué hace el endpoint para el usuario, en 2 o 3 líneas>

## 2. Contrato actual

### Entrada
| Campo | Origen (query, body, header, R1..R7) | Tipo según PHP | Obligatorio | Notas |
|---|---|---|---|---|

Método y ruta: <método> <ruta> (versión v1/v2)

### Respuesta exitosa
<forma exacta: wrapper {status, message, response_code} o primitivo/array desnudo, con un ejemplo de estructura sin datos reales>

### Respuestas de error
| Caso | status / código | Mensaje exacto |
|---|---|---|

## 3. Reglas de negocio
| Id | Regla | Origen (archivo:línea) |
|---|---|---|
| RN-1 | | |

## 4. Validaciones
| Campo | Qué valida el PHP | Origen | Qué NO valida y debería |
|---|---|---|---|

## 5. Acceso a datos
| Tabla / SP | Operación (lectura, escritura) | Columnas | Origen |
|---|---|---|---|

SQL relevante (con parámetros, sin valores reales):
<consultas o resumen del SP>

Transacciones: <si hay, dónde empiezan y terminan; si escribe dinero sin transacción, marcarlo>

## 6. Dependencias
| Dependencia | Tipo (modelo, librería, servicio externo) | Verificada en el código (sí/no) |
|---|---|---|

## 7. Seguridad financiera y auditoría
<montos, saldos, logs de auditoría, datos sensibles en logs o respuestas>

## 8. Bugs, código muerto y patrones a no replicar
| Hallazgo | Origen | Impacto |
|---|---|---|

## 9. Preguntas abiertas
- <lo que no se pudo confirmar leyendo el código>
```
