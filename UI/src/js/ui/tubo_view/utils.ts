
/**
 * Compares scalar and relational keys of original and modified Fabric instances,
 * ignoring date/timestamp metadata fields.
 */

export function viceversa_map(
  map1: Map<string, string>,
  map2: Map<string, string>,
): void {
  // Populate map2 with the inverse of map1 (key -> value becomes value -> key)
  for (const [key, value] of map1.entries()) {
    map2.set(value, key);
  }

  // Populate map1 with the inverse of map2
  for (const [key, value] of map2.entries()) {
    map1.set(value, key);
  }
}

export function fabric_column_name_from_tablename(
  tbl,
  tablename: string,
): string | null {
  const column_name = tbl[tablename];

  if (!column_name) {
    log.error(`Tablename ${tablename} was not found in map ${tbl}`);
    return null;
  }

  return column_name;
}
