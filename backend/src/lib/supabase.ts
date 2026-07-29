import { createServerSQLite } from "./sqlite";

export function createServerSupabase(): any {
  return createServerSQLite();
}
