import {
  FabricComment,
  Fabric as SchemaFabric,
  FabricDeduction as SchemaFabricDeduction,
  Tube as SchemaTube,
  Location as SchemaLocation,
  LocationTag,
} from "./schema";

export type ViewMode = "tube" | "fabric" | "both";

export interface TableView {
  previous_view: ViewMode;
  new_view: ViewMode;
}

export interface Tube extends SchemaTube {
  fabric_count: number;
  rectified: boolean;
}

export interface FabricExData extends Fabric {}

export interface FabricDeduction extends SchemaFabricDeduction {}

export interface Fabric extends SchemaFabric {
  deductions: FabricDeduction[];
  comments: FabricComment[];
}

export interface FabricData {
  original_fabric: Fabric;
  modified_fabric?: Fabric;
  mode: ItemState;
}

export interface CatalogItem {
  name: string;
  id: number;
  table_name: string;
}

export interface Location extends SchemaLocation {
  tags: LocationTag[];
}

export type ItemState = "created" | "edited" | "normal" | "deleted";
export type ModalState = "creating" | "editing" | "editing_created";
