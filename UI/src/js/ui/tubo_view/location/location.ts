import { CatalogApi } from "../../../api/catalog";
import { TypedEventEmitter } from "../../../emitter";
import { Location, LocationTag } from "../../../schema";
import { state } from "../../../state";
import { ModalDialog } from "../../dialogs/modalDialog";
import { notiDialog } from "../../dialogs/notification";
import { createIconHTML } from "../../renderUtils";
import { createElementFromHTML, num } from "../../utils";
import { request_to_create_value_on_table } from "../utils";
import TomSelect from "tom-select";

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
  locationForm: LocationForm;
  deletebtn: HTMLButtonElement;

  private overlayElement: HTMLElement = this.createButtonOverlay();

  constructor() {
    this.create_dialog();
    this.slots = [];
    this.locationForm = new LocationForm();

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

      if (this.slots.length > 0 && slotCard == this.slots.at(-1)) {
        this.deletebtn.classList.remove("hidden");
      } else {
        this.deletebtn.classList.add("hidden");
      }

      if (this.selected_slot) {
        this.selected_slot.classList.add("bg-white");
        this.selected_slot.classList.remove("bg-blue-100");
      }

      if (slotCard) {
        this.selected_slot = slotCard;
        const locationId = slotCard.dataset.id;
        this.selected_slot = slotCard;
        this.inject_buttons(slotCard);
        console.log(`Clicked slot location ID: ${locationId}`);

        this.selected_slot.classList.add("bg-blue-100");
        this.selected_slot.classList.remove("bg-white");
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
          <span class="text-xs font-semibold text-slate-600 mb-2">Ubicación ${location.sequence_number}</span>
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
    const addslot_element = createElementFromHTML(`
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

    addslot_element.addEventListener("click", async () => {
      let selected_file = await openFileExplorer();
      if (selected_file == null) {
        return;
      }
      const response = await CatalogApi.uploadLocationImage(selected_file);

      if (!response.success) {
        log.debug(response.data);
        return;
      }

      let location = response.data.location as Location;
      this.createSlot(location);

      state.catalagoData.data["location"].push(location);
      console.log("Upload successful:", response.data);

      // Refresh your grid or render the new slot card here
    });

    return addslot_element;
  }

  private createButtonOverlay(): HTMLElement {
    const overlay = createElementFromHTML(`
      <div class="slot-overlay-actions absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-md shadow-sm border border-slate-200 z-10 ">
        <button 
          type="button" 
          data-action="edit" 
          title="Editar" 
          class="p-1.5 rounded bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors"
        >
          <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        <button 
          type="button" 
          data-action="delete" 
          title="Eliminar" 
          class="p-1.5 rounded bg-red-50 text-slate-600 hover:text-red-600 transition-colors hidden"
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
    this.deletebtn = overlay.querySelector<HTMLButtonElement>(
      'button[data-action="delete"]',
    );

    // Attach direct listener to Edit button
    editBtn.addEventListener("click", async (e: MouseEvent) => {
      e.stopPropagation(); // Prevents triggering card click event

      if (this.selected_slot) {
        let id = this.selected_slot.dataset.id;
        let locatinoObj = state.catalagoData.data["location"].find(
          (obj) => obj.id == id,
        );
        let image = this.selected_slot.querySelector("img");

        let imageCopy = image ? image.cloneNode(true) : null;
        log.debug("locationObj ", locatinoObj);
        let location = await this.locationForm.open(locatinoObj, imageCopy);
      }
    });

    // Attach direct listener to Delete button
    this.deletebtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation(); // Prevents triggering card click event
      const locationId = this.selected_slot.dataset.id;
      log.debug("clicked ", locationId);
      if (locationId) {
        this.handleDeleteSlot(this.selected_slot, locationId);
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

  async handleDeleteSlot(slot: HTMLElement, locationId: string) {
    const res = await CatalogApi.location_delete(num(locationId));

    if (!res.success) {
      log.debug(res.data);
      notiDialog.titleContainer.textContent = "Error";
      notiDialog.bodyContainer.textContent = res.data.error;
      notiDialog.show();
      return;
    }

    log.debug("Deleted ", res.data);

    slot.remove();
    this.slots.pop();
    state.catalagoData.remove_by_id("location", locationId);
    console.log(`Delete clicked for slot ID: ${locationId}`);
  }
}
class LocationForm {
  location: Location;
  modalDialog: ModalDialog;

  header: HTMLHeadingElement;
  tom: TomSelect;
  image_container: HTMLDivElement;

  new_image_selected: File;

  img_dimensions: { width: string; height: string };

  resolve_promise?: (result: { location: Location } | null) => void;

  constructor() {
    this.create_dialog();
  }

  title(): string {
    return `Ubicacion`;
  }

  body(): HTMLElement {
    const htmlString = `
      <div class="flex flex-col gap-4 p-2 w-fit h-fit">

<div 
  class="group relative w-full aspect-[4/3] overflow-hidden rounded bg-slate-100 cursor-pointer" 
  id="img-container"
  role="button"
  tabindex="0"
>  

  <!-- Hover Overlay with Icon -->
  <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
    <svg class="w-8 h-8 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  </div>
</div>



        <h3 id="header" class="text-lg font-bold text-gray-800">
          Etiquetas
        </h3>

        <label class="form-control w-full">
          <select
            class="w-full input-lowercase"
          ></select>
        </label>
        <p class="err-message text-red-500"></p>
      </div>
    `;

    // Render template and query internal elements
    const container = createElementFromHTML(htmlString) as HTMLElement;
    this.header = container.querySelector("#header") as HTMLHeadingElement;

    this.image_container = container.querySelector(
      "#img-container",
    ) as HTMLHeadingElement;

    this.image_container.addEventListener("click", async () => {
      let selected_file = await openFileExplorer();
      if (!selected_file) {
        return;
      }
      this.new_image_selected = selected_file;

      let img = this.image_container.querySelector("img");
      log.debug("image ", img);
      if (img.dataset.objectUrl) {
        URL.revokeObjectURL(img.dataset.objectUrl);
      }
      const objectUrl = URL.createObjectURL(selected_file);
      img.src = objectUrl;
      img.dataset.objectUrl = objectUrl;

      log.debug("dimensions", this.img_dimensions);
      img.style.width = this.img_dimensions.width;
      img.style.height = this.img_dimensions.height;
      img.style.objectFit = "object-cover";

      log.debug(selected_file);
    });

    let select = container.querySelector("select");

    this.tom = new TomSelect(select, {
      create: true,
      createOnBlur: true,
      openOnFocus: true,
      selectOnTab: true,
      refreshThrottle: 0,
      maxItems: null,

      onOptionAdd: async (value, data) => {
        let res = await request_to_create_value_on_table(
          this.tom,
          value,
          "location_tag",
        );
        // if (res.created) {
        //   this.events.emit("catalog_item:added", res.item);
        // }
      },
    });

    this.tom.control_input.addEventListener("input", function (e) {
      const pos = e.target.selectionStart;
      e.target.value = e.target.value.toLowerCase();
      e.target.setSelectionRange(pos, pos);
    });

    // tom.control_input.addEventListener("focus", function (e) {
    //   if (tom.customData.err_message_active) {
    //     tom.customData.err_message_active = false;
    //     let err_mess = document.querySelector(`#error_text_${table_name}`);
    //     err_mess.textContent = "";
    //   }
    // });

    return container;
  }

  loadTags() {
    let items: LocationTag = state.catalagoData.data["location_tag"];

    items.forEach((item) => {
      let display = item.name ? item.name : item.id;
      this.tom.addOption({
        value: item.id,
        text: display,
        table_name: "location_tag",
      });
      log.debug({ value: item.id, text: display });
    });

    this.tom.refreshOptions();
    this.tom.close();
  }

  create_dialog() {
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      cancelText: "Volver",
      confirmText: "Guardar",

      // onCancel: () => {
      //   this.close();
      // },
      onConfirm: () => {
        this.submit();
      },

      onClose: () => {
        this.clear();
      },
    });
  }

  open(location: Location, locationImage) {
    return new Promise<{ location: Location } | null>((resolve) => {
      this.location = location;
      this.resolve_promise = resolve;
      this.insert_image(locationImage);
      this.modalDialog.show();
      this.new_image_selected = null;
    });
  }

  insert_image(img: HTMLImageElement) {
    this.image_container.replaceChildren(img);

    this.img_dimensions = {
      width: `${img.naturalWidth}px`,
      height: `${img.naturalHeight}px`,
    };
  }

  close() {
    this.modalDialog.close();
  }

  clear() {
    console.log("clearing?");
    this.tom.clear();
    this.tom.refreshItems();
  }

  async submit() {
    if (this.new_image_selected) {
      let res = await CatalogApi.updateLocationImage(
        this.location.id,
        this.new_image_selected,
      );

      if (!res.success) {
        log.debug(res.data());
        return;
      }
    }
  }
}

async function openFileExplorer(accept = "image/*"): Promise<File | null> {
  return new Promise((resolve) => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = accept; // Restricts file picker to images by default

    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const selectedFile = fileInput.files[0];

        resolve(selectedFile);
      }
    });

    // Programmatically trigger the file dialog
    fileInput.click();
  });
}
