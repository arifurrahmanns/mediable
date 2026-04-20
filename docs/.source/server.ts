// @ts-nocheck
import * as __fd_glob_10 from "../content/docs/storage.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/quick-start.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/queue.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/owners-and-collections.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/frameworks.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/direct-upload.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/database.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/conversions.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/api.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"api.mdx": __fd_glob_1, "conversions.mdx": __fd_glob_2, "database.mdx": __fd_glob_3, "direct-upload.mdx": __fd_glob_4, "frameworks.mdx": __fd_glob_5, "index.mdx": __fd_glob_6, "owners-and-collections.mdx": __fd_glob_7, "queue.mdx": __fd_glob_8, "quick-start.mdx": __fd_glob_9, "storage.mdx": __fd_glob_10, });