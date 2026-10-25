#!/usr/bin/env bash
#
# A webshop teljes fejlesztői környezetének indítása egyetlen paranccsal:
#   1. Postgres (Docker)  ->  5432
#   2. Java backend       ->  3001   (server-java, mvn spring-boot:run)
#   3. React kliens       ->  5173   (client, npm run dev)
#
# Használat:  ./start.sh [kapcsolók]
# Leállítás:  Ctrl+C  — a szkript leállítja a backendet és a frontendet is.
#
# A Postgres konténer SZÁNDÉKOSAN futva marad kilépés után (az adatok a named
# volume-ban élnek). Teljes reset:  cd server-java && docker compose down -v

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server-java"
LOG_DIR="$ROOT_DIR/.run"

BACKEND_PORT=3001
CLIENT_PORT=5173
HEALTH_URL="http://localhost:$BACKEND_PORT/api/health"

START_DB=1
START_BACKEND=1
START_CLIENT=1
BACKEND_TIMEOUT=180   # másodperc: mennyit várunk az /api/health válaszára

# ---------------------------------------------------------------- kapcsolók --

usage() {
  cat <<'EOF'
Használat: ./start.sh [kapcsolók]

  --no-db        Nem indítja a Docker Postgrest (már fut, vagy külső adatbázis).
  --no-backend   Csak az adatbázis és a kliens indul.
  --no-client    Csak az adatbázis és a backend indul.
  --timeout N    Ennyi másodpercig vár a backend /api/health válaszára (alap: 180).
  -h, --help     Ez a súgó.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-db)      START_DB=0 ;;
    --no-backend) START_BACKEND=0 ;;
    --no-client)  START_CLIENT=0 ;;
    --timeout)    BACKEND_TIMEOUT="${2:-}"; shift ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "Ismeretlen kapcsoló: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# ------------------------------------------------------------- segédfüggvények --

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'
  C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_BE=$'\033[35m'; C_FE=$'\033[34m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_BE=""; C_FE=""
fi

info() { printf '%s[indít]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s[ok]%s    %s\n' "$C_OK"   "$C_RESET" "$*"; }
warn() { printf '%s[figy]%s  %s\n' "$C_WARN" "$C_RESET" "$*"; }
err()  { printf '%s[hiba]%s  %s\n' "$C_ERR"  "$C_RESET" "$*" >&2; }

# Windowson a Maven és az npm gyakran csak .cmd wrapperként van a PATH-on.
resolve_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then echo "$name"; return 0; fi
  if command -v "$name.cmd" >/dev/null 2>&1; then echo "$name.cmd"; return 0; fi
  return 1
}

# Git Bash alatt a $! egy MSYS-pid; a folyamatfa kilövéséhez a Windows-pid kell.
win_pid() {
  ps -p "$1" 2>/dev/null | awk 'NR==2 { print $4 }'
}

# Egy háttérfolyamat leállítása a gyerekeivel együtt (mvn -> java, npm -> vite).
kill_tree() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  if command -v taskkill >/dev/null 2>&1; then
    local wpid; wpid="$(win_pid "$pid")"
    if [ -n "$wpid" ]; then
      taskkill //F //T //PID "$wpid" >/dev/null 2>&1 && return 0
    fi
  fi
  kill -TERM "$pid" 2>/dev/null
}

