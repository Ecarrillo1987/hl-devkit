---
name: report
description: Genera el reporte diario del dev para Erick, con formato fijo, a partir de la sesión y de git. Usar solo cuando el dev lo pide al cerrar el día.
disable-model-invocation: true
---

# Reporte diario del dev

Generá el reporte del día del dev con el formato fijo de abajo, para que lo pegue en Teams o en un correo a Erick.

## Cómo juntar la información

1. Repasá esta sesión: qué tarea declaró el dev, qué endpoint o MSA se trabajó, hasta qué fase del método se llegó y qué decisiones se tomaron.
2. Corré SOLO estos comandos de lectura en el repositorio de trabajo y usá su salida:
   - `git branch --show-current`
   - `git status --short`
   - `git log --since=midnight --author="$(git config user.name)" --oneline --all`
3. Si falta algo para completar una sección (por ejemplo bloqueos o próximo paso), preguntale al dev en una sola pregunta antes de generar el reporte.

## Reglas

- No incluyas credenciales, tokens, contraseñas, IPs, ni datos de clientes (nombres, teléfonos, documentos, cuentas, montos de personas reales).
- No incluyas contenido de archivos `.env`, de configuración ni del código legacy.
- No menciones herramientas de IA en el reporte.
- Escribí en español, al grano, sin relleno. No ejecutes ningún comando que modifique archivos o el repositorio.

## Formato (exacto)

```
REPORTE DIARIO — <nombre del dev> — <fecha AAAA-MM-DD>

Tarea: <endpoint o MSA>
Fase alcanzada: <número y nombre de la fase del método>
Rama: <rama actual>

Hecho hoy:
- <punto concreto>

Commits de hoy:
- <hash corto> <mensaje>   (o "Sin commits hoy")

Decisiones tomadas:
- <decisión y motivo>   (o "Ninguna")

Pendiente de validar con Erick (arquitectura o impacto global):
- <tema>   (o "Nada")

Bloqueos:
- <bloqueo y qué se necesita>   (o "Ninguno")

Próximo paso:
- <qué sigue mañana>
```

Al final, mostrá el reporte en un solo bloque listo para copiar.
