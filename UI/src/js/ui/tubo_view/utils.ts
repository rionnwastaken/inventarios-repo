import { CatalogApi } from "../../api/catalog";
import { Fabric } from "../../schema";
import { state } from "../../state";
import { CatalogItem } from "../../typeObj";
import TomSelect from "tom-select";
import { notiDialog } from "../dialogs/notification";
import { ModalDialog } from "../dialogs/modalDialog";
import { shortLivedDialog } from "../shortLiveDialog";

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

export async function request_to_create_value_on_table(
  tom: TomSelect,
  value,
  table_name,
): Promise<{ created: Boolean; item: CatalogItem }> {
  shortLivedDialog.titleContainer.innerHTML = `Quiere crear el articulo <span class="font-bold">${value}</span> en la tabla ${table_name}?`;

  shortLivedDialog.cancelBtn.textContent = "No";
  shortLivedDialog.confirmBtn.textContent = "Si";
  const userConfirmed = await shortLivedDialog.open();
  // const userConfirmed = await open();

  shortLivedDialog.close();

  let created = false;
  let item = null;
  if (userConfirmed) {
    console.log("User clicked confirm action");
    const res = await CatalogApi.addItem(table_name, value);

    if (res.success) {
      notiDialog.titleContainer.textContent = `Se ha creado correctamente el articulo ${value} en la table ${table_name}`;
      notiDialog.show();
      item = res.data["item"];
      created = true;

      tom.removeOption(value);
      tom.addOption({
        value: item.id,
        text: item.name,
      });

      tom.addItem(item.id);
      tom.refreshOptions(false);
      tom.close();
      log.debug(item);
    }
  } else {
    tom.removeOption(value);
    tom.clear();
    console.log("User cancelled or closed the modal");
  }

  return {
    created: created,
    item: item,
  };
}
