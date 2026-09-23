import { CatalogApi } from "../../../api/catalog";
import { TypedEventEmitter } from "../../../emitter";
import { Location } from "../../../schema";
import { state } from "../../../state";
import { ModalDialog } from "../../dialogs/modalDialog";
import { createIconHTML } from "../../renderUtils";
import { createElementFromHTML } from "../../utils";

export interface LocationEvents {
  "location:created": (location: Location) => {};
  "location:edited": (location: Location) => {};
  "location:deleted": (location: Location) => {};
}

export class LocationController {
  modalDialog: ModalDialog;
  title_el: HTMLElement;

  public events = new TypedEventEmitter<LocationEvents>();
  grid: HTMLDivElement;

  goback: HTMLButtonElement;
  slots: HTMLElement[];
  selected_slot: HTMLElement | null;
  slotManager: SlotManager;
  constructor() {
    this.create_dialog();
    this.slots = [];
    this.slotManager = new SlotManager();

    this.bindEvents();
  }

  show() {
    this.modalDialog.show();
  }

  create_dialog() {
    const a_tw = "w-full h-full min-w-full min-h-full";
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      container_tailwind_class: a_tw,
      height: "h-auto max-h-[80vh]",
      cancelText: "Volver",
      cancelClass: "btn",
      confirmText: "Deducir",
      confirmClass: "btn-error",
      footerContainer_tailwind_class: "flex justify-left",

      showCancel: false,
      showConfirm: false,

      onClose: () => {},
    });

    let boco = this.modalDialog.dialogEl.querySelector(".bottom-container");

    let buttons = createElementFromHTML(`
	<div class="flex justify-left"> 
	    <button class="btn" id="kardex-goback">Volver</button>
	</div>
    `);

    this.goback = buttons.querySelector("#kardex-goback");
    boco.prepend(buttons);

    let d = this.modalDialog.dialogEl;
  }

  title(): HTMLElement {
    this.title_el = createElementFromHTML(`
  <div class="flex justify-between"> 
    <div> 
      <h1>Ubicacion</h1>
    </div>

    <input> </input>
  </div>
`);

    return this.title_el;
  }

  body(): HTMLElement {
    const b = createElementFromHTML(`
    <div class="flex flex-col gap-4">
      <div class="top-container grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4 p-4 w-full">
      </div>

      <div class="bottom-container flex flex-col">
        <!-- Any extra content meant for the bottom goes here -->
      </div>
    </div>
  `);

    this.grid = b.querySelector(".top-container");

    console.log("grid here is ", this.grid);

    return b;
  }

  bindEvents() {
    this.grid.addEventListener("click", (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const addBtn = target.closest<HTMLElement>("#add-slot-btn");
      if (addBtn) {
        // this.handleAddLocationClick();
        return;
      }

      // 2. Check if a standard Location Card was clicked
      const slotCard = target.closest<HTMLElement>("[data-id]");
      if (slotCard) {
        this.selected_slot = slotCard;
        const locationId = slotCard.dataset.id;
        this.slotManager.selected_slot = slotCard;
        this.slotManager.inject_buttons(slotCard);
        console.log(`Clicked slot location ID: ${locationId}`);
      }
    });
  }

  loadSlots() {
    let el = this.createAddSlot();
    this.grid.appendChild(el);
    console.log("loc", state.catalagoData.data["location"]);
    for (let location of state.catalagoData.data["location"] as Location[]) {
      this.createSlot(location);
    }
  }

  createSlot(location: Location) {
    let filename = `image_${location.id}`;
    let slot = createElementFromHTML(`
    <div data-id="${location.id}" class="flex flex-col border border-slate-200 rounded-lg p-3 bg-white shadow-sm relative">
      <div class="flex "> 
          <span class="text-xs font-semibold text-slate-600 mb-2">Ubicación ${location.id}</span>
      </div>
      
      <div class="w-full aspect-[4/3] overflow-hidden rounded bg-slate-100">
        <img 
          src="/images/${filename}" 
          alt="Thumbnail" 
          class="w-full h-full object-cover block"
        />
      </div>
      
      <p class="mt-2 text-sm text-slate-800">${location?.description ?? ""}</p>
    </div>`);

    this.grid.appendChild(slot);
    this.slots.push(slot);
    return slot;
  }
  createAddSlot(onClick?: () => void) {
    const element = createElementFromHTML(`
    <button 
      id="#add-slot-btn"
      type="button" 
      class="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-3 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition-colors cursor-pointer w-full group text-slate-400 hover:text-slate-600 min-h-[220px]"
    >
      <div class="w-12 h-12 rounded-full bg-slate-200 group-hover:bg-slate-300 flex items-center justify-center mb-2 transition-colors">
        <svg class="w-6 h-6 stroke-current" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <span class="text-xs font-semibold uppercase tracking-wider">Agregar Ubicación</span>
    </button>
  `);

    element.addEventListener("click", async () => {
      this.openFileExplorer(async (file: File) => {
        const response = await CatalogApi.uploadLocationImage(file);

        if (!response.success) {
          log.debug(response.data);
          return;
        }

        let location = response.data.location as Location;
        this.createSlot(location);

        console.log("Upload successful:", response.data);

        // Refresh your grid or render the new slot card here
      });
    });

    return element;
  }

  openFileExplorer(onFileSelected: (file: File) => void, accept = "image/*") {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = accept; // Restricts file picker to images by default

    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const selectedFile = fileInput.files[0];
        onFileSelected(selectedFile);
      }
    });

    // Programmatically trigger the file dialog
    fileInput.click();
  }
}

