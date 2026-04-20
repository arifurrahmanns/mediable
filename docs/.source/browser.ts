// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"api.mdx": () => import("../content/docs/api.mdx?collection=docs"), "conversions.mdx": () => import("../content/docs/conversions.mdx?collection=docs"), "database.mdx": () => import("../content/docs/database.mdx?collection=docs"), "direct-upload.mdx": () => import("../content/docs/direct-upload.mdx?collection=docs"), "frameworks.mdx": () => import("../content/docs/frameworks.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "owners-and-collections.mdx": () => import("../content/docs/owners-and-collections.mdx?collection=docs"), "queue.mdx": () => import("../content/docs/queue.mdx?collection=docs"), "quick-start.mdx": () => import("../content/docs/quick-start.mdx?collection=docs"), "storage.mdx": () => import("../content/docs/storage.mdx?collection=docs"), }),
};
export default browserCollections;