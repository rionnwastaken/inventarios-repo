import { OrgChart } from "d3-org-chart";
import { ModalDialog } from "./dialogs/modalDialog";
import { Fabric } from "../typeObj";

class FabricHierarchy {
  modal_dialog: ModalDialog;
  orgchart: OrgChart<any>; // d3-org-chart uses node objects with id/parentId
  hierarchy_container: HTMLDivElement;

  constructor() {
    this.create_dialog();
  }

  create_dialog() {
    this.modal_dialog = new ModalDialog({
      body: this.body(),
      title: this.title(),
      width: "w-full max-w-7xl h-[80vh]",
    });

    const d = this.modal_dialog.dialogEl;
    this.hierarchy_container = d.querySelector("#hierarchy-container")!;

    this.create_orgchart();
  }

  body() {
    // Ensure the container has explicit dimensions (e.g., w-full h-[600px] or flex-1)
    return `
      <div id="hierarchy-container" class="w-full h-[600px] border rounded-lg overflow-hidden"></div>
    `;
  }

  title() {
    return `Jerarquía de Telas`;
  }

  create_orgchart() {
    this.orgchart = new OrgChart();
  }

  show(data: any[]) {
    // 1. Render dialog into DOM first so container has non-zero width/height
    this.modal_dialog.show();

    // 2. Set container, feed hierarchical node data, and call render()

    data = [
      { id: "1", parentId: "", name: "Main Fabric" },
      { id: "2", parentId: "1", name: "Variant A" },
    ];

    this.orgchart.nodeContent((d) => {
      return `
    ${d.name}
  `;
    });

    this.orgchart
      .container(this.hierarchy_container)
      .data(data) // Must be array of objects with id and parentId fields
      .render();
  }
}

const fabricHierarchy = new FabricHierarchy();
export { fabricHierarchy };
