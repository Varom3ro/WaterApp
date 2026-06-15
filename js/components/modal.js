// ============================================
// Tu Empresa - Modal Component
// ============================================

let currentModal = null;

export function openModal(options = {}) {
    const { title = '', content = '', size = '', onSave = null, saveLabel = 'Guardar', showFooter = true } = options;

    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal ${size === 'lg' ? 'modal-lg' : ''}">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
      ${showFooter ? `
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
        ${onSave ? `<button class="btn btn-primary" id="modal-save-btn">${saveLabel}</button>` : ''}
      </div>
      ` : ''}
    </div>
  `;

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    // Close handlers
    overlay.querySelector('#modal-close-btn').addEventListener('click', closeModal);
    const cancelBtn = overlay.querySelector('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Save handler
    if (onSave) {
        const saveBtn = overlay.querySelector('#modal-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                onSave(overlay);
            });
        }
    }

    currentModal = overlay;
    return overlay;
}

export function closeModal() {
    if (currentModal) {
        currentModal.classList.remove('active');
        setTimeout(() => {
            if (currentModal && currentModal.parentNode) {
                currentModal.parentNode.removeChild(currentModal);
            }
            currentModal = null;
        }, 250);
    }
}

export function getModalElement() {
    return currentModal;
}
