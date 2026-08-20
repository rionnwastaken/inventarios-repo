
import { Fabric, Tube } from "./schema";
import { Context, CraftMode } from "./ui/tubo_view/fabricCraft";

export type ViewMode = "tube" | "fabric";

export interface TableView {
  previous_view: ViewMode,
  new_view: ViewMode
}

export interface TubeExtraD extends Tube {
  fabric_count: number,
  rectified: boolean,

}

export interface FabricExData extends Fabric, Context {}


export interface FabricData {
  original_fabric:Fabric
  modified_fabric?:Fabric
  mode: CraftMode;
}


export interface CatalogItem {
  name:string,
  id:number,
  table_name:string
}
