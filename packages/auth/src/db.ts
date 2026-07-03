import { createDb } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";

export const db = createDb(serverEnv.DATABASE_URL);
