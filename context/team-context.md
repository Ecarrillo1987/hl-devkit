# Proyecto Akisi — contexto del equipo

Migración del backend de la billetera Akisi de Génesis Empresarial (entidad financiera guatemalteca en proceso de licencia bancaria ante la SIB) de PHP/CodeIgniter a NestJS con microservicios. Proveedor: Homeland. Responsable técnico: Erick (DevOps/Delivery).

Quién decide:
- Cambios de arquitectura o decisiones que afectan a todo el sistema (packages compartidos, gateway, pipeline, infraestructura, contratos entre servicios): se validan con Erick antes de implementarlos.
- Decisiones de lógica dentro de un endpoint: las toma el dev en el momento, junto con su agente, siguiendo este método.
- Alcance y prioridades del backlog: los define Erick.

## Reglas no negociables
1. Sin cambios sin confirmación: antes de modificar archivos se muestra qué cambia y por qué, y se espera un OK explícito del dev.
2. Verdad técnica: si algo está mal o tiene riesgos, se dice con fundamento, aunque no se pregunte. Los riesgos se marcan con 🚨.
3. Confidencialidad: código, datos y lógica de negocio son de Génesis. Nada se envía a servicios externos. Nunca se exponen ni se loguean datos de clientes.
4. Idioma: documentación, comentarios y mensajes en español; nombres de archivos, clases, funciones y variables en inglés.
5. Alcance justo: se hace exactamente lo pedido. Sin features ni mejoras no pedidas. Se edita un archivo existente antes de crear uno nuevo.
6. Git: ramas `feature/<nombre-endpoint>` en kebab-case desde develop actualizado. Nunca main/master. Nunca `--force` ni saltar hooks. Nunca `git add .`: siempre archivos explícitos. Push solo con confirmación del dev. Cada dev abre sus propios MR a develop, y los aprueba otro dev del equipo (nunca el autor).
7. Sin atribución: ningún commit, comentario ni documento del repo menciona IA ni herramientas de IA (sin Co-Authored-By).
8. Base de datos: el agente no accede a MySQL. Las consultas (DESCRIBE, snapshots, restores) las corre el dev a mano.
9. El PHP legacy es solo lectura. msa-transaction está fuera del MVP y no se modifica.
10. Lógica financiera (pagos, auth) nunca se completa sin revisión humana. Pagos y auth requieren aprobación dual antes del merge.

## Contexto regulatorio (SIB)
- Toda operación monetaria va dentro de una transacción de BD, con log de auditoría antes y después de cada escritura financiera.
- Sin datos sensibles en logs. Sin stack traces al cliente. Nunca exponer IDs internos de cuentas en respuestas.
- Los datos de clientes no salen del ambiente guatemalteco.

## Ecosistema
- Legacy (origen, solo lectura): CodeIgniter con REST_Controller, versiones v1 y v2. Auth JWT. Integración externa: Pronet.
- Destino: monorepo NestJS con npm workspaces y Turborepo. `npm ci`, build, test y lint siempre desde la raíz.
  - `apps/msa-customer`: microservicio de clientes (puerto 3002).
  - `apps/mdl-billetera`: gateway, auth y validación (puerto 3000). No existe en el PHP.
  - Packages compartidos: `@akisi/sequelize-models`, `@akisi/error-handler`, `external-dependencies`, `query-services`.
- NestJS 11, TypeScript, Sequelize (modelos centralizados), BD MySQL `pronet` (requiere VPN).
- En local el gateway llega al msa por `http://127.0.0.1:3002` (no `localhost`, por IPv6).
- CI/CD en Huawei CodeArts: cada MR a develop corre el pipeline y requiere aprobación; el merge a develop despliega a DEV. El YAML del pipeline no se edita desde la consola.

## Método de migración de un endpoint (orden estricto)
| Fase | Tarea |
|---|---|
| 0 | Rama `feature/<endpoint>` desde develop actualizado y limpio |
| 1 | Modelos Sequelize (N/A si ya existen) |
| 2 | DTO del msa con class-validator, mensajes en español natural |
| 3.A | Catálogo de errores (código + mensaje) |
| 3.B | Use-case con la lógica de negocio |
| 4 | Spec Jest del use-case |
| 5 | Provider en `app.module.ts` del msa |
| 6 | Ruta en el controller del msa + ajuste del spec del controller |
| 7 | Gateway: DTO, service y controller |
| 8 | Build + test + lint del monorepo: 0 errores |
| 9 | E2E local contra BD real (snapshot antes y restore después si escribe) |
| 10 | Colección Postman + commit + rebase + push |
| 11 | Post-MR: documento de data mapping para la SIB |

Análisis del PHP antes de escribir: todas las reglas de negocio, dependencias, validaciones de seguridad financiera, código muerto y patrones a no replicar (por ejemplo SQL por interpolación).

## Contrato y criterios de migración
- Se mantiene el contrato del PHP (entrada y respuesta) salvo decisión explícita. Mejoras internas (seguridad, tipos, validación) sí; cambios de lógica no.
- Wrapper por defecto `{status, message, response_code}`. Si el legacy devuelve un primitivo o array desnudo, no se envuelve (contrato productivo).
- Los bugs del legacy se corrigen y se documenta qué se corrigió y por qué.
- Un stored procedure que solo hace SELECT pasa a raw query parametrizada en el repo (trazabilidad para la SIB).
- Mensajes de error en español natural, nunca nombres técnicos de campos ("El teléfono es requerido", no "telno es requerido").

## Lecciones técnicas
- Validar SIEMPRE los tipos reales con DESCRIBE o INFORMATION_SCHEMA. No confiar en el tipo que "parece" en el PHP.
- DECIMAL llega como string (tiparlo string). BIGINT de COUNT llega como string (castear con `Number()`).
- Filtros por mes o año: rango con strings literales (`'2026-05-01 00:00:00'`), no `YEAR()`/`MONTH()` ni objetos Date.
- Sequelize ignora en silencio los campos no declarados en el modelo: verificar el modelo antes de un UPDATE con campos nuevos.
- No declarar `schema:` en `@Table` si la conexión ya apunta a ese schema (genera doble prefijo).
- `@IsOptional` no salta con string vacío: combinar con `@MinLength(1)`.
- Updates parciales: el payload lleva solo los campos que vinieron; el gateway filtra los `undefined` antes de llamar al msa.
- Arrays JSON de estructura variable: `Array.find` con condición semántica, nunca un índice fijo.
- UserInfo (credenciales) y UserInformation (datos personales) son tablas distintas.
- Conflictos de rebase frecuentes en app.module, customer.controller y su spec, app.service y app.controller del gateway, catalog.ts y la colección Postman: aceptar ambos lados en orden.

## Forma de trabajo con el agente
- Una tarea a la vez: plan primero, OK del dev, después cambios.
- Output literal y completo de archivos y comandos, sin resumir ni truncar, sobre todo en modelos, DTOs y use-cases.
- Al inicio de cada sesión el dev declara en qué tarea trabaja (endpoint o MSA y fase). Si no lo dijo, el agente lo pregunta antes de empezar.
- Al cerrar el día, el dev genera su reporte con `/hl-devkit:report` y se lo envía a Erick.
