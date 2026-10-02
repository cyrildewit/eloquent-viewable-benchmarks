#!/usr/bin/env bash
#
# Runs the benchmarks of one ref of the package on this machine and imports the result. Needs git, make and Docker,
# like the package itself; PHP and Node run in containers.
#
#   scripts/run.sh <ref> <driver> <size> [--runner=<name> --label=<text>] [--indexes=<list>] [--repo=<url or path>]
#   scripts/run.sh v9.0.0 mysql medium --runner=cyril --label="MacBook Pro M3, Docker Desktop 8 GB"
#
# The package is cloned into .cache/package and checked out at the ref. Every ref runs in the same checkout under one
# Compose project, so the seeded databases are reused: a dataset is seeded again only when its size is not the one
# asked for. The run is imported but not committed, so it can be looked at first.
#
# --runner names this machine's series and --label describes it. Both are stored in .cache/runner.env on the first
# run and reused after that, so one machine keeps one name. Passing a different --runner later is refused.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cache="$root/.cache"
package="$cache/package"
runner_file="$cache/runner.env"

repo="${PACKAGE_REPO:-https://github.com/cyrildewit/eloquent-viewable.git}"
runner=""
label=""
indexes="none"
positional=()

usage() {
    sed -n '6,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
}

fail() {
    echo "run: $*" >&2
    exit 1
}

step() {
    printf '\n\033[1m==> %s\033[0m\n' "$*"
}

for arg in "$@"; do
    case "$arg" in
        --runner=*) runner="${arg#*=}" ;;
        --label=*) label="${arg#*=}" ;;
        --indexes=*) indexes="${arg#*=}" ;;
        --repo=*) repo="${arg#*=}" ;;
        -h | --help) usage ;;
        --*) fail "unknown option $arg" ;;
        *) positional+=("$arg") ;;
    esac
done

[[ ${#positional[@]} -eq 3 ]] || usage
ref="${positional[0]}"
driver="${positional[1]}"
size="${positional[2]}"

[[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "a ref holds letters, digits, dots, dashes, underscores and slashes"

case "$driver" in
    sqlite) service="" ;;
    mysql) service="bench-mysql" ;;
    mariadb) service="bench-mariadb" ;;
    pgsql) service="bench-postgres" ;;
    *) fail "driver must be sqlite, mysql, mariadb or pgsql, not $driver" ;;
esac

case "$size" in
    small | medium | large) ;;
    *) fail "size must be small, medium or large, not $size" ;;
esac

# The runner: from the flags on the first run, from .cache/runner.env after that.
mkdir -p "$cache"
if [[ -f "$runner_file" ]]; then
    stored_runner="$(sed -n 's/^RUNNER=//p' "$runner_file")"
    stored_label="$(sed -n 's/^LABEL=//p' "$runner_file")"
    if [[ -n "$runner" && "$runner" != "$stored_runner" ]]; then
        fail "this machine runs as '$stored_runner'; remove $runner_file to start a new series"
    fi
    runner="$stored_runner"
    label="${label:-$stored_label}"
fi

[[ -n "$runner" ]] || fail "name this machine once with --runner=<name> --label=<description>"
[[ -n "$label" ]] || fail "describe this machine once with --label=<description>, e.g. \"MacBook Pro M3, Docker 8 GB\""
[[ "$runner" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "--runner may hold lowercase letters, digits and dashes"
[[ "$runner" != "gha" ]] || fail "'gha' is reserved for GitHub Actions"
[[ "$label" != *[\"\\]* ]] || fail "--label may not contain quotes or backslashes"
printf 'RUNNER=%s\nLABEL=%s\n' "$runner" "$label" > "$runner_file"

step "Checking out $ref"
if [[ -d "$package/.git" ]]; then
    git -C "$package" remote set-url origin "$repo"
    git -C "$package" fetch --quiet --force --prune --tags origin
else
    git clone --quiet "$repo" "$package"
fi

commit=""
for candidate in "refs/tags/$ref" "refs/remotes/origin/$ref" "$ref"; do
    if commit="$(git -C "$package" rev-parse --quiet --verify "$candidate^{commit}")"; then
        break
    fi
done
[[ -n "$commit" ]] || fail "$ref is not a tag, branch or commit of $repo"

git -C "$package" checkout --quiet --force --detach "$commit"
git -C "$package" clean --quiet --force -d
# Gitignored, so a fresh checkout lacks it, and phpbench only warns when it cannot write its dump there.
mkdir -p "$package/build"
committed_at="$(git -C "$package" log -1 --format=%cI "$commit")"
echo "$ref is ${commit:0:7}, committed $committed_at"

[[ -f "$package/benchmarks/describe.php" ]] || fail "$ref has no make bench-describe, it predates the benchmarks"

# One Compose project for every ref, so the bench-* volumes and the seeded data carry over.
export COMPOSE_PROJECT_NAME=eloquent-viewable-bench
pkg_make() {
    make --no-print-directory -C "$package" "$@"
}

step "Building the image and installing dependencies"
pkg_make build
pkg_make install

out="$root/build/$runner-$driver-$size"
rm -rf "$out"
mkdir -p "$out"
dataset="build/dataset.json"

if pkg_make bench-describe DRIVER="$driver" ARGS="--output=$dataset" > /dev/null 2>&1 \
    && grep -q "\"size\": \"$size\"" "$package/$dataset"; then
    step "Reusing the $size dataset already seeded on $driver"
else
    step "Seeding the $size dataset on $driver"
    pkg_make bench-seed DRIVER="$driver" SIZE="$size"
fi

step "Setting the optional indexes to $indexes"
pkg_make bench-indexes DRIVER="$driver" INDEXES="$indexes"
pkg_make bench-describe DRIVER="$driver" ARGS="--output=$dataset" > /dev/null

step "Running the benchmarks"
rm -f "$package/build/run.xml"
pkg_make bench DRIVER="$driver" ARGS="--dump-file=build/run.xml"

[[ -s "$package/build/run.xml" ]] || fail "phpbench wrote no dump to build/run.xml, see its output above"
[[ -s "$package/$dataset" ]] || fail "make bench-describe wrote no $dataset"
cp "$package/build/run.xml" "$out/run.xml"
cp "$package/$dataset" "$out/dataset.json"

# The SQL and plan of every read variant. A ref whose explain.php predates --output prints its report and writes
# nothing, and the run is imported without queries.
step "Explaining the queries"
rm -f "$package/build/queries.json"
pkg_make bench-explain DRIVER="$driver" ARGS="--output=build/queries.json" || echo "bench-explain failed, continuing without queries"
if [[ -s "$package/build/queries.json" ]]; then
    cp "$package/build/queries.json" "$out/queries.json"
else
    echo "No queries.json was written, the run is imported without SQL"
fi

image="null"
if [[ -n "$service" ]]; then
    image="\"$(docker compose --project-directory "$package" --profile bench config --images "$service")\""
fi

cat > "$out/meta.json" << EOF
{
  "ref": "$ref",
  "commit": "$commit",
  "committed_at": "$committed_at",
  "runner": "$runner",
  "machine_label": "$label",
  "database_image": $image
}
EOF

step "Importing"
make --no-print-directory -C "$root" import DIR="build/$runner-$driver-$size"

echo
echo "Done. Look the run over, then commit runs/ and results/ in a pull request."
