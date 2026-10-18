---
name: new-msa
description: Alta de un microservicio nuevo en el monorepo siguiendo docs/ADDING-MICROSERVICE.md, por etapas y con frenos. Usar solo cuando el dev lo pide explícitamente con el nombre y el puerto del MSA.
disable-model-invocation: true
argument-hint: msa-<nombre> <puerto>
---

# Alta de un MSA nuevo

Argumentos recibidos: `$ARGUMENTS` (formato esperado: `msa-<nombre> <puerto>`, por ejemplo `msa-identity 3003`).

Esta skill **dirige** el alta; la fuente de verdad es `docs/ADDING-MICROSERVICE.md` del repositorio, que se lee completo en cada uso. Si esta skill y la guía dicen cosas distintas, manda la guía y se avisa al dev.

Agregar un MSA es un **cambio de arquitectura global** (toca pipeline, scripts de deploy, Secrets y gateway): según las reglas del equipo, se valida con Erick antes de implementarlo.

## Reglas durante toda el alta

- Una etapa a la vez. Al final de cada etapa: mostrar qué se hizo, el output literal y completo de los controles, y **esperar el OK del dev** antes de seguir.
- La salida de cada comando de control se muestra **cruda, en un bloque de código, con el comando arriba**. Una tabla resumen puede ir además, nunca en lugar de la salida cruda.
- Si hace falta apartarse de un comando de la guía (por ejemplo, otra carpeta temporal), avisarlo antes de ejecutarlo y explicar por qué.
- Si un control no da el valor esperado: **parar**, mostrar el valor real y no seguir. No "arreglar" el control.
- Output literal y completo de todo archivo creado o modificado. Nada de resúmenes, elipsis ni "+N lines".
- Commits con archivos explícitos (nunca `git add .`), mensaje convencional, sin atribución.
- No se hace push sin confirmación explícita del dev. El MR lo abre el dev y lo aprueba otro dev.
- Nunca se escriben valores de secretos en archivos, en el MR ni en el chat: solo nombres de variables.
- Nunca se edita el pipeline desde la consola de CodeArts. Nunca se tocan el legacy ni `msa-transaction`.
- No se copia código de negocio de `msa-customer` (casos de uso, controladores, DTOs): solo la configuración que indica la guía.

## Etapa 0 — Controles previos (solo lectura)

1. Separar `$ARGUMENTS` en NOMBRE y PUERTO. Validar:
   - NOMBRE cumple `^msa-[a-z][a-z0-9-]*[a-z0-9]$`.
   - PUERTO es un número entre 3001 y 3999.
   - Derivar: `NOMBRE_SNAKE` (guiones a guion bajo, ej. `msa_identity`), `VAR_URL` (ej. `MSA_IDENTITY_URL`).
2. Confirmar que se está en la raíz del monorepo: existen `.codearts/workflow/akisi-ci.yml`, `docs/ADDING-MICROSERVICE.md`, `scripts/cci-release.py`, `scripts/cci-update-msa-urls.py` y `apps/msa-customer/`.
3. Correr y mostrar literal:
   - `git status --short` (tiene que estar vacío)
   - `git branch --show-current` (tiene que ser `develop`)
   - `git fetch origin develop` y `git rev-list --count HEAD..origin/develop` (tiene que ser `0`; si no, pedir al dev que actualice develop)
4. Verificar que el MSA no existe y el puerto está libre, mostrando el output literal de:
   - `ls apps/`
   - `grep -n "<PUERTO>" docker-compose.yml scripts/cci-release.py scripts/cci-update-msa-urls.py` (no tiene que haber resultados)
   - `grep -n "<NOMBRE>" .codearts/workflow/akisi-ci.yml scripts/cci-release.py scripts/cci-update-msa-urls.py` (no tiene que haber resultados)

Si algo falla, parar y explicar qué falta.

## Etapa 1 — Leer la guía

Leer `docs/ADDING-MICROSERVICE.md` **completo**. Identificar los pasos, los controles esperados (líneas, conteos) y la sección "Puntos a confirmar con la primera alta".

## Etapa 2 — Plan y validación de arquitectura

Presentar al dev, con NOMBRE y PUERTO ya reemplazados:

| Parte | Qué |
|---|---|
| MR 1 — repo | Carpeta `apps/<NOMBRE>/`, `package-lock.json`, jobs en `akisi-ci.yml` + 2 `needs`, `SERVICES` en `cci-release.py`, `MSA_LIST_DEFAULT` en `cci-update-msa-urls.py`, `deploy/secrets/services.yml`, `docker-compose.yml`, `docker-compose.override.yml` |
| Consola (antes del merge del MR 1) | Secret `<NOMBRE>-secrets` en CCI, creado por quien tenga acceso |
| MR 2 — gateway | `VAR_URL` en el gateway y los endpoints proxy, solo después de ver `✓ <VAR_URL>=...` en el log del release del MR 1 |

