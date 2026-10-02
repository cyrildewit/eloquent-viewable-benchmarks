/**
 * Turns a phpbench dump and the two metadata files beside it into a result file.
 */
import { parseDump, utc } from './phpbench.ts';
import { RESULT_FORMAT, datasetSchema, metaSchema, resultSchema, type MetaInput, type Result } from './schema.ts';

/** `v9.0.0` → `v9_0_0`, `feature/My-Change` → `feature_my_change`. */
export function slugRef(ref: string): string {
  const slug = ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug === '') {
    throw new Error(`Cannot build an identifier from the ref "${ref}"`);
  }

  return slug;
}

/** Whether a ref is a release tag, a commit hash, or anything else, which is treated as a branch. */
export function refKind(ref: string, commit: string): Result['kind'] {
  if (/^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(ref)) {
    return 'release';
  }
  if (/^[0-9a-f]{7,40}$/.test(ref) && commit.startsWith(ref)) {
    return 'commit';
  }

  return 'branch';
}

/**
 * `<ref-slug>_<sha7>_<driver>_<size>_<runner>_<YYYYMMDDTHHMMSS>`. Unique across the whole repository, because it is
 * also the address of the run's page: CI measures one commit on every driver at the same moment, and a re-run of the
 * same series starts at a later second.
 */
export function runId(
  run: Pick<Result, 'ref' | 'commit' | 'runner' | 'ran_at'> & { driver: string; size: string },
): string {
  const stamp = run.ran_at.slice(0, 19).replace(/[-:]/g, '');

  return `${slugRef(run.ref)}_${run.commit.slice(0, 7)}_${run.driver}_${run.size}_${run.runner}_${stamp}`;
}

/** Where a result and its dump are kept, relative to the repository root. */
export function resultPaths(result: Pick<Result, 'id' | 'runner' | 'database' | 'dataset'>): {
  xml: string;
  json: string;
} {
  const dir = `${result.runner}/${result.database.driver}/${result.dataset.size}`;

  return { xml: `runs/${dir}/${result.id}.xml`, json: `results/${dir}/${result.id}.json` };
}

export function buildResult(xml: string, meta: MetaInput, dataset: unknown): Result {
  const run = metaSchema.parse(meta);
  const data = datasetSchema.parse(dataset);
  const dump = parseDump(xml);

  return resultSchema.parse({
    format: RESULT_FORMAT,
    id: runId({ ...run, ran_at: dump.ranAt, driver: data.database.driver, size: data.size }),
    package: run.package,
    ref: run.ref,
    kind: refKind(run.ref, run.commit),
    commit: run.commit,
    committed_at: utc(run.committed_at),
    ran_at: dump.ranAt,
    runner: run.runner,
    machine: { label: run.machine_label, ...dump.machine },
    php: dump.php,
    laravel: data.laravel,
    database: { driver: data.database.driver, image: run.database_image, server_version: data.database.server_version },
    dataset: {
      schema_version: data.schema_version,
      size: data.size,
      seed: data.seed,
      anchor: data.anchor,
      articles: data.articles,
      videos: data.videos,
      views: data.views,
      hot_article_views: data.hot_article_views,
      cold_article_views: data.cold_article_views,
      indexes: indexKey(data.indexes),
    },
    phpbench: dump.phpbench,
    workflow_run: run.workflow_run,
    subjects: dump.subjects,
    errors: dump.errors,
  });
}

/** The optional indexes as one stable string, so it can be part of a series key: `none` or `type-viewed-at,visitor`. */
export function indexKey(indexes: string[]): string {
  return indexes.length === 0 ? 'none' : [...new Set(indexes)].sort().join(',');
}

/** The parts of a result that come from the dump, so a stored result can be checked against its XML. */
export function fromDump(result: Result): unknown {
  const { label: _label, ...machine } = result.machine;

  return {
    phpbench: result.phpbench,
    ranAt: result.ran_at,
    machine,
    php: result.php,
    subjects: result.subjects,
    errors: result.errors,
  };
}

export function serialise(result: Result): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
