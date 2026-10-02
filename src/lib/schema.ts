/**
 * The shapes of everything this repository reads and writes. The import, the validation and the site all use these
 * definitions, so a file that passes here renders on the site.
 */
import { z } from 'astro/zod';

export const DRIVERS = ['sqlite', 'mysql', 'mariadb', 'pgsql'] as const;
export const SIZES = ['small', 'medium', 'large'] as const;
export const KINDS = ['release', 'branch', 'commit'] as const;

/** Bump when the result file changes shape, and migrate the existing files in the same commit. */
export const RESULT_FORMAT = 2;

const runner = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes');
const commit = z.string().regex(/^[0-9a-f]{40}$/, 'a full 40-character commit hash');
const count = z.int().nonnegative();
const micros = z.number().nonnegative();

/**
 * `meta.json`, written by the workflow or the local script next to the dump. Everything about a run that phpbench and
 * the package cannot know.
 */
export const metaSchema = z.object({
  package: z.string().min(1).default('cyrildewit/eloquent-viewable'),
  ref: z.string().min(1),
  commit,
  committed_at: z.iso.datetime({ offset: true }),
  runner,
  machine_label: z.string().min(1),
  database_image: z.string().min(1).nullable().default(null),
  workflow_run: z.url().nullable().default(null),
});

/**
 * `dataset.json`, printed by `make bench-describe` in the package: the seeded dataset and the database it lives in.
 * Unknown keys are ignored, so the package can add fields before this repository uses them.
 */
export const datasetSchema = z.object({
  schema_version: z.int().positive(),
  size: z.enum(SIZES),
  seed: z.int(),
  anchor: z.string().min(1),
  articles: count,
  videos: count,
  views: count,
  hot_article_views: count,
  cold_article_views: count,
  indexes: z.array(z.string().min(1)),
  database: z.object({
    driver: z.enum(DRIVERS),
    server_version: z.string().min(1),
  }),
  laravel: z.string().min(1),
});

const paramValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** The result of an explain statement, as the driver returned it: column names and every value as a string. */
const planSchema = z.strictObject({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string().nullable())),
});

/** One statement a variant ran, bindings substituted, with the plan the driver gave for it. */
const querySchema = z.strictObject({
  sql: z.string().min(1),
  plan: planSchema,
});

/**
 * `queries.json`, written by `make bench-explain ARGS=--output=<file>` in the package: the SQL and query plan of
 * every variant of a group, keyed as phpbench names them. Unknown keys are ignored, as with `dataset.json`.
 */
export const queriesSchema = z.object({
  schema_version: z.int().positive(),
  driver: z.enum(DRIVERS),
  analyzed: z.boolean(),
  group: z.string().min(1),
  subjects: z.array(
    z.object({
      class: z.string().min(1),
      subject: z.string().min(1),
      set: z.string(),
      params: z.record(z.string(), paramValue),
      queries: z.array(querySchema),
    }),
  ),
});

/** The queries of one variant as the result file keeps them: by short class name, without the parameters. */
export const subjectQueriesSchema = z.strictObject({
  benchmark: z.string().min(1),
  subject: z.string().min(1),
  set: z.string(),
  queries: z.array(querySchema),
});

/** One variant of a subject: a benchmark method with one parameter set. */
export const subjectSchema = z.strictObject({
  benchmark: z.string().min(1),
  subject: z.string().min(1),
  set: z.string(),
  params: z.record(z.string(), paramValue),
  groups: z.array(z.string()),
  revs: z.int().positive(),
  iterations: z.int().positive(),
  mode_us: micros,
  mean_us: micros,
  min_us: micros,
  max_us: micros,
  stdev_us: micros,
  rstdev: z.number().nonnegative(),
  mem_peak: count,
  rejects: count,
});

/** A variant that failed, so it has no timings. */
export const subjectErrorSchema = z.strictObject({
  benchmark: z.string().min(1),
  subject: z.string().min(1),
  set: z.string(),
  message: z.string(),
});

const utc = z.iso.datetime();

/** `results/<runner>/<driver>/<size>/<id>.json`, one per imported run. */
export const resultSchema = z.strictObject({
  format: z.literal(RESULT_FORMAT),
  id: z
    .string()
    .regex(/^[a-z0-9_]+_[0-9a-f]{7}_(sqlite|mysql|mariadb|pgsql)_(small|medium|large)_[a-z0-9-]+_\d{8}T\d{6}$/),
  package: z.string().min(1),
  ref: z.string().min(1),
  kind: z.enum(KINDS),
  commit,
  committed_at: utc,
  ran_at: utc,
  runner,
  machine: z.strictObject({
    label: z.string().min(1),
    os: z.string(),
    arch: z.string(),
    kernel: z.string(),
    load: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  }),
  php: z.strictObject({
    version: z.string().min(1),
    opcache: z.boolean(),
    /** Whether the extension was loaded. The harness refuses to run unless its mode is off. */
    xdebug: z.boolean(),
  }),
  /** The installed Laravel version. The package does not commit composer.lock, so a later run of a ref may differ. */
  laravel: z.string().min(1),
  database: z.strictObject({
    driver: z.enum(DRIVERS),
    image: z.string().nullable(),
    server_version: z.string().min(1),
  }),
  dataset: z.strictObject({
    schema_version: z.int().positive(),
    size: z.enum(SIZES),
    seed: z.int(),
    anchor: z.string().min(1),
    articles: count,
    videos: count,
    views: count,
    hot_article_views: count,
    cold_article_views: count,
    indexes: z.string().min(1),
  }),
  phpbench: z.string().min(1),
  workflow_run: z.url().nullable(),
  /** Every short class name in `subjects` and `errors` to its fully qualified name, as the dump has it. */
  classes: z.record(z.string().min(1), z.string().min(1)),
  subjects: z.array(subjectSchema).min(1),
  errors: z.array(subjectErrorSchema),
  /** The SQL from `queries.json`, or null when the run was imported without one. */
  queries: z
    .strictObject({
      analyzed: z.boolean(),
      group: z.string().min(1),
      subjects: z.array(subjectQueriesSchema),
    })
    .nullable(),
});

export type Meta = z.infer<typeof metaSchema>;
export type MetaInput = z.input<typeof metaSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type QueriesFile = z.infer<typeof queriesSchema>;
export type Query = z.infer<typeof querySchema>;
export type SubjectQueries = z.infer<typeof subjectQueriesSchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type SubjectError = z.infer<typeof subjectErrorSchema>;
export type Result = z.infer<typeof resultSchema>;
