# hl-devkit — kit de trabajo del equipo

Kit interno de Homeland para trabajar con el agente en el proyecto Akisi. Se instala en tu máquina y **nunca va dentro del repositorio del cliente**.

## Qué hace

| Pieza | Qué hace por vos |
|---|---|
| Guard de git | Bloquea force push, `--no-verify`, commits en `main`, `master` o `develop`, commits sin `-m` y mensajes con atribución a IA. Te pregunta antes de cada `git push` |
| Guard de archivos | El código legacy es de solo lectura. El agente no puede leer `.env`, claves ni archivos con credenciales |
| Detector del legacy | Si algo cambia en el legacy durante la sesión, te avisa al final de la respuesta |
| Ocultar llaves privadas | Si el agente lee un archivo con una llave privada (por ejemplo los controllers del legacy), la reemplaza por `[LLAVE PRIVADA OCULTA]` antes de que la vea |
| Contexto del equipo | Cada sesión arranca con las reglas del proyecto, el método de migración y tus datos |
| `/hl-devkit:report` | Genera tu reporte diario para Erick, con formato fijo |
| `/hl-devkit:new-msa` | Guía el alta de un microservicio nuevo, etapa por etapa, con frenos |
| `/hl-devkit:spec`, `plan`, `tasks` | Migración de un endpoint con specs: qué hace el PHP, cómo se migra y las tareas por fase |

## Requisitos

- Claude Code **2.1.295 o superior**: `claude --version`
- Node.js y Git para Windows (Git Bash)
- El repositorio de trabajo clonado y la carpeta del legacy en tu máquina

Si `claude` no se encuentra en PowerShell, usá la ruta completa: `& "$env:APPDATA\npm\claude.cmd"`.

## Instalación (una sola vez)

**1. Copiar el kit** a tu máquina, por ejemplo en `D:\HomeLand\hl-devkit` (fuera de cualquier repo del cliente).

**2. Validarlo** (PowerShell):

```powershell
claude plugin validate D:\HomeLand\hl-devkit
```

Tiene que decir `Validation passed`.

**3. Configurar tu estación** con tus datos y tus rutas:

```powershell
cd D:\HomeLand\hl-devkit
node scripts/configure-dev.js --name "TuNombre" --legacy "<ruta del legacy>" --repo "<ruta de tu repo de trabajo>" --specs "D:\HomeLand\specs"
```

Esto escribe solo en tu configuración personal de Claude (con backup previo) y en el archivo local `.git/info/exclude` de tu repo. No toca ningún archivo del repositorio. La carpeta de specs se crea si no existe, y tiene que estar **fuera** del repo de trabajo y del legacy.

**4. Cargar el kit en todas tus sesiones**, también en VS Code. Creá una variable de entorno de usuario de Windows:

- Nombre: `CLAUDE_CODE_PLUGIN_DIRS`
- Valor: la ruta del kit, por ejemplo `D:\HomeLand\hl-devkit`

Después cerrá y abrí VS Code y las terminales.

**5. Privacidad:** en los ajustes de tu cuenta de Claude, desactivá el uso de tus conversaciones para mejorar los modelos. Trabajamos con código y datos del cliente.

## Verificar que funciona

Abrí el agente en tu repo de trabajo y escribí `/hooks`. Tienen que aparecer **4 eventos**: `PreToolUse` (2 hooks), `PostToolUse` (1 hook), `SessionStart` (2 hooks) y `Stop` (1 hook).

Después preguntale: *"Sin ejecutar nada: decime quién soy y cuáles son las 3 reglas más importantes del proyecto"*. Tiene que saber tu nombre y tu repo.

## Uso diario

- Al empezar, decile al agente en qué tarea vas a trabajar (endpoint o MSA y fase).
- Para migrar un endpoint, antes de escribir código:
  1. `/hl-devkit:spec <endpoint>`: qué hace hoy el PHP. Lo revisás y lo aprobás.
  2. `/hl-devkit:plan <endpoint>`: cómo se migra. Te pide correr unos `DESCRIBE` en la BD y pegar el resultado. Si el plan toca algo global (packages, pipeline, contratos), lo valida Erick.
  3. `/hl-devkit:tasks <endpoint>`: las tareas por fase. El agente las va marcando a medida que implementa.
  Las specs quedan en tu carpeta de specs: no van al repo del cliente, ni a commits ni a MR.
- Al terminar el día: `/hl-devkit:report` y le mandás el resultado a Erick.
- Para un MSA nuevo: `/hl-devkit:new-msa msa-<nombre> <puerto>`. Antes de implementar, el alta se valida con Erick: la skill te lo va a preguntar.

## Si algo te bloquea

Los bloqueos son a propósito. El mensaje dice qué regla se activó.

| Mensaje | Qué hacer |
|---|---|
| Commit directo en la rama protegida | Crear una rama `feature/<nombre>` |
| El commit debe usar `-m` | Pedirle al agente que use `-m "mensaje"` |
| El código legacy es de solo lectura | Correcto: el legacy no se modifica |
| Acceder a archivos de secretos | Correcto: los `.env` y credenciales no se leen. Si necesitás un valor, buscalo vos sin pasarlo al chat |
| ALERTA: hubo cambios en el código legacy | Revisá con `git status` en la carpeta del legacy y revertí |

Si un bloqueo te parece un error del kit (algo legítimo que no te deja hacer), avisale a Erick con el mensaje exacto. No lo esquives.

## Reglas del kit

- No se modifica el kit en tu máquina. Los cambios se proponen a Erick.
- El kit no se copia dentro del repositorio del cliente ni se menciona en commits, MR o documentación del proyecto.