port_busy() {
  local port="$1"
  if command -v netstat >/dev/null 2>&1; then
    # A ${port} kapcsos zárójele kötelező: a mintában közvetlenül utána `[` áll,
    # amit a shell (és a shellcheck, SC1087) tömbindexelés kezdetének olvas.
    netstat -ano 2>/dev/null | grep -qE "[:.]${port}[[:space:]]+.*LISTEN"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

BACKEND_PID=""; CLIENT_PID=""; TAIL_PIDS=()
CLEANED=0

cleanup() {
  [ "$CLEANED" -eq 1 ] && return
  CLEANED=1
  if [ -n "$BACKEND_PID" ] || [ -n "$CLIENT_PID" ]; then
    echo
    info "Leállítás…"
    kill_tree "$CLIENT_PID"
    kill_tree "$BACKEND_PID"
    # A naplókövetők utoljára, hogy a leállás utolsó sorai még kiférjenek.
    for p in "${TAIL_PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done
    ok "A backend és a kliens leállt. A Postgres konténer tovább fut (leállítás: cd server-java && docker compose down)."
  fi
}
trap cleanup INT TERM EXIT

# Naplófájl követése a konzolra, előtaggal.
#
# Az előtagoló ciklus SZÁNDÉKOSAN folyamathelyettesítésben fut, nem csővezeték
# jobb oldalán: így a $! magának a `tail`-nek a pid-je, és egy sima kill leállítja.
# Csővezetékkel a $! a `while` alhéjra mutatna, a `tail` pedig árván továbbfutna
# (Git Bash alatt a taskkill //T sem éri el, mert nem látja a fa részének) — a
# nyitva maradt cső miatt a szkript soha nem lépne ki.
tail_log() {
  local color="$1" label="$2" file="$3"
  tail -n +1 -f "$file" 2>/dev/null > >(
    while IFS= read -r line; do
      printf '%s%s%s %s\n' "$color" "$label" "$C_RESET" "$line"
    done
  ) &
  TAIL_PIDS+=("$!")
}

# ---------------------------------------------------------- előfeltételek --

info "Előfeltételek ellenőrzése…"

MVN=""; NPM=""
if [ "$START_DB" -eq 1 ] && ! command -v docker >/dev/null 2>&1; then
  err "A 'docker' nem található a PATH-on. Indítsd el a Docker Desktopot, vagy használd a --no-db kapcsolót."
  exit 1
fi
if [ "$START_BACKEND" -eq 1 ]; then
  MVN="$(resolve_cmd mvn)" || { err "A 'mvn' nem található a PATH-on (JDK 25 + Maven kell a backendhez)."; exit 1; }
fi
if [ "$START_CLIENT" -eq 1 ]; then
  NPM="$(resolve_cmd npm)" || { err "Az 'npm' nem található a PATH-on."; exit 1; }
fi

# Portütközés: a 3001/5173 párost más helyi projekt is használhatja.
if [ "$START_BACKEND" -eq 1 ] && port_busy "$BACKEND_PORT"; then
  err "A $BACKEND_PORT port már foglalt — fut egy másik backend? Állítsd le, vagy add ki a --no-backend kapcsolót."
  exit 1
fi
if [ "$START_CLIENT" -eq 1 ] && port_busy "$CLIENT_PORT"; then
  err "Az $CLIENT_PORT port már foglalt — fut egy másik Vite dev szerver? Állítsd le, vagy add ki a --no-client kapcsolót."
  exit 1
fi

mkdir -p "$LOG_DIR"

# ------------------------------------------------------------- 1. Postgres --

if [ "$START_DB" -eq 1 ]; then
  info "Postgres indítása (docker compose up -d)…"
  if ! (cd "$SERVER_DIR" && docker compose up -d) ; then
    err "A Postgres nem indult el. Fut a Docker Desktop?"
    exit 1
  fi

  info "Várakozás az adatbázisra…"
  for _ in $(seq 1 60); do
    if (cd "$SERVER_DIR" && docker compose exec -T postgres pg_isready -U webshop -d webshop >/dev/null 2>&1); then
      ok "Postgres kész (localhost:5432/webshop)."
      break
    fi
    sleep 1
  done
  if ! (cd "$SERVER_DIR" && docker compose exec -T postgres pg_isready -U webshop -d webshop >/dev/null 2>&1); then
    err "Az adatbázis 60 másodpercen belül nem lett elérhető."
    exit 1
  fi
else
  info "Adatbázis indítása kihagyva (--no-db)."
fi

# -------------------------------------------------------------- 2. backend --

if [ "$START_BACKEND" -eq 1 ]; then
  BACKEND_LOG="$LOG_DIR/backend.log"
  : > "$BACKEND_LOG"
  # A DATABASE_PASSWORD-nak szándékosan nincs alapértéke az application.yml-ben:
  # élesben a hiánya azonnali indulási hiba (spec 7.6). A helyi fejlesztéshez a `dev`
  # profil adja a docker-compose.yml szerinti jelszót. Aki mást állít be (valódi
  # env-változóval vagy .env-ben), annak az erősebb — ez csak akkor lép be, ha nincs.
  export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-dev}"
  info "Backend indítása (mvn spring-boot:run, profil: $SPRING_PROFILES_ACTIVE) — napló: .run/backend.log"
  ( cd "$SERVER_DIR" && exec "$MVN" spring-boot:run ) >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  tail_log "$C_BE" "[be]" "$BACKEND_LOG"

  info "Várakozás a backendre ($HEALTH_URL)…"
  backend_up=0
  for _ in $(seq 1 "$BACKEND_TIMEOUT"); do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      err "A backend folyamat elszállt indulás közben. Részletek: .run/backend.log"
      exit 1
    fi
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      backend_up=1
      break
    fi
    sleep 1
  done
  if [ "$backend_up" -eq 0 ]; then
    err "A backend $BACKEND_TIMEOUT másodpercen belül nem válaszolt. Részletek: .run/backend.log"
    exit 1
  fi
  ok "Backend fut: http://localhost:$BACKEND_PORT/api"