export class SlotManager {
  // Reusable overlay element
  private overlayElement: HTMLElement = this.createButtonOverlay();
  selected_slot: HTMLElement | null;
  private createButtonOverlay(): HTMLElement {
    const overlay = createElementFromHTML(`
      <div class="slot-overlay-actions absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-md shadow-sm border border-slate-200 z-10 transition-opacity duration-150 opacity-0 group-hover:opacity-100">
        <button 
          type="button" 
          data-action="edit" 
          title="Editar" 
          class="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors"
        >
          <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        <button 
          type="button" 
          data-action="delete" 
          title="Eliminar" 
          class="p-1.5 rounded hover:bg-red-50 text-slate-600 hover:text-red-600 transition-colors"
        >
          <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `);

    // Query for the specific buttons inside the created element
    const editBtn = overlay.querySelector<HTMLButtonElement>(
      'button[data-action="edit"]',
    );
    const deleteBtn = overlay.querySelector<HTMLButtonElement>(
      'button[data-action="delete"]',
    );

    // Attach direct listener to Edit button
    editBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation(); // Prevents triggering card click event

      const locationId = card?.dataset.locationId;
      if (locationId) {
        this.handleEditSlot(locationId);
      }
    });

    // Attach direct listener to Delete button
    deleteBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation(); // Prevents triggering card click event
      const card = overlay.closest<HTMLElement>("[data-location-id]");
      const locationId = card?.dataset.locationId;

      if (locationId) {
        this.handleDeleteSlot(locationId);
      }
    });

    return overlay;
  }

  inject_buttons(slotCard: HTMLElement): void {
    if (!slotCard.classList.contains("relative")) {
      slotCard.classList.add("relative");
    }

    if (!slotCard.classList.contains("group")) {
      slotCard.classList.add("group");
    }

    slotCard.appendChild(this.overlayElement);
  }

  remove_buttons(): void {
    if (this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
  }

  private handleEditSlot(locationId: string) {
    console.log(`Edit clicked for slot ID: ${locationId}`);
  }

  private handleDeleteSlot(locationId: string) {
    console.log(`Delete clicked for slot ID: ${locationId}`);
  }
}
