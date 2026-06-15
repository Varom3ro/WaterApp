// ============================================
// Tu Empresa - Toast Notifications
// ============================================

let toastContainer = null;

function ensureContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

export function showToast(message, type = 'success', duration = 3000) {
    ensureContainer();

    const icons = {
        success: '✓',
        warning: '⚠',
        error: '✕',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span style="font-size:1.1rem;font-weight:bold">${icons[type] || '●'}</span>
    <span>${message}</span>
  `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 300ms ease';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, duration);
}
