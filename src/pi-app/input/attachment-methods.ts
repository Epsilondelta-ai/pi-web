const INLINE_LIMIT = 256 * 1024;
const LUCIDE_X_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;

export const attachmentMethods = {
  async handlePromptPaste(event) {
    const imageFiles = this.pastedImageFiles(event.clipboardData);
    if (!imageFiles.length) return;
    event.preventDefault();
    await this.addFiles(imageFiles);
  },

  pastedImageFiles(clipboardData) {
    const items = [...(clipboardData?.items || [])];
    const files = items.length ? items.map((item) => item.getAsFile?.()) : [...(clipboardData?.files || [])];
    return files.filter((file) => file?.type?.startsWith("image/")).map((file, index) => {
      if (file.name || typeof File !== "function") return file;
      return new File([file], `pasted-image-${index + 1}.${this.imageExtension(file.type)}`, {
        type: file.type,
        lastModified: file.lastModified || Date.now(),
      });
    });
  },

  imageExtension(type = "") {
    const subtype = type.split("/")[1]?.split(";")[0] || "png";
    if (subtype === "jpeg") return "jpg";
    if (subtype === "svg+xml") return "svg";
    return subtype;
  },

  async addFiles(files) {
    if (!this.attachments) return;
    for (const file of files || []) {
      const attachment = file.type?.startsWith("image/")
        ? await this.imageAttachment(file)
        : await this.fileAttachment(file);
      this.attachmentContents.push(attachment);
      this.addAttachmentChip(file.name, file.size, file, attachment.dataUrl);
    }
    this.attachments.hidden = !this.attachments.children.length;
    this.updatePrompt();
  },

  async fileAttachment(file) {
    const content = file.size <= INLINE_LIMIT ? await file.text() : "[file too large to inline]";
    return {
      type: "file",
      name: file.name,
      mimeType: file.type || "text/plain",
      content,
    };
  },

  async imageAttachment(file) {
    return {
      type: "image",
      name: file.name,
      mimeType: file.type || "image/png",
      dataUrl: await this.fileDataUrl(file),
    };
  },

  async fileDataUrl(file) {
    const base64 = this.arrayBufferToBase64(await file.arrayBuffer());
    return `data:${file.type || "application/octet-stream"};base64,${base64}`;
  },

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  },

  addAttachmentChip(name, size, file, previewUrl) {
    const chip = document.createElement("span");
    chip.className = "attach-chip";
    chip.dataset.attachmentIndex = String(this.attachmentContents.length - 1);
    chip.innerHTML = [
      this.attachmentPreviewMarkup(file, previewUrl),
      `<span class="ac-name"></span>`,
      `<span class="ac-size">${this.formatBytes(size)}</span>`,
      `<button class="ac-remove" type="button" data-remove-attachment aria-label="remove">${LUCIDE_X_ICON}</button>`,
    ].join("");
    chip.querySelector(".ac-name").textContent = name;
    this.attachments.append(chip);
  },

  attachmentPreviewMarkup(file, previewUrl) {
    if (previewUrl && file?.type?.startsWith("image/")) {
      return `<img class="ac-preview" src="${previewUrl}" alt="">`;
    }
    return `<span class="ac-glyph">${file ? this.kindGlyph(file) : "file"}</span>`;
  },

  kindGlyph(file) {
    if (file.type?.startsWith("image")) return "img";
    if (file.name.endsWith(".pdf")) return "pdf";
    if (/\.(js|ts|jsx|tsx|astro|py|go|rs)$/.test(file.name)) return "&lt;/&gt;";
    return "txt";
  },

  formatBytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  },
};