Preguntar explícitamente: **"¿Erick aprobó esta alta?"** Sin un sí, no seguir.

## Etapa 3 — MR 1, en rama propia

Crear la rama `feature/<NOMBRE>` desde develop. Cada sub-etapa termina con freno.

**3.1 Esqueleto del MSA.** Crear `apps/<NOMBRE>/` copiando de `apps/msa-customer/` solo lo que lista la tabla "Requisitos previos" de la guía y adaptando lo que dice ahí (nombre, rutas del Dockerfile, `EXPOSE`, `HEALTHCHECK`, puerto). Mantener los scripts `build`, `lint`, `test`, `test:cov` y el bloque `coverageThreshold` sin cambios. `.env.example` y `.env.prod.example` solo con nombres y `<CHANGE_ME>`. Implementar `GET /health/live` y `GET /health` según `docs/LOCAL-SETUP.md`. Mostrar cada archivo creado completo.

**3.2 Lockfile.** `npm install` desde la raíz. Mostrar `git status --short`.

**3.3 Validación local.** Desde la raíz: `npm run lint`, `npm run build`, y en `apps/<NOMBRE>` `npm run test:cov`. Los tres en verde, con la cobertura por encima del piso. El `docker compose up --build` y el `GET /health` del MSA los corre el dev y confirma el resultado.

**3.4 Jobs del pipeline.** Ejecutar el comando del Paso 2 de la guía tal cual, reemplazando `msa-identity`/`msa_identity` por NOMBRE/NOMBRE_SNAKE. Correr los tres controles de la guía y mostrar los valores: tienen que coincidir con los esperados. Insertar el bloque antes de `  akisi_check:`, agregar los `needs` de `akisi_check` y de `release`, y correr el control final de la guía (`grep -c "<NOMBRE_SNAKE>_"`). Mostrar el diff completo de `akisi-ci.yml`.

**3.5 Deploy.** Agregar la línea en `SERVICES` (antes del gateway) y en `MSA_LIST_DEFAULT`, con el formato exacto de la guía. Mostrar el diff completo de los dos scripts y compilar (con `python3`, o `python` si en Windows no existe `python3`): `python3 -c "import ast; [ast.parse(open(f, encoding='utf-8').read(), f) for f in ['scripts/cci-release.py','scripts/cci-update-msa-urls.py']]"`.

**3.6 Secretos y Docker.** Bloque en `deploy/secrets/services.yml` con **nombres** de variables, igual que el de `msa-customer`. Servicio en `docker-compose.yml` y `docker-compose.override.yml` según `docs/DOCKER-GUIDE.md`. Mostrar los diffs completos.

**3.7 Revisión final.** Mostrar `git status --short` y `git diff --stat`. Repetir lint, build y test del MSA. Recorrer el checklist "Antes del MR 1" de la guía marcando cada punto como hecho o pendiente (el Secret queda pendiente si no se confirmó).

**3.8 Commit.** `git add` con la lista explícita de archivos, commit `feat(<NOMBRE>): add microservice` (sin atribución). Preguntar si se hace push. Recordar al dev:
- El Secret `<NOMBRE>-secrets` tiene que existir en CCI **antes del merge**.
- Conviene mergear cuando nadie más esté mergeando (el release redespliega todos los servicios por el cambio de `package-lock.json`).
- El MR lo abre el dev y lo aprueba otro dev.

## Etapa 4 — Después del merge del MR 1

Pedirle al dev que confirme, con el log del job `release`: `RELEASE OK`, la línea `✓ <VAR_URL>=...`, `GET /health` del gateway en ok, login funcionando y Deployment `<NOMBRE>` en 1/1. Si algo falla, no seguir al MR 2.

Registrar lo que se aprendió de los "Puntos a confirmar con la primera alta" (repositorio de SWR, tiempo del liveness): se informa a Erick para actualizar la guía en un MR aparte.

## Etapa 5 — MR 2: gateway

En rama `feature/<NOMBRE>-gateway` desde develop actualizado. Hacer lo que indica el Paso 6 de la guía en `apps/mdl-billetera/`: `VAR_URL` en `.env.example` (`<CHANGE_ME>`), `env.validation.ts` (`Joi.string().uri().required()`), lectura de la URL en `app.service.ts`, y los métodos proxy y rutas que el dev pida, con DTOs de class-validator y mensajes en español natural. Sin `@Public()` salvo login, registro o health. Build, lint y tests del gateway en verde. Commit con archivos explícitos y freno antes del push.
