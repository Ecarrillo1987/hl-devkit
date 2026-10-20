---
name: tasks
description: Convierte el plan aprobado de un endpoint en tareas concretas por fase del método, en la carpeta de specs del dev. Usar solo cuando el dev lo pide con el nombre del endpoint.
disable-model-invocation: true
argument-hint: <endpoint>
---

# Tareas de migración — el plan en pasos concretos

Endpoint: `$ARGUMENTS`

## Rutas

- Carpeta de specs: `${user_config.specs_path}`

Si aparece vacía o como texto `${...}`, usar la ruta de "Esta estación de trabajo" del contexto de la sesión. Si tampoco está, parar y pedirle al dev que corra `configure-dev.js`.

## Reglas

- Solo se arranca si `plan.md` del endpoint dice `Estado: aprobado`. Si el plan es de impacto global, tiene que decir que Erick lo validó. Si no, parar.
- Cada tarea es concreta: nombra el archivo y lo que se hace, y es verificable.
- Las tareas siguen el orden estricto de las fases del método. Fases que no aplican se marcan `N/A` con el motivo.
- `tasks.md` se escribe solo en la carpeta de specs. Nunca dentro del repo de trabajo.

## Pasos

1. Leer `spec.md` y `plan.md` completos y verificar estados.
2. Si ya existe `tasks.md`, mostrar su avance y preguntar si se regenera. No sobrescribir sin OK.
3. Escribir `tasks.md` con el formato de abajo, una línea `- [ ]` por tarea, tomando del plan los archivos, campos, errores y casos de test.
4. Mostrar `tasks.md` completo y preguntar si se arranca la implementación.

## Durante la implementación

- Antes de cada fase, decir qué tareas se van a hacer. Al terminar cada tarea, marcarla `- [x]` en `tasks.md`.
- Si algo del plan no se puede hacer como estaba escrito, parar, explicar por qué y actualizar el plan antes de seguir (y volver a validar con Erick si cambia el impacto a global).
- Al terminar la fase 10, cambiar en los tres archivos `Estado: aprobado` por `Estado: implementado (<fecha>, commit <hash corto>)`.

## Formato de tasks.md

```markdown
# Tareas — <endpoint>

Estado: aprobado (<fecha>)
Plan: aprobado (<fecha>) | Impacto: local | global (validado por Erick)
Rama: feature/<endpoint-en-kebab-case>

## Fase 0 — Rama
- [ ] Verificar develop limpio y actualizado
- [ ] Crear `feature/<endpoint>` desde develop

## Fase 1 — Modelos Sequelize
- [ ] <archivo>: <cambio> (o N/A: <motivo>)

## Fase 2 — DTO del msa
- [ ] <archivo>: <campos y decoradores>

## Fase 3.A — Catálogo de errores
- [ ] <archivo>: <códigos>

## Fase 3.B — Use-case
- [ ] <archivo>: <reglas RN-n que implementa>

## Fase 4 — Spec del use-case (Jest)
- [ ] <archivo>: <casos>

## Fase 5 — Provider en app.module.ts del msa
- [ ] <archivo>

## Fase 6 — Ruta en el controller del msa + spec del controller
- [ ] <archivo>

## Fase 7 — Gateway
- [ ] 7.A DTO: <archivo>
- [ ] 7.B Service: <archivo>
- [ ] 7.C Controller: <archivo>

## Fase 8 — Build, test y lint del monorepo
- [ ] `npm run build` sin errores
- [ ] `npm run test` sin fallos y cobertura sobre el piso
- [ ] `npm run lint` sin errores

## Fase 9 — E2E local
- [ ] Para vos en BD: snapshot antes (si escribe)
- [ ] Casos: <de la sección Tests del plan>
- [ ] Para vos en BD: restore después (si escribe)

## Fase 10 — Postman, commit y push
- [ ] Colección Postman actualizada
- [ ] Commit con archivos explícitos, sin atribución
- [ ] Rebase sobre develop y push (con confirmación del dev)
- [ ] MR abierto por el dev, aprobado por otro dev

## Fase 11 — Data mapping (post-MR)
- [ ] Documento de data mapping para la SIB
```
