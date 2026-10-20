---
name: plan
description: Genera el plan de migración de un endpoint a NestJS a partir de su spec aprobada, en la carpeta de specs del dev. Usar solo cuando el dev lo pide con el nombre del endpoint.
disable-model-invocation: true
argument-hint: <endpoint>
---

# Plan de migración — cómo se migra el endpoint

Endpoint: `$ARGUMENTS`

## Rutas

- Carpeta de specs: `${user_config.specs_path}`
- Repositorio de trabajo: `${user_config.repo_path}`

Si alguna aparece vacía o como texto `${...}`, usar las rutas de "Esta estación de trabajo" del contexto de la sesión. Si tampoco están ahí, parar y pedirle al dev que corra `configure-dev.js`.

## Reglas

- Solo se arranca si `<carpeta de specs>/<endpoint>/spec.md` existe y dice `Estado: aprobado`. Si no, parar y decir qué falta.
- El plan describe cómo se migra; no se escribe código del repo en este paso.
- Se mantiene el contrato del PHP (entrada y respuesta) salvo decisión explícita. Mejoras internas sí; cambios de lógica no.
- El agente no accede a MySQL. Los tipos de la BD los obtiene el dev con las consultas del bloque "Para vos en BD" y pega el resultado.
- Sin credenciales, IPs ni datos de clientes en el plan.
- El plan se escribe solo en `<carpeta de specs>/<endpoint>/plan.md`. Nunca dentro del repo de trabajo.

## Pasos

1. Leer `spec.md` completo y verificar el estado.
2. Leer en el repo de trabajo lo que ya existe y se puede reutilizar: modelos de `packages/sequelize-models`, catálogo de errores, controller y `app.module.ts` del msa, `app.service.ts` y `app.controller.ts` del gateway, y un endpoint ya migrado parecido como referencia.
3. Si ya existe `plan.md`, mostrar su estado y preguntar si se actualiza. No sobrescribir sin OK.
4. Escribir `plan.md` con el formato de abajo. La sección 1 queda con las consultas y la tabla de tipos **pendiente**.
5. Mostrar el bloque "Para vos en BD" y pedirle al dev que corra las consultas y pegue el resultado. Completar la sección 1 con los tipos reales y ajustar modelos y DTO si algún tipo no es el que parecía en el PHP.
6. Clasificar el impacto:
   - **Local**: solo archivos del endpoint en el msa y en el gateway (DTO, use-case, ruta, proxy, catálogo de errores).
   - **Global**: toca `packages/` (incluidos modelos compartidos), el pipeline, scripts de deploy, contratos entre servicios o el contrato con el front. Un plan global **lo valida Erick** antes de aprobarse.
7. Mostrar el plan completo y preguntar si se aprueba (si es global, si Erick lo aprobó). Al aprobarse, cambiar `Estado: borrador` por `Estado: aprobado (<fecha>)`.

## Formato de plan.md

```markdown
# Plan — <endpoint>

Estado: borrador
Spec: aprobada (<fecha de la spec>)
Impacto: local | global (validado por Erick: sí/no)
Dev: <nombre> | Fecha: <AAAA-MM-DD>

## 1. Tipos reales de la BD

Para vos en BD:
    DESCRIBE <schema>.<tabla>;

| Tabla | Columna | Tipo real | Tipo en el modelo / DTO | Nota |
|---|---|---|---|---|
| (pendiente: pegar resultado de las consultas) | | | | |

## 2. Modelos Sequelize
| Modelo | Existe (sí/no) | Cambios (campos a agregar con tipo real) | Paquete |
|---|---|---|---|

## 3. DTO del msa
| Campo | Tipo | Decoradores | Mensaje de error en español |
|---|---|---|---|

## 4. Catálogo de errores
| Código | Cuándo | Mensaje |
|---|---|---|

## 5. Use-case
Pasos, con cada regla de la spec:
| Paso | Regla (RN-n) | Implementación |
|---|---|---|

Transacción de BD: <sí/no y alcance>. Auditoría antes y después de escrituras financieras: <dónde>.

## 6. Registro y ruta en el msa
- Provider en app.module.ts: <nombre>
- Ruta: <método> <ruta> en <controller>

## 7. Gateway (mdl-billetera)
| Pieza | Detalle |
|---|---|
| DTO | |
| Service (proxy) | |
| Controller | <método y ruta; con JWT o @Public() y por qué> |

## 8. Contrato
- Se mantiene igual: <entrada, respuesta, wrapper o desnudo, asimetrías>
- Mejoras internas (no cambian el contrato): <validaciones, tipos, seguridad>

## 9. Bugs del legacy que se corrigen
| Bug (de la spec) | Corrección | Por qué |
|---|---|---|

## 10. Tests
| Caso | Regla | Esperado |
|---|---|---|

## 11. Archivos que se tocan
- <ruta en el repo> (nuevo / modificado)

## 12. Riesgos y decisiones humanas
- <TODOs que requieren revisión humana, sobre todo pagos y auth>
```
