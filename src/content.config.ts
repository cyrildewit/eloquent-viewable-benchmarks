import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { resultSchema } from './lib/schema.ts';
import { resultsDir } from './lib/source.ts';

export const collections = {
  runs: defineCollection({
    loader: glob({ pattern: '**/*.json', base: resultsDir, generateId: ({ data }) => String(data.id) }),
    schema: resultSchema,
  }),
};