else
  info "Backend indítása kihagyva (--no-backend)."
fi

# --------------------------------------------------------------- 3. kliens --

if [ "$START_CLIENT" -eq 1 ]; then
  CLIENT_LOG="$LOG_DIR/client.log"
  : > "$CLIENT_LOG"

  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    info "Függőségek telepítése (npm install)…"
    ( cd "$ROOT_DIR" && "$NPM" install ) || { err "Az npm install elhasalt."; exit 1; }
  fi

  info "Kliens indítása (npm run dev) — napló: .run/client.log"
  ( cd "$ROOT_DIR" && exec "$NPM" run dev ) >"$CLIENT_LOG" 2>&1 &
  CLIENT_PID=$!
  tail_log "$C_FE" "[fe]" "$CLIENT_LOG"

  for _ in $(seq 1 60); do
    if curl -fsS --max-time 2 "http://localhost:$CLIENT_PORT/" >/dev/null 2>&1; then break; fi
    kill -0 "$CLIENT_PID" 2>/dev/null || { err "A kliens folyamat elszállt. Részletek: .run/client.log"; exit 1; }
    sleep 1
  done
  ok "Kliens fut: http://localhost:$CLIENT_PORT"
else
  info "Kliens indítása kihagyva (--no-client)."
fi

RUNNING=()
[ -n "$BACKEND_PID" ] && RUNNING+=("$BACKEND_PID")
[ -n "$CLIENT_PID" ]  && RUNNING+=("$CLIENT_PID")

echo
if [ "$START_CLIENT" -eq 1 ]; then
  ok "Kész. Az alkalmazás:  http://localhost:$CLIENT_PORT"
elif [ "$START_BACKEND" -eq 1 ]; then
  ok "Kész. Az API:  http://localhost:$BACKEND_PORT/api"
fi

if [ ${#RUNNING[@]} -eq 0 ]; then
  info "Nem indult figyelendő folyamat — kilépés."
  exit 0
fi

info "Kilépés: Ctrl+C (a backend és a kliens is leáll)."
echo

# A háttérfolyamatok élettartamáig futunk; az EXIT trap takarít.
# Ha bármelyik magától elszáll, kilépünk, és a cleanup leállítja a másikat.
wait -n "${RUNNING[@]}" 2>/dev/null
exit 0
